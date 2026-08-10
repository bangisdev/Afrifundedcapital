import type { Db } from "../../db";
import {
  tradingMetrics,
  drawdownHistory,
  mt5Accounts,
  userChallenges,
  challengeTemplates,
  settings,
  users,
} from "../../schema";
import { eq, desc, and, asc } from "drizzle-orm";
import type { MT5Provider, ChallengeRow, MT5TradeRecord } from "./types";
import {
  rulesFromTemplate,
  evaluateChallengeRules,
  hasHardViolation,
  violationReason,
  type RuleViolation,
} from "./rule-engine";
import { maybeGenerateCertificate } from "../certificates";
import { createNotification, notify } from "../notifications";
import { challengeWarningEmail, challengeViolationEmail } from "../email";
import { writeAuditLog } from "../audit";

export interface SyncOutcome {
  synced: boolean;
  reason?: "already_synced" | "skipped";
  source?: "gateway" | "simulated";
  error?: string;
}

/** Shape of entries persisted in `user_challenges.violations` (JSON). */
interface StoredViolation {
  code?: string;
  type?: string; // legacy alias kept for pre-warning consumers
  severity?: string;
  message?: string;
  detectedAt?: number;
  evidence?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Best-effort display name for the challenge owner (email fallback). */
function ownerName(db: Db, userId: number): string {
  try {
    const user = db.select().from(users).where(eq(users.id, userId)).get();
    return user?.name || user?.email || "there";
  } catch { return "there"; }
}

/**
 * Resolve the purchase label ("Two-Step Evaluation · $50,000") for a
 * challenge row, for stamping audit entries and email copy.
 */
export function resolveChallengeLabel(db: Db, challenge: ChallengeRow): string | null {
  try {
    const template = db
      .select()
      .from(challengeTemplates)
      .where(eq(challengeTemplates.id, challenge.templateId))
      .get();
    if (template?.name && challenge.accountSize != null) {
      return `${template.name} · $${challenge.accountSize.toLocaleString("en-US")}`;
    }
  } catch { /* non-critical */ }
  return null;
}

/**
 * Audit a system-driven lifecycle transition (phase pass, funding, violation,
 * expiry). The actor is the challenge owner — like payment.completed, the
 * event belongs to the trader's journey rather than an admin action.
 */
function writeLifecycleAudit(
  db: Db,
  challenge: ChallengeRow,
  action: string,
  extra: Record<string, unknown> = {},
): void {
  try {
    writeAuditLog(db, {
      userId: challenge.userId,
      action,
      entity: "challenge",
      entityId: challenge.id,
      details: {
        challengeLabel: resolveChallengeLabel(db, challenge),
        accountSize: challenge.accountSize,
        ...extra,
      },
    });
  } catch { /* audit is non-critical */ }
}

/**
 * Sync a single challenge — pulls latest MT5 data through the provider and
 * stores it. Handles the daily-dedup window, status transitions (phase
 * completion → certificate, max-drawdown violation, expiry).
 *
 * Returns `{ synced: false, reason: "already_synced" }` when a sync already
 * happened within the last 23 hours, and `{ synced: false, reason: "skipped" }`
 * when the challenge isn't in a syncable state.
 */
export async function syncChallenge(
  db: Db,
  provider: MT5Provider,
  challenge: ChallengeRow,
): Promise<SyncOutcome> {
  const now = Date.now();

  if (challenge.status !== "active") {
    return { synced: false, reason: "skipped" };
  }

  // Get latest metrics for this challenge
  const latestMetrics = db.select().from(tradingMetrics)
    .where(eq(tradingMetrics.challengeId, challenge.id))
    .orderBy(desc(tradingMetrics.recordedAt))
    .limit(1).get();

  // Check if we already synced today (within last 23 hours)
  if (latestMetrics && (now - latestMetrics.recordedAt) < 23 * 60 * 60 * 1000) {
    return { synced: false, reason: "already_synced" };
  }

  // Pull data through the provider (real gateway or simulated fallback).
  const previousMetrics = latestMetrics
    ? omitTimestamps(latestMetrics)
    : null;

  let result: Awaited<ReturnType<MT5Provider["syncDaily"]>>;
  try {
    result = await provider.syncDaily(challenge, previousMetrics);
  } catch (err) {
    return {
      synced: false,
      reason: "skipped",
      error: err instanceof Error ? err.message : "MT5 sync failed",
    };
  }

  const { metrics, accountUpdate } = result;

  // Insert new metrics record
  db.insert(tradingMetrics).values({
    mt5AccountId: challenge.mt5AccountId || 0,
    challengeId: challenge.id,
    ...metrics,
    recordedAt: now,
  }).run();

  // Insert drawdown history
  db.insert(drawdownHistory).values({
    challengeId: challenge.id,
    mt5AccountId: challenge.mt5AccountId || 0,
    balance: accountUpdate.balance,
    equity: accountUpdate.equity,
    drawdown: metrics.currentDrawdown,
    dailyDrawdown: metrics.dailyDrawdown,
    peakBalance: Math.max(latestMetrics?.balance ?? challenge.accountSize, accountUpdate.balance),
    recordedAt: now,
  }).run();

  // Update MT5 account balance/equity
  if (challenge.mt5AccountId) {
    db.update(mt5Accounts).set({
      balance: accountUpdate.balance,
      equity: accountUpdate.equity,
      lastSyncAt: now,
    }).where(eq(mt5Accounts.id, challenge.mt5AccountId)).run();
  }

  // ─── Rule engine: evaluate template rules against the sync ──
  // Rules are only ENFORCED on real gateway data. The simulated provider
  // generates random market movement for demos/tests — terminating real
  // (or demo) challenges on that noise would be wrong.
  const isGatewaySync = result.source === "gateway";
  const template = db.select().from(challengeTemplates).where(eq(challengeTemplates.id, challenge.templateId)).get();
  const rules = template ? rulesFromTemplate(template) : null;

  let violations: RuleViolation[] = [];
  if (isGatewaySync && rules && challenge.status === "active") {
    // Daily metrics history (for the consistency rule: best day vs total profit).
    const metricsHistory = db
      .select({
        dailyPL: tradingMetrics.dailyPL,
        totalProfit: tradingMetrics.totalProfit,
        recordedAt: tradingMetrics.recordedAt,
      })
      .from(tradingMetrics)
      .where(eq(tradingMetrics.challengeId, challenge.id))
      .orderBy(asc(tradingMetrics.recordedAt))
      .all();

    // Recent closed trades (gateway provider only — simulated returns []).
    let trades: MT5TradeRecord[] = [];
    try {
      const since = now - 7 * 24 * 60 * 60 * 1000;
      if (challenge.mt5AccountId) {
        const account = db.select().from(mt5Accounts).where(eq(mt5Accounts.id, challenge.mt5AccountId)).get();
        if (account?.login) {
          trades = await provider.getTradeHistory(account.login, since, now);
        }
      }
    } catch { /* trade history is best-effort */ }

    // High-impact news events from a configured feed (settings `news_calendar`).
    let newsEvents: number[] = [];
    try {
      const setting = db.select().from(settings).where(eq(settings.key, "news_calendar")).get();
      if (setting?.value) {
        const parsed: unknown = JSON.parse(setting.value);
        if (Array.isArray(parsed)) {
          const events = parsed as Array<{ at?: unknown; impact?: unknown }>;
          newsEvents = events
            .filter((e) => e?.at !== undefined && (e?.impact === undefined || e?.impact === "high"))
            .map((e) => Number(e.at))
            .filter((n: number) => Number.isFinite(n));
        }
      }
    } catch { /* non-critical */ }

    violations = evaluateChallengeRules({ challenge, rules, metrics, metricsHistory, trades, newsEvents, now });
  }

  // ─── Warning handling: non-terminal drawdown proximity alerts ────────
  // Warnings are persisted into the same violations JSON (the `severity`
  // field distinguishes them from hard breaches) so the admin panel can
  // surface them, but each rule code notifies the trader only ONCE — repeat
  // warnings on later syncs refresh the stored entry instead of spamming the
  // bell. Warnings never terminate or suspend a challenge.
  const warnings = violations.filter((v) => v.severity === "warning");
  if (isGatewaySync && rules && warnings.length > 0 && challenge.status === "active") {
    let storedWarnings: StoredViolation[] = [];
    try { storedWarnings = challenge.violations ? (JSON.parse(challenge.violations) as StoredViolation[]) : []; } catch { storedWarnings = []; }
    const mergedWarnings = [...storedWarnings];
    const codeOf = (v: StoredViolation) => v.code || v.type || "";
    const knownCodes = new Set(mergedWarnings.map(codeOf));
    let notified = 0;

    for (const w of warnings) {
      const entry: StoredViolation = { ...w, type: w.code }; // `type` kept for legacy consumers
      if (knownCodes.has(w.code)) {
        const idx = mergedWarnings.findIndex((v) => codeOf(v) === w.code);
        if (idx >= 0) mergedWarnings[idx] = { ...mergedWarnings[idx], detectedAt: w.detectedAt, message: w.message };
      } else {
        mergedWarnings.push(entry);
        knownCodes.add(w.code);
        const reason = violationReason(w, rules);
        await notify(db, challenge.userId, {
          type: "challenge_warning",
          title: "Drawdown Warning",
          message: `Heads up — ${reason}. Consider reducing risk before the limit is hit.`,
          link: "/dashboard/challenges",
          // Email fires only on first detection (same rule code), matching the
          // notification — repeat syncs refresh the stored entry, no spam.
          email: challengeWarningEmail(ownerName(db, challenge.userId), resolveChallengeLabel(db, challenge), reason),
        });
        notified++;
      }
    }

    db.update(userChallenges).set({
      violations: JSON.stringify(mergedWarnings),
      updatedAt: now,
    }).where(eq(userChallenges.id, challenge.id)).run();

    if (notified > 0) {
      writeLifecycleAudit(db, challenge, "challenge.warned", {
        warnings: warnings.map((w) => ({ code: w.code, message: w.message, evidence: w.evidence })),
      });
    }
  }

  // ─── Challenge status transitions (violation wins over phase pass) ──
  const willViolate = isGatewaySync && !!rules && hasHardViolation(violations) && challenge.status === "active";

  if (willViolate) {
    // Merge with any existing violations, deduped by rule code. Re-read the
    // row so warnings persisted just above (same sync) are preserved instead
    // of being clobbered by the stale in-memory `challenge` snapshot.
    let stored: StoredViolation[] = [];
    try {
      const fresh = db.select({ violations: userChallenges.violations }).from(userChallenges)
        .where(eq(userChallenges.id, challenge.id)).get();
      stored = fresh?.violations ? (JSON.parse(fresh.violations) as StoredViolation[]) : [];
    } catch { stored = []; }
    const existingCodes = new Set(stored.map((v) => v.code || v.type || ""));
    const merged = [
      ...stored,
      ...violations
        .filter((v) => !existingCodes.has(v.code))
        .map((v) => ({ ...v, type: v.code })), // `type` kept for legacy consumers
    ];

    db.update(userChallenges).set({
      status: "violated",
      violations: JSON.stringify(merged),
      updatedAt: now,
    }).where(eq(userChallenges.id, challenge.id)).run();

    // Suspend the live account (best-effort; simulated is a no-op).
    if (challenge.mt5AccountId) {
      try {
        const account = db.select().from(mt5Accounts).where(eq(mt5Accounts.id, challenge.mt5AccountId)).get();
        if (account?.login) {
          await provider.suspendAccount(account.login);
          db.update(mt5Accounts).set({ isSuspended: true }).where(eq(mt5Accounts.id, account.id)).run();
        }
      } catch { /* best-effort */ }
    }

    const top = violations[0];
    const reason = violationReason(top, rules);
    await notify(db, challenge.userId, {
      type: "challenge_violation",
      title: "Challenge Violation",
      message: `Your challenge has been violated due to ${reason}. Your account has been suspended.`,
      link: "/dashboard/challenges",
      email: challengeViolationEmail(ownerName(db, challenge.userId), resolveChallengeLabel(db, challenge), reason),
    });

    // Audit every rule that fired, stamped with the challenge label.
    writeLifecycleAudit(db, challenge, "challenge.violated", {
      violations: violations.map((v) => ({ code: v.code, message: v.message, evidence: v.evidence })),
      totalViolations: violations.length,
    });
  } else if (challenge.status === "active") {
    // ── Phase completion: profit target reached + min trading days ──
    const profitTargetAmount = (challenge.profitTarget / 100) * challenge.accountSize;
    const minDaysMet = (metrics.tradingDaysCount ?? 0) >= challenge.minTradingDays;
    const profitReached = (metrics.totalProfit ?? 0) >= profitTargetAmount;

    if (profitReached && minDaysMet) {
      // Determine next status based on current phase
      let nextStatus: string | null = null;

      if (challenge.currentPhase === 2) {
        nextStatus = "phase_2_passed";
      } else if (challenge.currentPhase === 1 || !challenge.currentPhase) {
        nextStatus = "phase_1_passed";
      } else {
        nextStatus = "funded";
      }

      // Update challenge status
      db.update(userChallenges).set({
        status: nextStatus,
        currentPhase: nextStatus === "phase_1_passed" ? 2 : (challenge.currentPhase || 1),
        phase1PassedAt: nextStatus === "phase_1_passed" ? now : challenge.phase1PassedAt,
        phase2PassedAt: nextStatus === "phase_2_passed" ? now : challenge.phase2PassedAt,
        fundedAt: nextStatus === "funded" ? now : challenge.fundedAt,
        updatedAt: now,
      }).where(eq(userChallenges.id, challenge.id)).run();

      // Auto-generate certificate for the completed phase
      maybeGenerateCertificate(db, challenge.id, nextStatus);

      // Audit the lifecycle transition — which phase was passed (or funded),
      // stamped with the challenge label.
      writeLifecycleAudit(
        db,
        challenge,
        nextStatus === "funded" ? "challenge.funded" : "challenge.phase_passed",
        {
          phase: nextStatus,
          profitTargetAmount,
          totalProfit: metrics.totalProfit ?? 0,
          tradingDays: metrics.tradingDaysCount ?? 0,
        },
      );
    }

    // ── Expiry ────────────────────────────────────────────
    if (challenge.expiresAt && challenge.expiresAt < now) {
      db.update(userChallenges).set({
        status: "expired",
        updatedAt: now,
      }).where(eq(userChallenges.id, challenge.id)).run();

      createNotification(db, challenge.userId, {
        type: "challenge_expired",
        title: "Challenge Expired",
        message: `Your challenge (Account Size: $${challenge.accountSize.toLocaleString()}) has expired. You can purchase a new challenge from the dashboard.`,
        link: "/dashboard/challenges",
      });

      // Audit the expiry with the challenge label.
      writeLifecycleAudit(db, challenge, "challenge.expired", {
        expiresAt: challenge.expiresAt,
      });
    }
  }

  return { synced: true, source: result.source };
}

/** List active challenges that still need a sync (used by admin sync-all and queue). */
export function getActiveChallenges(db: Db): ChallengeRow[] {
  return db.select().from(userChallenges)
    .where(eq(userChallenges.status, "active"))
    .all();
}

/** Find the challenge bound to an MT5 account (for queue handlers). */
export function getChallengeByMt5Account(db: Db, mt5AccountId: number): ChallengeRow | null {
  return db.select().from(userChallenges)
    .where(and(
      eq(userChallenges.mt5AccountId, mt5AccountId),
      eq(userChallenges.status, "active"),
    ))
    .get() ?? null;
}

/** Strip auto/managed columns so a stored row can be passed back as "previous". */
function omitTimestamps(row: typeof tradingMetrics.$inferSelect) {
  const { id, mt5AccountId, challengeId, recordedAt, ...rest } = row;
  void id;
  void mt5AccountId;
  void challengeId;
  void recordedAt;
  return rest;
}
