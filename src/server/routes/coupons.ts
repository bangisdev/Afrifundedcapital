import { Hono } from "hono";
import { getDb } from "../db";
import { coupons, couponRedemptions } from "../schema";
import { eq, desc, asc, and, count, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";

const app = new Hono();

// ─── Validate Coupon (public, requires auth) ──────────
app.post("/validate", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const code = (body.code as string)?.trim().toUpperCase();
  const amount = body.amount as number;

  if (!code) return c.json({ valid: false, error: "Coupon code is required" }, 400);
  if (!amount || amount <= 0) return c.json({ valid: false, error: "Invalid purchase amount" }, 400);

  const db = getDb();
  const coupon = db.select().from(coupons).where(eq(coupons.code, code)).get();

  if (!coupon) return c.json({ valid: false, error: "Coupon not found" }, 404);

  // Check expiry
  if (coupon.expiresAt && coupon.expiresAt < Date.now()) {
    return c.json({ valid: false, error: "Coupon has expired" }, 400);
  }

  // Check max total uses
  if (coupon.maxUses) {
    const totalRedemptions = db
      .select({ count: sql<number>`count(*)` })
      .from(couponRedemptions)
      .where(eq(couponRedemptions.couponId, coupon.id))
      .get();
    if (totalRedemptions && totalRedemptions.count >= coupon.maxUses) {
      return c.json({ valid: false, error: "Coupon has reached maximum usage" }, 400);
    }
  }

  // Check max uses per user
  if (coupon.maxUsesPerUser) {
    const userRedemptions = db
      .select({ count: sql<number>`count(*)` })
      .from(couponRedemptions)
      .where(and(
        eq(couponRedemptions.couponId, coupon.id),
        eq(couponRedemptions.userId, userId)
      ))
      .get();
    if (userRedemptions && userRedemptions.count >= coupon.maxUsesPerUser) {
      return c.json({ valid: false, error: "You have already used this coupon" }, 400);
    }
  }

  // Check minimum purchase amount
  if (coupon.minPurchaseAmount && amount < coupon.minPurchaseAmount) {
    return c.json({
      valid: false,
      error: `Minimum purchase amount is ${coupon.minPurchaseAmount}`,
    }, 400);
  }

  // Calculate discount
  let discount = 0;
  if (coupon.discountType === "percentage") {
    discount = Math.round(amount * (coupon.discountValue / 100));
  } else {
    // fixed discount
    discount = Math.min(coupon.discountValue, amount); // Can't discount more than the total
  }

  const finalAmount = Math.max(amount - discount, 0); // Never go negative

  return c.json({
    valid: true,
    couponId: coupon.id,
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discount,
    originalAmount: amount,
    finalAmount,
    description: coupon.description,
  });
});

// ─── Record coupon redemption (called after payment) ──
app.post("/redeem", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const { couponId, paymentId } = body;

  if (!couponId || !paymentId) return c.json({ error: "couponId and paymentId required" }, 400);

  const db = getDb();

  // Check if already redeemed for this payment
  const existing = db
    .select()
    .from(couponRedemptions)
    .where(and(
      eq(couponRedemptions.couponId, couponId),
      eq(couponRedemptions.userId, userId),
      eq(couponRedemptions.paymentId, paymentId),
    ))
    .get();
  if (existing) return c.json({ success: true, message: "Already redeemed" });

  db.insert(couponRedemptions).values({
    couponId,
    userId,
    paymentId,
    discountAmount: 0,
    originalAmount: 0,
    redeemedAt: Date.now(),
  }).run();

  return c.json({ success: true });
});

