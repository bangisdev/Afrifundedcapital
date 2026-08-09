/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Integration tests for MT5 rule enforcement: syncChallenge runs the rule
 * engine after each metrics sync and terminates challenges on hard violations
 * (status → violated, account suspension hook, notification, audit entry).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq, desc } from "drizzle-orm";
import * as schema from "../schema";
import { getTestDb, getTestSqlite, cleanupTestDb } from "./setup";
import { syncChallenge } from "../lib/mt5/sync-service";
import type { MT5Provider, ChallengeRow, SyncMetrics } from "../lib/mt5/types";

const BASE_METRICS: SyncMetrics = {
  balance: 10000,
  equity: 10000,
  floatingPL: 0,
  dailyPL: 0,
  totalProfit: 0,
  currentDrawdown: 0,
  dailyDrawdown: 0,
  trailingDrawdown: 0,
  relativeDrawdown: 0,
  absoluteDrawdown: 0,
  remainingDrawdown: 1000,
  profitTargetProgress: 0,
  tradingDaysCount: 1,
  openPositions: 0,
  closedTrades: 0,
  winRate: 50,
  lossRate: 50,
  averageRR: 1,
  profitFactor: 1,
  expectancy: 0,
  largestWin: 0,
  largestLoss: 0,
  consecutiveWins: 0,
  consecutiveLosses: 0,
  riskScore: 50,
  healthScore: 80,
};

function fakeMetrics(overrides: Partial<SyncMetrics> = {}): SyncMetrics {
  return { ...BASE_METRICS, ...overrides };
}

interface FakeProvider {
  metrics: SyncMetrics;
  trades: any[];
  suspendCalls: string[];
}

function fakeProvider(p: FakeProvider): MT5Provider & { suspendCalls: string[] } {
  return {
    mode: "simulated",
    configured: false,
    ping: async () => ({ ok: true, latencyMs: 1, message: "test" }),
    createAccount: async () => ({ login: "1", server: "test" }),
    getAccountInfo: async () => { throw new Error("n/a"); },
    getTradeHistory: async () => p.trades,
    syncDaily: async () => ({
      metrics: p.metrics,
      accountUpdate: { balance: p.metrics.balance, equity: p.metrics.equity },
      // Enforcement only runs on real gateway data — the fake reports gateway
      // so the rule path is exercised.
      source: "gateway",
    }),
    suspendAccount: async (login: string) => { p.suspendCalls.push(login); },
    activateAccount: async () => {},
    changePassword: async () => {},
    changeInvestorPassword: async () => {},
    suspendCalls: p.suspendCalls,
  } as unknown as MT5Provider & { suspendCalls: string[] };
}

interface CreatedChallenge {
  row: ChallengeRow;
  templateId: number;
  userId: number;
}

