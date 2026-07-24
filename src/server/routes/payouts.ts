import { Hono } from "hono";
import { getDb } from "../db";
import { profitPayouts, fundedAccounts, userChallenges, users } from "../schema";
import { eq, desc, and, count, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";

const app = new Hono();

// Get my payouts
app.get("/my", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();
  const items = db.select().from(profitPayouts)
    .where(eq(profitPayouts.userId, userId))
    .orderBy(desc(profitPayouts.requestedAt)).all();
  return c.json(items);
});

// Get my payout stats
app.get("/my/stats", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();
  const total = db.select({ count: count() }).from(profitPayouts).where(eq(profitPayouts.userId, userId)).get();
  const paid = db.select({ total: sql<number>`coalesce(sum(amount), 0)` })
    .from(profitPayouts).where(and(eq(profitPayouts.userId, userId), eq(profitPayouts.status, "paid"))).get();
  const pending = db.select({ total: sql<number>`coalesce(sum(amount), 0)` })
    .from(profitPayouts).where(and(eq(profitPayouts.userId, userId), eq(profitPayouts.status, "pending"))).get();
  return c.json({ totalPayouts: total?.count || 0, totalPaid: paid?.total || 0, totalPending: pending?.total || 0 });
});

// Get my funded accounts
app.get("/my/funded", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();
  const accounts = db.select().from(fundedAccounts).where(eq(fundedAccounts.userId, userId)).all();
  return c.json(accounts);
});

// Request payout
app.post("/request", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const db = getDb();
  const result = db.insert(profitPayouts).values({
    userId,
    fundedAccountId: body.fundedAccountId,
    challengeId: body.challengeId,
    amount: body.amount,
    currency: body.currency || "NGN",
    status: "pending",
    paymentMethod: body.paymentMethod,
    paymentDetails: body.paymentDetails,
    requestedAt: Date.now(),
  }).returning().get();
  return c.json(result);
});

// Admin: Payout stats
app.get("/admin/stats", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const total = db.select({ count: count() }).from(profitPayouts).get();
  const pending = db.select({ count: count() }).from(profitPayouts).where(eq(profitPayouts.status, "pending")).get();
  const totalPaid = db.select({ total: sql<number>`coalesce(sum(amount), 0)` })
    .from(profitPayouts).where(eq(profitPayouts.status, "paid")).get();
  return c.json({ total: total?.count || 0, pending: pending?.count || 0, totalPaid: totalPaid?.total || 0 });
});

// Admin: List all payouts
app.get("/admin/all", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const items = db.select().from(profitPayouts).orderBy(desc(profitPayouts.requestedAt)).all();
  return c.json(items);
});

// Admin: Approve payout
app.post("/admin/:id/approve", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  db.update(profitPayouts).set({ status: "approved", processedAt: Date.now() }).where(eq(profitPayouts.id, id)).run();
  return c.json({ success: true });
});

// Admin: Reject payout
app.post("/admin/:id/reject", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const db = getDb();
  db.update(profitPayouts).set({ status: "rejected", rejectionReason: body.reason, processedAt: Date.now() }).where(eq(profitPayouts.id, id)).run();
  return c.json({ success: true });
});

export default app;
