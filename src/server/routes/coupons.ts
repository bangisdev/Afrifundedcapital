import { Hono } from "hono";
import { getDb } from "../db";
import { coupons, couponRedemptions } from "../schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";

const app = new Hono();

// List all coupons (admin)
app.get("/admin/all", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const items = db.select().from(coupons).orderBy(desc(coupons.createdAt)).all();
  return c.json(items);
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
