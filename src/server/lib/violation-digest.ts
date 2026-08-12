/**
 * Weekly violation summary digest for admins.
 *
 * Every week (7-day cadence, aligned to boot), the digest scans the stored
 * `user_challenges.violations` JSON for hard rule breaches detected in the
 * trailing 7-day window and emails ONE recap to every admin: period stats,
 * the most commonly breached rules, and a per-violation table with trader
 * identity and challenge label. It deep-links to the admin violations digest
 * tab (`/admin/challenges?tab=violations`), which is where admins reset or
 * reissue violated challenges.
 *
 * This complements the real-time per-violation ops alert
 * (`notifyAdminsOfChallengeViolation` in ./notifications): the digest is the
 * weekly at-a-glance recap, not a replacement for the immediate email.
 *
 * Hard violations only — non-terminal drawdown warnings (`severity:
 * "warning"`) are intentionally excluded so the recap stays actionable.
 *
 * The parser is tolerant of legacy rows written before the rule engine
 * existed (shape `{ type, date, drawdown }`, e.g. `{ type:
 * "max_drawdown", date: <epoch ms>, drawdown: 2318.38 }`): `date` is
 * treated as the detection timestamp and `type` as the rule code. Legacy
 * rows on challenges that are STILL violated bypass the trailing window
 * (they predate the per-violation alert and were never surfaced by a prior
 * digest) and stay visible until the challenge is reset or repurchased —
 * which clears the stored violations. Every other violation keeps the
 * strict weekly window.
 *
 * The scheduler is started once per process by the same entrypoints that
 * start the MT5 scheduler (dev Vite plugin + production `server.ts`). A
 * `violation_digest_last_sent` settings row de-duplicates across restarts:
 * the tick only sends when the interval has fully elapsed since the last
 * send. The timestamp is recorded only when at least one email actually
 * delivered, so a digest configured with a Resend key mid-week fires on the
 * next tick instead of being silently skipped. No email key → the tick
 * retries weekly and never records a false "sent".
 */

import { eq, sql } from "drizzle-orm";

import { settings, userChallenges, users, ROLES } from "../schema";
import type { Db } from "../db";
import { sendEmail, adminViolationDigestEmail } from "./email";
import { ruleLabel } from "./mt5/rule-engine";
import { resolveChallengeLabel } from "./mt5/sync-service";

/** How far back the digest looks — the trailing 7 days. */
export const DIGEST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Weekly send cadence. Overridable via env (used by tests/e2e). */
export const DIGEST_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** First tick shortly after boot, then every `DIGEST_INTERVAL_MS`. */
// E2e mode (E2E_TESTING=1, Playwright web server): push the first auto-tick
// far out so specs drive sends exclusively through the manual button (the
// scheduler itself is unit-tested). Mirrors the MT5 scheduler's e2e timers.
const DIGEST_INITIAL_DELAY_MS = process.env.E2E_TESTING === "1" ? 60 * 60 * 1000 : 60 * 1000;

const LAST_SENT_KEY = "violation_digest_last_sent";

// Module-level guard keeps the scheduler idempotent across entrypoints
// (dev Vite plugin + production server.ts both call start once per process).
let schedulerStarted = false;

/** One hard violation surfaced in the digest email. */
export interface DigestEntry {
  challengeId: number;
  traderName: string;
  traderEmail: string | null;
  challengeLabel: string | null;
  ruleCode: string;
  ruleLabelText: string;
  message: string;
  detectedAt: number;
}

/** Aggregated stats + rows rendered by `adminViolationDigestEmail`. */
export interface DigestSummary {
  periodStart: number;
  periodEnd: number;
  entries: DigestEntry[];
  totalViolations: number;
  totalChallenges: number;
  uniqueTraders: number;
  topRules: Array<{ code: string; label: string; count: number }>;
}

/** Shape of entries persisted in `user_challenges.violations` (JSON). */
interface StoredViolation {
  code?: string;
  type?: string; // legacy alias kept for pre-warning consumers
  severity?: string;
  message?: string;
  detectedAt?: number;
  /** Legacy pre-rule-engine shape: `{ type, date, drawdown }` — `date` is epoch ms. */
  date?: string | number;
  [key: string]: unknown;
}

/**
 * Best-effort detection timestamp for a stored violation. The rule engine
 * writes `detectedAt` (epoch ms); legacy rows written before it existed
 * carry `date` instead (epoch ms, occasionally an ISO/date string). Returns
 * `null` when neither is usable so the row can be window-filtered rather
 * than mis-placed.
 */
