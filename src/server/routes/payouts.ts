import { Hono } from "hono";
import { getDb } from "../db";
import { profitPayouts, fundedAccounts, userChallenges, users } from "../schema";
import { eq, desc, and, count, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";
import { createNotification } from "../lib/notifications";
import { sendEmail, payoutApprovedEmail, payoutRejectedEmail, payoutPaidEmail } from "../lib/email";

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

// Admin: Payout stats (supports ?startDate=&endDate= in ms timestamps)
app.get("/admin/stats", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const startTs = startDate ? parseInt(startDate) : undefined;
  const endTs = endDate ? parseInt(endDate) : undefined;

  // Build date filter conditions
  const dateConditions: ReturnType<typeof sql>[] = [];
  if (startTs) dateConditions.push(sql`${profitPayouts.requestedAt} >= ${startTs}`);
  if (endTs) dateConditions.push(sql`${profitPayouts.requestedAt} <= ${endTs}`);
  const dateFilter = dateConditions.length > 0 ? and(...dateConditions) : undefined;

  // Default period (this month) for the stats cards
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const startOfMonthTs = startOfMonth.getTime();

  const total = dateFilter
    ? db.select({ count: count() }).from(profitPayouts).where(dateFilter).get()
    : db.select({ count: count() }).from(profitPayouts).get();
  const pending = dateFilter
    ? db.select({ count: count() }).from(profitPayouts).where(and(eq(profitPayouts.status, "pending"), ...dateConditions)).get()
    : db.select({ count: count() }).from(profitPayouts).where(eq(profitPayouts.status, "pending")).get();
  const approved = dateFilter
    ? db.select({ count: count() }).from(profitPayouts).where(and(eq(profitPayouts.status, "approved"), ...dateConditions)).get()
    : db.select({ count: count() }).from(profitPayouts).where(eq(profitPayouts.status, "approved")).get();
  const approvedAmount = dateFilter
    ? db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(profitPayouts).where(and(eq(profitPayouts.status, "approved"), ...dateConditions)).get()
    : db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(profitPayouts).where(eq(profitPayouts.status, "approved")).get();
  const totalPaid = db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(profitPayouts).where(eq(profitPayouts.status, "paid")).get();
  const paidThisMonth = db.select({ total: sql<number>`coalesce(sum(amount), 0)` })
    .from(profitPayouts).where(and(eq(profitPayouts.status, "paid"), sql`${profitPayouts.processedAt} >= ${startOfMonthTs}`)).get();
  const paidCount = db.select({ count: count() })
    .from(profitPayouts).where(and(eq(profitPayouts.status, "paid"), sql`${profitPayouts.processedAt} >= ${startOfMonthTs}`)).get();
  return c.json({
    total: total?.count || 0,
    pending: pending?.count || 0,
    approved: approved?.count || 0,
    approvedAmount: approvedAmount?.total || 0,
    totalPaid: totalPaid?.total || 0,
    paidThisMonth: paidThisMonth?.total || 0,
    paidThisMonthCount: paidCount?.count || 0,
  });
});

// Admin: List all payouts (supports ?startDate=&endDate= in ms timestamps, ?status= filter)
app.get("/admin/all", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const status = c.req.query("status");
  const conditions: ReturnType<typeof eq | typeof sql>[] = [];
  if (startDate) conditions.push(sql`${profitPayouts.requestedAt} >= ${parseInt(startDate)}`);
  if (endDate) conditions.push(sql`${profitPayouts.requestedAt} <= ${parseInt(endDate)}`);
  if (status) conditions.push(eq(profitPayouts.status, status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const items = where
    ? db.select().from(profitPayouts).where(where).orderBy(desc(profitPayouts.requestedAt)).all()
    : db.select().from(profitPayouts).orderBy(desc(profitPayouts.requestedAt)).all();
  return c.json(items);
});

// Admin: Approve payout
app.post("/admin/:id/approve", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const payout = db.select().from(profitPayouts).where(eq(profitPayouts.id, id)).get();
  db.update(profitPayouts).set({ status: "approved", processedAt: Date.now() }).where(eq(profitPayouts.id, id)).run();
  if (payout) {
    createNotification(db, payout.userId, {
      type: "payout",
      title: "Payout Approved",
      message: `Your payout request of ${payout.currency} ${payout.amount.toLocaleString()} has been approved and will be processed shortly.`,
      link: "/dashboard/payouts",
    });
    // Send email notification
    const user = db.select().from(users).where(eq(users.id, payout.userId)).get();
    if (user?.email) {
      const email = payoutApprovedEmail(user.name || "Trader", payout.amount, payout.currency);
      sendEmail({ ...email, to: user.email }).catch(() => {});
    }
  }
  return c.json({ success: true });
});

