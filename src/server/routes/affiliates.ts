import { Hono } from "hono";
import { getDb } from "../db";
import { affiliates, referrals, commissions, commissionPayouts, users, wallets, walletTransactions, settings } from "../schema";
import { eq, desc, asc, count, sql, and, or, like, type SQL, type SQLWrapper } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";
import { createNotification } from "../lib/notifications";

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

// Admin: List all affiliates (paginated + searchable)
app.get("/admin/all", requireAuth, requireAdmin, (c) => {
  const db = getDb();

  // Pagination params (clamped)
  const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") || "20") || 20));

  // Sorting (whitelisted columns, asc/desc)
  const SORTABLE: Record<string, SQLWrapper> = {
    id: affiliates.id,
    referralCode: affiliates.referralCode,
    totalReferrals: affiliates.totalReferrals,
    totalCommissions: affiliates.totalCommissions,
    isActive: affiliates.isActive,
    joinedAt: affiliates.joinedAt,
  };
  const qSortBy = String(c.req.query("sortBy") || "joinedAt");
  const qSortOrder = String(c.req.query("sortOrder") || "desc");
  const sortCol = SORTABLE[qSortBy] || affiliates.joinedAt;
  const sortOrder = qSortOrder.toLowerCase() === "asc" ? asc(sortCol) : desc(sortCol);

  // Filters
  const search = (c.req.query("search") || "").trim();
  const status = c.req.query("status") || "";

  const conditions: SQL[] = [];
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        like(affiliates.referralCode, pattern),
        like(users.name, pattern),
        like(users.email, pattern),
      )!,
    );
  }
  if (status === "active") conditions.push(eq(affiliates.isActive, true));
  if (status === "inactive") conditions.push(eq(affiliates.isActive, false));
  const whereClause: SQL = conditions.length > 0 ? and(...conditions)! : sql`1 = 1`;

  // Total matching count
  const totalRow = db
    .select({ count: count() })
    .from(affiliates)
    .leftJoin(users, eq(users.id, affiliates.userId))
    .where(whereClause)
    .get();
  const total = totalRow?.count || 0;

  // Page of affiliates with user info joined
  const rows = db
    .select({ aff: affiliates, userName: users.name, userEmail: users.email })
    .from(affiliates)
    .leftJoin(users, eq(users.id, affiliates.userId))
    .where(whereClause)
    .orderBy(sortOrder)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  const items = rows.map((r) => ({
    ...r.aff,
    userName: r.userName || null,
    userEmail: r.userEmail || null,
  }));

  // Platform-wide stats (unfiltered)
  const all = db.select().from(affiliates).all();
  const stats = {
    total: all.length,
    active: all.filter((a) => a.isActive).length,
    totalReferrals: all.reduce((s, a) => s + (a.totalReferrals || 0), 0),
    totalCommissions: all.reduce((s, a) => s + (a.totalCommissions || 0), 0),
    pendingCommissions: all.reduce((s, a) => s + (a.pendingCommissions || 0), 0),
    paidCommissions: all.reduce((s, a) => s + (a.paidCommissions || 0), 0),
  };

  return c.json({
    affiliates: items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats,
  });
});

// Admin: Approve commission
app.post("/admin/commission/:id/approve", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  db.update(commissions).set({ status: "approved", paidAt: Date.now() }).where(eq(commissions.id, id)).run();
  return c.json({ success: true });
});

