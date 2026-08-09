import { Hono } from "hono";
import { getDb } from "../db";
import {
  tradingMetrics,
  mt5Accounts,
  drawdownHistory,
  userChallenges,
  users,
  settings,
} from "../schema";
import {
  eq,
  desc,
  asc,
  and,
  sql,
  count,
  like,
  or,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";
import { getMT5Provider } from "../lib/mt5";
import { getMT5Config, redactMT5Config, MT5_CONFIG_SETTING, isMT5GatewayConfigured } from "../lib/mt5/config";
import { setSecretOverride } from "../lib/secrets";
import { syncChallenge, getActiveChallenges } from "../lib/mt5/sync-service";
import {
  enqueueSyncJob,
  processSyncQueue,
  getQueueStats,
  getQueueEntries,
  retryJob,
  retryAllFailed,
} from "../lib/mt5/retry-queue";
import {
  runReconciliation,
  getReconciliationHistory,
  getReconciliationStatus,
} from "../lib/mt5/reconciliation";
import { writeAuditLog, redactSetting } from "../lib/audit";
import { createNotification } from "../lib/notifications";

const app = new Hono();

// ─── MT5 Accounts ──────────────────────────────────────

app.get("/mt5", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();

  const qPage = Number(c.req.query("page") || 1);
  const qPageSize = Number(c.req.query("pageSize") || 10);
  const page = Math.max(1, qPage);
  const pageSize = Math.min(50, Math.max(1, qPageSize));

  // Sorting (whitelisted columns, asc/desc)
  const SORTABLE: Record<string, SQLWrapper> = {
    id: mt5Accounts.id,
    login: mt5Accounts.login,
    server: mt5Accounts.server,
    group: mt5Accounts.group,
    leverage: mt5Accounts.leverage,
    balance: mt5Accounts.balance,
    equity: mt5Accounts.equity,
    lastSyncAt: mt5Accounts.lastSyncAt,
    createdAt: mt5Accounts.createdAt,
  };
  const qSortBy = String(c.req.query("sortBy") || "createdAt");
  const qSortOrder = String(c.req.query("sortOrder") || "desc");
  const sortCol = SORTABLE[qSortBy] || mt5Accounts.createdAt;
  const sortOrder = qSortOrder.toLowerCase() === "asc" ? asc(sortCol) : desc(sortCol);

  const whereClause: SQL = eq(mt5Accounts.userId, userId);

  // Total matching count
  const totalRow = db.select({ count: count() }).from(mt5Accounts).where(whereClause).get();
  const total = totalRow?.count || 0;

  // Page of accounts
  const accounts = db
    .select()
    .from(mt5Accounts)
    .where(whereClause)
    .orderBy(sortOrder)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  // User-wide stats (unfiltered)
  const all = db
    .select({ isActive: mt5Accounts.isActive, isSuspended: mt5Accounts.isSuspended })
    .from(mt5Accounts)
    .where(whereClause)
    .all();
  const byStatus = {
    active: all.filter((a) => a.isActive && !a.isSuspended).length,
    suspended: all.filter((a) => a.isSuspended).length,
    inactive: all.filter((a) => !a.isActive && !a.isSuspended).length,
  };

  return c.json({
    accounts,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats: { total: all.length, byStatus },
  });
});

// ─── Challenge Metrics ─────────────────────────────────

app.get("/challenge/:id/metrics", requireAuth, (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const latest = db.select().from(tradingMetrics)
    .where(eq(tradingMetrics.challengeId, id))
    .orderBy(desc(tradingMetrics.recordedAt))
    .limit(1).get();
  return c.json(latest || null);
});

app.get("/challenge/:id/history", requireAuth, (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const history = db.select().from(tradingMetrics)
    .where(eq(tradingMetrics.challengeId, id))
    .orderBy(tradingMetrics.recordedAt).all();
  return c.json(history);
});

app.get("/challenge/:id/drawdown", requireAuth, (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const history = db.select().from(drawdownHistory)
    .where(eq(drawdownHistory.challengeId, id))
    .orderBy(drawdownHistory.recordedAt).all();
  return c.json(history);
});

// ─── Manual Sync (user triggers for own account) ──────

