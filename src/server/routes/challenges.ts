import { Hono } from "hono";
import { getDb, type Db } from "../db";
import {
  challengeTemplates,
  accountSizes,
  userChallenges,
  tradingMetrics,
  payments,
  mt5Accounts,
} from "../schema";
import { eq, desc, asc, count, and, inArray, type SQLWrapper } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";
import { createNotification } from "../lib/notifications";
import { maybeGenerateCertificate } from "../lib/certificates";
import { writeAuditLog } from "../lib/audit";
import { resolveChallengeLabel } from "../lib/mt5/sync-service";

let seeded = false;

/**
 * Full rule set per challenge type. Applied both to freshly seeded templates
 * and backfilled onto older templates (which were seeded with only the core
 * numbers). Backfill runs on every seed check and is a no-op once a template
 * already has its reset fee set.
 */
function templateRuleDefaults(type: string) {
  const common = {
    allowNewsTrading: true,
    allowEATrading: true,
    scalingPlan:
      "Grow up to $1M — 20% account increase after 3 consecutive profitable months.",
    maxAccountSize: 1000000,
  };
  switch (type) {
    case "one_step":
      return {
        ...common,
        allowWeekendHolding: false,
        allowCopyTrading: false,
        consistencyTarget: 20,
        maxPositionSize: 25,
      };
    case "two_step":
      return {
        ...common,
        allowWeekendHolding: false,
        allowCopyTrading: false,
        consistencyTarget: 20,
        maxPositionSize: 30,
      };
    case "instant_funding":
      return {
        ...common,
        allowWeekendHolding: true,
        allowCopyTrading: true,
        consistencyTarget: null,
        maxPositionSize: 50,
      };
    default:
      return {
        ...common,
        allowWeekendHolding: false,
        allowCopyTrading: false,
        consistencyTarget: 20,
        maxPositionSize: 30,
      };
  }
}

function backfillTemplateRules(db: Db) {
  const templates = db.select().from(challengeTemplates).all();
  let updated = 0;
  for (const t of templates) {
    if (t.resetFee != null) continue; // already enriched
    const rules = templateRuleDefaults(t.type);
    const price = t.price || 0;
    db.update(challengeTemplates)
      .set({
        resetFee: Math.round(price * 0.2),
        extensionFee: Math.round(price * 0.1),
        consistencyTarget: rules.consistencyTarget,
        maxPositionSize: rules.maxPositionSize,
        scalingPlan: rules.scalingPlan,
        maxAccountSize: rules.maxAccountSize,
        allowWeekendHolding: rules.allowWeekendHolding,
        allowNewsTrading: rules.allowNewsTrading,
        allowEATrading: rules.allowEATrading,
        allowCopyTrading: rules.allowCopyTrading,
        updatedAt: Date.now(),
      })
      .where(eq(challengeTemplates.id, t.id))
      .run();
    updated++;
  }
  if (updated > 0) {
    console.log(`[Seed] Backfilled trading rules for ${updated} challenge template(s)`);
  }
}

