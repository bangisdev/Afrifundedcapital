/**
 * MT5 reconciliation drift-detection unit tests.
 *
 * `runReconciliation` compares the live server state (via the provider) — or,
 * in simulated mode, the latest stored trading metrics — against the locally
 * stored account snapshot, classifying each account as matched / mismatch /
 * unavailable under a numeric tolerance. Coverage:
 *
 *   1. Tolerance boundary semantics: within, exactly-at (inclusive), and over.
 *   2. Balance drift and equity-only drift detection (simulated + gateway).
 *   3. Gateway error handling → unavailable, with the audit entry recorded.
 *   4. Missing-account handling and the `accountId` filter option.
 *
 * Fixtures use raw SQL against the shared test DB (unique logins per test) and
 * a fake gateway provider injected through the `MT5Provider` seam, so no live
 * server is ever touched.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb, getTestSqlite, cleanupTestDb } from "./setup";
import { settings } from "../schema";
import { MT5_CONFIG_SETTING } from "../lib/mt5/config";
import { getMT5Provider } from "../lib/mt5";
import { runReconciliation, getReconciliationHistory } from "../lib/mt5/reconciliation";
import type { MT5Provider, MT5AccountInfo } from "../lib/mt5/types";

let userId: number;

beforeAll(() => {
  getTestDb();
  const sqlite = getTestSqlite();
  const res = sqlite
    .prepare(
      "INSERT INTO users (name, email, email_verified, role, created_at, updated_at) VALUES ('Recon Tester', 'recon-tester@test.com', 1, 'user', ?, ?)",
    )
    .run(Date.now(), Date.now());
  userId = Number(res.lastInsertRowid);
});

afterAll(() => {
  cleanupTestDb();
});

beforeEach(() => {
  const sqlite = getTestSqlite();
  sqlite.prepare("DELETE FROM mt5_reconciliation").run();
  sqlite.prepare("DELETE FROM user_challenges").run();
  sqlite.prepare("DELETE FROM mt5_accounts").run();
  sqlite.prepare("DELETE FROM trading_metrics").run();
  const db = getTestDb();
  db.delete(settings).where(eq(settings.key, MT5_CONFIG_SETTING)).run();
});

/** Insert an MT5 account + active challenge; returns the account id. */
function seedAccountWithChallenge(
  login: string,
  balance: number,
  equity: number,
  opts: { mt5AccountId?: number | null } = {},
): number {
  const sqlite = getTestSqlite();
  const res = sqlite
    .prepare(
      `INSERT INTO mt5_accounts (user_id, login, password, investor_password, server, "group", leverage, balance, equity, currency, created_at) VALUES (?, ?, 'pw', 'inv', 'Test', 'DEMO\\AFC', 100, ?, ?, 'NGN', ?)`,
    )
    .run(userId, login, balance, equity, Date.now());
  const accountId = Number(res.lastInsertRowid);
  sqlite
    .prepare(
      `INSERT INTO user_challenges (user_id, template_id, account_size_id, status, account_size, currency, profit_target, daily_drawdown, max_drawdown, max_leverage, min_trading_days, amount_paid, created_at, updated_at, mt5_account_id, current_phase) VALUES (?, 1, 1, 'active', ?, 'NGN', 10, 5, 50, 100, 1, 100, ?, ?, ?, 1)`,
    )
    .run(userId, balance, Date.now(), Date.now(), opts.mt5AccountId === undefined ? accountId : opts.mt5AccountId);
  return accountId;
}

/** Insert a latest-metrics row (the simulated reconciliation source). */
function seedLatestMetrics(accountId: number, balance: number, equity: number): void {
  const sqlite = getTestSqlite();
  sqlite
    .prepare(
      `INSERT INTO trading_metrics (mt5_account_id, challenge_id, balance, equity, floating_pl, daily_pl, total_profit, current_drawdown, daily_drawdown, trailing_drawdown, relative_drawdown, absolute_drawdown, remaining_drawdown, profit_target_progress, trading_days_count, open_positions, closed_trades, recorded_at) VALUES (?, (SELECT id FROM user_challenges WHERE mt5_account_id = ?), ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, ?)`,
    )
    .run(accountId, accountId, balance, equity, Date.now());
}