app.post("/sync", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();
  const provider = getMT5Provider(db);

  // Get active challenges for this user
  const challenges = db.select().from(userChallenges)
    .where(and(
      eq(userChallenges.userId, userId),
      eq(userChallenges.status, "active"),
    )).all();

  if (challenges.length === 0) {
    return c.json({ synced: 0, message: "No active challenges to sync" });
  }

  // If specific challenge requested
  const targetId = body.challengeId ? parseInt(body.challengeId) : null;
  const targets = targetId
    ? challenges.filter((ch) => ch.id === targetId)
    : challenges;

  let synced = 0;
  let skipped = 0;
  let queued = 0;

  for (const challenge of targets) {
    const outcome = await syncChallenge(db, provider, challenge);
    if (outcome.synced) {
      synced++;
    } else if (outcome.reason === "already_synced") {
      skipped++;
    } else if (outcome.error) {
      // Enqueue a retry job so the failure is retried with backoff.
      if (challenge.mt5AccountId) {
        enqueueSyncJob(db, {
          mt5AccountId: challenge.mt5AccountId,
          action: "sync",
          payload: { challengeId: challenge.id, error: outcome.error },
        });
        queued++;
      }
      skipped++;
    } else {
      skipped++;
    }
  }

  return c.json({
    synced,
    skipped,
    queued,
    source: provider.mode,
    message: synced > 0
      ? `Synced ${synced} challenge(s) with latest metrics`
      : queued > 0
        ? `Sync failed for ${queued} challenge(s) — added to retry queue`
        : "All challenges already synced today",
  });
});

// ─── Admin: Sync All Active Accounts ───────────────────

app.post("/admin/sync-all", requireAuth, requireAdmin, async (c) => {
  const db = getDb();
  const provider = getMT5Provider(db);

  const activeChallenges = getActiveChallenges(db);

  let synced = 0;
  let skipped = 0;
  let queued = 0;

  for (const challenge of activeChallenges) {
    const outcome = await syncChallenge(db, provider, challenge);
    if (outcome.synced) {
      synced++;
    } else if (outcome.error) {
      if (challenge.mt5AccountId) {
        enqueueSyncJob(db, {
          mt5AccountId: challenge.mt5AccountId,
          action: "sync",
          payload: { challengeId: challenge.id, error: outcome.error },
        });
        queued++;
      }
      skipped++;
    } else {
      skipped++;
    }
  }

  return c.json({
    synced,
    skipped,
    queued,
    total: activeChallenges.length,
    source: provider.mode,
    message: `Synced ${synced}, skipped ${skipped} (already synced today)${queued ? `, ${queued} queued for retry` : ""}`,
  });
});

// ─── Demo Seeding ──────────────────────────────────────

app.post("/seed-demo", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const db = getDb();
  const challengeId = body.challengeId;

  const challenge = db.select().from(userChallenges)
    .where(and(eq(userChallenges.id, challengeId), eq(userChallenges.userId, userId)))
    .get();

  if (!challenge) return c.json({ error: "Challenge not found" }, 404);

  const existing = db.select({ cnt: count() }).from(tradingMetrics)
    .where(eq(tradingMetrics.challengeId, challengeId)).get();
  if (existing && (existing.cnt ?? 0) > 0) return c.json({ success: true, seeded: false });

  const now = Date.now();
  const DAY = 86400000;
  const baseBalance = challenge.accountSize;

  for (let i = 0; i < 60; i++) {
    const t = now - (60 - i) * DAY;
    const variance = (Math.random() - 0.45) * baseBalance * 0.02;
    const balance = baseBalance + (i * variance);
    const equity = balance + (Math.random() - 0.5) * baseBalance * 0.01;
    const dailyPL = variance;
    const totalProfit = balance - baseBalance;

    const metricsData = {
      mt5AccountId: challenge.mt5AccountId || 0,
      challengeId,
      balance: Math.round(balance * 100) / 100,
      equity: Math.round(equity * 100) / 100,
      floatingPL: Math.round((equity - balance) * 100) / 100,
      dailyPL: Math.round(dailyPL * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
      currentDrawdown: Math.max(0, Math.round((baseBalance - equity) * 100) / 100),
      dailyDrawdown: Math.max(0, Math.round(-dailyPL * 100) / 100),
      trailingDrawdown: 0,
      relativeDrawdown: 0,
      absoluteDrawdown: 0,
      remainingDrawdown: Math.round((challenge.maxDrawdown - (baseBalance - equity)) * 100) / 100,
      profitTargetProgress: Math.min(100, Math.round((totalProfit / (challenge.profitTarget * baseBalance / 100)) * 100)),
      tradingDaysCount: i + 1,
      openPositions: Math.floor(Math.random() * 5),
      closedTrades: i * 3 + Math.floor(Math.random() * 3),
      winRate: 50 + Math.random() * 15,
      lossRate: 35 + Math.random() * 10,
      averageRR: 1.5 + Math.random(),
      profitFactor: 1.2 + Math.random() * 0.8,
      expectancy: 50 + Math.random() * 100,
      largestWin: Math.round(baseBalance * 0.02 * Math.random() * 100) / 100,
      largestLoss: -Math.round(baseBalance * 0.01 * Math.random() * 100) / 100,
      consecutiveWins: Math.floor(Math.random() * 8) + 1,
      consecutiveLosses: Math.floor(Math.random() * 5) + 1,
      riskScore: Math.round(Math.random() * 100),
      healthScore: 60 + Math.floor(Math.random() * 35),
      recordedAt: t,
    };

    db.insert(tradingMetrics).values(metricsData).run();
  }

  return c.json({ success: true, seeded: true });
});