// ─── Get my affiliate payout stats ──────────────────────
app.get("/payouts/stats", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();
  const affiliate = db.select().from(affiliates).where(eq(affiliates.userId, userId)).get();
  if (!affiliate) return c.json({ pending: 0, approved: 0, paid: 0, totalRequested: 0, totalPaid: 0 });

  const pending = db.select({ total: sql<number>`coalesce(sum(amount), 0)` })
    .from(commissionPayouts).where(and(eq(commissionPayouts.userId, userId), eq(commissionPayouts.status, "pending"))).get();
  const approved = db.select({ total: sql<number>`coalesce(sum(amount), 0)` })
    .from(commissionPayouts).where(and(eq(commissionPayouts.userId, userId), eq(commissionPayouts.status, "approved"))).get();
  const paid = db.select({ total: sql<number>`coalesce(sum(amount), 0)` })
    .from(commissionPayouts).where(and(eq(commissionPayouts.userId, userId), eq(commissionPayouts.status, "paid"))).get();
  const totalRequested = db.select({ count: count() })
    .from(commissionPayouts).where(eq(commissionPayouts.userId, userId)).get();

  return c.json({
    pending: pending?.total || 0,
    approved: approved?.total || 0,
    paid: paid?.total || 0,
    totalRequested: totalRequested?.count || 0,
    totalPaid: paid?.total || 0,
  });
});

// ─── Get my affiliate payout history ─────────────────────
app.get("/payouts", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();

  const qPage = Number(c.req.query("page") || 1);
  const qPageSize = Number(c.req.query("pageSize") || 10);
  const page = Math.max(1, qPage);
  const pageSize = Math.min(50, Math.max(1, qPageSize));

  const whereClause: SQL = eq(commissionPayouts.userId, userId);

  // Total matching count
  const totalRow = db.select({ count: count() }).from(commissionPayouts).where(whereClause).get();
  const total = totalRow?.count || 0;

  // Page of payouts
  const items = db
    .select()
    .from(commissionPayouts)
    .where(whereClause)
    .orderBy(desc(commissionPayouts.requestedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  // User-wide stats (unfiltered)
  const all = db.select({ status: commissionPayouts.status }).from(commissionPayouts).where(whereClause).all();
  const byStatus = all.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});

  return c.json({
    payouts: items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats: { total: all.length, byStatus },
  });
});

// ─── Request affiliate payout ────────────────────────────
app.post("/payout-request", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const db = getDb();
  const now = Date.now();

  const affiliate = db.select().from(affiliates).where(eq(affiliates.userId, userId)).get();
  if (!affiliate) return c.json({ error: "No affiliate account found" }, 400);

  const amount = parseFloat(body.amount);
  if (!amount || amount <= 0) return c.json({ error: "Invalid amount" }, 400);

  if (amount < 5000) return c.json({ error: "Minimum payout is ₦5,000" }, 400);

  if (affiliate.pendingCommissions < amount) {
    return c.json({ error: `Insufficient pending commissions. Available: ₦${affiliate.pendingCommissions.toLocaleString()}` }, 400);
  }

  // Check for existing pending payout requests
  const pendingRequest = db.select().from(commissionPayouts).where(
    and(eq(commissionPayouts.userId, userId), eq(commissionPayouts.status, "pending"))
  ).get();
  if (pendingRequest) {
    return c.json({ error: "You already have a pending payout request. Please wait for it to be processed." }, 400);
  }

  // Allow concurrent approved (not yet paid) requests — only block pending

  if (!body.paymentMethod) return c.json({ error: "Payment method is required" }, 400);
  if (!body.paymentDetails) return c.json({ error: "Payment details are required" }, 400);

  // Deduct from pending commissions
  db.update(affiliates).set({
    pendingCommissions: affiliate.pendingCommissions - amount,
  }).where(eq(affiliates.id, affiliate.id)).run();

  // Check auto-approve threshold from settings
  const thresholdSetting = db.select().from(settings).where(eq(settings.key, "affiliate_auto_approve_threshold")).get();
  const threshold = thresholdSetting ? JSON.parse(thresholdSetting.value) : 50000;
  const shouldAutoApprove = amount <= threshold;

  // Create payout request
  const payout = db.insert(commissionPayouts).values({
    userId,
    affiliateId: affiliate.id,
    amount,
    currency: "NGN",
    status: shouldAutoApprove ? "approved" : "pending",
    paymentMethod: body.paymentMethod,
    paymentDetails: body.paymentDetails,
    requestedAt: now,
    ...(shouldAutoApprove ? { processedAt: now } : {}),
  }).returning().get();

  // Notify user
  if (shouldAutoApprove) {
    createNotification(db, userId, {
      type: "payout",
      title: "Affiliate Payout Auto-Approved",
      message: `Your payout request of ₦${amount.toLocaleString()} has been auto-approved and will be processed shortly. (Under ₦${threshold.toLocaleString()} threshold)`,
      link: "/dashboard/affiliate",
    });
  } else {
    createNotification(db, userId, {
      type: "payout",
      title: "Affiliate Payout Requested",
      message: `Your payout request of ₦${amount.toLocaleString()} has been submitted and is pending review.`,
      link: "/dashboard/affiliate",
    });
  }

  return c.json({ ...payout, autoApproved: shouldAutoApprove, threshold });
});

