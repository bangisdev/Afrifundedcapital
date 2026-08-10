/**
 * Integration tests for `syncChallenge` (`src/server/lib/mt5/sync-service.ts`).
 *
 * Uses an in-memory SQLite DB with the full migration schema and a fake
 * gateway provider, so the rule-enforcement pipeline (warnings → notifications,
 * hard violations → terminate + suspend + notify) is exercised end to end.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { runMigrations } from "../migrate";
import type { Db } from "../db";
import { users, challengeTemplates, accountSizes, mt5Accounts, userChallenges, notifications } from "../schema";
import { syncChallenge } from "../lib/mt5/sync-service";
import type { MT5Provider, MT5AccountInfo, MT5SyncResult, MT5TradeRecord, SyncMetrics } from "../lib/mt5/types";
import { NOW, makeMetrics } from "./helpers/mt5-fixtures";

// Capture email sends without ever hitting Resend. The sync service emails the
// trader via `notify` → `sendEmailToUser` → `sendEmail`; stubbing the one
// side-effecting export (while spreading the real templates) records calls and
// keeps the whole preference/delivery flow intact.
const sendEmailMock = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
vi.mock("../lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/email")>();
  return { ...actual, sendEmail: sendEmailMock };
});

/** Fake gateway provider — deterministic metrics/trades, records suspensions. */
class FakeProvider implements MT5Provider {
  readonly mode: "gateway" | "simulated";
  readonly configured: boolean;
  suspended: string[] = [];
  trades: MT5TradeRecord[] = [];
  metrics: SyncMetrics | null = null;
  account = { balance: 100_000, equity: 100_000 };

  constructor(mode: "gateway" | "simulated" = "gateway") {
    this.mode = mode;
    this.configured = mode === "gateway";
  }

  async ping() {
    return { ok: true, latencyMs: 1, message: "fake provider" };
  }
  async createAccount() {
    return { login: "2010001", server: "AfriFundedCapital-Test" };
  }
  async getAccountInfo(_login: string): Promise<MT5AccountInfo> {
    throw new Error("not used in tests");
  }
  async getTradeHistory() {
    return this.trades;
  }
  async syncDaily(_challenge: unknown, _previous: SyncMetrics | null): Promise<MT5SyncResult> {
    if (!this.metrics) throw new Error("FakeProvider.metrics not set");
    return {
      metrics: this.metrics,
      accountUpdate: this.account,
      source: this.mode,
    };
  }
  async suspendAccount(login: string) {
    this.suspended.push(login);
  }
  async activateAccount() {}
  async changePassword() {}
  async changeInvestorPassword() {}
}

interface Fixture {
  db: Db;
  provider: FakeProvider;
  challenge: typeof userChallenges.$inferSelect;
  login: string;
}

let emailSeq = 0;