/** Find the most recent reconciliation entry for a login. */
function latestEntry(login: string) {
  const history = getReconciliationHistory(getTestDb(), { limit: 50 });
  return history.find((h) => h.login === login);
}

/** A fake gateway provider whose `getAccountInfo` is fully controlled. */
function fakeGatewayProvider(
  getAccountInfo: (login: string) => Promise<Pick<MT5AccountInfo, "balance" | "equity">>,
): MT5Provider {
  const fn = vi.fn(getAccountInfo);
  return {
    mode: "gateway",
    configured: true,
    getAccountInfo: fn,
  } as unknown as MT5Provider;
}

// ═══════════════════════════════════════════════════════════════
//  SIMULATED MODE — latest metrics vs local snapshot
// ═══════════════════════════════════════════════════════════════

describe("simulated drift detection (latest metrics vs local snapshot)", () => {
  it("matches when the latest metrics agree with the account", async () => {
    const db = getTestDb();
    const accountId = seedAccountWithChallenge("DRIFT-OK", 10_000, 10_000);
    seedLatestMetrics(accountId, 10_000, 10_000);

    const summary = await runReconciliation(db, getMT5Provider(db));
    expect(summary.source).toBe("simulated");
    expect(summary.total).toBe(1);
    expect(summary.matched).toBe(1);
    expect(summary.mismatch).toBe(0);
    expect(summary.unavailable).toBe(0);

    const entry = latestEntry("DRIFT-OK");
    expect(entry?.status).toBe("matched");
    expect(entry?.difference).toBe(0);
    expect(entry?.tolerance).toBe(0.01);
  });

  it("treats a drift within tolerance as matched", async () => {
    const db = getTestDb();
    const accountId = seedAccountWithChallenge("DRIFT-WITHIN", 10_000, 10_000);
    seedLatestMetrics(accountId, 10_000.005, 10_000);

    const summary = await runReconciliation(db, getMT5Provider(db), { tolerance: 0.01 });
    expect(summary.matched).toBe(1);
    expect(summary.mismatch).toBe(0);
    expect(latestEntry("DRIFT-WITHIN")?.status).toBe("matched");
  });

  it("treats a drift exactly at tolerance as matched (inclusive boundary)", async () => {
    // 10_000.5 and 0.5 are exactly representable in binary64, so the diff is
    // exactly the tolerance — the <= comparison must count it as matched.
    const db = getTestDb();
    const accountId = seedAccountWithChallenge("DRIFT-EDGE", 10_000, 10_000);
    seedLatestMetrics(accountId, 10_000.5, 10_000);

    const summary = await runReconciliation(db, getMT5Provider(db), { tolerance: 0.5 });
    expect(summary.matched).toBe(1);
    expect(summary.mismatch).toBe(0);
    expect(latestEntry("DRIFT-EDGE")?.difference).toBe(0.5);
  });

  it("flags a mismatch once drift exceeds the tolerance", async () => {
    const db = getTestDb();
    const accountId = seedAccountWithChallenge("DRIFT-OVER", 10_000, 10_000);
    seedLatestMetrics(accountId, 10_000.02, 10_000);

    const summary = await runReconciliation(db, getMT5Provider(db), { tolerance: 0.01 });
    expect(summary.mismatch).toBe(1);
    expect(summary.matched).toBe(0);

    const entry = latestEntry("DRIFT-OVER");
    expect(entry?.status).toBe("mismatch");
    expect(entry?.difference).toBe(0.02);
    expect(entry?.detail).toBe("latest metrics snapshot");
  });

  it("flags a mismatch on equity-only drift when the balance matches", async () => {
    const db = getTestDb();
    const accountId = seedAccountWithChallenge("DRIFT-EQ", 10_000, 10_000);
    seedLatestMetrics(accountId, 10_000, 9_800); // same balance, 200 lower equity

    const summary = await runReconciliation(db, getMT5Provider(db), { tolerance: 0.01 });
    expect(summary.mismatch).toBe(1);
    expect(summary.matched).toBe(0);
  });

  it("a zero tolerance flags any nonzero drift", async () => {
    const db = getTestDb();
    const accountId = seedAccountWithChallenge("DRIFT-ZERO", 10_000, 10_000);
    seedLatestMetrics(accountId, 10_010, 10_000);

    const summary = await runReconciliation(db, getMT5Provider(db), { tolerance: 0 });
    expect(summary.mismatch).toBe(1);
    expect(latestEntry("DRIFT-ZERO")?.difference).toBe(10);
  });

  it("falls back to the local snapshot when no metrics exist (matched)", async () => {
    const db = getTestDb();
    seedAccountWithChallenge("DRIFT-NOMETRICS", 10_000, 10_000);

    const summary = await runReconciliation(db, getMT5Provider(db));
    expect(summary.matched).toBe(1);
    expect(latestEntry("DRIFT-NOMETRICS")?.status).toBe("matched");
  });

  it("counts active challenges without an MT5 account as unavailable", async () => {
    const db = getTestDb();
    seedAccountWithChallenge("DRIFT-NOACCT", 10_000, 10_000, { mt5AccountId: null });

    const summary = await runReconciliation(db, getMT5Provider(db));
    expect(summary.total).toBe(1);
    expect(summary.unavailable).toBe(1);
    expect(summary.matched).toBe(0);
    expect(summary.mismatch).toBe(0);
  });

  it("restricts the pass to a single account with the accountId option", async () => {
    const db = getTestDb();
    const a = seedAccountWithChallenge("DRIFT-A", 10_000, 10_000);
    seedAccountWithChallenge("DRIFT-B", 20_000, 20_000);

    const summary = await runReconciliation(db, getMT5Provider(db), { accountId: a });
    expect(summary.total).toBe(1);
    expect(latestEntry("DRIFT-A")).toBeDefined();
    expect(latestEntry("DRIFT-B")).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
//  GATEWAY MODE — live server snapshot vs local snapshot
// ═══════════════════════════════════════════════════════════════

describe("gateway drift detection (live server snapshot)", () => {
  it("matches when the live snapshot agrees with the local account", async () => {
    const db = getTestDb();
    seedAccountWithChallenge("GW-OK", 10_000, 10_000);
    const provider = fakeGatewayProvider(async () => ({ balance: 10_000, equity: 10_000 }));

    const summary = await runReconciliation(db, provider);
    expect(summary.source).toBe("gateway");
    expect(summary.matched).toBe(1);
    expect(summary.mismatch).toBe(0);
    expect(summary.unavailable).toBe(0);

    const entry = latestEntry("GW-OK");
    expect(entry?.status).toBe("matched");
    expect(entry?.detail).toBe("live server snapshot");
    expect(entry?.source).toBe("gateway");
  });

  it("flags a mismatch on live balance drift and records the difference", async () => {
    const db = getTestDb();
    seedAccountWithChallenge("GW-DRIFT", 10_000, 10_000);
    const provider = fakeGatewayProvider(async () => ({ balance: 10_250, equity: 10_250 }));

    const summary = await runReconciliation(db, provider);
    expect(summary.mismatch).toBe(1);
    expect(summary.matched).toBe(0);

    const entry = latestEntry("GW-DRIFT");
    expect(entry?.status).toBe("mismatch");
    expect(entry?.difference).toBe(250);
    expect(entry?.serverBalance).toBe(10_250);
    expect(entry?.localBalance).toBe(10_000);
    expect(entry?.detail).toBe("live server snapshot");
  });

  it("applies the tolerance to live snapshots", async () => {
    const db = getTestDb();
    seedAccountWithChallenge("GW-TOL", 10_000, 10_000);
    const provider = fakeGatewayProvider(async () => ({ balance: 10_000.005, equity: 10_000 }));

    const summary = await runReconciliation(db, provider, { tolerance: 0.01 });
    expect(summary.matched).toBe(1);
    expect(summary.mismatch).toBe(0);
  });

  it("records an unavailable entry when the gateway errors", async () => {
    const db = getTestDb();
    seedAccountWithChallenge("GW-DOWN", 10_000, 10_000);
    const provider = fakeGatewayProvider(async () => {
      throw new Error("Manager API connection refused");
    });

    const summary = await runReconciliation(db, provider);
    expect(summary.unavailable).toBe(1);
    expect(summary.matched).toBe(0);
    expect(summary.mismatch).toBe(0);

    const entry = latestEntry("GW-DOWN");
    expect(entry?.status).toBe("unavailable");
    expect(entry?.detail).toContain("Manager API connection refused");
    expect(entry?.source).toBe("gateway");
  });
});
