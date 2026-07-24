import { Hono } from "hono";
import { getDb } from "../db";
import { payments, paymentLogs } from "../schema";
import { eq, desc, count, and, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";

const app = new Hono();

// Get my payments
app.get("/my", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();
  const items = db.select().from(payments)
    .where(eq(payments.userId, userId))
    .orderBy(desc(payments.createdAt)).limit(100).all();
  return c.json(items);
});

// Admin: List all payments
app.get("/admin/all", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const items = db.select().from(payments).orderBy(desc(payments.createdAt)).limit(200).all();
  return c.json(items);
});

// Admin: Payment stats
app.get("/admin/stats", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const total = db.select({ count: count() }).from(payments).get();
  const completed = db.select({ count: count() }).from(payments).where(eq(payments.status, "completed")).get();
  const revenue = db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(payments).where(eq(payments.status, "completed")).get();
  return c.json({ total: total?.count || 0, completed: completed?.count || 0, revenue: revenue?.total || 0 });
});

// Admin: Revenue growth
app.get("/admin/revenue-growth", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000;

  const thisMonth = db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(payments)
    .where(and(eq(payments.status, "completed"), sql`created_at > ${thirtyDaysAgo}`)).get();
  const lastMonth = db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(payments)
    .where(and(eq(payments.status, "completed"), sql`created_at > ${sixtyDaysAgo} AND created_at <= ${thirtyDaysAgo}`)).get();

  return c.json({ thisMonth: thisMonth?.total || 0, lastMonth: lastMonth?.total || 0 });
});

// Admin: Refund payment
app.post("/admin/:id/refund", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  db.update(payments).set({ status: "refunded", completedAt: Date.now() }).where(eq(payments.id, id)).run();
  return c.json({ success: true });
});

export default app;