// ─── Reset Demo Data ───────────────────────────────────

app.post("/reset-demo", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const db = getDb();

  const challenge = db.select().from(userChallenges)
    .where(and(eq(userChallenges.id, body.challengeId), eq(userChallenges.userId, userId)))
    .get();

  if (!challenge) return c.json({ error: "Challenge not found" }, 404);

  db.delete(tradingMetrics).where(eq(tradingMetrics.challengeId, body.challengeId)).run();
  db.delete(drawdownHistory).where(eq(drawdownHistory.challengeId, body.challengeId)).run();
  return c.json({ success: true });
});

// ─── Admin: Create MT5 Account ─────────────────────────

app.post("/admin/mt5", requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json();
  const db = getDb();
  const provider = getMT5Provider(db);

  const leverage = body.leverage || 100;
  const password = body.password || "Afc@12345";
  const investorPassword = body.investorPassword || "Afc@12345";

  const user = body.userId
    ? db.select().from(users).where(eq(users.id, parseInt(body.userId))).get()
    : null;

  let login = "AFC" + Math.floor(100000 + Math.random() * 900000);
  let server = "AfriFundedCapital-Demo";
  let group = "DEMO\\AFC";

  // When a gateway is configured, provision the account on the live MT5 server.
  if (provider.mode === "gateway") {
    try {
      const created = await provider.createAccount({
        name: user?.name || "Trader",
        email: user?.email || "",
        balance: body.balance || 0,
        leverage,
        group: body.group || "DEMO\\AFC",
        password,
        investorPassword,
      });
      login = created.login;
      server = created.server;
      group = body.group || "DEMO\\AFC";
    } catch (err) {
      return c.json({
        error: `MT5 gateway account creation failed: ${err instanceof Error ? err.message : "unknown error"}`,
      }, 502);
    }
  }

  const result = db.insert(mt5Accounts).values({
    userId: body.userId,
    login,
    password,
    investorPassword,
    server,
    group,
    leverage,
    balance: body.balance || 0,
    equity: body.equity || 0,
    createdAt: Date.now(),
  }).returning().get();

  // Record an audit trail for account provisioning.
  try {
    writeAuditLog(db, {
      userId: c.get("userId"),
      action: "mt5.account_created",
      entity: "mt5_account",
      entityId: String(result.id),
      details: { login, server, group, leverage, provisioned: provider.mode },
      ipAddress: c.req.header("x-forwarded-for") || undefined,
    });
  } catch {
    /* audit is non-critical */
  }

  return c.json({ ...result, provisioned: provider.mode });
});

// ─── Admin: MT5 Accounts (paginated list) ───────────────

