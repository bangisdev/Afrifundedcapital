/**
 * Weekly admin violation digest tests.
 *
 * Covers the aggregation + send pipeline in `lib/violation-digest.ts`:
 *
 *   1. collectWeekViolations — 7-day window filtering, hard-only (warnings
 *      excluded), trader identity + challenge label join, newest-first sort
 *   2. summarizeViolations — totals, unique traders, top-rule ranking
 *   3. sendWeeklyViolationDigest — one email per admin (role-based), never
 *      throws when emailing is unconfigured, reports delivery counts
 *   4. runViolationDigestTick — interval dedup via the
 *      `violation_digest_last_sent` setting, records after a real send
 *   5. startViolationDigestScheduler — idempotent timer registration, tick
 *      fires on schedule and respects the dedup window
 *
 * The scheduler is driven with Vitest fake timers; `../lib/email` is mocked
 * so sends are observable without a Resend key. The DB is the real test
 * SQLite instance (via `./setup`), so aggregation runs against real rows.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { eq } from "drizzle-orm";

import { getTestDb, cleanupTestDb } from "./setup";
import { users, userChallenges, challengeTemplates, settings, ROLES } from "../schema";
import type { DigestEntry } from "../lib/violation-digest";

vi.mock("../lib/email", () => ({
  sendEmail: vi.fn(),
  adminViolationDigestEmail: vi.fn(() => ({
    subject: "Weekly Violation Summary",
    html: "<p>digest</p>",
    text: "digest",
  })),
}));

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};
type SendEmailFn = (
  params: SendEmailParams,
  overrides?: { apiKey?: string },
) => Promise<{ ok: boolean; reason?: string }>;

const WEEK = 7 * 24 * 60 * 60 * 1000;
// Fixed reference "now" so the window math is deterministic.
const NOW = Date.UTC(2026, 7, 10, 9, 0, 0); // 2026-08-10 09:00 UTC

let db: ReturnType<typeof getTestDb>;
let sendEmail: Mock<SendEmailFn>;
let digest: typeof import("../lib/violation-digest");

function seedUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  return db
    .insert(users)
    .values({
      name: "Test Trader",
      email: `trader-${Math.random().toString(36).slice(2, 8)}@test.com`,
      role: ROLES.USER,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    })
    .returning()
    .get();
}

function seedTemplate() {
  return db
    .insert(challengeTemplates)
    .values({
      name: "Two-Step Evaluation",
      type: "two_step",
      profitTarget: 10,
      dailyDrawdown: 5,
      maxDrawdown: 10,
      maxLeverage: 100,
      minTradingDays: 5,
      price: 200,
      durationDays: 30,
      createdBy: 1,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning()
    .get();
}

function seedChallenge(
  userId: number,
  templateId: number,
  opts: { status?: string; violations: Array<Record<string, unknown>> },
) {
  return db
    .insert(userChallenges)
    .values({
      userId,
      templateId,
      accountSizeId: 1,
      status: opts.status || "violated",
      accountSize: 50_000,
      currency: "NGN",
      profitTarget: 10,
      dailyDrawdown: 5,
      maxDrawdown: 10,
      maxLeverage: 100,
      minTradingDays: 5,
      amountPaid: 200,
      violations: JSON.stringify(opts.violations),
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning()
    .get();
}

function hardViolation(code: string, detectedAt: number, message = `breached ${code}`) {
  return { code, severity: "hard", message, detectedAt };
}

beforeAll(() => {
  db = getTestDb();
});

afterAll(() => {
  cleanupTestDb();
});

beforeEach(async () => {
  // Fresh module registry so the scheduler's module-level `schedulerStarted`
  // guard resets and the mocked email module applies to the new import.
  vi.resetModules();
  const email = await import("../lib/email");
  sendEmail = vi.mocked(email.sendEmail);
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ ok: true });
  digest = await import("../lib/violation-digest");

  // Clean the tables the digest reads — fresh state per test.
  db.delete(userChallenges).run();
  db.delete(challengeTemplates).run();
  db.delete(settings).run();
  db.delete(users).run();
});

// ═══════════════════════════════════════════════════════════════
//  COLLECT WEEK VIOLATIONS
// ═══════════════════════════════════════════════════════════════

describe("collectWeekViolations", () => {
  it("returns hard violations detected in the trailing window, newest first, with identity + label", () => {
    const trader = seedUser({ name: "Ada Trader", email: "ada@test.com" });
    const template = seedTemplate();
    seedChallenge(trader.id, template.id, {
      violations: [
        hardViolation("ea_detected", NOW - 2 * 24 * 60 * 60 * 1000),
        hardViolation("max_drawdown", NOW - 24 * 60 * 60 * 1000),
        // Non-terminal warning must be excluded from the digest.
        {
          code: "daily_drawdown_warning",
          severity: "warning",
          message: "approaching",
          detectedAt: NOW - 24 * 60 * 60 * 1000,
        },
      ],
    });

    const entries = digest.collectWeekViolations(db, NOW, WEEK);

    expect(entries).toHaveLength(2);
    // Newest first: max_drawdown (1 day ago) before ea_detected (2 days ago).
    expect(entries[0]!.ruleCode).toBe("max_drawdown");
    expect(entries[1]!.ruleCode).toBe("ea_detected");
    expect(entries[0]!.traderName).toBe("Ada Trader");
    expect(entries[0]!.traderEmail).toBe("ada@test.com");
    expect(entries[0]!.challengeLabel).toBe("Two-Step Evaluation · $50,000");
    expect(entries[0]!.ruleLabelText).toBe("Max drawdown");
  });

  it("excludes violations older than the window and includes them from any challenge state", () => {
    const trader = seedUser();
    const template = seedTemplate();
    // Old hard violation on a still-violated challenge — outside the window.
    seedChallenge(trader.id, template.id, {
      violations: [hardViolation("max_drawdown", NOW - 10 * 24 * 60 * 60 * 1000)],
    });
    // Recent hard violation on an ACTIVE challenge (stored history) — the
    // `violations IS NOT NULL` branch must still pick it up.
    seedChallenge(trader.id, template.id, {
      status: "active",
      violations: [hardViolation("news_trading", NOW - 3 * 24 * 60 * 60 * 1000)],
    });

    const entries = digest.collectWeekViolations(db, NOW, WEEK);

    expect(entries).toHaveLength(1);
    expect(entries[0]!.ruleCode).toBe("news_trading");
    expect(entries[0]!.ruleLabelText).toBe("News trading");
  });

  it("handles challenges with malformed violations JSON without throwing", () => {
    const trader = seedUser();
    const template = seedTemplate();
    db.insert(userChallenges).values({
      userId: trader.id,
      templateId: template.id,
      accountSizeId: 1,
      status: "violated",
      accountSize: 10_000,
      currency: "NGN",
      profitTarget: 10,
      dailyDrawdown: 5,
      maxDrawdown: 10,
      maxLeverage: 100,
      minTradingDays: 5,
      amountPaid: 100,
      violations: "{not-json",
      createdAt: NOW,
      updatedAt: NOW,
    }).run();

    expect(digest.collectWeekViolations(db, NOW, WEEK)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
//  SUMMARIZE VIOLATIONS
// ═══════════════════════════════════════════════════════════════

describe("summarizeViolations", () => {
  it("rolls entries into totals, unique traders, and ranked top rules", () => {
    const entries: DigestEntry[] = [
      { challengeId: 1, traderName: "A", traderEmail: "a@x.com", challengeLabel: null, ruleCode: "max_drawdown", ruleLabelText: "Max drawdown", message: "m", detectedAt: NOW - 1000 },
      { challengeId: 1, traderName: "A", traderEmail: "a@x.com", challengeLabel: null, ruleCode: "ea_detected", ruleLabelText: "EA trading", message: "m", detectedAt: NOW - 2000 },
      { challengeId: 2, traderName: "B", traderEmail: "b@x.com", challengeLabel: null, ruleCode: "max_drawdown", ruleLabelText: "Max drawdown", message: "m", detectedAt: NOW - 3000 },
    ];

    const summary = digest.summarizeViolations(entries, NOW - WEEK, NOW);

    expect(summary.totalViolations).toBe(3);
    expect(summary.totalChallenges).toBe(2);
    expect(summary.uniqueTraders).toBe(2);
    expect(summary.topRules).toEqual([
      { code: "max_drawdown", label: "Max drawdown", count: 2 },
      { code: "ea_detected", label: "EA trading", count: 1 },
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════
//  SEND WEEKLY DIGEST
// ═══════════════════════════════════════════════════════════════

describe("sendWeeklyViolationDigest", () => {
  it("emails every admin (not traders) and reports delivery counts", async () => {
    seedUser({ role: ROLES.SUPER_ADMIN, email: "super@afc.com", name: "Super Admin" });
    seedUser({ role: ROLES.SUPPORT_ADMIN, email: "support@afc.com", name: "Support Admin" });
    // Traders must not receive the digest.
    const trader = seedUser({ role: ROLES.USER });
    const template = seedTemplate();
    seedChallenge(trader.id, template.id, {
      violations: [hardViolation("max_drawdown", NOW - 60_000)],
    });

    const result = await digest.sendWeeklyViolationDigest(db, { now: NOW });

    expect(result).toEqual({ admins: 2, violations: 1, challenges: 1, sent: 2 });
    expect(sendEmail).toHaveBeenCalledTimes(2);
    const recipients = sendEmail.mock.calls.map((c) => c[0]!.to).sort();
    expect(recipients).toEqual(["super@afc.com", "support@afc.com"]);
    expect(sendEmail.mock.calls[0]![0]!.subject).toContain("Weekly Violation Summary");
    expect(sendEmail.mock.calls[0]![0]!.html).toContain("<p>digest</p>");
  });

  it("reports sent: 0 without a working email key and never throws", async () => {
    seedUser({ role: ROLES.SUPER_ADMIN, email: "super@afc.com" });
    sendEmail.mockResolvedValue({ ok: false, reason: "RESEND_API_KEY is not configured" });

    const result = await digest.sendWeeklyViolationDigest(db, { now: NOW });

    expect(result.sent).toBe(0);
    expect(result.admins).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("sends the all-clear recap when there are no violations this week", async () => {
    seedUser({ role: ROLES.SUPER_ADMIN, email: "super@afc.com" });

    const result = await digest.sendWeeklyViolationDigest(db, { now: NOW });

    expect(result).toEqual({ admins: 1, violations: 0, challenges: 0, sent: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════
//  SCHEDULER TICK — INTERVAL DEDUP
// ═══════════════════════════════════════════════════════════════

describe("runViolationDigestTick", () => {
  it("skips when the interval has not elapsed since the last send", async () => {
    db.insert(settings).values({
      key: "violation_digest_last_sent",
      value: String(NOW - 60_000), // sent a minute ago
      group: "general",
      description: "last sent",
    }).run();

    const result = await digest.runViolationDigestTick(db, NOW, WEEK);

    expect(result).toEqual({ skipped: true, sent: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends and records last-sent when the interval elapsed", async () => {
    seedUser({ role: ROLES.SUPER_ADMIN, email: "super@afc.com" });
    db.insert(settings).values({
      key: "violation_digest_last_sent",
      value: String(NOW - WEEK - 1),
      group: "general",
      description: "last sent",
    }).run();

    const result = await digest.runViolationDigestTick(db, NOW, WEEK);

    expect(result.skipped).toBe(false);
    expect(result.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const stored = db.select().from(settings).where(eq(settings.key, "violation_digest_last_sent")).get();
    expect(stored?.value).toBe(String(NOW));
  });

  it("does not record last-sent when nothing delivered (no email key)", async () => {
    seedUser({ role: ROLES.SUPER_ADMIN, email: "super@afc.com" });
    sendEmail.mockResolvedValue({ ok: false, reason: "RESEND_API_KEY is not configured" });

    await digest.runViolationDigestTick(db, NOW, WEEK);

    const stored = db.select().from(settings).where(eq(settings.key, "violation_digest_last_sent")).get();
    expect(stored).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
//  START SCHEDULER — IDEMPOTENCY + SCHEDULED TICK
// ═══════════════════════════════════════════════════════════════

describe("startViolationDigestScheduler", () => {
  it("registers one initial timeout on first start only (no recurring interval at boot)", () => {
    vi.useFakeTimers();
    try {
      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

      digest.startViolationDigestScheduler(db);
      digest.startViolationDigestScheduler(db);
      digest.startViolationDigestScheduler(db);

      // One initial 60s delay; the weekly cadence re-arms itself per tick.
      expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
      expect(setTimeoutSpy.mock.calls[0]?.[1]).toBe(60_000);
      expect(setIntervalSpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("fires the digest after the initial delay and respects the dedup window", async () => {
    vi.useFakeTimers();
    try {
      seedUser({ role: ROLES.SUPER_ADMIN, email: "super@afc.com" });

      digest.startViolationDigestScheduler(db);
      // First tick (60s after boot) — no last-sent on record → sends.
      await vi.advanceTimersByTimeAsync(60_000);
      expect(sendEmail).toHaveBeenCalledTimes(1);

      sendEmail.mockClear();
      // One full interval later the weekly cadence sends again.
      await vi.advanceTimersByTimeAsync(WEEK);
      expect(sendEmail).toHaveBeenCalledTimes(1);

      // A restart mid-week (fresh module, same DB) dedups on last-sent.
      vi.resetModules();
      const fresh = await import("../lib/violation-digest");
      const email = await import("../lib/email");
      sendEmail = vi.mocked(email.sendEmail);
      sendEmail.mockClear();
      fresh.startViolationDigestScheduler(db);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(sendEmail).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