async function createChallenge(overrides: {
  template?: Record<string, unknown>;
  challenge?: Record<string, unknown>;
} = {}): Promise<CreatedChallenge> {
  const sqlite = getTestSqlite();
  const db = getTestDb();

  const user = db.insert(schema.users).values({
    name: "Rule Trader",
    email: `rule-${Math.random().toString(36).slice(2, 10)}@test.com`,
    emailVerified: true,
    role: "user",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }).returning().get();

  const tpl = {
    name: "Rule Engine Test",
    type: "one_step",
    profitTarget: 10,
    dailyDrawdown: 5,
    maxDrawdown: 10,
    maxLeverage: 100,
    minTradingDays: 2,
    consistencyTarget: 30,
    maxPositionSize: 5,
    allowWeekendHolding: false,
    allowNewsTrading: false,
    allowEATrading: false,
    allowCopyTrading: false,
    price: 100,
    durationDays: 30,
    ...overrides.template,
  };
  const tplResult = sqlite.prepare(
    `INSERT INTO challenge_templates
      (name, type, profit_target, daily_drawdown, max_drawdown, max_leverage, min_trading_days,
       consistency_target, max_position_size, allow_weekend_holding, allow_news_trading,
       allow_ea_trading, allow_copy_trading, price, duration_days, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    tpl.name, tpl.type, tpl.profitTarget, tpl.dailyDrawdown, tpl.maxDrawdown, tpl.maxLeverage, tpl.minTradingDays,
    tpl.consistencyTarget, tpl.maxPositionSize, tpl.allowWeekendHolding ? 1 : 0, tpl.allowNewsTrading ? 1 : 0,
    tpl.allowEATrading ? 1 : 0, tpl.allowCopyTrading ? 1 : 0, tpl.price, tpl.durationDays, user.id, Date.now(), Date.now(),
  );
  const templateId = Number(tplResult.lastInsertRowid);

  const sizeResult = sqlite.prepare(
    "INSERT INTO account_sizes (label, size, template_id, price, sort_order) VALUES (?, ?, ?, ?, ?)",
  ).run("$10,000", 10000, templateId, 100, 1);
  const sizeId = Number(sizeResult.lastInsertRowid);

  const now = Date.now();
  const ch = {
    userId: user.id,
    templateId,
    accountSizeId: sizeId,
    status: "active",
    accountSize: 10000,
    currency: "NGN",
    profitTarget: tpl.profitTarget,
    dailyDrawdown: tpl.dailyDrawdown,
    maxDrawdown: tpl.maxDrawdown,
    maxLeverage: tpl.maxLeverage,
    minTradingDays: tpl.minTradingDays,
    amountPaid: 100,
    createdAt: now,
    updatedAt: now,
    ...overrides.challenge,
  };
  const chResult = sqlite.prepare(
    `INSERT INTO user_challenges
      (user_id, template_id, account_size_id, status, account_size, currency, profit_target,
       daily_drawdown, max_drawdown, max_leverage, min_trading_days, amount_paid, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ch.userId, ch.templateId, ch.accountSizeId, ch.status, ch.accountSize, ch.currency, ch.profitTarget,
    ch.dailyDrawdown, ch.maxDrawdown, ch.maxLeverage, ch.minTradingDays, ch.amountPaid, ch.createdAt, ch.updatedAt,
  );
  const challengeId = Number(chResult.lastInsertRowid);

  const row = db.select().from(schema.userChallenges).where(eq(schema.userChallenges.id, challengeId)).get()!;
  return { row, templateId, userId: user.id };
}

function loadChallenge(id: number): ChallengeRow {
  return getTestDb().select().from(schema.userChallenges).where(eq(schema.userChallenges.id, id)).get()!;
}

function storedViolations(id: number): any[] {
  const row = getTestSqlite().prepare("SELECT violations FROM user_challenges WHERE id = ?").get(id) as { violations: string | null };
  try { return row.violations ? JSON.parse(row.violations) : []; } catch { return []; }
}

function latestAudit(action: string, challengeId: number): any {
  const row = getTestSqlite().prepare(
    "SELECT * FROM audit_logs WHERE action = ? AND entity_id = ? ORDER BY id DESC LIMIT 1",
  ).get(action, String(challengeId)) as any;
  return row ?? null;
}

describe("MT5 rule enforcement via sync", () => {
  beforeAll(() => {
    getTestDb();
  });

  afterAll(() => cleanupTestDb());

  it("terminates the challenge on max drawdown breach with notify + audit", async () => {
    const { row } = await createChallenge();
    const provider = fakeProvider({ metrics: fakeMetrics({ currentDrawdown: 2000, equity: 8000, balance: 8000, totalProfit: -2000 }), trades: [], suspendCalls: [] });

    const outcome = await syncChallenge(getTestDb(), provider, row);
    expect(outcome.synced).toBe(true);

    const after = loadChallenge(row.id);
    expect(after.status).toBe("violated");

    const vs = storedViolations(row.id);
    expect(vs.length).toBe(1);
    expect(vs[0].code).toBe("max_drawdown");
    expect(vs[0].type).toBe("max_drawdown"); // legacy field kept
    expect(vs[0].severity).toBe("hard");

    const notif = getTestSqlite().prepare("SELECT * FROM notifications WHERE user_id = ? AND type = ?").get(row.userId, "challenge_violation") as any;
    expect(notif).toBeDefined();
    expect(notif.message).toContain("maximum drawdown");

    const audit = latestAudit("challenge.violated", row.id);
    expect(audit).toBeDefined();
    const details = JSON.parse(audit.details);
    expect(details.totalViolations).toBe(1);
    expect(details.violations[0].code).toBe("max_drawdown");
  });

  it("flags daily drawdown breaches", async () => {
    const { row } = await createChallenge();
    const provider = fakeProvider({ metrics: fakeMetrics({ dailyDrawdown: 600, dailyPL: -600 }), trades: [], suspendCalls: [] });

    await syncChallenge(getTestDb(), provider, row);
    const vs = storedViolations(row.id);
    expect(vs[0].code).toBe("daily_drawdown");
    expect(loadChallenge(row.id).status).toBe("violated");
  });

  it("terminates on consistency breach using stored metrics history", async () => {
    const { row } = await createChallenge();
    const sqlite = getTestSqlite();

    // Seed prior days: best day (500) = 83% of total profit (600) > 30% target.
    sqlite.prepare(
      `INSERT INTO trading_metrics
        (mt5_account_id, challenge_id, balance, equity, floating_pl, daily_pl, total_profit, current_drawdown,
         daily_drawdown, trailing_drawdown, relative_drawdown, absolute_drawdown, remaining_drawdown,
         profit_target_progress, trading_days_count, open_positions, closed_trades, win_rate, loss_rate,
         average_rr, profit_factor, expectancy, largest_win, largest_loss, consecutive_wins, consecutive_losses,
         risk_score, health_score, recorded_at)
       VALUES (?, ?, 10000, 10000, 0, 100, 100, 0, 0, 0, 0, 0, 1000, 0, 1, 0, 0, 50, 50, 1, 1, 0, 0, 0, 0, 0, 50, 80, ?)`,
    ).run(0, row.id, Date.now() - 2 * 86400_000);
    sqlite.prepare(
      `INSERT INTO trading_metrics
        (mt5_account_id, challenge_id, balance, equity, floating_pl, daily_pl, total_profit, current_drawdown,
         daily_drawdown, trailing_drawdown, relative_drawdown, absolute_drawdown, remaining_drawdown,
         profit_target_progress, trading_days_count, open_positions, closed_trades, win_rate, loss_rate,
         average_rr, profit_factor, expectancy, largest_win, largest_loss, consecutive_wins, consecutive_losses,
         risk_score, health_score, recorded_at)
       VALUES (?, ?, 10500, 10500, 0, 500, 600, 0, 0, 0, 0, 0, 1000, 0, 2, 0, 0, 50, 50, 1, 1, 0, 0, 0, 0, 0, 50, 80, ?)`,
    ).run(0, row.id, Date.now() - 86400_000);

    const provider = fakeProvider({ metrics: fakeMetrics({ totalProfit: 600, balance: 10600, equity: 10600, tradingDaysCount: 3 }), trades: [], suspendCalls: [] });

    await syncChallenge(getTestDb(), provider, row);
    const vs = storedViolations(row.id);
    expect(vs[0].code).toBe("consistency");
    expect(loadChallenge(row.id).status).toBe("violated");
  });

  it("detects copy trading from trade history", async () => {
    const db = getTestDb();
    const { row } = await createChallenge();
    // Trade-based rules require a bound account (the login is how history is fetched).
    const acc = db.insert(schema.mt5Accounts).values({
      userId: row.userId,
      login: "RL20001",
      password: "x",
      investorPassword: "y",
      server: "Test",
      leverage: 100,
      balance: 10000,
      equity: 10000,
      currency: "NGN",
      isActive: true,
      isSuspended: false,
      createdAt: Date.now(),
    }).returning().get();
    getTestSqlite().prepare("UPDATE user_challenges SET mt5_account_id = ? WHERE id = ?").run(acc.id, row.id);

    // Thursday midday — the weekend-holding rule must not fire here.
    const now = new Date("2026-08-06T12:00:00Z").getTime();
    const provider = fakeProvider({
      metrics: fakeMetrics(),
      trades: [
        { ticket: 1, login: "RL20001", symbol: "EURUSD", action: "buy", volume: 0.5, priceOpen: 1.2, priceClose: 1.21, profit: 10, commission: 0, swap: 0, openedAt: now - 600_000, closedAt: now - 300_000 },
        { ticket: 2, login: "RL20001", symbol: "EURUSD", action: "buy", volume: 0.5, priceOpen: 1.2, priceClose: 1.21, profit: 10, commission: 0, swap: 0, openedAt: now - 597_000, closedAt: now - 295_000 },
      ],
      suspendCalls: [],
    });

    await syncChallenge(db, provider, loadChallenge(row.id));
    const vs = storedViolations(row.id);
    expect(vs[0].code).toBe("copy_trading_detected");
    expect(loadChallenge(row.id).status).toBe("violated");
  });

  it("does not duplicate violations on a repeat sync while still active", async () => {
    const { row } = await createChallenge();
    const provider = fakeProvider({ metrics: fakeMetrics({ currentDrawdown: 2000, equity: 8000, balance: 8000 }), trades: [], suspendCalls: [] });

    // Pre-seed an existing max_drawdown violation (status still active).
    getTestSqlite().prepare("UPDATE user_challenges SET violations = ? WHERE id = ?").run(
      JSON.stringify([{ code: "max_drawdown", type: "max_drawdown", severity: "hard", message: "old", evidence: {}, detectedAt: Date.now() - 86400_000 }]),
      row.id,
    );

    await syncChallenge(getTestDb(), provider, row);
    const vs = storedViolations(row.id);
    expect(vs.length).toBe(1); // deduped by code
    expect(vs[0].code).toBe("max_drawdown");
  });

  it("violation wins over phase completion on the same sync", async () => {
    const { row } = await createChallenge();
    // Satisfies profit target + min days AND breaches max drawdown.
    const provider = fakeProvider({
      metrics: fakeMetrics({ totalProfit: 1500, balance: 11500, equity: 8000, currentDrawdown: 3500, tradingDaysCount: 3 }),
      trades: [],
      suspendCalls: [],
    });

    await syncChallenge(getTestDb(), provider, row);
    const after = loadChallenge(row.id);
    expect(after.status).toBe("violated");
    expect(storedViolations(row.id)[0].code).toBe("max_drawdown");
  });

  it("still advances phases when all rules are clean", async () => {
    const { row } = await createChallenge();
    const provider = fakeProvider({
      metrics: fakeMetrics({ totalProfit: 1500, balance: 11500, equity: 11500, tradingDaysCount: 3 }),
      trades: [],
      suspendCalls: [],
    });

    const outcome = await syncChallenge(getTestDb(), provider, row);
    expect(outcome.synced).toBe(true);
    const after = loadChallenge(row.id);
    expect(after.status).toBe("phase_1_passed");
    expect(storedViolations(row.id)).toEqual([]);

    const audit = latestAudit("challenge.phase_passed", row.id);
    expect(audit).toBeDefined();
  });

  it("suspends the live account on violation when one is bound", async () => {
    const sqlite = getTestSqlite();
    const db = getTestDb();

    const { row } = await createChallenge();
    // Bind an MT5 account so the suspension hook runs.
    const acc = db.insert(schema.mt5Accounts).values({
      userId: row.userId,
      login: "RL10001",
      password: "x",
      investorPassword: "y",
      server: "Test",
      leverage: 100,
      balance: 10000,
      equity: 10000,
      currency: "NGN",
      isActive: true,
      isSuspended: false,
      createdAt: Date.now(),
    }).returning().get();
    sqlite.prepare("UPDATE user_challenges SET mt5_account_id = ? WHERE id = ?").run(acc.id, row.id);

    const provider = fakeProvider({ metrics: fakeMetrics({ currentDrawdown: 2000, equity: 8000, balance: 8000 }), trades: [], suspendCalls: [] });
    await syncChallenge(db, provider, loadChallenge(row.id));

    expect(provider.suspendCalls).toContain("RL10001");
    const accAfter = db.select().from(schema.mt5Accounts).where(eq(schema.mt5Accounts.id, acc.id)).get();
    expect(accAfter!.isSuspended).toBe(true);
  });
});
