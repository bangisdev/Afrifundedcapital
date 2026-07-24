import { Hono } from "hono";
import { getDb } from "../db";
import { tradingMetrics, mt5Accounts, drawdownHistory, userChallenges } from "../schema";
import { eq, desc, and, sql, count } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";

const app = new Hono();

// Get my MT5 accounts
app.get("/mt5", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();
  const accounts = db.select().from(mt5Accounts).where(eq(mt5Accounts.userId, userId)).all();
  return c.json(accounts);
});

// Get challenge metrics (latest)
app.get("/challenge/:id/metrics", requireAuth, (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const latest = db.select().from(tradingMetrics)
    .where(eq(tradingMetrics.challengeId, id))
    .orderBy(desc(tradingMetrics.recordedAt))
    .limit(1).get();
  return c.json(latest || null);
});

// Get challenge metrics history
app.get("/challenge/:id/history", requireAuth, (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const history = db.select().from(tradingMetrics)
    .where(eq(tradingMetrics.challengeId, id))
    .orderBy(tradingMetrics.recordedAt).all();
  return c.json(history);
});

// Get drawdown history
app.get("/challenge/:id/drawdown", requireAuth, (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const history = db.select().from(drawdownHistory)
    .where(eq(drawdownHistory.challengeId, id))
    .orderBy(drawdownHistory.recordedAt).all();
  return c.json(history);
});

// Seed demo trading data
app.post("/seed-demo", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const db = getDb();
  const challengeId = body.challengeId;

  const challenge = db.select().from(userChallenges)
    .where(and(eq(userChallenges.id, challengeId), eq(userChallenges.userId, userId)))
    .get();

  if (!challenge) return c.json({ error: "Challenge not found" }, 404);

  // Check if metrics already exist
  const existing = db.select({ count: count() }).from(tradingMetrics)
    .where(eq(tradingMetrics.challengeId, challengeId)).get();
  if (existing && existing.count > 0) return c.json({ success: true, seeded: false });

  const now = Date.now();
  const DAY = 86400000;
  const baseBalance = challenge.accountSize;

  // Create 60 days of demo metrics
  for (let i = 0; i < 60; i++) {
    const t = now - (60 - i) * DAY;
    const variance = (Math.random() - 0.45) * baseBalance * 0.02;
    const balance = baseBalance + (i * variance);
    const equity = balance + (Math.random() - 0.5) * baseBalance * 0.01;
    const dailyPL = variance;
    const totalProfit = balance - baseBalance;

    db.insert(tradingMetrics).values({
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
    }).run();
  }

  // Mark demo seeded
  db.update(userChallenges).set({ updatedAt: now }).where(eq(userChallenges.id, challengeId)).run();

  return c.json({ success: true, seeded: true });
});

// Reset demo data for a challenge
app.post("/reset-demo", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const db = getDb();

  const challenge = db.select().from(userChallenges)
    .where(and(eq(userChallenges.id, body.challengeId), eq(userChallenges.userId, userId)))
    .get();

  if (!challenge) return c.json({ error: "Challenge not found" }, 404);

  db.delete(tradingMetrics).where(eq(tradingMetrics.challengeId, body.challengeId)).run();
  return c.json({ success: true });
});

// Admin: List MT5 sync queue
app.get("/admin/sync-queue", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  return c.json([]);
});

// Admin: Create MT5 account
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
    leverage: body.leverage || 100,
    balance: body.balance || 0,
    equity: body.equity || 0,
    createdAt: Date.now(),
  }).returning().get();
  return c.json(result);
});

export default app;