app.get("/admin/mt5", requireAuth, requireAdmin, (c) => {
  const db = getDb();

  // Pagination params (clamped)
  const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") || "20") || 20));

  // Filters
  const search = (c.req.query("search") || "").trim();
  const status = c.req.query("status") || "";

  const conditions: SQL[] = [];
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        like(mt5Accounts.login, pattern),
        like(mt5Accounts.server, pattern),
        like(users.name, pattern),
        like(users.email, pattern),
      )!,
    );
  }
  if (status === "active") conditions.push(eq(mt5Accounts.isActive, true));
  if (status === "suspended") conditions.push(eq(mt5Accounts.isSuspended, true));
  if (status === "inactive") conditions.push(eq(mt5Accounts.isActive, false));
  const whereClause: SQL = conditions.length > 0 ? and(...conditions)! : sql`1 = 1`;

  // Total matching count
  const totalRow = db
    .select({ count: count() })
    .from(mt5Accounts)
    .leftJoin(users, eq(users.id, mt5Accounts.userId))
    .where(whereClause)
    .get();
  const total = totalRow?.count || 0;

  // Page of accounts with user info joined
  const rows = db
    .select({ account: mt5Accounts, userName: users.name, userEmail: users.email })
    .from(mt5Accounts)
    .leftJoin(users, eq(users.id, mt5Accounts.userId))
    .where(whereClause)
    .orderBy(desc(mt5Accounts.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  // Stats
  const totalAccounts = db.select({ cnt: count() }).from(mt5Accounts).get();
  const activeAccounts = db
    .select({ cnt: count() })
    .from(mt5Accounts)
    .where(eq(mt5Accounts.isActive, true))
    .get();
  const suspendedAccounts = db
    .select({ cnt: count() })
    .from(mt5Accounts)
    .where(eq(mt5Accounts.isSuspended, true))
    .get();
  const sumBalance = db.select({ total: sql`COALESCE(SUM(${mt5Accounts.balance}), 0)` }).from(mt5Accounts).get();

  const items = rows.map((r) => ({
    ...r.account,
    userName: r.userName,
    userEmail: r.userEmail,
  }));

  return c.json({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats: {
      total: totalAccounts?.cnt || 0,
      active: activeAccounts?.cnt || 0,
      suspended: suspendedAccounts?.cnt || 0,
      totalBalance: sumBalance?.total || 0,
    },
  });
});

// ─── Admin: Provider Status ────────────────────────────

app.get("/admin/status", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const provider = getMT5Provider(db);
  const config = getMT5Config(db);
  const queue = getQueueStats(db);
  const reconciliation = getReconciliationStatus(db);

  const lastSync = db
    .select()
    .from(mt5Accounts)
    .where(sql`last_sync_at IS NOT NULL`)
    .orderBy(desc(mt5Accounts.lastSyncAt))
    .limit(1)
    .get();

  return c.json({
    providerMode: provider.mode,
    configured: isMT5GatewayConfigured(db),
    config: redactMT5Config(config),
    queue,
    reconciliation,
    lastSyncAt: lastSync?.lastSyncAt ?? null,
  });
});

// ─── Admin: Gateway Connection Test ─────────────────────

app.post("/admin/test-connection", requireAuth, requireAdmin, async (c) => {
  const db = getDb();
  const provider = getMT5Provider(db);

  if (provider.mode === "simulated") {
    return c.json({
      ok: true,
      mode: "simulated",
      message: "No MT5 gateway configured — using simulated data. Add a gateway in Settings → MT5 to switch to live.",
    });
  }

  const ping = await provider.ping();
  return c.json({ ...ping, mode: "gateway" });
});

// ─── Admin: MT5 Config (read/write) ────────────────────

app.get("/admin/config", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  return c.json({ config: redactMT5Config(getMT5Config(db)) });
});