// ─── Get my redeemed coupons (paginated + sortable) ───
app.get("/my", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();

  const qPage = Number(c.req.query("page") || 1);
  const qPageSize = Number(c.req.query("pageSize") || 10);
  const page = Math.max(1, qPage);
  const pageSize = Math.min(50, Math.max(1, qPageSize));

  // Sorting (whitelisted columns, asc/desc) — "code" sorts on the joined coupons table
  const SORTABLE: Record<string, SQLWrapper> = {
    id: couponRedemptions.id,
    code: coupons.code,
    discountAmount: couponRedemptions.discountAmount,
    originalAmount: couponRedemptions.originalAmount,
    redeemedAt: couponRedemptions.redeemedAt,
  };
  const qSortBy = String(c.req.query("sortBy") || "redeemedAt");
  const qSortOrder = String(c.req.query("sortOrder") || "desc");
  const sortCol = SORTABLE[qSortBy] || couponRedemptions.redeemedAt;
  const sortOrder = qSortOrder.toLowerCase() === "asc" ? asc(sortCol) : desc(sortCol);

  const whereClause: SQL = eq(couponRedemptions.userId, userId);

  // Total matching count
  const totalRow = db
    .select({ count: count() })
    .from(couponRedemptions)
    .leftJoin(coupons, eq(coupons.id, couponRedemptions.couponId))
    .where(whereClause)
    .get();
  const total = totalRow?.count || 0;

  // Page of redemptions with coupon info joined
  const rows = db
    .select({
      redemption: couponRedemptions,
      couponCode: coupons.code,
      discountType: coupons.discountType,
      discountValue: coupons.discountValue,
    })
    .from(couponRedemptions)
    .leftJoin(coupons, eq(coupons.id, couponRedemptions.couponId))
    .where(whereClause)
    .orderBy(sortOrder)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  const items = rows.map((r) => ({
    ...r.redemption,
    code: r.couponCode || null,
    discountType: r.discountType || null,
    discountValue: r.discountValue || null,
  }));

  // User-wide stats (unfiltered)
  const all = db
    .select({ discountAmount: couponRedemptions.discountAmount })
    .from(couponRedemptions)
    .where(whereClause)
    .all();
  const totalDiscount = all.reduce((s, r) => s + (r.discountAmount || 0), 0);

  return c.json({
    coupons: items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats: { total: all.length, totalDiscount },
  });
});

// List all coupons (admin) with redemption counts
app.get("/admin/all", requireAuth, requireAdmin, (c) => {
  const db = getDb();

  // Sorting (whitelisted columns, asc/desc)
  const SORTABLE: Record<string, SQLWrapper> = {
    id: coupons.id,
    code: coupons.code,
    discountType: coupons.discountType,
    discountValue: coupons.discountValue,
    currentUses: coupons.currentUses,
    isActive: coupons.isActive,
    expiresAt: coupons.expiresAt,
    createdAt: coupons.createdAt,
  };
  const qSortBy = String(c.req.query("sortBy") || "createdAt");
  const qSortOrder = String(c.req.query("sortOrder") || "desc");
  const sortCol = SORTABLE[qSortBy] || coupons.createdAt;
  const sortOrder = qSortOrder.toLowerCase() === "asc" ? asc(sortCol) : desc(sortCol);

  const items = db.select().from(coupons).orderBy(sortOrder).all();

  // Enrich each coupon with actual redemption count and total discount given
  const enriched = items.map((coupon) => {
    const stats = db
      .select({
        count: sql<number>`count(*)`,
        totalDiscount: sql<number>`coalesce(sum(${couponRedemptions.discountAmount}), 0)`,
      })
      .from(couponRedemptions)
      .where(eq(couponRedemptions.couponId, coupon.id))
      .get();

    return {
      ...coupon,
      redemptionCount: stats?.count || 0,
      totalDiscountGiven: stats?.totalDiscount || 0,
    };
  });

  return c.json(enriched);
});

// Create coupon
app.post("/admin/create", requireAuth, requireAdmin, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const db = getDb();
  const result = db.insert(coupons).values({
    code: body.code,
    discountType: body.discountType,
    discountValue: body.discountValue,
    minPurchaseAmount: body.minPurchaseAmount || null,
    maxUses: body.maxUses || null,
    maxUsesPerUser: body.maxUsesPerUser || null,
    expiresAt: body.expiresAt || null,
    description: body.description || null,
    createdBy: userId,
    createdAt: Date.now(),
  }).returning().get();
  return c.json(result);
});

// Update coupon
app.put("/admin/:id", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const db = getDb();
  db.update(coupons).set(body).where(eq(coupons.id, id)).run();
  return c.json({ success: true });
});

// Delete coupon
app.delete("/admin/:id", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  db.delete(coupons).where(eq(coupons.id, id)).run();
  return c.json({ success: true });
});

export default app;
