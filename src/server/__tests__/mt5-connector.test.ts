/**
 * MT5 Connector tests — provider factory, HTTP gateway provider (mocked fetch),
 * retry queue lifecycle, reconciliation engine, and admin endpoints.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from "vitest";
import type { Hono } from "hono";
import {
  ApiEnvelope,
  buildTestApp,
  cleanupTestDb,
  signUp,
  signIn,
  authGet,
  authPost,
  authPut,
  getTestDb,
  getTestSqlite,
} from "./setup";
import { users, settings, mt5SyncQueue, mt5Reconciliation } from "../schema";
import { eq } from "drizzle-orm";
import { getMT5Provider } from "../lib/mt5";
import {
  enqueueSyncJob,
  processSyncQueue,
  getQueueStats,
  getQueueEntries,
  retryJob,
} from "../lib/mt5/retry-queue";
import { runReconciliation, getReconciliationHistory } from "../lib/mt5/reconciliation";
import { getMT5Config } from "../lib/mt5/config";
import { MT5_CONFIG_SETTING } from "../lib/mt5/config";

let app: Hono;
let userCookie: string;
let adminCookie: string;
let adminUserId: number;

beforeAll(async () => {
  // Stable master key so the secret-store roundtrip works across the mocked
  // and non-mocked module contexts (see secrets.test.ts — mirrors a real
  // deployment with APP_SECRETS_KEY set in the Keys/API keys tab).
  process.env.APP_SECRETS_KEY = "test-master-key-0123456789abcdef";

  app = await buildTestApp();

  const { cookie: uc } = await signUp(app, {
    name: "MT5 Connector Trader",
    email: "mt5-connector-trader@test.com",
    password: "Secure@123",
  });
  userCookie = uc;

  await signUp(app, {
    name: "MT5 Connector Admin",
    email: "mt5-connector-admin@test.com",
    password: "Secure@123",
  });

  const db = getTestDb();
  const adminUser = db.select().from(users).where(eq(users.email, "mt5-connector-admin@test.com")).get();
  if (adminUser) {
    adminUserId = adminUser.id;
    await authPost(app, "/api/auth/promote-admin", "", { userId: adminUser.id });
  }

  const { cookie: reLogin } = await signIn(app, {
    email: "mt5-connector-admin@test.com",
    password: "Secure@123",
  });
  adminCookie = reLogin;
});

afterAll(() => {
  delete process.env.APP_SECRETS_KEY;
  cleanupTestDb();
});

// ═══════════════════════════════════════════════════════════════
//  PROVIDER FACTORY + CONFIG
// ═══════════════════════════════════════════════════════════════

describe("getMT5Provider factory", () => {
  it("returns the simulated provider when no gateway is configured", () => {
    const db = getTestDb();
    const provider = getMT5Provider(db);
    expect(provider.mode).toBe("simulated");
    expect(provider.configured).toBe(false);
  });

  it("returns the HTTP gateway provider when configured", () => {
    const db = getTestDb();
    // Clean any existing config, then insert an enabled config
    db.delete(settings).where(eq(settings.key, MT5_CONFIG_SETTING)).run();
    db.insert(settings).values({
      key: MT5_CONFIG_SETTING,
      value: JSON.stringify({
        enabled: true,
        baseUrls: ["https://mt5-gw.test:8443"],
        apiKey: "secret-key-1234",
        managerLogin: "999",
        managerPassword: "pw",
        group: "LIVE\\AFC",
        leverage: 100,
        serverName: "AfriFundedCapital-Live",
        requestTimeoutMs: 5000,
        maxRetries: 2,
        retryBaseDelayMs: 10,
        reconciliationTolerance: 0.01,
      }),
      group: "mt5",
      description: "test",
    }).run();

    const provider = getMT5Provider(db);
    expect(provider.mode).toBe("gateway");
    expect(provider.configured).toBe(true);
  });

  it("getMT5Config parses stored JSON with defaults", () => {
    const db = getTestDb();
    const cfg = getMT5Config(db);
    expect(cfg.enabled).toBe(true);
    expect(cfg.baseUrls).toEqual(["https://mt5-gw.test:8443"]);
    expect(cfg.reconciliationTolerance).toBe(0.01);
    // Defaults preserved for unset fields
    expect(cfg.retryBaseDelayMs).toBe(10); // was set in the stored value
    expect(typeof cfg.maxRetries).toBe("number");
  });
});

// ═══════════════════════════════════════════════════════════════
//  HTTP PROVIDER — mocked fetch
// ═══════════════════════════════════════════════════════════════

describe("HttpMT5Provider", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function buildProvider() {
    const db = getTestDb();
    return getMT5Provider(db) as {
      mode: string;
      ping(): Promise<{ ok: boolean; latencyMs: number; message: string }>;
      getAccountInfo(login: string): Promise<{ balance: number; equity: number; login: string }>;
      getTradeHistory(login: string, from: number, to: number): Promise<unknown[]>;
    };
  }

  it("ping reports ok when the gateway is reachable", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } })
    ) as unknown as typeof fetch;

    const provider = buildProvider();
    const result = await provider.ping();
    expect(result.ok).toBe(true);
    expect(result.message).toContain("Gateway reachable");
  });

  it("ping reports failure when the gateway is unreachable (network error)", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const provider = buildProvider();
    const result = await provider.ping();
    expect(result.ok).toBe(false);
    expect(result.message).toContain("ECONNREFUSED");
  });

  it("getAccountInfo returns parsed account data", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ login: "123456", group: "LIVE\\AFC", leverage: 100, balance: 10123.45, equity: 10200.0, floatingPL: 76.55, openPositions: 2, serverTime: Date.now(), currency: "NGN" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    ) as unknown as typeof fetch;

    const provider = buildProvider();
    const info = await provider.getAccountInfo("123456");
    expect(info.balance).toBe(10123.45);
    expect(info.equity).toBe(10200.0);
  });

  it("getAccountInfo throws on non-2xx", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "account not found" }), { status: 404 })
    ) as unknown as typeof fetch;

    const provider = buildProvider();
    await expect(provider.getAccountInfo("999999")).rejects.toThrow();
  });

  it("getTradeHistory returns an array from the gateway", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          trades: [
            { ticket: 1, login: "123456", symbol: "EURUSD", action: "buy", volume: 0.1, priceOpen: 1.05, priceClose: 1.06, profit: 100, commission: -5, swap: 0, openedAt: Date.now() - 1000, closedAt: Date.now() },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    ) as unknown as typeof fetch;

    const provider = buildProvider();
    const trades = await provider.getTradeHistory("123456", Date.now() - 3600000, Date.now());
    expect(Array.isArray(trades)).toBe(true);
    expect(trades.length).toBe(1);
  });

  it("retries transient 5xx errors then succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("boom", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ login: "123", balance: 1 }), { status: 200, headers: { "Content-Type": "application/json" } }));

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = buildProvider();
    const info = await provider.getAccountInfo("123");
    expect(info.balance).toBe(1);
    // First 503 + first retry success = 2 calls
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ═══════════════════════════════════════════════════════════════
//  RETRY QUEUE
// ═══════════════════════════════════════════════════════════════

describe("retry queue service", () => {
  beforeEach(() => {
    // Isolate: clear the queue and disable the gateway so tests run
    // deterministically against the simulated provider.
    const sqlite = getTestSqlite();
    sqlite.prepare("DELETE FROM mt5_sync_queue").run();
    const db = getTestDb();
    db.delete(settings).where(eq(settings.key, MT5_CONFIG_SETTING)).run();
  });

  it("enqueues a job and reports queue stats", () => {
    const db = getTestDb();
    const sqlite = getTestSqlite();
    const accountId = sqlite
      .prepare("INSERT INTO mt5_accounts (user_id, login, password, investor_password, server, \"group\", leverage, balance, equity, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(adminUserId, "TST1001", "pw", "inv", "Test", "DEMO\\AFC", 100, 10000, 10000, "NGN", Date.now());
    const id = Number(accountId.lastInsertRowid);

    enqueueSyncJob(db, { mt5AccountId: id, action: "sync", maxRetries: 2 });
    enqueueSyncJob(db, { mt5AccountId: id, action: "suspend", maxRetries: 2 });

    const stats = getQueueStats(db);
    expect(stats.pending).toBeGreaterThanOrEqual(2);
    expect(stats.total).toBeGreaterThanOrEqual(2);

    const entries = getQueueEntries(db, { page: 1, pageSize: 10 });
    expect(entries.items.length).toBeGreaterThanOrEqual(2);
    expect(entries.items[0].action).toBeTruthy();
  });

  it("processes sync jobs with the simulated provider", async () => {
    const db = getTestDb();
    const sqlite = getTestSqlite();
    const accountId = sqlite
      .prepare("INSERT INTO mt5_accounts (user_id, login, password, investor_password, server, \"group\", leverage, balance, equity, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(adminUserId, "TST1002", "pw", "inv", "Test", "DEMO\\AFC", 100, 10000, 10000, "NGN", Date.now());
    const id = Number(accountId.lastInsertRowid);

    const challenge = sqlite
      .prepare("INSERT INTO user_challenges (user_id, template_id, account_size_id, status, account_size, currency, profit_target, daily_drawdown, max_drawdown, max_leverage, min_trading_days, amount_paid, created_at, updated_at, mt5_account_id, current_phase) VALUES (?, ?, ?, 'active', ?, 'NGN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(adminUserId, 1, 1, 10000, 10, 5, 50, 100, 1, 100, Date.now(), Date.now(), id, 1);
    void challenge;

    // Age nothing — fresh challenge has no metrics, so sync runs
    enqueueSyncJob(db, { mt5AccountId: id, action: "sync", maxRetries: 1 });

    const provider = getMT5Provider(db);
    const result = await processSyncQueue(db, provider, { ignoreBackoff: true });
    expect(result.succeeded).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);

    const stats = getQueueStats(db);
    expect(stats.pending).toBe(0);
    expect(stats.done).toBeGreaterThanOrEqual(1);
  });

  it("marks jobs failed when a sync errors repeatedly", async () => {
    const db = getTestDb();
    const sqlite = getTestSqlite();
    const accountId = sqlite
      .prepare("INSERT INTO mt5_accounts (user_id, login, password, investor_password, server, \"group\", leverage, balance, equity, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(adminUserId, "TST1003", "pw", "inv", "Test", "DEMO\\AFC", 100, 10000, 10000, "NGN", Date.now());
    const id = Number(accountId.lastInsertRowid);

    // No challenge bound → sync action errors with "No active challenge"
    enqueueSyncJob(db, { mt5AccountId: id, action: "sync", maxRetries: 1 });

    const provider = getMT5Provider(db);
    const result = await processSyncQueue(db, provider, { ignoreBackoff: true });
    expect(result.failed).toBe(1);

    const failed = getQueueEntries(db, { status: "failed" });
    expect(failed.items.length).toBeGreaterThanOrEqual(1);
    expect(failed.items[0].error).toContain("No active challenge");
  });

  it("retryJob resets a failed job to pending", async () => {
    const db = getTestDb();
    const sqlite = getTestSqlite();
    const accountId = sqlite
      .prepare("INSERT INTO mt5_accounts (user_id, login, password, investor_password, server, \"group\", leverage, balance, equity, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(adminUserId, "TST1004", "pw", "inv", "Test", "DEMO\\AFC", 100, 10000, 10000, "NGN", Date.now());
    const id = Number(accountId.lastInsertRowid);

    // No challenge bound → sync action fails → job becomes failed
    enqueueSyncJob(db, { mt5AccountId: id, action: "sync", maxRetries: 1 });
    const provider = getMT5Provider(db);
    await processSyncQueue(db, provider, { ignoreBackoff: true });

    const failed = getQueueEntries(db, { status: "failed", page: 1, pageSize: 1 });
    expect(failed.items.length).toBe(1);
    const jobId = failed.items[0].id;
    expect(retryJob(db, jobId)).toBe(true);
    const refreshed = db.select().from(mt5SyncQueue).where(eq(mt5SyncQueue.id, jobId)).get();
    expect(refreshed?.status).toBe("pending");
  });
});

// ═══════════════════════════════════════════════════════════════
//  RECONCILIATION
// ═══════════════════════════════════════════════════════════════

describe("reconciliation engine", () => {
  beforeEach(() => {
    // Isolate: clear reconciliation history and disable the gateway so the
    // simulated consistency-check path is exercised.
    const sqlite = getTestSqlite();
    sqlite.prepare("DELETE FROM mt5_reconciliation").run();
    const db = getTestDb();
    db.delete(settings).where(eq(settings.key, MT5_CONFIG_SETTING)).run();
  });

  it("records entries for active challenges (simulated provider)", async () => {
    const db = getTestDb();
    const sqlite = getTestSqlite();

    const accountId = sqlite
      .prepare("INSERT INTO mt5_accounts (user_id, login, password, investor_password, server, \"group\", leverage, balance, equity, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(adminUserId, "REC1001", "pw", "inv", "Test", "DEMO\\AFC", 100, 10000, 10000, "NGN", Date.now());
    const id = Number(accountId.lastInsertRowid);

    // Active challenge bound to this account
    sqlite
      .prepare("INSERT INTO user_challenges (user_id, template_id, account_size_id, status, account_size, currency, profit_target, daily_drawdown, max_drawdown, max_leverage, min_trading_days, amount_paid, created_at, updated_at, mt5_account_id, current_phase) VALUES (?, ?, ?, 'active', ?, 'NGN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(adminUserId, 1, 1, 10000, 10, 5, 50, 100, 1, 100, Date.now(), Date.now(), id, 1);

    // Seed a matching metrics row so simulated reconciliation matches
    sqlite
      .prepare("INSERT INTO trading_metrics (mt5_account_id, challenge_id, balance, equity, floating_pl, daily_pl, total_profit, current_drawdown, daily_drawdown, trailing_drawdown, relative_drawdown, absolute_drawdown, remaining_drawdown, profit_target_progress, trading_days_count, open_positions, closed_trades, recorded_at) VALUES (?, (SELECT id FROM user_challenges WHERE mt5_account_id = ?), ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, ?)")
      .run(id, id, 10000, 10000, Date.now());

    const provider = getMT5Provider(db);
    const summary = await runReconciliation(db, provider);
    expect(summary.total).toBeGreaterThanOrEqual(1);
    expect(summary.source).toBe("simulated");

    const history = getReconciliationHistory(db, { limit: 10 });
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].login).toBe("REC1001");
    expect(history[0].status).toBe("matched");
  });

  it("flags a mismatch when local balance differs from metrics", async () => {
    const db = getTestDb();
    const sqlite = getTestSqlite();

    const accountId = sqlite
      .prepare("INSERT INTO mt5_accounts (user_id, login, password, investor_password, server, \"group\", leverage, balance, equity, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(adminUserId, "REC1002", "pw", "inv", "Test", "DEMO\\AFC", 100, 10000, 10000, "NGN", Date.now());
    const id = Number(accountId.lastInsertRowid);

    sqlite
      .prepare("INSERT INTO user_challenges (user_id, template_id, account_size_id, status, account_size, currency, profit_target, daily_drawdown, max_drawdown, max_leverage, min_trading_days, amount_paid, created_at, updated_at, mt5_account_id, current_phase) VALUES (?, ?, ?, 'active', ?, 'NGN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(adminUserId, 1, 1, 10000, 10, 5, 50, 100, 1, 100, Date.now(), Date.now(), id, 1);

    // Metrics show 10500 but account says 10000 → mismatch
    sqlite
      .prepare("INSERT INTO trading_metrics (mt5_account_id, challenge_id, balance, equity, floating_pl, daily_pl, total_profit, current_drawdown, daily_drawdown, trailing_drawdown, relative_drawdown, absolute_drawdown, remaining_drawdown, profit_target_progress, trading_days_count, open_positions, closed_trades, recorded_at) VALUES (?, (SELECT id FROM user_challenges WHERE mt5_account_id = ?), ?, ?, 0, 500, 500, 0, 0, 0, 0, 0, 0, 5, 1, 0, 0, ?)")
      .run(id, id, 10500, 10500, Date.now());

    const provider = getMT5Provider(db);
    const summary = await runReconciliation(db, provider, { tolerance: 0.01 });
    expect(summary.mismatch).toBeGreaterThanOrEqual(1);

    const history = getReconciliationHistory(db, { limit: 10 });
    const entry = history.find((h) => h.login === "REC1002");
    expect(entry).toBeDefined();
    expect(entry?.status).toBe("mismatch");
    expect(entry?.difference).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN ENDPOINTS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/trading/admin/status", () => {
  it("returns provider mode, config (redacted), queue and reconciliation info", async () => {
    // Self-contained: ensure a gateway config exists so the redaction is verifiable
    const db = getTestDb();
    db.insert(settings)
      .values({
        key: MT5_CONFIG_SETTING,
        value: JSON.stringify({ enabled: true, baseUrls: ["https://mt5-gw.test:8443"], apiKey: "secret-key-1234", managerLogin: "999", managerPassword: "pw", group: "LIVE\\AFC", leverage: 100, serverName: "AfriFundedCapital-Live", requestTimeoutMs: 5000, maxRetries: 2, retryBaseDelayMs: 10, reconciliationTolerance: 0.01 }),
        group: "mt5",
        description: "test",
      })
      .onConflictDoNothing()
      .run();

    const { status, body } = await authGet(app, "/api/trading/admin/status", adminCookie);
    expect(status).toBe(200);
    const result = body as ApiEnvelope;
    expect(result.providerMode).toBeTruthy();
    expect(result.config).toBeDefined();
    // Secrets must never leak
    expect(JSON.stringify(result.config)).not.toContain("secret-key-1234");
    expect(result.config.apiKeyLast4).toBe("1234");
    expect(result.queue).toHaveProperty("pending");
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authGet(app, "/api/trading/admin/status", userCookie);
    expect(status).toBe(403);
  });
});

describe("GET /api/trading/admin/config", () => {
  it("returns redacted config (no password)", async () => {
    const { status, body } = await authGet(app, "/api/trading/admin/config", adminCookie);
    expect(status).toBe(200);
    const result = body as ApiEnvelope;
    expect(result.config).toHaveProperty("enabled");
    expect(result.config).toHaveProperty("baseUrls");
    expect(JSON.stringify(result.config)).not.toContain("managerPassword");
    expect(JSON.stringify(result.config)).not.toContain("secret-key-1234");
  });
});

describe("PUT /api/trading/admin/config", () => {
  it("updates the gateway config and writes an audit trail", async () => {
    // Ensure an existing row so the update path (mt5.config_updated) is hit
    const db = getTestDb();
    db.insert(settings)
      .values({
        key: MT5_CONFIG_SETTING,
        value: JSON.stringify({ enabled: false, baseUrls: [], apiKey: "", managerLogin: "", managerPassword: "", group: "DEMO\\AFC", leverage: 100, serverName: "", requestTimeoutMs: 15000, maxRetries: 3, retryBaseDelayMs: 1000, reconciliationTolerance: 0.01 }),
        group: "mt5",
        description: "test",
      })
      .onConflictDoNothing()
      .run();

    const { status, body } = await authPut(app, "/api/trading/admin/config", adminCookie, {
      enabled: true,
      baseUrls: ["https://gw-a.test:8443", "https://gw-b.test:8443"],
      apiKey: "new-key-5678",
      managerLogin: "555",
      managerPassword: "new-pw",
      group: "LIVE\\AFC",
      leverage: 200,
      serverName: "AfriFundedCapital-Live",
      requestTimeoutMs: 10000,
      maxRetries: 4,
      retryBaseDelayMs: 2000,
      reconciliationTolerance: 0.5,
    });
    expect(status).toBe(200);
    expect((body as ApiEnvelope).success).toBe(true);

    // Redacted response — no password, no full key
    const redacted = (body as ApiEnvelope).config as Record<string, unknown>;
    expect(JSON.stringify(redacted)).not.toContain("new-pw");
    expect(redacted.apiKeyLast4).toBe("5678");
    expect(redacted.baseUrls).toHaveLength(2);

    // Provider now switches to gateway mode
    const provider = getMT5Provider(getTestDb());
    expect(provider.mode).toBe("gateway");

    // Audit entry written
    const sqlite = getTestSqlite();
    const audit = sqlite
      .prepare("SELECT action FROM audit_logs WHERE action LIKE 'mt5.config%' ORDER BY id DESC LIMIT 1")
      .get() as { action: string } | undefined;
    expect(audit).toBeDefined();
    expect(audit!.action).toBe("mt5.config_updated");
  });

  it("stores the apiKey via the encrypted secret store, never in plaintext settings", async () => {
    const db = getTestDb();
    const res = await authPut(app, "/api/trading/admin/config", adminCookie, {
      apiKey: "store-me-9999",
    });
    expect(res.status).toBe(200);
    expect((res.body as ApiEnvelope).config.apiKeyLast4).toBe("9999");

    // The plaintext settings row no longer carries the apiKey…
    const row = db.select().from(settings).where(eq(settings.key, MT5_CONFIG_SETTING)).get();
    expect(row).toBeTruthy();
    const parsed = JSON.parse(row!.value) as Record<string, unknown>;
    expect(parsed.apiKey).toBeUndefined();
    expect(JSON.stringify(parsed)).not.toContain("store-me-9999");

    // …it lives in the encrypted override instead (ciphertext never contains it).
    const override = db
      .select()
      .from(settings)
      .where(eq(settings.key, "secret_override:MT5_GATEWAY_API_KEY"))
      .get();
    expect(override).toBeTruthy();
    expect(override!.value).not.toContain("store-me-9999");

    // Cleanup so later tests see a clean secret store.
    db.delete(settings).where(eq(settings.key, "secret_override:MT5_GATEWAY_API_KEY")).run();
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authPut(app, "/api/trading/admin/config", userCookie, { enabled: true });
    expect(status).toBe(403);
  });
});

describe("POST /api/trading/admin/test-connection", () => {
  it("returns simulated mode info when no reachable gateway (mocked unreachable)", async () => {
    // With the config enabled, the provider is gateway — but the endpoint
    // gracefully handles ping failures. Restore simulated first.
    const db = getTestDb();
    db.delete(settings).where(eq(settings.key, MT5_CONFIG_SETTING)).run();

    const { status, body } = await authPost(app, "/api/trading/admin/test-connection", adminCookie, {});
    expect(status).toBe(200);
    const result = body as ApiEnvelope;
    expect(result.mode).toBe("simulated");
    expect(result.ok).toBe(true);
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authPost(app, "/api/trading/admin/test-connection", userCookie, {});
    expect(status).toBe(403);
  });
});

describe("POST /api/trading/admin/queue/process", () => {
  it("processes pending jobs and reports counts", async () => {
    const { status, body } = await authPost(app, "/api/trading/admin/queue/process", adminCookie, {
      ignoreBackoff: true,
    });
    expect(status).toBe(200);
    const result = body as ApiEnvelope;
    expect(result).toHaveProperty("processed");
    expect(result).toHaveProperty("succeeded");
    expect(result).toHaveProperty("failed");
    expect(result).toHaveProperty("providerMode");
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authPost(app, "/api/trading/admin/queue/process", userCookie, {});
    expect(status).toBe(403);
  });
});

describe("GET /api/trading/admin/queue", () => {
  it("returns queue stats and entries", async () => {
    const { status, body } = await authGet(app, "/api/trading/admin/queue", adminCookie);
    expect(status).toBe(200);
    const result = body as ApiEnvelope;
    expect(result.stats).toHaveProperty("pending");
    expect(Array.isArray(result.items)).toBe(true);
  });
});

describe("POST /api/trading/admin/reconcile", () => {
  it("runs a reconciliation pass", async () => {
    const { status, body } = await authPost(app, "/api/trading/admin/reconcile", adminCookie, {});
    expect(status).toBe(200);
    const result = body as ApiEnvelope;
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("matched");
    expect(result).toHaveProperty("mismatch");
    expect(result.source).toBeTruthy();
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authPost(app, "/api/trading/admin/reconcile", userCookie, {});
    expect(status).toBe(403);
  });
});

describe("GET /api/trading/admin/reconcile/history", () => {
  it("returns recorded reconciliation entries", async () => {
    const { status, body } = await authGet(app, "/api/trading/admin/reconcile/history", adminCookie);
    expect(status).toBe(200);
    const result = body as ApiEnvelope;
    expect(Array.isArray(result.items)).toBe(true);
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authGet(app, "/api/trading/admin/reconcile/history", userCookie);
    expect(status).toBe(403);
  });
});

describe("mt5_reconciliation table", () => {
  it("was created by migrations", () => {
    const sqlite = getTestSqlite();
    const table = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mt5_reconciliation'")
      .get();
    expect(table).toBeDefined();
  });

  it("stores entries with source + difference", () => {
    const db = getTestDb();
    const entries = db.select().from(mt5Reconciliation).limit(1).all();
    if (entries.length > 0) {
      expect(entries[0]).toHaveProperty("login");
      expect(entries[0]).toHaveProperty("source");
      expect(entries[0]).toHaveProperty("difference");
    }
  });
});