app.put("/admin/config", requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json();
  const db = getDb();
  const current = getMT5Config(db);

  // The gateway bearer token is a managed secret: a provided value is stored
  // encrypted via the secret store (admin override) and is never written to
  // the settings JSON. Legacy configs that predate the store keep their stored
  // key until it is replaced, so existing installs don't break.
  const rawApiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  let legacyApiKey = "";
  if (!rawApiKey) {
    const stored = db.select().from(settings).where(eq(settings.key, MT5_CONFIG_SETTING)).get();
    if (stored) {
      try {
        legacyApiKey = (JSON.parse(stored.value) as { apiKey?: string }).apiKey ?? "";
      } catch { /* invalid stored JSON — ignore */ }
    }
  }
  if (rawApiKey) {
    setSecretOverride("MT5_GATEWAY_API_KEY", rawApiKey);
  }

  const next = {
    ...current,
    enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled,
    baseUrls: Array.isArray(body.baseUrls)
      ? body.baseUrls.map(String).map((s: string) => s.trim()).filter(Boolean)
      : current.baseUrls,
    apiKey: rawApiKey || legacyApiKey,
    managerLogin: typeof body.managerLogin === "string" ? body.managerLogin.trim() : current.managerLogin,
    managerPassword: typeof body.managerPassword === "string" ? body.managerPassword : current.managerPassword,
    group: typeof body.group === "string" && body.group.trim() ? body.group.trim() : current.group,
    leverage: typeof body.leverage === "number" ? body.leverage : current.leverage,
    serverName: typeof body.serverName === "string" && body.serverName.trim() ? body.serverName.trim() : current.serverName,
    requestTimeoutMs: typeof body.requestTimeoutMs === "number" ? body.requestTimeoutMs : current.requestTimeoutMs,
    maxRetries: typeof body.maxRetries === "number" ? body.maxRetries : current.maxRetries,
    retryBaseDelayMs: typeof body.retryBaseDelayMs === "number" ? body.retryBaseDelayMs : current.retryBaseDelayMs,
    reconciliationTolerance: typeof body.reconciliationTolerance === "number" ? body.reconciliationTolerance : current.reconciliationTolerance,
  };

  // Never persist the apiKey in the settings table — it lives in the secret
  // store (or the legacy fallback read above). Drop it from the payload.
  const { apiKey: _droppedApiKey, ...persisted } = next;
  const existing = db.select().from(settings).where(eq(settings.key, MT5_CONFIG_SETTING)).get();
  if (existing) {
    db.update(settings).set({ value: JSON.stringify(persisted) }).where(eq(settings.key, MT5_CONFIG_SETTING)).run();
  } else {
    db.insert(settings).values({
      key: MT5_CONFIG_SETTING,
      value: JSON.stringify(persisted),
      group: "mt5",
      description: "MT5 Manager API gateway connection",
    }).run();
  }

  try {
    writeAuditLog(db, {
      userId: c.get("userId"),
      action: existing ? "mt5.config_updated" : "mt5.config_created",
      entity: "setting",
      entityId: MT5_CONFIG_SETTING,
      details: {
        key: MT5_CONFIG_SETTING,
        from: redactSetting(MT5_CONFIG_SETTING, current),
        to: redactSetting(MT5_CONFIG_SETTING, next),
      },
      ipAddress: c.req.header("x-forwarded-for") || undefined,
    });
  } catch {
    /* audit is non-critical */
  }

  // Alert other admins — connection config is sensitive.
  try {
    createNotification(db, c.get("userId"), {
      type: "mt5_config_changed",
      title: "MT5 Gateway Config Changed",
      message: `An admin updated the MT5 Manager API gateway configuration (${next.baseUrls.length} endpoint(s), enabled: ${next.enabled}).`,
      link: "/admin/mt5",
    });
  } catch {
    /* notification is non-critical */
  }

  return c.json({ success: true, config: redactMT5Config(next) });
});

// ─── Admin: Retry Queue ────────────────────────────────

app.get("/admin/queue", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const status = c.req.query("status") || "";
  const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") || "25") || 25));
  return c.json({
    stats: getQueueStats(db),
    ...getQueueEntries(db, { status: status || undefined, page, pageSize }),
  });
});

app.post("/admin/queue/process", requireAuth, requireAdmin, async (c) => {
  const db = getDb();
  const provider = getMT5Provider(db);
  const body = await c.req.json().catch(() => ({}));
  const result = await processSyncQueue(db, provider, {
    ignoreBackoff: body.ignoreBackoff === true,
    limit: typeof body.limit === "number" ? body.limit : 50,
  });
  return c.json({ ...result, providerMode: provider.mode });
});

app.post("/admin/queue/:id/retry", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const id = parseInt(c.req.param("id"));
  const ok = retryJob(db, id);
  return ok
    ? c.json({ success: true })
    : c.json({ error: "Queue job not found" }, 404);
});

app.post("/admin/queue/retry-all", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const count = retryAllFailed(db);
  return c.json({ success: true, retried: count });
});

// ─── Admin: Reconciliation ─────────────────────────────

app.post("/admin/reconcile", requireAuth, requireAdmin, async (c) => {
  const db = getDb();
  const provider = getMT5Provider(db);
  const body = await c.req.json().catch(() => ({}));
  const summary = await runReconciliation(db, provider, {
    tolerance: typeof body.tolerance === "number" ? body.tolerance : undefined,
    accountId: typeof body.accountId === "number" ? body.accountId : undefined,
  });
  return c.json(summary);
});

app.get("/admin/reconcile/history", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") || "25") || 25));
  return c.json({ items: getReconciliationHistory(db, { limit }) });
});