function autoSeed(db: Db) {
  backfillTemplateRules(db);
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
    const rules = templateRuleDefaults(t.type);
    const result = db.insert(challengeTemplates).values({
      ...t,
      ...rules,
      resetFee: Math.round(t.price * 0.2),
      extensionFee: Math.round(t.price * 0.1),
      currency: "NGN", isActive: true, createdBy: 1, createdAt: now, updatedAt: now,
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

  // Pagination params (clamped)
  const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") || "10") || 10));

  // Sorting (whitelisted columns, asc/desc)
  const SORTABLE: Record<string, SQLWrapper> = {
    id: userChallenges.id,
    status: userChallenges.status,
    accountSize: userChallenges.accountSize,
    amountPaid: userChallenges.amountPaid,
    currentPhase: userChallenges.currentPhase,
    createdAt: userChallenges.createdAt,
  };
  const qSortBy = String(c.req.query("sortBy") || "createdAt");
  const qSortOrder = String(c.req.query("sortOrder") || "desc");
  const sortCol = SORTABLE[qSortBy] || userChallenges.createdAt;
  const sortOrder = qSortOrder.toLowerCase() === "asc" ? asc(sortCol) : desc(sortCol);

  // Total count for this user
  const totalRow = db
    .select({ count: count() })
    .from(userChallenges)
    .where(eq(userChallenges.userId, userId))
    .get();
  const total = totalRow?.count || 0;

  // Page of challenges
  const challenges = db
    .select()
    .from(userChallenges)
    .where(eq(userChallenges.userId, userId))
    .orderBy(sortOrder)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  // Attach the template name so the UI can stamp e.g. "Two-Step Evaluation · $50,000".
  const templateIds = [...new Set(challenges.map((ch) => ch.templateId))];
  const templates = templateIds.length > 0
    ? db.select().from(challengeTemplates).where(inArray(challengeTemplates.id, templateIds)).all()
    : [];
  const templateNameById = new Map(templates.map((t) => [t.id, t.name]));
  const enriched = challenges.map((ch) => ({
    ...ch,
    templateName: templateNameById.get(ch.templateId) || null,
  }));

  // User-wide stats (unfiltered)
  const allChallenges = db
    .select({ status: userChallenges.status })
    .from(userChallenges)
    .where(eq(userChallenges.userId, userId))
    .all();
  const byStatus = allChallenges.reduce<Record<string, number>>((acc, ch) => {
    acc[ch.status] = (acc[ch.status] || 0) + 1;
    return acc;
  }, {});

  return c.json({
    challenges: enriched,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats: { total: allChallenges.length, byStatus },
  });
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
  if (!challenge) return c.json(null);

  // Stamp the template name for the detail header (e.g. "Two-Step Evaluation · $50,000").
  const template = db
    .select()
    .from(challengeTemplates)
    .where(eq(challengeTemplates.id, challenge.templateId))
    .get();
  return c.json({ ...challenge, templateName: template?.name || null });
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

  // Sorting (whitelisted columns, asc/desc)
  const SORTABLE: Record<string, SQLWrapper> = {
    id: userChallenges.id,
    accountSize: userChallenges.accountSize,
    amountPaid: userChallenges.amountPaid,
    status: userChallenges.status,
    createdAt: userChallenges.createdAt,
  };
  const qSortBy = String(c.req.query("sortBy") || "createdAt");
  const qSortOrder = String(c.req.query("sortOrder") || "desc");
  const sortCol = SORTABLE[qSortBy] || userChallenges.createdAt;
  const sortOrder = qSortOrder.toLowerCase() === "asc" ? asc(sortCol) : desc(sortCol);

  const challenges = db
    .select()
    .from(userChallenges)
    .orderBy(sortOrder)
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

  try {
    writeAuditLog(db, {
      userId,
      action: "template.created",
      entity: "challenge_template",
      entityId: result.id,
      details: {
        name: result.name,
        type: result.type,
        price: result.price,
        currency: result.currency,
      },
      ipAddress: c.req.header("x-forwarded-for"),
    });
  } catch (e) {
    console.warn("[Audit] Failed to log template creation:", e);
  }

  return c.json(result);
});

// Admin: Update challenge template
app.put("/admin/templates/:id", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const db = getDb();

  const existing = db.select().from(challengeTemplates).where(eq(challengeTemplates.id, id)).get();
  if (!existing) return c.json({ error: "Template not found" }, 404);

  db.update(challengeTemplates)
    .set({ ...body, updatedAt: Date.now() })
    .where(eq(challengeTemplates.id, id))
    .run();

  try {
    writeAuditLog(db, {
      userId: c.get("userId"),
      action: "template.updated",
      entity: "challenge_template",
      entityId: id,
      details: {
        name: existing.name,
        fields: Object.keys(body),
      },
      ipAddress: c.req.header("x-forwarded-for"),
    });
  } catch (e) {
    console.warn("[Audit] Failed to log template update:", e);
  }

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

  try {
    writeAuditLog(db, {
      userId: c.get("userId"),
      action: "template_size.created",
      entity: "account_size",
      entityId: result.id,
      details: {
        label: result.label,
        size: result.size,
        templateId: result.templateId,
        price: result.price,
      },
      ipAddress: c.req.header("x-forwarded-for"),
    });
  } catch (e) {
    console.warn("[Audit] Failed to log account size creation:", e);
  }

  return c.json(result);
});

