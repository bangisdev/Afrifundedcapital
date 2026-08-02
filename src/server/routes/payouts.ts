import { Hono } from "hono";
import { getDb } from "../db";
import { profitPayouts, fundedAccounts, userChallenges, users } from "../schema";
import { eq, desc, and, count, sql, type SQL } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";
import { createNotification } from "../lib/notifications";
import { sendEmail, payoutApprovedEmail, payoutRejectedEmail, payoutPaidEmail } from "../lib/email";

const app = new Hono();

// Get my payouts
app.get("/my", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();

  // Pagination params (clamped)
  const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") || "10") || 10));

  // Total count for this user
  const totalRow = db
    .select({ count: count() })
    .from(profitPayouts)
    .where(eq(profitPayouts.userId, userId))
    .get();
  const total = totalRow?.count || 0;

  // Page of payouts
  const items = db
    .select()
    .from(profitPayouts)
    .where(eq(profitPayouts.userId, userId))
    .orderBy(desc(profitPayouts.requestedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  // User-wide stats (unfiltered)
  const allPayouts = db
    .select({ status: profitPayouts.status, amount: profitPayouts.amount })
    .from(profitPayouts)
    .where(eq(profitPayouts.userId, userId))
    .all();
  const byStatus = allPayouts.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});
  const totalPaid = allPayouts.filter((p) => p.status === "paid").reduce((s, p) => s + (p.amount || 0), 0);
  const totalPending = allPayouts.filter((p) => p.status === "pending" || p.status === "processing").reduce((s, p) => s + (p.amount || 0), 0);

  return c.json({
    payouts: items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats: { total: allPayouts.length, totalPaid, totalPending, byStatus },
  });
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

  const qPage = Number(c.req.query("page") || 1);
  const qPageSize = Number(c.req.query("pageSize") || 10);
  const page = Math.max(1, qPage);
  const pageSize = Math.min(50, Math.max(1, qPageSize));

  const whereClause: SQL = eq(fundedAccounts.userId, userId);

  // Total matching count
  const totalRow = db.select({ count: count() }).from(fundedAccounts).where(whereClause).get();
  const total = totalRow?.count || 0;

  // Page of accounts
  const accounts = db
    .select()
    .from(fundedAccounts)
    .where(whereClause)
    .orderBy(desc(fundedAccounts.activatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  // User-wide stats (unfiltered)
  const all = db.select({ isActive: fundedAccounts.isActive }).from(fundedAccounts).where(whereClause).all();
  const byStatus = {
    active: all.filter((a) => a.isActive).length,
    inactive: all.filter((a) => !a.isActive).length,
  };

  return c.json({
    accounts,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats: { total: all.length, byStatus },
  });
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

// Admin: Per-user payout breakdown within date range
app.get("/admin/by-user", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const conditions: ReturnType<typeof eq | typeof sql>[] = [];
  if (startDate) conditions.push(sql`${profitPayouts.requestedAt} >= ${parseInt(startDate)}`);
  if (endDate) conditions.push(sql`${profitPayouts.requestedAt} <= ${parseInt(endDate)}`);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Get all payouts (with optional date filter)
  const items = where
    ? db.select().from(profitPayouts).where(where).orderBy(desc(profitPayouts.requestedAt)).all()
    : db.select().from(profitPayouts).orderBy(desc(profitPayouts.requestedAt)).all();

  // Group by userId
  const userMap = new Map<number, {
    userId: number;
    totalAmount: number;
    count: number;
    pending: number;
    approved: number;
    paid: number;
    rejected: number;
    pendingAmount: number;
    approvedAmount: number;
    paidAmount: number;
    rejectedAmount: number;
  }>();

  for (const p of items) {
    const existing = userMap.get(p.userId);
    if (existing) {
      existing.totalAmount += p.amount;
      existing.count++;
      if (p.status === "pending") { existing.pending++; existing.pendingAmount += p.amount; }
      if (p.status === "approved") { existing.approved++; existing.approvedAmount += p.amount; }
      if (p.status === "paid") { existing.paid++; existing.paidAmount += p.amount; }
      if (p.status === "rejected") { existing.rejected++; existing.rejectedAmount += p.amount; }
    } else {
      userMap.set(p.userId, {
        userId: p.userId,
        totalAmount: p.amount,
        count: 1,
        pending: p.status === "pending" ? 1 : 0,
        approved: p.status === "approved" ? 1 : 0,
        paid: p.status === "paid" ? 1 : 0,
        rejected: p.status === "rejected" ? 1 : 0,
        pendingAmount: p.status === "pending" ? p.amount : 0,
        approvedAmount: p.status === "approved" ? p.amount : 0,
        paidAmount: p.status === "paid" ? p.amount : 0,
        rejectedAmount: p.status === "rejected" ? p.amount : 0,
      });
    }
  }

  // Look up user names
  const userIds = Array.from(userMap.keys());
  const userNames = new Map<number, string>();
  if (userIds.length > 0) {
    const allUsers = db.select({ id: users.id, name: users.name, email: users.email }).from(users).all();
    for (const u of allUsers) {
      if (userIds.includes(u.id)) {
        userNames.set(u.id, u.name || u.email || `User ${u.id}`);
      }
    }
  }

  const breakdown = Array.from(userMap.values())
    .map((u) => ({ ...u, name: userNames.get(u.userId) || `User ${u.userId}` }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  return c.json(breakdown);
});

// Admin: List all payouts (supports ?startDate=&endDate=, ?status=, ?userId= filters)
app.get("/admin/all", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const status = c.req.query("status");
  const userIdParam = c.req.query("userId");
  const conditions: ReturnType<typeof eq | typeof sql>[] = [];
  if (startDate) conditions.push(sql`${profitPayouts.requestedAt} >= ${parseInt(startDate)}`);
  if (endDate) conditions.push(sql`${profitPayouts.requestedAt} <= ${parseInt(endDate)}`);
  if (status) conditions.push(eq(profitPayouts.status, status));
  if (userIdParam) conditions.push(eq(profitPayouts.userId, parseInt(userIdParam)));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const items = where
    ? db.select().from(profitPayouts).where(where).orderBy(desc(profitPayouts.requestedAt)).all()
    : db.select().from(profitPayouts).orderBy(desc(profitPayouts.requestedAt)).all();
  return c.json(items);
});

// Admin: Search users by name or email for the user filter autocomplete
app.get("/admin/search-users", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const q = c.req.query("q") || "";
  if (!q || q.length < 1) return c.json([]);
  const pattern = `%${q}%`;
  const results = db.select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(sql`(${users.name} LIKE ${pattern}) OR (${users.email} LIKE ${pattern}) OR (CAST(${users.id} AS TEXT) LIKE ${pattern})`)
    .limit(15)
    .all();
  return c.json(results);
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