// ─── Admin: List all affiliate payout requests (paginated + searchable) ───
app.get("/admin/payouts", requireAuth, requireAdmin, (c) => {
  const db = getDb();

  // Pagination params (clamped)
  const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") || "20") || 20));

  // Sorting (whitelisted columns, asc/desc)
  const SORTABLE: Record<string, SQLWrapper> = {
    id: commissionPayouts.id,
    amount: commissionPayouts.amount,
    status: commissionPayouts.status,
    paymentMethod: commissionPayouts.paymentMethod,
    requestedAt: commissionPayouts.requestedAt,
    processedAt: commissionPayouts.processedAt,
  };
  const qSortBy = String(c.req.query("sortBy") || "requestedAt");
  const qSortOrder = String(c.req.query("sortOrder") || "desc");
  const sortCol = SORTABLE[qSortBy] || commissionPayouts.requestedAt;
  const sortOrder = qSortOrder.toLowerCase() === "asc" ? asc(sortCol) : desc(sortCol);

  // Filters
  const search = (c.req.query("search") || "").trim();
  const status = c.req.query("status") || "";

  const conditions: SQL[] = [];
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        like(users.name, pattern),
        like(users.email, pattern),
        like(commissionPayouts.paymentMethod, pattern),
        sql`cast(${commissionPayouts.amount} as text) like ${pattern}`,
      )!,
    );
  }
  if (status && status !== "all") conditions.push(eq(commissionPayouts.status, status));
  const whereClause: SQL = conditions.length > 0 ? and(...conditions)! : sql`1 = 1`;

  // Total matching count
  const totalRow = db
    .select({ count: count() })
    .from(commissionPayouts)
    .leftJoin(users, eq(users.id, commissionPayouts.userId))
    .where(whereClause)
    .get();
  const total = totalRow?.count || 0;

  // Page of payouts with user info joined
  const rows = db
    .select({ payout: commissionPayouts, userName: users.name, userEmail: users.email })
    .from(commissionPayouts)
    .leftJoin(users, eq(users.id, commissionPayouts.userId))
    .where(whereClause)
    .orderBy(sortOrder)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  const items = rows.map((r) => ({
    ...r.payout,
    userName: r.userName || null,
    userEmail: r.userEmail || null,
  }));

  // Platform-wide stats (unfiltered)
  const all = db.select().from(commissionPayouts).all();
  const stats = {
    total: all.length,
    pending: all.filter((p) => p.status === "pending").length,
    approved: all.filter((p) => p.status === "approved").length,
    paid: all.filter((p) => p.status === "paid").length,
    rejected: all.filter((p) => p.status === "rejected").length,
    totalAmount: all.reduce((s, p) => s + (p.amount || 0), 0),
    pendingAmount: all.filter((p) => p.status === "pending").reduce((s, p) => s + (p.amount || 0), 0),
    paidAmount: all.filter((p) => p.status === "paid").reduce((s, p) => s + (p.amount || 0), 0),
  };

  return c.json({
    payouts: items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats,
  });
});