// ─── Admin: MT5 Background Scheduler (E2E test hook) ─────
//
// Test-only. Serves 404 unless the server runs with E2E_TESTING=1 (the
// Playwright web server always sets it). It deterministically sets up the
// conditions the background scheduler (`src/server/lib/mt5/scheduler.ts`)
// acts on, so the e2e suite can observe the retry-queue drain and the daily
// sync pass firing WITHOUT clicking any manual control:
//   1. finds (or creates) an active challenge bound to an MT5 account,
//   2. deletes its metrics/drawdown history and zeroes the account balance +
//      lastSyncAt, so `syncChallenge` sees a stale, syncable challenge,
//   3. optionally enqueues a pending "sync" retry-queue job for it.
app.post("/admin/scheduler/e2e-setup", requireAuth, requireAdmin, async (c) => {
  if (process.env.E2E_TESTING !== "1") {
    return c.json({ error: "E2E scheduler test hook is disabled" }, 404);
  }
  const db = getDb();
  const body = await c.req.json().catch(() => ({}));
  const enqueue = body.enqueue !== false;
  const userId = c.get("userId");
  const now = Date.now();

  // 1. Reuse the caller's most recent active challenge bound to an MT5
  //    account (the global-setup demo challenge); create one otherwise.
  let challenge = db.select().from(userChallenges)
    .where(and(
      eq(userChallenges.userId, userId),
      eq(userChallenges.status, "active"),
      sql`${userChallenges.mt5AccountId} IS NOT NULL`,
    ))
    .orderBy(desc(userChallenges.createdAt))
    .limit(1)
    .get();

  if (!challenge) {
    const account = db.insert(mt5Accounts).values({
      userId,
      login: "AFC" + Math.floor(100000 + Math.random() * 900000),
      password: "E2E@Demo123",
      investorPassword: "E2E@Demo123",
      server: "AfriFundedCapital-Demo",
      group: "DEMO\\AFC",
      leverage: 100,
      balance: 10000,
      equity: 10000,
      currency: "NGN",
      createdAt: now,
    }).returning().get();
    challenge = db.insert(userChallenges).values({
      userId,
      templateId: 0,
      accountSizeId: 0,
      status: "active",
      accountSize: 10000,
      currency: "NGN",
      profitTarget: 10,
      dailyDrawdown: 5,
      maxDrawdown: 10,
      maxLeverage: 100,
      minTradingDays: 5,
      maxTradingDays: 30,
      startedAt: now,
      expiresAt: now + 30 * 86400000,
      amountPaid: 0,
      currentPhase: 1,
      mt5AccountId: account.id,
      createdAt: now,
      updatedAt: now,
    }).returning().get();
  }

  const mt5AccountId = challenge.mt5AccountId;
  const account = mt5AccountId
    ? db.select().from(mt5Accounts).where(eq(mt5Accounts.id, mt5AccountId)).get()
    : undefined;

  // 2. Make the challenge stale so the next scheduler sync pass actually syncs
  //    it, and zero the account so a fresh sync is observable (balance + $0).
  db.delete(tradingMetrics).where(eq(tradingMetrics.challengeId, challenge.id)).run();
  db.delete(drawdownHistory).where(eq(drawdownHistory.challengeId, challenge.id)).run();
  if (mt5AccountId) {
    db.update(mt5Accounts).set({ balance: 0, equity: 0, lastSyncAt: null })
      .where(eq(mt5Accounts.id, mt5AccountId)).run();
  }

  // 3. Optionally enqueue a pending retry-queue job for the drain test.
  let queueJobId: number | null = null;
  if (enqueue && mt5AccountId) {
    queueJobId = enqueueSyncJob(db, {
      mt5AccountId,
      action: "sync",
      payload: { challengeId: challenge.id, source: "e2e-setup" },
    });
  }

  return c.json({
    success: true,
    challengeId: challenge.id,
    mt5AccountId,
    login: account?.login ?? null,
    accountSize: challenge.accountSize,
    queueJobId,
    enqueued: enqueue && !!mt5AccountId,
    stats: getQueueStats(db),
  });
});

// ─── Admin: Sync Queue Status (legacy) ──────────────────

app.get("/admin/sync-queue", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const activeCount = db.select({ cnt: count() }).from(userChallenges)
    .where(eq(userChallenges.status, "active")).get();

  const syncedToday = db.select({ cnt: count() }).from(tradingMetrics)
    .where(sql`recorded_at > ${Date.now() - 24 * 60 * 60 * 1000}`).get();

  const queue = getQueueStats(db);

  return c.json({
    activeChallenges: activeCount?.cnt || 0,
    syncedToday: syncedToday?.cnt || 0,
    lastSyncAt: Date.now(),
    queue,
  });
});

export default app;
