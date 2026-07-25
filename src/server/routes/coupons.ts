import { Hono } from "hono";
import { getDb } from "../db";
import { coupons, couponRedemptions } from "../schema";
import { eq, desc, and, sql } from "drizzle-orm";
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

// List all coupons (admin) with redemption counts
app.get("/admin/all", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const items = db.select().from(coupons).orderBy(desc(coupons.createdAt)).all();

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