// ─── Admin: Approve affiliate payout ─────────────────────
app.post("/admin/payouts/:id/approve", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const payout = db.select().from(commissionPayouts).where(eq(commissionPayouts.id, id)).get();
  if (!payout) return c.json({ error: "Payout not found" }, 404);
  if (payout.status !== "pending") return c.json({ error: "Payout is not in pending status" }, 400);

  db.update(commissionPayouts).set({
    status: "approved",
    processedAt: Date.now(),
  }).where(eq(commissionPayouts.id, id)).run();

  createNotification(db, payout.userId, {
    type: "payout",
    title: "Affiliate Payout Approved",
    message: `Your payout request of ₦${payout.amount.toLocaleString()} has been approved and will be processed shortly.`,
    link: "/dashboard/affiliate",
  });

  return c.json({ success: true });
});

// ─── Admin: Reject affiliate payout ──────────────────────
app.post("/admin/payouts/:id/reject", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const db = getDb();
  const payout = db.select().from(commissionPayouts).where(eq(commissionPayouts.id, id)).get();
  if (!payout) return c.json({ error: "Payout not found" }, 404);
  if (payout.status !== "pending") return c.json({ error: "Payout is not in pending status" }, 400);

  // Refund the amount back to pending commissions
  const affiliate = db.select().from(affiliates).where(eq(affiliates.id, payout.affiliateId)).get();
  if (affiliate) {
    db.update(affiliates).set({
      pendingCommissions: affiliate.pendingCommissions + payout.amount,
    }).where(eq(affiliates.id, affiliate.id)).run();
  }

  db.update(commissionPayouts).set({
    status: "rejected",
    notes: body.reason || "Rejected by admin",
    processedAt: Date.now(),
  }).where(eq(commissionPayouts.id, id)).run();

  createNotification(db, payout.userId, {
    type: "payout",
    title: "Affiliate Payout Rejected",
    message: `Your payout request of ₦${payout.amount.toLocaleString()} was rejected. Reason: ${body.reason || "Not specified"}.`,
    link: "/dashboard/affiliate",
  });

  return c.json({ success: true });
});

// ─── Admin: Mark affiliate payout as paid ────────────────
app.post("/admin/payouts/:id/pay", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const payout = db.select().from(commissionPayouts).where(eq(commissionPayouts.id, id)).get();
  if (!payout) return c.json({ error: "Payout not found" }, 404);
  if (payout.status !== "approved") return c.json({ error: "Payout must be approved first" }, 400);

  // Update payout status
  db.update(commissionPayouts).set({
    status: "paid",
    processedAt: Date.now(),
  }).where(eq(commissionPayouts.id, id)).run();

  // Update affiliate paid commissions
  const affiliate = db.select().from(affiliates).where(eq(affiliates.id, payout.affiliateId)).get();
  if (affiliate) {
    db.update(affiliates).set({
      paidCommissions: affiliate.paidCommissions + payout.amount,
    }).where(eq(affiliates.id, affiliate.id)).run();
  }

  // Log wallet transaction
  const wallet = db.select().from(wallets).where(eq(wallets.userId, payout.userId)).get();
  if (wallet) {
    db.insert(walletTransactions).values({
      walletId: wallet.id,
      userId: payout.userId,
      type: "commission",
      amount: payout.amount,
      balanceBefore: wallet.balance,
      balanceAfter: wallet.balance + payout.amount,
      description: `Affiliate payout of ₦${payout.amount.toLocaleString()}`,
      reference: `CP-${payout.id}`,
      createdAt: Date.now(),
    }).run();

    db.update(wallets).set({
      balance: wallet.balance + payout.amount,
    }).where(eq(wallets.id, wallet.id)).run();
  }

  createNotification(db, payout.userId, {
    type: "payout",
    title: "Affiliate Payout Completed",
    message: `Your payout of ₦${payout.amount.toLocaleString()} has been processed. Funds have been credited to your wallet.`,
    link: "/dashboard/wallet",
  });

  return c.json({ success: true });
});

export default app;