// Admin: Update account size
app.put("/admin/sizes/:id", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const db = getDb();

  const existing = db.select().from(accountSizes).where(eq(accountSizes.id, id)).get();
  if (!existing) return c.json({ error: "Account size not found" }, 404);

  db.update(accountSizes)
    .set(body)
    .where(eq(accountSizes.id, id))
    .run();

  try {
    writeAuditLog(db, {
      userId: c.get("userId"),
      action: "template_size.updated",
      entity: "account_size",
      entityId: id,
      details: {
        label: existing.label,
        templateId: existing.templateId,
        fields: Object.keys(body),
      },
      ipAddress: c.req.header("x-forwarded-for"),
    });
  } catch (e) {
    console.warn("[Audit] Failed to log account size update:", e);
  }

  return c.json({ success: true });
});

// Admin: Delete account size
app.delete("/admin/sizes/:id", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const existing = db.select().from(accountSizes).where(eq(accountSizes.id, id)).get();
  if (!existing) return c.json({ error: "Account size not found" }, 404);

  db.delete(accountSizes).where(eq(accountSizes.id, id)).run();

  try {
    writeAuditLog(db, {
      userId: c.get("userId"),
      action: "template_size.deleted",
      entity: "account_size",
      entityId: id,
      details: {
        label: existing.label,
        size: existing.size,
        templateId: existing.templateId,
      },
      ipAddress: c.req.header("x-forwarded-for"),
    });
  } catch (e) {
    console.warn("[Audit] Failed to log account size deletion:", e);
  }

  return c.json({ success: true });
});

// Admin: Delete challenge template (cascade deletes sizes)
app.delete("/admin/templates/:id", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const existing = db.select().from(challengeTemplates).where(eq(challengeTemplates.id, id)).get();
  if (!existing) return c.json({ error: "Template not found" }, 404);
  // Check if any user challenges use this template
  const usage = db.select({ cnt: count() }).from(userChallenges).where(eq(userChallenges.templateId, id)).get();
  if (usage && (usage.cnt ?? 0) > 0) {
    return c.json({ error: `Cannot delete: ${usage.cnt} user challenges use this template` }, 400);
  }
  db.delete(accountSizes).where(eq(accountSizes.templateId, id)).run();
  db.delete(challengeTemplates).where(eq(challengeTemplates.id, id)).run();

  try {
    writeAuditLog(db, {
      userId: c.get("userId"),
      action: "template.deleted",
      entity: "challenge_template",
      entityId: id,
      details: {
        name: existing.name,
        type: existing.type,
        price: existing.price,
      },
      ipAddress: c.req.header("x-forwarded-for"),
    });
  } catch (e) {
    console.warn("[Audit] Failed to log template deletion:", e);
  }

  return c.json({ success: true });
});

