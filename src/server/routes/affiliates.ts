import { Hono } from "hono";
import { getDb } from "../db";
import { affiliates, referrals, commissions } from "../schema";
import { eq, desc, count } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";

const app = new Hono();

// Get my affiliate data
app.get("/my", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();
  const affiliate = db.select().from(affiliates).where(eq(affiliates.userId, userId)).get();
  return c.json(affiliate || null);
});

// Track referral
app.post("/track", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const db = getDb();
  const affiliate = db.select().from(affiliates).where(eq(affiliates.referralCode, body.code)).get();
  if (affiliate) {
    db.insert(referrals).values({
      referrerId: affiliate.userId,
      referredId: userId,
      affiliateId: affiliate.id,
      status: "pending",
      createdAt: Date.now(),
    }).run();
  }
  return c.json({ success: true });
});

// Admin: List all affiliates
app.get("/admin/all", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const items = db.select().from(affiliates).orderBy(desc(affiliates.joinedAt)).all();
  return c.json(items);
});

// Admin: Approve commission
app.post("/admin/commission/:id/approve", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  db.update(commissions).set({ status: "approved", paidAt: Date.now() }).where(eq(commissions.id, id)).run();
  return c.json({ success: true });
});

export default app;