function violationTimestamp(v: StoredViolation): number | null {
  if (typeof v.detectedAt === "number" && Number.isFinite(v.detectedAt)) return v.detectedAt;
  const raw = v.date;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Seconds-precision epochs are ~1e9; ms-precision are ~1e12.
    return raw < 1e11 ? raw * 1000 : raw;
  }
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Collect hard violations detected within `[now - windowMs, now]` from every
 * challenge that carries a stored violation record. Identity (trader name +
 * email) and the purchase label are joined in so the email needs no extra
 * lookups. Entries are returned newest-first.
 *
 * Legacy pre-rule-engine rows (`{ type, date, drawdown }`, no
 * `detectedAt`/`code`) are parsed via `violationTimestamp` + `type`; on a
 * challenge still in `violated` status they are backfilled regardless of
 * age (reset/repurchase clears them), while the weekly window still
 * applies everywhere else.
 */
export function collectWeekViolations(
  db: Db,
  now: number = Date.now(),
  windowMs: number = DIGEST_WINDOW_MS,
): DigestEntry[] {
  const since = now - windowMs;

  const rows = db
    .select()
    .from(userChallenges)
    .where(
      sql`${userChallenges.violations} IS NOT NULL OR ${userChallenges.status} = ${"violated"}`,
    )
    .all();

  // Trader identity is joined here; the purchase label is resolved per
  // challenge by `resolveChallengeLabel` (reads the template itself).
  const owners = db.select().from(users).all();
  const ownerById = new Map(owners.map((u) => [u.id, u]));

  const entries: DigestEntry[] = [];

  for (const challenge of rows) {
    let stored: StoredViolation[] = [];
    try {
      stored = challenge.violations ? (JSON.parse(challenge.violations) as StoredViolation[]) : [];
    } catch {
      stored = [];
    }

    for (const v of stored) {
      // Digest is hard violations only — non-terminal warnings stay out.
      if (v.severity === "warning") continue;
      const detectedAt = violationTimestamp(v);
      if (detectedAt === null || detectedAt > now) continue;

      // Legacy pre-rule-engine rows (type/date, no code/detectedAt) on a
      // challenge that is STILL violated bypass the window: they were never
      // surfaced by the real-time alert or an earlier digest, so they stay
      // in the recap until the admin resets/repurchases the challenge
      // (which clears the stored violations). Everything else keeps the
      // strict trailing-7-day window.
      const isLegacyRow = typeof v.code !== "string" && typeof v.detectedAt !== "number";
      const backfillLegacy = isLegacyRow && challenge.status === "violated";
      if (!backfillLegacy && detectedAt < since) continue;

      const owner = ownerById.get(challenge.userId);
      const code = v.code || v.type || "unknown";
      entries.push({
        challengeId: challenge.id,
        traderName: owner?.name || owner?.email || "Trader",
        traderEmail: owner?.email ?? null,
        challengeLabel: resolveChallengeLabel(db, challenge),
        ruleCode: code,
        ruleLabelText: ruleLabel(code as Parameters<typeof ruleLabel>[0]) || code,
        message: v.message || code,
        detectedAt,
      });
    }
  }

  entries.sort((a, b) => b.detectedAt - a.detectedAt);
  return entries;
}

/** Roll the collected entries into digest stats (top rules, counts). */
export function summarizeViolations(
  entries: DigestEntry[],
  periodStart: number,
  periodEnd: number,
): DigestSummary {
  const perRule = new Map<string, number>();
  const labelByCode = new Map<string, string>();
  for (const e of entries) {
    perRule.set(e.ruleCode, (perRule.get(e.ruleCode) || 0) + 1);
    if (!labelByCode.has(e.ruleCode)) labelByCode.set(e.ruleCode, e.ruleLabelText);
  }

  const topRules = [...perRule.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, count]) => ({ code, label: labelByCode.get(code) || code, count }));

  return {
    periodStart,
    periodEnd,
    entries,
    totalViolations: entries.length,
    totalChallenges: new Set(entries.map((e) => e.challengeId)).size,
    uniqueTraders: new Set(entries.map((e) => e.traderEmail ?? e.traderName)).size,
    topRules,
  };
}

/**
 * Build + send the weekly digest to every admin (any role other than
 * `user`). Emails are sent individually via Resend and always awaited so the
 * caller can report delivery. Returns the outcome for logging/tests.
 *
 * Never throws — a failed send (missing key, Resend error) is reported in the
 * result, not propagated, so the scheduler loop always survives.
 */
