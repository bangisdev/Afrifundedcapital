import { Hono } from "hono";
import { getDb } from "./db";
import {
  challengeTemplates,
  accountSizes,
  userChallenges,
  tradingMetrics,
  users,
} from "./schema";
import { eq, desc, count, sql, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "./middleware";

const app = new Hono();

// List all challenge templates (public + auth)
app.get("/templates", (c) => {
  const db = getDb();
  const templates = db
    .select()
    .from(challengeTemplates)
    .where(eq(challengeTemplates.isActive, true))
    .orderBy(desc(challengeTemplates.createdAt))
    .all();
  return c.json(templates);
});

// Get account sizes for a template
app.get("/templates/:id/sizes", (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const sizes = db
    .select()
    .from(accountSizes)
    .where(
      and(eq(accountSizes.templateId, id), eq(accountSizes.isActive, true))
    )
    .orderBy(accountSizes.sortOrder)
    .all();
  return c.json(sizes);
});

// Get single template
app.get("/templates/:id", (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const template = db
    .select()
    .from(challengeTemplates)
    .where(eq(challengeTemplates.id, id))
    .get();
  return c.json(template || null);
});

// Get my challenges
app.get("/my", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();
  const challenges = db
    .select()
    .from(userChallenges)
    .where(eq(userChallenges.userId, userId))
    .orderBy(desc(userChallenges.createdAt))
    .all();
  return c.json(challenges);
});

// Get single challenge by id
app.get("/my/:id", requireAuth, (c) => {
  const userId = c.get("userId");
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const challenge = db
    .select()
    .from(userChallenges)
    .where(
      and(eq(userChallenges.id, id), eq(userChallenges.userId, userId))
    )
    .get();
  return c.json(challenge || null);
});

// Get dashboard metrics (aggregated)
app.get("/metrics", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();

  const activeChallenges = db
    .select({ count: count() })
    .from(userChallenges)
    .where(
      and(
        eq(userChallenges.userId, userId),
        eq(userChallenges.status, "active")
      )
    )
    .get();

  const totalChallenges = db
    .select({ count: count() })
    .from(userChallenges)
    .where(eq(userChallenges.userId, userId))
    .get();

  const funded = db
    .select({ count: count() })
    .from(userChallenges)
    .where(
      and(
        eq(userChallenges.userId, userId),
        eq(userChallenges.status, "funded")
      )
    )
    .get();

  return c.json({
    activeChallenges: activeChallenges?.count || 0,
    totalChallenges: totalChallenges?.count || 0,
    fundedAccounts: funded?.count || 0,
    totalProfit: 0,
    winRate: 0,
  });
});

// Get metrics history for a challenge
app.get("/my/:id/metrics", requireAuth, (c) => {
  const userId = c.get("userId");
  const id = parseInt(c.req.param("id"));
  const db = getDb();

  const challenge = db
    .select()
    .from(userChallenges)
    .where(
      and(eq(userChallenges.id, id), eq(userChallenges.userId, userId))
    )
    .get();

  if (!challenge) {
    return c.json([]);
  }

  const metrics = db
    .select()
    .from(tradingMetrics)
    .where(eq(tradingMetrics.challengeId, id))
    .orderBy(tradingMetrics.recordedAt)
    .all();

  return c.json(metrics);
});

// Admin: List all challenges
app.get("/admin/all", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const challenges = db
    .select()
    .from(userChallenges)
    .orderBy(desc(userChallenges.createdAt))
    .all();
  return c.json(challenges);
});

// Admin: Challenge stats
app.get("/admin/stats", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const total = db.select({ count: count() }).from(userChallenges).get();
  const active = db
    .select({ count: count() })
    .from(userChallenges)
    .where(eq(userChallenges.status, "active"))
    .get();
  const funded = db
    .select({ count: count() })
    .from(userChallenges)
    .where(eq(userChallenges.status, "funded"))
    .get();

  return c.json({
    total: total?.count || 0,
    active: active?.count || 0,
    funded: funded?.count || 0,
  });
});

// Admin: Create challenge template
app.post("/admin/templates", requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json();
  const db = getDb();
  const userId = c.get("userId");
  const now = Date.now();

  const result = db
    .insert(challengeTemplates)
    .values({
      name: body.name,
      description: body.description,
      type: body.type,
      profitTarget: body.profitTarget,
      dailyDrawdown: body.dailyDrawdown,
      maxDrawdown: body.maxDrawdown,
      maxLeverage: body.maxLeverage,
      minTradingDays: body.minTradingDays,
      maxTradingDays: body.maxTradingDays || null,
      price: body.price,
      currency: body.currency || "NGN",
      durationDays: body.durationDays,
      allowWeekendHolding: body.allowWeekendHolding || false,
      allowNewsTrading: body.allowNewsTrading ?? true,
      allowEATrading: body.allowEATrading ?? true,
      allowCopyTrading: body.allowCopyTrading || false,
      resetFee: body.resetFee || null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  return c.json(result);
});

// Admin: Update challenge template
app.put("/admin/templates/:id", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const db = getDb();

  db.update(challengeTemplates)
    .set({ ...body, updatedAt: Date.now() })
    .where(eq(challengeTemplates.id, id))
    .run();

  return c.json({ success: true });
});

// Admin: Create account size
app.post("/admin/sizes", requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json();
  const db = getDb();

  const result = db
    .insert(accountSizes)
    .values({
      label: body.label,
      size: body.size,
      currency: body.currency || "NGN",
      templateId: body.templateId,
      price: body.price,
      sortOrder: body.sortOrder || 0,
    })
    .returning()
    .get();

  return c.json(result);
});

// Admin: Update account size
app.put("/admin/sizes/:id", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const db = getDb();

  db.update(accountSizes)
    .set(body)
    .where(eq(accountSizes.id, id))
    .run();

  return c.json({ success: true });
});

// Seed: Get enabled payment providers
app.get("/providers", requireAuth, (c) => {
  return c.json([{ name: "flutterwave", enabled: true }]);
});

export default app;
