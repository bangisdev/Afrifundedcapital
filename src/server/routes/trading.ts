import { Hono } from "hono";
import { getDb } from "../db";
import { tradingMetrics, mt5Accounts, drawdownHistory, userChallenges, users } from "../schema";
import { eq, desc, and, sql, count, like, or, type SQL } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";
import { maybeGenerateCertificate } from "../lib/certificates";
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

  const whereClause: SQL = eq(mt5Accounts.userId, userId);

  // Total matching count
  const totalRow = db.select({ count: count() }).from(mt5Accounts).where(whereClause).get();
  const total = totalRow?.count || 0;

  // Page of accounts
  const accounts = db
    .select()
    .from(mt5Accounts)
    .where(whereClause)
    .orderBy(desc(mt5Accounts.createdAt))
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

// ─── Daily Sync (simulated MT5 pull) ──────────────────

/**
 * Simulates pulling the latest daily metrics from MT5 server.
 * In production, this would call the MT5 Manager API to get:
 * - Balance, Equity, Floating P/L
 * - Open positions, closed trades
 * - Win/loss rates, profit factor, etc.
 *
 * For now, we simulate realistic daily changes based on the
 * challenge's current state and random market behavior.
 */
function simulateDailySync(
  challenge: any,
  previousMetrics: any | null,
): {
  metrics: Record<string, number>;
  accountUpdate: { balance: number; equity: number };
} {
  const baseBalance = challenge.accountSize;
  const prev = previousMetrics;

  // Use previous day's balance as starting point
  const prevBalance = prev?.balance ?? baseBalance;
  const prevEquity = prev?.equity ?? baseBalance;

  // Simulate daily P/L with realistic variance (slight upward bias)
  const dailyVariance = (Math.random() - 0.47) * baseBalance * 0.015; // ~1.5% max daily swing
  const newBalance = Math.max(baseBalance * 0.5, prevBalance + dailyVariance); // Floor at 50% of initial
  const floatingPL = (Math.random() - 0.5) * baseBalance * 0.008;
  const newEquity = newBalance + floatingPL;

  const totalProfit = newBalance - baseBalance;
  const currentDrawdown = Math.max(0, baseBalance - newEquity);
  const dailyDrawdown = Math.max(0, -dailyVariance);
  const peakBalance = Math.max(prev?.balance ?? 0, newBalance);

  // Calculate drawdown relative to peak
  const trailingDrawdown = peakBalance > 0 ? ((peakBalance - newEquity) / peakBalance) * 100 : 0;

  const tradingDaysCount = (prev?.tradingDaysCount ?? 0) + 1;
  const closedTrades = (prev?.closedTrades ?? 0) + Math.floor(Math.random() * 5) + 1;

  // Win rate with slight improvement over time
  const baseWinRate = 48 + Math.min(tradingDaysCount * 0.1, 8);
  const winRate = baseWinRate + (Math.random() - 0.5) * 6;

  const openPositions = Math.floor(Math.random() * 6);
  const wins = Math.floor(closedTrades * (winRate / 100));
  const losses = closedTrades - wins;
  const avgRR = 1.2 + Math.random() * 1.5;
  const profitFactor = 1.0 + (winRate / 100) * avgRR * 0.5 + (Math.random() - 0.5) * 0.3;

  const largestWin = prev?.largestWin
    ? Math.max(prev.largestWin, Math.round(baseBalance * 0.025 * Math.random()))
    : Math.round(baseBalance * 0.02 * Math.random());
  const largestLoss = prev?.largestLoss
    ? Math.min(prev.largestLoss, -Math.round(baseBalance * 0.015 * Math.random()))
    : -Math.round(baseBalance * 0.012 * Math.random());

  // Consecutive tracking
  const isWin = dailyVariance > 0;
  const consecutiveWins = isWin ? (prev?.consecutiveWins ?? 0) + 1 : 0;
  const consecutiveLosses = isWin ? 0 : (prev?.consecutiveLosses ?? 0) + 1;

  // Risk and health scores
  const riskScore = Math.min(100, Math.max(0, 50 + (trailingDrawdown * 5) + (Math.random() - 0.5) * 10));
  const healthScore = Math.min(100, Math.max(0, 80 - (trailingDrawdown * 3) + (winRate - 50) * 0.5 + (Math.random() - 0.5) * 10));

  const profitTargetProgress = challenge.profitTarget > 0
    ? Math.min(100, Math.max(0, (totalProfit / (challenge.profitTarget * baseBalance / 100)) * 100))
    : 0;

  return {
    metrics: {
      balance: Math.round(newBalance * 100) / 100,
      equity: Math.round(newEquity * 100) / 100,
      floatingPL: Math.round(floatingPL * 100) / 100,
      dailyPL: Math.round(dailyVariance * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
      currentDrawdown: Math.round(currentDrawdown * 100) / 100,
      dailyDrawdown: Math.round(dailyDrawdown * 100) / 100,
      trailingDrawdown: Math.round(trailingDrawdown * 100) / 100,
      relativeDrawdown: Math.round((currentDrawdown / baseBalance) * 10000) / 100,
      absoluteDrawdown: Math.round(Math.max(0, baseBalance - newEquity) * 100) / 100,
      remainingDrawdown: Math.round(Math.max(0, challenge.maxDrawdown * baseBalance / 100 - currentDrawdown) * 100) / 100,
      profitTargetProgress: Math.round(profitTargetProgress * 100) / 100,
      tradingDaysCount,
      openPositions,
      closedTrades,
      winRate: Math.round(winRate * 10) / 10,
      lossRate: Math.round((100 - winRate) * 10) / 10,
      averageRR: Math.round(avgRR * 100) / 100,
      profitFactor: Math.round(profitFactor * 100) / 100,
      expectancy: Math.round(((winRate / 100) * baseBalance * 0.015 - ((100 - winRate) / 100) * baseBalance * 0.01) * 100) / 100,
      largestWin,
      largestLoss,
      consecutiveWins,
      consecutiveLosses,
      riskScore: Math.round(riskScore),
      healthScore: Math.round(healthScore),
    },
    accountUpdate: {
      balance: Math.round(newBalance * 100) / 100,
      equity: Math.round(newEquity * 100) / 100,
    },
  };
}

/**
 * Sync a single challenge — pulls latest "MT5 data" and stores it.
 */
function syncChallenge(db: any, challenge: any): boolean {
  const now = Date.now();
  const DAY = 86400000;

  // Get latest metrics for this challenge
  const latestMetrics = db.select().from(tradingMetrics)
    .where(eq(tradingMetrics.challengeId, challenge.id))
    .orderBy(desc(tradingMetrics.recordedAt))
    .limit(1).get();

  // Check if we already synced today (within last 23 hours)
  if (latestMetrics && (now - latestMetrics.recordedAt) < 23 * 60 * 60 * 1000) {
    return false; // Already synced today
  }

  // Simulate MT5 data pull
  const { metrics, accountUpdate } = simulateDailySync(challenge, latestMetrics);

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

  // ─── Check for challenge status transitions ────────────────
  // If profit target reached and min trading days met, advance the challenge
  const profitTargetAmount = (challenge.profitTarget / 100) * challenge.accountSize;
  const minDaysMet = (metrics.tradingDaysCount ?? 0) >= challenge.minTradingDays;
  const profitReached = (metrics.totalProfit ?? 0) >= profitTargetAmount;

  if (profitReached && minDaysMet && challenge.status === "active") {
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
  }

  // ─── Check for challenge violation (max drawdown exceeded) ──
  const maxDrawdownAmount = (challenge.maxDrawdown / 100) * challenge.accountSize;
  if ((metrics.currentDrawdown ?? 0) >= maxDrawdownAmount && challenge.status === "active") {
    db.update(userChallenges).set({
      status: "violated",
      violations: JSON.stringify([{ type: "max_drawdown", date: now, drawdown: metrics.currentDrawdown }]),
      updatedAt: now,
    }).where(eq(userChallenges.id, challenge.id)).run();

    createNotification(db, challenge.userId, {
      type: "challenge_violation",
      title: "Challenge Violation",
      message: `Your challenge has been violated due to exceeding the maximum drawdown limit (${challenge.maxDrawdown}%). Your account has been suspended.`,
      link: "/dashboard/challenges",
    });
  }

  // ─── Check for challenge expiry ──────────────────────────
  if (challenge.expiresAt && challenge.expiresAt < now && challenge.status === "active") {
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
  }

  return true;
}

// ─── Manual Sync (user triggers for own account) ──────

app.post("/sync", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();

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
  for (const challenge of targets) {
    if (syncChallenge(db, challenge)) {
      synced++;
    }
  }

  return c.json({
    synced,
    message: synced > 0
      ? `Synced ${synced} challenge(s) with latest metrics`
      : "All challenges already synced today",
  });
});