// Admin: Demo purchase (create challenge without payment)
app.post("/demo-purchase", requireAuth, requireAdmin, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const db = getDb();
  const now = Date.now();

  const templateId = parseInt(body.templateId);
  const accountSizeId = parseInt(body.accountSizeId);
  const targetUserId = body.userId ? parseInt(body.userId) : userId;

  if (!templateId || !accountSizeId) {
    return c.json({ error: "templateId and accountSizeId are required" }, 400);
  }

  const template = db.select().from(challengeTemplates).where(eq(challengeTemplates.id, templateId)).get();
  const size = db.select().from(accountSizes).where(eq(accountSizes.id, accountSizeId)).get();
  if (!template) return c.json({ error: "Template not found" }, 404);
  if (!size) return c.json({ error: "Account size not found" }, 404);

  // Create a completed payment record for audit trail
  const reference = `DEMO-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const payment = db.insert(payments).values({
    userId: targetUserId,
    amount: 0,
    currency: "NGN",
    provider: "demo",
    status: "completed",
    reference,
    description: `Demo: ${template.name} — ${size.label}`,
    templateId,
    accountSizeId,
    createdAt: now,
    completedAt: now,
  }).returning().get();

  // Create challenge
  const challenge = db.insert(userChallenges).values({
    userId: targetUserId,
    templateId,
    accountSizeId,
    status: "active",
    accountSize: size.size,
    currency: "NGN",
    profitTarget: template.profitTarget,
    dailyDrawdown: template.dailyDrawdown,
    maxDrawdown: template.maxDrawdown,
    maxLeverage: template.maxLeverage,
    minTradingDays: template.minTradingDays,
    maxTradingDays: template.maxTradingDays || null,
    paymentId: payment.id,
    amountPaid: 0,
    startedAt: now,
    expiresAt: now + (template.durationDays || 30) * 86400000,
    createdAt: now,
    updatedAt: now,
  }).returning().get();

  // Create MT5 demo account
  const login = "AFC" + Math.floor(100000 + Math.random() * 900000);
  const mt5Account = db.insert(mt5Accounts).values({
    userId: targetUserId,
    login,
    password: "Demo@" + Math.random().toString(36).substring(2, 10),
    investorPassword: "Demo@" + Math.random().toString(36).substring(2, 10),
    server: "AfriFundedCapital-Demo",
    group: "DEMO\\AFC",
    leverage: template.maxLeverage || 100,
    balance: size.size,
    equity: size.size,
    currency: "NGN",
    createdAt: now,
  }).returning().get();

  db.update(userChallenges).set({ mt5AccountId: mt5Account.id, updatedAt: now }).where(eq(userChallenges.id, challenge.id)).run();

  // Notify user
  createNotification(db, targetUserId, {
    type: "payment",
    title: "Demo Challenge Created",
    message: `A demo ${template.name} challenge (${size.label}) has been created for your account.`,
    link: "/dashboard/challenges",
  });

  return c.json({
    success: true,
    challengeId: challenge.id,
    mt5Login: login,
    message: `Demo challenge created: ${template.name} — ${size.label}`,
  });
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
  const updateFields: Partial<typeof userChallenges.$inferInsert> = { status: newStatus, updatedAt: now };
  if (newStatus === "phase_1_passed") updateFields.phase1PassedAt = now;
  if (newStatus === "phase_2_passed") updateFields.phase2PassedAt = now;
  if (newStatus === "funded") updateFields.fundedAt = now;
  if (body.currentPhase !== undefined) updateFields.currentPhase = body.currentPhase;

  db.update(userChallenges).set(updateFields).where(eq(userChallenges.id, id)).run();

  // Auto-generate certificate if status warrants one
  const cert = maybeGenerateCertificate(db, id, newStatus);

  // Audit the status change — lifecycle events get their own action so the
  // trail reads like the challenge's actual journey, and every entry is
  // stamped with the challenge label (template · account size).
  try {
    const lifecycleActions: Record<string, string> = {
      phase_1_passed: "challenge.phase_passed",
      phase_2_passed: "challenge.phase_passed",
      funded: "challenge.funded",
      violated: "challenge.violated",
      expired: "challenge.expired",
    };
    const action = lifecycleActions[newStatus] || "challenge.status_updated";
    writeAuditLog(db, {
      userId: c.get("userId"),
      action,
      entity: "challenge",
      entityId: id,
      details: {
        challengeLabel: resolveChallengeLabel(db, challenge),
        fromStatus: challenge.status,
        toStatus: newStatus,
        ...(newStatus === "phase_1_passed" || newStatus === "phase_2_passed" ? { phase: newStatus } : {}),
      },
      ipAddress: c.req.header("x-forwarded-for") || undefined,
    });
  } catch (e) {
    console.warn("[Audit] Failed to log challenge status change:", e);
  }

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
