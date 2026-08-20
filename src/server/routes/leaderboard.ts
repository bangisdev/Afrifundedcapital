import { Hono } from "hono";
import { getDb } from "../db";
import { users, tradingMetrics, userChallenges, challengeTemplates } from "../schema";
import { eq, desc, sql, and, gt } from "drizzle-orm";

const app = new Hono();

/**
 * GET /api/leaderboard — Public leaderboard of top funded traders.
 * Returns anonymized or opt-in trader rankings by profit %.
 * query params: period=week|month|all, limit=number (default 20)
 */
app.get("/", async (c) => {
  const period = c.req.query("period") || "all";
  const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);

  // Calculate period cutoff
  let since = 0;
  const now = Date.now();
  if (period === "week") since = now - 7 * 24 * 60 * 60 * 1000;
  else if (period === "month") since = now - 30 * 24 * 60 * 60 * 1000;

  const db = getDb();

  // Get all traders (leaderboard opt-in is via profile settings)
  const leaderboardUsers = db
    .select({
      userId: users.id,
      name: users.name,
      country: users.country,
      avatarInitials: sql<string>`CASE WHEN length(${users.name}) > 0 THEN upper(substr(${users.name}, 1, 1)) ELSE 'T' END`.as("avatarInitials"),
    })
    .from(users)
    .where(eq(users.role, "client"))
    .all();

  if (leaderboardUsers.length === 0) {
    return c.json({ leaderboard: [], period });
  }

  const userIds = leaderboardUsers.map((u) => u.userId);
  const userMap = new Map(leaderboardUsers.map((u) => [u.userId, u]));

  // Get latest trading metrics per challenge for each user
  const results: Array<{
    userId: number;
    name: string;
    country: string | null;
    avatarInitials: string;
    totalProfit: number;
    winRate: number;
    profitFactor: number;
    accountSize: number;
    profitPct: number;
    healthScore: number;
    tradingDays: number;
    challengeLabel: string;
  }> = [];

  for (const uid of userIds) {
    // Get funded or active challenges for this user
    const challenges = db
      .select({
        challengeId: userChallenges.id,
        status: userChallenges.status,
        accountSize: userChallenges.accountSize,
        templateName: challengeTemplates.name,
      })
      .from(userChallenges)
      .leftJoin(challengeTemplates, eq(userChallenges.templateId, challengeTemplates.id))
      .where(
        and(
          eq(userChallenges.userId, uid),
          sql`${userChallenges.status} IN ('active', 'funded')`
        )
      )
      .all();

    for (const ch of challenges) {
      // Get latest metric for this challenge
      const metric = db
        .select()
        .from(tradingMetrics)
        .where(
          and(
            eq(tradingMetrics.challengeId, ch.challengeId),
            gt(tradingMetrics.recordedAt, since)
          )
        )
        .orderBy(desc(tradingMetrics.recordedAt))
        .limit(1)
        .get();

      if (!metric) continue;

      const profitPct = ch.accountSize > 0
        ? (metric.totalProfit / ch.accountSize) * 100
        : 0;

      const user = userMap.get(uid);
      if (!user) continue;

      results.push({
        userId: uid,
        name: user.name || "Anonymous Trader",
        country: user.country,
        avatarInitials: user.avatarInitials,
        totalProfit: metric.totalProfit,
        winRate: metric.winRate || 0,
        profitFactor: metric.profitFactor || 0,
        accountSize: ch.accountSize,
        profitPct,
        healthScore: metric.healthScore || 0,
        tradingDays: metric.tradingDaysCount,
        challengeLabel: ch.templateName || "Challenge",
      });
    }
  }

  // Sort by profit percentage descending
  results.sort((a, b) => b.profitPct - a.profitPct);

  // Take top N
  const top = results.slice(0, limit);

  // Add rank
  const leaderboard = top.map((r, i) => ({
    rank: i + 1,
    ...r,
    totalProfit: Math.round(r.totalProfit * 100) / 100,
    profitPct: Math.round(r.profitPct * 100) / 100,
    winRate: Math.round(r.winRate * 10) / 10,
    profitFactor: Math.round(r.profitFactor * 100) / 100,
  }));

  return c.json({ leaderboard, period, total: results.length });
});

/**
 * GET /api/leaderboard/stats — Public platform stats for landing page.
 */
app.get("/stats", async (c) => {
  const db = getDb();

  const totalTraders = db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.role, "client"))
    .get();

  const fundedTraders = db
    .select({ count: sql<number>`count(*)` })
    .from(userChallenges)
    .where(eq(userChallenges.status, "funded"))
    .get();

  const totalPayouts = db
    .select({ total: sql<number>`coalesce(sum(amount), 0)` })
    .from(sql`payments`)
    .where(sql`status = 'completed'`)
    .get();

  return c.json({
    totalTraders: totalTraders?.count || 0,
    fundedTraders: fundedTraders?.count || 0,
    totalPayouts: totalPayouts?.total || 0,
  });
});

export default app;