// ─── Admin: Sync All Active Accounts ───────────────────

app.post("/admin/sync-all", requireAuth, requireAdmin, (c) => {
  const db = getDb();

  const activeChallenges = db.select().from(userChallenges)
    .where(eq(userChallenges.status, "active"))
    .all();

  let synced = 0;
  let skipped = 0;

  for (const challenge of activeChallenges) {
    if (syncChallenge(db, challenge)) {
      synced++;
    } else {
      skipped++;
    }
  }

  return c.json({
    synced,
    skipped,
    total: activeChallenges.length,
    message: `Synced ${synced}, skipped ${skipped} (already synced today)`,
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

  let prevMetrics: any = null;
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
    prevMetrics = metricsData;
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
  const login = "AFC" + Math.floor(100000 + Math.random() * 900000);
  const result = db.insert(mt5Accounts).values({
    userId: body.userId,
    login,
    password: body.password || "Afc@12345",
    investorPassword: body.investorPassword || "Afc@12345",
    server: "AfriFundedCapital-Demo",
    group: "DEMO\\AFC",
    leverage: body.leverage || 100,
    balance: body.balance || 0,
    equity: body.equity || 0,
    createdAt: Date.now(),
  }).returning().get();
  return c.json(result);
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

// ─── Admin: Sync Queue Status ──────────────────────────

app.get("/admin/sync-queue", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const activeCount = db.select({ cnt: count() }).from(userChallenges)
    .where(eq(userChallenges.status, "active")).get();

  const syncedToday = db.select({ cnt: count() }).from(tradingMetrics)
    .where(sql`recorded_at > ${Date.now() - 24 * 60 * 60 * 1000}`).get();

  return c.json({
    activeChallenges: activeCount?.cnt || 0,
    syncedToday: syncedToday?.cnt || 0,
    lastSyncAt: Date.now(),
  });
});

export default app;