async function makeFixture(overrides?: { mode?: "gateway" | "simulated"; metrics?: SyncMetrics }): Promise<Fixture> {
  const sqlite = new Database(":memory:");
  runMigrations(sqlite);
  const db = drizzle(sqlite, { schema }) as unknown as Db;

  const userId = db
    .insert(users)
    .values({ name: "Trader One", email: `trader-${emailSeq++}@test.dev`, role: "user", createdAt: NOW, updatedAt: NOW })
    .returning({ id: users.id })
    .get()!.id;

  const templateId = db
    .insert(challengeTemplates)
    .values({
      name: "Two-Step Evaluation",
      type: "two_step",
      isActive: true,
      profitTarget: 10,
      dailyDrawdown: 5,
      maxDrawdown: 10,
      maxLeverage: 100,
      minTradingDays: 3,
      maxTradingDays: null,
      maxPositionSize: 2,
      consistencyTarget: 20,
      allowWeekendHolding: false,
      allowNewsTrading: true,
      allowEATrading: false,
      allowCopyTrading: false,
      price: 100,
      currency: "NGN",
      durationDays: 30,
      createdBy: userId,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning({ id: challengeTemplates.id })
    .get()!.id;

  db.insert(accountSizes)
    .values({ label: "$100,000", size: 100_000, currency: "USD", templateId, price: 100, sortOrder: 0 })
    .run();

  const login = "2010001";
  const accountId = db
    .insert(mt5Accounts)
    .values({ userId, login, password: "pw", investorPassword: "ipw", createdAt: NOW })
    .returning({ id: mt5Accounts.id })
    .get()!.id;

  const challengeId = db
    .insert(userChallenges)
    .values({
      userId,
      templateId,
      accountSizeId: 1,
      status: "active",
      accountSize: 100_000,
      currency: "USD",
      profitTarget: 10,
      dailyDrawdown: 5,
      maxDrawdown: 10,
      maxLeverage: 100,
      minTradingDays: 3,
      maxTradingDays: null,
      startedAt: NOW,
      amountPaid: 100,
      violations: null,
      mt5AccountId: accountId,
      currentPhase: 1,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning({ id: userChallenges.id })
    .get()!.id;

  const provider = new FakeProvider(overrides?.mode);
  if (overrides?.metrics) provider.metrics = overrides.metrics;

  const challenge = db.select().from(userChallenges).where(eq(userChallenges.id, challengeId)).get()!;
  return { db, provider, challenge, login };
}

const reload = (db: Db, id: number) => db.select().from(userChallenges).where(eq(userChallenges.id, id)).get()!;
const notificationsFor = (db: Db, userId: number) =>
  db.select().from(notifications).where(eq(notifications.userId, userId)).all();

let fixture: Fixture;

describe("syncChallenge rule enforcement", () => {
  beforeEach(async () => {
    sendEmailMock.mockClear();
    fixture = await makeFixture();
  });

  it("persists a drawdown warning, notifies once, and keeps the challenge active", async () => {
    // Max drawdown limit = 10% × $100k = $10k → 90% = warning territory.
    fixture.provider.metrics = makeMetrics({ balance: 91_000, equity: 91_000, currentDrawdown: 9_000, totalProfit: -9_000 });
    fixture.provider.account = { balance: 91_000, equity: 91_000 };

    const outcome = await syncChallenge(fixture.db, fixture.provider, fixture.challenge);
    expect(outcome.synced).toBe(true);

    const row = reload(fixture.db, fixture.challenge.id);
    expect(row.status).toBe("active");
    const stored = JSON.parse(row.violations || "[]") as Array<{ code: string; severity: string }>;
    expect(stored).toContainEqual(expect.objectContaining({ code: "max_drawdown_warning", severity: "warning" }));

    const notes = notificationsFor(fixture.db, fixture.challenge.userId);
    expect(notes.filter((n) => n.type === "challenge_warning").length).toBe(1);
    expect(notes[0].message).toContain("approaching");
    expect(fixture.provider.suspended).toEqual([]);
  });

  it("emails the trader a drawdown warning on first detection, once per rule code", async () => {
    fixture.provider.metrics = makeMetrics({ balance: 91_000, equity: 91_000, currentDrawdown: 9_000, totalProfit: -9_000 });
    fixture.provider.account = { balance: 91_000, equity: 91_000 };

    await syncChallenge(fixture.db, fixture.provider, fixture.challenge);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const [call] = sendEmailMock.mock.calls;
    expect(call[0].subject).toMatch(/Drawdown Warning/i);
    expect(call[0].to).toMatch(/trader-/); // the challenge owner's email
    expect(call[0].html).toContain("approaching");

    // A later sync still warning on the SAME rule code must not email again.
    fixture.db.update(schema.tradingMetrics).set({ recordedAt: NOW - 24 * 60 * 60 * 1000 }).run();
    const row = reload(fixture.db, fixture.challenge.id);
    const provider2 = new FakeProvider();
    provider2.metrics = makeMetrics({ balance: 91_500, equity: 91_500, currentDrawdown: 8_500, totalProfit: -8_500 });
    provider2.account = { balance: 91_500, equity: 91_500 };
    await syncChallenge(fixture.db, provider2, row);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("emails the trader when a hard violation terminates the challenge", async () => {
    fixture.provider.metrics = makeMetrics({ balance: 90_000, equity: 90_000, currentDrawdown: 10_000, totalProfit: -10_000 });
    fixture.provider.account = { balance: 90_000, equity: 90_000 };

    await syncChallenge(fixture.db, fixture.provider, fixture.challenge);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const [call] = sendEmailMock.mock.calls;
    expect(call[0].subject).toMatch(/Challenge Violated/i);
    expect(call[0].to).toMatch(/trader-/);
    expect(call[0].html).toContain("Two-Step Evaluation"); // challenge label in the email
    expect(call[0].html).toContain("suspended");
  });

  it("emails every admin when a trader's challenge is hard-violated", async () => {
    const adminId = fixture.db
      .insert(users)
      .values({ name: "Ops Admin", email: "admin-ops@test.dev", role: "super_admin", createdAt: NOW, updatedAt: NOW })
      .returning({ id: users.id })
      .get()!.id;

    fixture.provider.metrics = makeMetrics({ balance: 90_000, equity: 90_000, currentDrawdown: 10_000, totalProfit: -10_000 });
    fixture.provider.account = { balance: 90_000, equity: 90_000 };

    await syncChallenge(fixture.db, fixture.provider, fixture.challenge);

    // One email to the trader + one to the admin.
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const calls = sendEmailMock.mock.calls.map((c) => c[0]);
    const adminCall = calls.find((c) => c.to === "admin-ops@test.dev");
    const traderCall = calls.find((c) => c.to !== "admin-ops@test.dev");

    expect(adminCall?.subject).toMatch(/Trader Challenge Violated/i);
    expect(adminCall?.html).toContain("Trader One");
    expect(adminCall?.html).toContain("Two-Step Evaluation");
    expect(traderCall?.subject).toMatch(/Challenge Violated/i);

    // The admin also gets an in-app notification pointing at the admin page.
    const adminNotes = notificationsFor(fixture.db, adminId);
    expect(adminNotes.filter((n) => n.type === "challenge_violation").length).toBe(1);
    expect(adminNotes[0].link).toBe("/admin/challenges");
  });

  it("skips the violation email when the user disabled email notifications", async () => {
    fixture.db.update(users).set({ emailNotifications: false }).where(eq(users.id, fixture.challenge.userId)).run();
    fixture.provider.metrics = makeMetrics({ balance: 90_000, equity: 90_000, currentDrawdown: 10_000, totalProfit: -10_000 });
    fixture.provider.account = { balance: 90_000, equity: 90_000 };

    await syncChallenge(fixture.db, fixture.provider, fixture.challenge);

    expect(sendEmailMock).not.toHaveBeenCalled();
    // The in-app notification is still created — email is the only thing gated.
    const notes = notificationsFor(fixture.db, fixture.challenge.userId);
    expect(notes.filter((n) => n.type === "challenge_violation").length).toBe(1);
  });

  it("a hard drawdown violation terminates the challenge, suspends the account, and notifies", async () => {
    fixture.provider.metrics = makeMetrics({ balance: 90_000, equity: 90_000, currentDrawdown: 10_000, totalProfit: -10_000 });
    fixture.provider.account = { balance: 90_000, equity: 90_000 };

    const outcome = await syncChallenge(fixture.db, fixture.provider, fixture.challenge);
    expect(outcome.synced).toBe(true);

    const row = reload(fixture.db, fixture.challenge.id);
    expect(row.status).toBe("violated");
    const stored = JSON.parse(row.violations || "[]") as Array<{ code: string; severity: string }>;
    expect(stored).toContainEqual(expect.objectContaining({ code: "max_drawdown", severity: "hard" }));

    expect(fixture.provider.suspended).toContain(fixture.login);

    const notes = notificationsFor(fixture.db, fixture.challenge.userId);
    expect(notes.filter((n) => n.type === "challenge_violation").length).toBe(1);

    const account = fixture.db.select().from(mt5Accounts).where(eq(mt5Accounts.login, fixture.login)).get()!;
    expect(account.isSuspended).toBe(true);
  });

  it("a warning persisted on a previous sync survives a later hard violation merge", async () => {
    // First sync: warning only.
    fixture.provider.metrics = makeMetrics({ balance: 91_500, equity: 91_500, currentDrawdown: 8_500, totalProfit: -8_500 });
    fixture.provider.account = { balance: 91_500, equity: 91_500 };
    await syncChallenge(fixture.db, fixture.provider, fixture.challenge);
    expect(reload(fixture.db, fixture.challenge.id).status).toBe("active");

    // Back-date the stored metrics beyond the 23h dedup window, then run a
    // second sync with breach metrics on a fresh provider.
    fixture.db.update(schema.tradingMetrics).set({ recordedAt: NOW - 24 * 60 * 60 * 1000 }).run();
    const row = reload(fixture.db, fixture.challenge.id);
    const provider2 = new FakeProvider();
    provider2.metrics = makeMetrics({ balance: 90_000, equity: 90_000, currentDrawdown: 10_000, totalProfit: -10_000 });
    provider2.account = { balance: 90_000, equity: 90_000 };

    await syncChallenge(fixture.db, provider2, row);

    const final = reload(fixture.db, fixture.challenge.id);
    expect(final.status).toBe("violated");
    const stored = JSON.parse(final.violations || "[]") as Array<{ code: string; severity: string }>;
    const codes = stored.map((v) => v.code);
    expect(codes).toContain("max_drawdown_warning"); // survived the merge
    expect(codes).toContain("max_drawdown");
  });

  it("does not enforce rules on simulated (non-gateway) syncs", async () => {
    const sim = await makeFixture({ mode: "simulated" });
    sim.provider.metrics = makeMetrics({ balance: 90_000, equity: 90_000, currentDrawdown: 10_000, totalProfit: -10_000 });
    sim.provider.account = { balance: 90_000, equity: 90_000 };

    await syncChallenge(sim.db, sim.provider, sim.challenge);
    const row = reload(sim.db, sim.challenge.id);
    expect(row.status).toBe("active");
    expect(row.violations).toBeNull();
    expect(sim.provider.suspended).toEqual([]);
  });

  it("records phase completion on a healthy gateway sync (no rule interference)", async () => {
    // Profit target 10% of $100k = $10k; 3 min trading days; drawdown clean.
    fixture.provider.metrics = makeMetrics({
      balance: 110_000,
      equity: 110_000,
      totalProfit: 10_000,
      currentDrawdown: 0,
      dailyDrawdown: 0,
      tradingDaysCount: 3,
    });
    fixture.provider.account = { balance: 110_000, equity: 110_000 };

    await syncChallenge(fixture.db, fixture.provider, fixture.challenge);
    const row = reload(fixture.db, fixture.challenge.id);
    expect(row.status).toBe("phase_1_passed");
  });

  it("is a no-op for non-active challenges", async () => {
    fixture.db.update(userChallenges).set({ status: "phase_1_passed" }).where(eq(userChallenges.id, fixture.challenge.id)).run();
    const row = reload(fixture.db, fixture.challenge.id);
    const outcome = await syncChallenge(fixture.db, fixture.provider, row);
    expect(outcome.synced).toBe(false);
    expect(outcome.reason).toBe("skipped");
  });
});