export async function sendWeeklyViolationDigest(
  db: Db,
  opts?: { now?: number; windowMs?: number },
): Promise<{ admins: number; violations: number; challenges: number; sent: number }> {
  const now = opts?.now ?? Date.now();
  const windowMs = opts?.windowMs ?? DIGEST_WINDOW_MS;
  const entries = collectWeekViolations(db, now, windowMs);
  const summary = summarizeViolations(entries, now - windowMs, now);

  const admins = db
    .select()
    .from(users)
    .where(sql`${users.role} IS NOT NULL AND ${users.role} != ${ROLES.USER}`)
    .all();

  let sent = 0;
  for (const admin of admins) {
    if (!admin.email) continue;
    try {
      const emailParams = adminViolationDigestEmail(admin.name || admin.email, summary);
      const result = await sendEmail({ ...emailParams, to: admin.email });
      if (result.ok) sent++;
    } catch {
      // Individual admin failure never aborts the rest of the recipients.
    }
  }

  return {
    admins: admins.length,
    violations: summary.totalViolations,
    challenges: summary.totalChallenges,
    sent,
  };
}

/**
 * True when `intervalMs` has fully elapsed since the last recorded send —
 * used both by the scheduler tick and unit tests.
 */
export function shouldSendDigest(lastSent: number, now: number, intervalMs: number): boolean {
  if (!Number.isFinite(lastSent) || lastSent <= 0) return true;
  return now - lastSent >= intervalMs;
}

/**
 * Epoch ms of the last successful digest send (emails actually delivered),
 * or `null` when the digest has never gone out. Read by the admin overview
 * "Last digest sent" status card and by the scheduler tick itself.
 */
export function getViolationDigestLastSent(db: Db): number | null {
  try {
    const setting = db.select().from(settings).where(eq(settings.key, LAST_SENT_KEY)).get();
    const value = setting ? Number(setting.value) : 0;
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Record a successful digest send (emails actually delivered) so the weekly
 * scheduler's dedup window restarts from `now`. Used by the scheduler tick
 * and by the admin "Send digest now" endpoint — a manual send that delivers
 * also re-anchors the weekly cadence. Never throws; returns true when the
 * timestamp was written.
 */
export function recordViolationDigestSent(db: Db, now: number = Date.now()): boolean {
  try {
    const existing = db.select().from(settings).where(eq(settings.key, LAST_SENT_KEY)).get();
    if (existing) {
      db.update(settings).set({ value: String(now) }).where(eq(settings.key, LAST_SENT_KEY)).run();
    } else {
      db.insert(settings).values({
        key: LAST_SENT_KEY,
        value: String(now),
        group: "general",
        description: "Last time the weekly violation digest was emailed to admins (epoch ms)",
      }).run();
    }
    return true;
  } catch (e) {
    console.warn("[Digest] Failed to record last-sent timestamp:", e);
    return false;
  }
}

/**
 * One scheduler tick: skip when the interval hasn't elapsed since the last
 * send; otherwise send the digest and record `violation_digest_last_sent` —
 * but only when at least one email actually delivered (see module docs).
 */
export async function runViolationDigestTick(
  db: Db,
  now: number = Date.now(),
  intervalMs: number = DIGEST_INTERVAL_MS,
): Promise<{ skipped: boolean; sent: number }> {
  const lastSent = getViolationDigestLastSent(db) ?? 0;

  if (!shouldSendDigest(lastSent, now, intervalMs)) {
    return { skipped: true, sent: 0 };
  }

  const result = await sendWeeklyViolationDigest(db, { now, windowMs: DIGEST_WINDOW_MS });
  if (result.sent > 0) {
    recordViolationDigestSent(db, now);
    console.log(
      `[Digest] Weekly violation digest sent to ${result.sent}/${result.admins} admin(s) — ` +
        `${result.violations} violation(s) across ${result.challenges} challenge(s)`,
    );
  } else {
    console.log(
      `[Digest] Weekly violation digest tick: ${result.violations} violation(s) in window — ` +
        "email not configured or no admin recipients, will retry next tick",
    );
  }
  return { skipped: false, sent: result.sent };
}

/**
 * Background scheduler for the weekly violation digest. Idempotent
 * (module-level guard) — started once per process by the dev Vite plugin and
 * the production `server.ts`. First tick 60s after boot, then every
 * `DIGEST_INTERVAL_MS` (env-overridable via `VIOLATION_DIGEST_INTERVAL_MS`).
 */
export function startViolationDigestScheduler(db: Db): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const intervalMs = Number(
    process.env.VIOLATION_DIGEST_INTERVAL_MS || DIGEST_INTERVAL_MS,
  );

  const tick = async (): Promise<void> => {
    try {
      await runViolationDigestTick(db);
    } catch (err) {
      console.error("[Digest] Weekly violation digest error:", err);
    } finally {
      // Re-arm from this tick so the cadence stays anchored to the last
      // send (a skipped tick due to dedup still retries one interval later).
      setTimeout(() => void tick(), intervalMs);
    }
  };

  setTimeout(() => void tick(), DIGEST_INITIAL_DELAY_MS);
}