// Admin: Bulk approve payouts
app.post("/admin/bulk-approve", requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json();
  const ids: number[] = body.ids || [];
  if (!ids.length) return c.json({ error: "No IDs provided" }, 400);
  const db = getDb();
  const now = Date.now();
  let approved = 0;
  for (const id of ids) {
    const payout = db.select().from(profitPayouts).where(eq(profitPayouts.id, id)).get();
    if (payout && payout.status === "pending") {
      db.update(profitPayouts).set({ status: "approved", processedAt: now }).where(eq(profitPayouts.id, id)).run();
      createNotification(db, payout.userId, {
        type: "payout",
        title: "Payout Approved",
        message: `Your payout request of ${payout.currency} ${payout.amount.toLocaleString()} has been approved and will be processed shortly.`,
        link: "/dashboard/payouts",
      });
      approved++;
    }
  }
  return c.json({ success: true, approved });
});

// Admin: Reject payout
app.post("/admin/:id/reject", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const db = getDb();
  const payout = db.select().from(profitPayouts).where(eq(profitPayouts.id, id)).get();
  db.update(profitPayouts).set({ status: "rejected", rejectionReason: body.reason, processedAt: Date.now() }).where(eq(profitPayouts.id, id)).run();
  if (payout) {
    createNotification(db, payout.userId, {
      type: "payout",
      title: "Payout Rejected",
      message: `Your payout request of ${payout.currency} ${payout.amount.toLocaleString()} was rejected. Reason: ${body.reason || "Not specified"}.`,
      link: "/dashboard/payouts",
    });
    // Send email notification with rejection reason
    const user = db.select().from(users).where(eq(users.id, payout.userId)).get();
    if (user?.email) {
      const email = payoutRejectedEmail(user.name || "Trader", payout.amount, payout.currency, body.reason || "No reason provided");
      sendEmail({ ...email, to: user.email }).catch(() => {});
    }
  }
  return c.json({ success: true });
});

// Admin: Bulk mark payouts as paid
app.post("/admin/bulk-mark-paid", requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json();
  const ids: number[] = body.ids || [];
  if (!ids.length) return c.json({ error: "No IDs provided" }, 400);
  const db = getDb();
  const now = Date.now();
  let marked = 0;
  for (const id of ids) {
    const payout = db.select().from(profitPayouts).where(eq(profitPayouts.id, id)).get();
    if (payout && payout.status === "approved") {
      db.update(profitPayouts).set({ status: "paid", processedAt: now }).where(eq(profitPayouts.id, id)).run();
      createNotification(db, payout.userId, {
        type: "payout",
        title: "Payout Sent",
        message: `Your payout of ${payout.currency} ${payout.amount.toLocaleString()} has been sent to your account.`,
        link: "/dashboard/payouts",
      });
      // Send email notification
      const user = db.select().from(users).where(eq(users.id, payout.userId)).get();
      if (user?.email) {
        const email = payoutPaidEmail(user.name || "Trader", payout.amount, payout.currency);
        sendEmail({ ...email, to: user.email }).catch(() => {});
      }
      marked++;
    }
  }
  return c.json({ success: true, marked });
});

// Admin: Mark payout as paid
app.post("/admin/:id/mark-paid", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const payout = db.select().from(profitPayouts).where(eq(profitPayouts.id, id)).get();
  db.update(profitPayouts).set({ status: "paid", processedAt: Date.now() }).where(eq(profitPayouts.id, id)).run();
  if (payout) {
    createNotification(db, payout.userId, {
      type: "payout",
      title: "Payout Sent",
      message: `Your payout of ${payout.currency} ${payout.amount.toLocaleString()} has been sent to your account.`,
      link: "/dashboard/payouts",
    });
    // Send email notification
    const user = db.select().from(users).where(eq(users.id, payout.userId)).get();
    if (user?.email) {
      const email = payoutPaidEmail(user.name || "Trader", payout.amount, payout.currency);
      sendEmail({ ...email, to: user.email }).catch(() => {});
    }
  }
  return c.json({ success: true });
});

export default app;
