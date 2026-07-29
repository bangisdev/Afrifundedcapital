import { Hono } from "hono";
import { getDb } from "../db";
import { affiliates, referrals, commissions, commissionPayouts, users, wallets, walletTransactions } from "../schema";
import { eq, desc, count, sql, and } from "drizzle-orm";
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
  const items = db.select().from(commissionPayouts)
    .where(eq(commissionPayouts.userId, userId))
    .orderBy(desc(commissionPayouts.requestedAt))
    .all();
  return c.json(items);
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

  if (!body.paymentMethod) return c.json({ error: "Payment method is required" }, 400);
  if (!body.paymentDetails) return c.json({ error: "Payment details are required" }, 400);

  // Deduct from pending commissions
  db.update(affiliates).set({
    pendingCommissions: affiliate.pendingCommissions - amount,
  }).where(eq(affiliates.id, affiliate.id)).run();

  // Create payout request
  const payout = db.insert(commissionPayouts).values({
    userId,
    affiliateId: affiliate.id,
    amount,
    currency: "NGN",
    status: "pending",
    paymentMethod: body.paymentMethod,
    paymentDetails: body.paymentDetails,
    requestedAt: now,
  }).returning().get();

  // Notify user
  createNotification(db, userId, {
    type: "payout",
    title: "Affiliate Payout Requested",
    message: `Your payout request of ₦${amount.toLocaleString()} has been submitted and is pending review.`,
    link: "/dashboard/affiliate",
  });

  return c.json(payout);
});

// ─── Admin: List all affiliate payout requests ───────────
app.get("/admin/payouts", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const items = db.select().from(commissionPayouts)
    .orderBy(desc(commissionPayouts.requestedAt))
    .all();

  // Enrich with user info
  const enriched = items.map((item) => {
    const user = db.select().from(users).where(eq(users.id, item.userId)).get();
    return { ...item, userName: user?.name || user?.email || "Unknown" };
  });

  return c.json(enriched);
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
