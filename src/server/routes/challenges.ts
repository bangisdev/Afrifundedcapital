import { Hono } from "hono";
import { getDb } from "../db";
import {
  challengeTemplates,
  accountSizes,
  userChallenges,
  tradingMetrics,
  users,
} from "../schema";
import { eq, desc, count, sql, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";
import { maybeGenerateCertificate } from "../lib/certificates";

let seeded = false;

function autoSeed(db: any) {
  if (seeded) return;
  const existing = db.select({ cnt: count() }).from(challengeTemplates).get();
  if (existing && (existing.cnt ?? 0) > 0) { seeded = true; return; }

  const now = Date.now();
  const templates = [
    { name: "Two-Step Evaluation", type: "two_step", description: "Classic two-phase evaluation with 8% profit target, 5% daily and 10% max drawdown. Prove your skills in two steps.", profitTarget: 8, dailyDrawdown: 5, maxDrawdown: 10, maxLeverage: 100, minTradingDays: 5, price: 50000, durationDays: 30 },
    { name: "One-Step Challenge", type: "one_step", description: "Single-phase challenge with 10% profit target. Fast track to funding with a 4% daily drawdown limit.", profitTarget: 10, dailyDrawdown: 4, maxDrawdown: 8, maxLeverage: 50, minTradingDays: 3, price: 40000, durationDays: 30 },
    { name: "Instant Funding", type: "instant_funding", description: "Get funded immediately with no evaluation. Higher leverage and flexible rules for experienced traders.", profitTarget: 10, dailyDrawdown: 5, maxDrawdown: 10, maxLeverage: 100, minTradingDays: 0, price: 80000, durationDays: 30 },
  ];

  for (const t of templates) {
    const result = db.insert(challengeTemplates).values({
      ...t, currency: "NGN", isActive: true, createdBy: 1, createdAt: now, updatedAt: now,
    }).returning().get();

    const sizes = [
      { label: "$5,000", size: 5000, price: t.price * 0.5 },
      { label: "$10,000", size: 10000, price: t.price * 0.8 },
      { label: "$25,000", size: 25000, price: t.price },
      { label: "$50,000", size: 50000, price: t.price * 1.5 },
      { label: "$100,000", size: 100000, price: t.price * 2.5 },
      { label: "$200,000", size: 200000, price: t.price * 4 },
    ];

    sizes.forEach((s, i) => {
      db.insert(accountSizes).values({
        label: s.label, size: s.size, currency: "NGN", templateId: result.id,
        price: s.price, sortOrder: i, isActive: true,
      }).run();
    });
  }

  seeded = true;
  console.log("[Seed] Auto-seeded 3 challenge templates with account sizes");
}

const app = new Hono();

// List all challenge templates (public + auth) — auto-seeds on first access
app.get("/templates", (c) => {
  const db = getDb();
  autoSeed(db);
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

// Admin: Update challenge status (with automatic certificate generation)
app.put("/admin/:id/status", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const db = getDb();
  const now = Date.now();
  const newStatus = body.status as string;

  if (!newStatus) return c.json({ error: "status is required" }, 400);

  const validStatuses = ["active", "phase_1_passed", "phase_2_passed", "funded", "violated", "expired", "refunded"];
  if (!validStatuses.includes(newStatus)) return c.json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, 400);

  const challenge = db.select().from(userChallenges).where(eq(userChallenges.id, id)).get();
  if (!challenge) return c.json({ error: "Challenge not found" }, 404);

  // Build update object with timestamp fields
  const updateFields: any = { status: newStatus, updatedAt: now };
  if (newStatus === "phase_1_passed") updateFields.phase1PassedAt = now;
  if (newStatus === "phase_2_passed") updateFields.phase2PassedAt = now;
  if (newStatus === "funded") updateFields.fundedAt = now;
  if (body.currentPhase !== undefined) updateFields.currentPhase = body.currentPhase;

  db.update(userChallenges).set(updateFields).where(eq(userChallenges.id, id)).run();

  // Auto-generate certificate if status warrants one
  const cert = maybeGenerateCertificate(db, id, newStatus);

  return c.json({
    success: true,
    challengeId: id,
    newStatus,
    certificateGenerated: cert ? { id: cert.id, number: cert.certificateNumber } : null,
  });
});

// Seed: Get enabled payment providers
app.get("/providers", requireAuth, (c) => {
  return c.json([{ name: "flutterwave", enabled: true }]);
});

export default app;
