import { Hono } from "hono";
import { getDb } from "../db";
import { payments, paymentLogs, flutterwaveTransactions, challengeTemplates, accountSizes, userChallenges, mt5Accounts, settings, coupons, couponRedemptions, users, referrals, affiliates, commissions } from "../schema";
import { eq, desc, count, and, or, like, sql, type SQL } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";
import { notify } from "../lib/notifications";
import { paymentConfirmationEmail } from "../lib/email";

const app = new Hono();

// ─── Flutterwave Config ────────────────────────────────
app.get("/flutterwave-config", requireAuth, (c) => {
  const db = getDb();
  let publicKey = process.env.FLW_PUBLIC_KEY || "";
  let provider = "flutterwave";
  let isEnabled = true;
  
  // Also check settings table (database-stored config takes priority)
  try {
    const setting = db.select().from(settings).where(eq(settings.key, "flutterwave_config")).get();
    if (setting) {
      const config = JSON.parse(setting.value);
      if (config.publicKey) publicKey = config.publicKey;
      if (config.provider) provider = config.provider;
      if (config.isEnabled !== undefined) isEnabled = config.isEnabled;
    }
  } catch {}
  
  return c.json({ publicKey, provider, isEnabled });
});

// ─── Admin: Save Flutterwave Config ────────────────────
app.post("/admin/flutterwave-config", requireAuth, requireAdmin, async (c) => {
  const db = getDb();
  const body = await c.req.json();
  const config = {
    publicKey: body.publicKey || "",
    secretKey: body.secretKey || "",
    secretHash: body.secretHash || "",
    isEnabled: body.isEnabled !== undefined ? body.isEnabled : true,
  };
  
  const existing = db.select().from(settings).where(eq(settings.key, "flutterwave_config")).get();
  if (existing) {
    db.update(settings).set({ value: JSON.stringify(config) }).where(eq(settings.key, "flutterwave_config")).run();
  } else {
    db.insert(settings).values({
      key: "flutterwave_config",
      value: JSON.stringify(config),
      group: "payments",
      description: "Flutterwave payment gateway configuration",
    }).run();
  }
  
  return c.json({ success: true, message: "Flutterwave config saved" });
});

// ─── Admin: Get full Flutterwave config (for settings page) ──
app.get("/admin/flutterwave-config", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  try {
    const setting = db.select().from(settings).where(eq(settings.key, "flutterwave_config")).get();
    if (setting) {
      const config = JSON.parse(setting.value);
      // Mask secret key for display
      return c.json({
        publicKey: config.publicKey || "",
        secretKey: config.secretKey ? "••••••" + config.secretKey.slice(-4) : "",
        secretHash: config.secretHash || "",
        isEnabled: config.isEnabled !== undefined ? config.isEnabled : true,
      });
    }
  } catch {}
  
  // Fall back to env vars
  return c.json({
    publicKey: process.env.FLW_PUBLIC_KEY || "",
    secretKey: process.env.FLW_SECRET_KEY ? "••••••" + process.env.FLW_SECRET_KEY.slice(-4) : "",
    secretHash: process.env.FLW_SECRET_HASH || "",
    isEnabled: !!(process.env.FLW_PUBLIC_KEY),
  });
});

// ─── Initiate Payment ──────────────────────────────────
app.post("/initiate", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const db = getDb();
  const now = Date.now();

  // Validate and apply coupon if provided
  let finalAmount = body.amount;
  let couponId: number | null = null;
  let discount = 0;

  if (body.couponCode) {
    const coupon = db.select().from(coupons).where(eq(coupons.code, body.couponCode.trim().toUpperCase())).get();
    if (coupon) {
      // Re-validate coupon (double-check)
      let valid = true;
      if (coupon.expiresAt && coupon.expiresAt < now) valid = false;
      if (coupon.maxUses) {
        const totalRedemptions = db.select({ count: sql<number>`count(*)` }).from(couponRedemptions).where(eq(couponRedemptions.couponId, coupon.id)).get();
        if (totalRedemptions && totalRedemptions.count >= coupon.maxUses) valid = false;
      }
      if (coupon.maxUsesPerUser) {
        const userRedemptions = db.select({ count: sql<number>`count(*)` }).from(couponRedemptions).where(and(eq(couponRedemptions.couponId, coupon.id), eq(couponRedemptions.userId, userId))).get();
        if (userRedemptions && userRedemptions.count >= coupon.maxUsesPerUser) valid = false;
      }

      if (valid) {
        const originalAmount = body.originalAmount || body.amount;
        if (coupon.discountType === "percentage") {
          discount = Math.round(originalAmount * (coupon.discountValue / 100));
        } else {
          discount = Math.min(coupon.discountValue, originalAmount);
        }
        finalAmount = Math.max(originalAmount - discount, 0);
        couponId = coupon.id;
      }
    }
  }

  // Generate unique reference
  const reference = `AFC-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  // Create payment record
  const metadata: Record<string, unknown> = {};
  if (body.couponCode) metadata.couponCode = body.couponCode;
  if (couponId) metadata.couponId = couponId;
  if (discount > 0) metadata.discount = discount;
  if (finalAmount !== (body.originalAmount || body.amount)) metadata.originalAmount = body.originalAmount || body.amount;

  const payment = db.insert(payments).values({
    userId,
    amount: finalAmount,
    currency: body.currency || "NGN",
    provider: "flutterwave",
    status: "pending",
    reference,
    description: body.description || "Challenge Purchase",
    templateId: body.templateId ? parseInt(body.templateId) : null,
    accountSizeId: body.accountSizeId ? parseInt(body.accountSizeId) : null,
    metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
    createdAt: now,
  }).returning().get();

  // Record coupon redemption now (will be confirmed on payment success)
  if (couponId) {
    try {
      db.insert(couponRedemptions).values({
        couponId,
        userId,
        paymentId: payment.id,
        discountAmount: discount,
        originalAmount: body.originalAmount || body.amount,
        redeemedAt: now,
      }).run();
    } catch {}
  }

  return c.json({ paymentId: payment.id, reference, finalAmount, discount });
});

// ─── Verify Transaction (client-side callback) ─────────
app.post("/verify", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const db = getDb();
  const now = Date.now();

  const { paymentId, transactionId, flwRef } = body;

  // Find the payment record
  const payment = db.select().from(payments).where(eq(payments.id, paymentId)).get();
  if (!payment) return c.json({ error: "Payment not found" }, 404);
  if (payment.userId !== userId) return c.json({ error: "Unauthorized" }, 403);
  if (payment.status === "completed") return c.json({ status: "completed", message: "Already processed" });

  // Verify with Flutterwave API — read secret key from settings first, then env
  let secretKey = process.env.FLW_SECRET_KEY || "";
  try {
    const setting = db.select().from(settings).where(eq(settings.key, "flutterwave_config")).get();
    if (setting) {
      const config = JSON.parse(setting.value);
      if (config.secretKey) secretKey = config.secretKey;
    }
  } catch {}
  let verificationResult: any;

  try {
    const response = await fetch(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    verificationResult = await response.json();
  } catch (err) {
    return c.json({ error: "Failed to verify with Flutterwave" }, 500);
  }

  // Log the verification
  db.insert(paymentLogs).values({
    paymentId: payment.id,
    provider: "flutterwave",
    event: "verification",
    data: JSON.stringify(verificationResult),
    createdAt: now,
  }).run();

  // Check verification result
  if (verificationResult.status === "success" && verificationResult.data?.status === "successful") {
    // Mark payment as completed
    db.update(payments).set({ status: "completed", completedAt: now }).where(eq(payments.id, payment.id)).run();

    // Store Flutterwave transaction
    db.insert(flutterwaveTransactions).values({
      paymentId: payment.id,
      transactionId: String(transactionId),
      flwRef: flwRef || verificationResult.data?.flw_ref || "",
      status: "successful",
      amount: verificationResult.data?.amount || payment.amount,
      currency: verificationResult.data?.currency || payment.currency,
      chargedAmount: verificationResult.data?.charged_amount || payment.amount,
      processorResponse: verificationResult.data?.processor_response || " successful",
      customerEmail: verificationResult.data?.customer?.email || "",
      customerName: verificationResult.data?.customer?.name || "",
      paymentType: verificationResult.data?.payment_type || "card",
      createdAt: now,
      verifiedAt: now,
    }).run();

    // Create challenge if template + account size provided
    if (payment.templateId && payment.accountSizeId) {
      const template = db.select().from(challengeTemplates).where(eq(challengeTemplates.id, payment.templateId)).get();
      const size = db.select().from(accountSizes).where(eq(accountSizes.id, payment.accountSizeId)).get();

      if (template && size) {
        const challenge = db.insert(userChallenges).values({
          userId,
          templateId: payment.templateId,
          accountSizeId: payment.accountSizeId,
          status: "active",
          accountSize: size.size,
          currency: "NGN",
          profitTarget: template.profitTarget,
          dailyDrawdown: template.dailyDrawdown,
          maxDrawdown: template.maxDrawdown,
          maxLeverage: template.maxLeverage,
          minTradingDays: template.minTradingDays,
          maxTradingDays: template.maxTradingDays || null,
          paymentId: payment.id,
          amountPaid: payment.amount,
          startedAt: now,
          expiresAt: now + (template.durationDays || 30) * 86400000,
          createdAt: now,
          updatedAt: now,
        }).returning().get();

        // Create MT5 account for the challenge
        const login = "AFC" + Math.floor(100000 + Math.random() * 900000);
        const mt5Account = db.insert(mt5Accounts).values({
          userId,
          login,
          password: "Afc@" + Math.random().toString(36).substring(2, 10),
          investorPassword: "Afc@" + Math.random().toString(36).substring(2, 10),
          server: "AfriFundedCapital-Demo",
          group: "DEMO\\AFC",
          leverage: template.maxLeverage || 100,
          balance: size.size,
          equity: size.size,
          currency: "NGN",
          createdAt: now,
        }).returning().get();

        // Link MT5 account to challenge
        db.update(userChallenges).set({ mt5AccountId: mt5Account.id, updatedAt: now }).where(eq(userChallenges.id, challenge.id)).run();
      }
    }

    // Notify user of successful payment
    const payer = db.select().from(users).where(eq(users.id, userId)).get();
    const payerName = payer?.name || "Trader";
    notify(db, userId, {
      type: "payment",
      title: "Payment Successful",
      message: `Your payment of ${payment.currency} ${payment.amount.toLocaleString()} has been confirmed. Your challenge is now active.`,
      link: "/dashboard/challenges",
      email: paymentConfirmationEmail(payerName, payment.amount, payment.currency, payment.description || "Challenge Purchase"),
    });

    // ── Notify referrer if this user was referred ────────
    try {
      const referral = db.select().from(referrals).where(eq(referrals.referredId, userId)).get();
      if (referral) {
        const referrerAffiliate = db.select().from(affiliates).where(eq(affiliates.id, referral.affiliateId)).get();
        if (referrerAffiliate) {
          const referrerUser = db.select().from(users).where(eq(users.id, referrerAffiliate.userId)).get();
          if (referrerUser) {
            // Update referral status to converted
            db.update(referrals).set({ status: "converted", convertedAt: now }).where(eq(referrals.id, referral.id)).run();

            // Create commission record (10% of purchase)
            const commissionAmount = payment.amount * 0.10;
            db.insert(commissions).values({
              affiliateId: referrerAffiliate.id,
              userId: referrerAffiliate.userId,
              referralId: referral.id,
              amount: commissionAmount,
              level: 1,
              status: "pending",
              source: "challenge_purchase",
              description: `Commission from ${payerName}'s challenge purchase`,
              createdAt: now,
            }).run();

            // Update affiliate commission totals
            db.update(affiliates).set({
              totalCommissions: referrerAffiliate.totalCommissions + commissionAmount,
              pendingCommissions: referrerAffiliate.pendingCommissions + commissionAmount,
            }).where(eq(affiliates.id, referrerAffiliate.id)).run();

            // Notify referrer (dashboard + email)
            const { referralPurchaseEmail } = await import("../lib/email");
            notify(db, referrerUser.id, {
              type: "referral",
              title: "Referral Commission Earned!",
              message: `${payerName} just purchased a challenge! You earned ${payment.currency} ${commissionAmount.toLocaleString()} commission.`,
              link: "/dashboard/affiliate",
              email: referralPurchaseEmail(
                referrerUser.name || referrerUser.email || "Trader",
                payerName,
                payment.amount,
                payment.currency,
              ),
            });
          }
        }
      }
    } catch (e) {
      console.warn("[Payments] Failed to process referral commission:", e);
    }

    return c.json({ status: "completed", message: "Payment verified and challenge created" });
  }

  // Payment failed verification
  db.update(payments).set({ status: "failed" }).where(eq(payments.id, payment.id)).run();
  return c.json({ status: "failed", message: "Payment verification failed" });
});

// ─── Flutterwave Webhook ───────────────────────────────
app.post("/webhook/flutterwave", async (c) => {
  const body = await c.req.json();
  const db = getDb();
  const now = Date.now();

  // Verify webhook signature (verif-hash) — read from settings first, then env
  let secretHash = process.env.FLW_SECRET_HASH || "";
  try {
    const setting = db.select().from(settings).where(eq(settings.key, "flutterwave_config")).get();
    if (setting) {
      const config = JSON.parse(setting.value);
      if (config.secretHash) secretHash = config.secretHash;
    }
  } catch {}
  const signature = c.req.header("verif-hash") || "";
  if (secretHash && signature !== secretHash) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const event = body?.event;
  const data = body?.data;

  if (!data?.id) return c.json({ status: "ignored" });

  // Find payment by tx_ref
  const payment = db.select().from(payments).where(eq(payments.reference, data.tx_ref)).get();
  if (!payment) return c.json({ status: "ignored" });

  // Log webhook
  db.insert(paymentLogs).values({
    paymentId: payment.id,
    provider: "flutterwave",
    event: event || "webhook",
    data: JSON.stringify(body),
    ipAddress: c.req.header("x-forwarded-for") || "unknown",
    createdAt: now,
  }).run();

  // If already completed, skip
  if (payment.status === "completed") return c.json({ status: "already_processed" });

  if (event === "charge.completed" && data.status === "successful") {
    // Mark payment completed
    db.update(payments).set({ status: "completed", completedAt: now }).where(eq(payments.id, payment.id)).run();

    // Store Flutterwave transaction
    db.insert(flutterwaveTransactions).values({
      paymentId: payment.id,
      transactionId: String(data.id),
      flwRef: data.flw_ref || "",
      status: "successful",
      amount: data.amount || payment.amount,
      currency: data.currency || payment.currency,
      chargedAmount: data.charged_amount || payment.amount,
      processorResponse: data.processor_response || "successful",
      customerEmail: data.customer?.email || "",
      customerName: data.customer?.name || "",
      paymentType: data.payment_type || "card",
      createdAt: now,
      verifiedAt: now,
    }).run();

    // Create challenge if template + account size provided
    if (payment.templateId && payment.accountSizeId) {
      const template = db.select().from(challengeTemplates).where(eq(challengeTemplates.id, payment.templateId)).get();
      const size = db.select().from(accountSizes).where(eq(accountSizes.id, payment.accountSizeId)).get();

      if (template && size) {
        const challenge = db.insert(userChallenges).values({
          userId: payment.userId,
          templateId: payment.templateId,
          accountSizeId: payment.accountSizeId,
          status: "active",
          accountSize: size.size,
          currency: "NGN",
          profitTarget: template.profitTarget,
          dailyDrawdown: template.dailyDrawdown,
          maxDrawdown: template.maxDrawdown,
          maxLeverage: template.maxLeverage,
          minTradingDays: template.minTradingDays,
          maxTradingDays: template.maxTradingDays || null,
          paymentId: payment.id,
          amountPaid: payment.amount,
          startedAt: now,
          expiresAt: now + (template.durationDays || 30) * 86400000,
          createdAt: now,
          updatedAt: now,
        }).returning().get();

        const login = "AFC" + Math.floor(100000 + Math.random() * 900000);
        const mt5Account = db.insert(mt5Accounts).values({
          userId: payment.userId,
          login,
          password: "Afc@" + Math.random().toString(36).substring(2, 10),
          investorPassword: "Afc@" + Math.random().toString(36).substring(2, 10),
          server: "AfriFundedCapital-Demo",
          group: "DEMO\\AFC",
          leverage: template.maxLeverage || 100,
          balance: size.size,
          equity: size.size,
          currency: "NGN",
          createdAt: now,
        }).returning().get();

        db.update(userChallenges).set({ mt5AccountId: mt5Account.id, updatedAt: now }).where(eq(userChallenges.id, challenge.id)).run();

        // Notify user of successful payment via webhook
        const webhookPayer = db.select().from(users).where(eq(users.id, payment.userId)).get();
        const webhookPayerName = webhookPayer?.name || "Trader";
        notify(db, payment.userId, {
          type: "payment",
          title: "Payment Successful",
          message: `Your payment of ${payment.currency} ${payment.amount.toLocaleString()} has been confirmed. Your challenge is now active.`,
          link: "/dashboard/challenges",
          email: paymentConfirmationEmail(webhookPayerName, payment.amount, payment.currency, payment.description || "Challenge Purchase"),
        });

        // ── Notify referrer if this user was referred ────────
        try {
          const webhookReferral = db.select().from(referrals).where(eq(referrals.referredId, payment.userId)).get();
          if (webhookReferral) {
            const webhookReferrerAffiliate = db.select().from(affiliates).where(eq(affiliates.id, webhookReferral.affiliateId)).get();
            if (webhookReferrerAffiliate) {
              const webhookReferrerUser = db.select().from(users).where(eq(users.id, webhookReferrerAffiliate.userId)).get();
              if (webhookReferrerUser) {
                // Update referral status to converted
                db.update(referrals).set({ status: "converted", convertedAt: now }).where(eq(referrals.id, webhookReferral.id)).run();

                // Create commission record (10% of purchase)
                const webhookCommissionAmount = payment.amount * 0.10;
                db.insert(commissions).values({
                  affiliateId: webhookReferrerAffiliate.id,
                  userId: webhookReferrerAffiliate.userId,
                  referralId: webhookReferral.id,
                  amount: webhookCommissionAmount,
                  level: 1,
                  status: "pending",
                  source: "challenge_purchase",
                  description: `Commission from ${webhookPayerName}'s challenge purchase`,
                  createdAt: now,
                }).run();

                // Update affiliate commission totals
                db.update(affiliates).set({
                  totalCommissions: webhookReferrerAffiliate.totalCommissions + webhookCommissionAmount,
                  pendingCommissions: webhookReferrerAffiliate.pendingCommissions + webhookCommissionAmount,
                }).where(eq(affiliates.id, webhookReferrerAffiliate.id)).run();

                // Notify referrer (dashboard + email)
                const { referralPurchaseEmail } = await import("../lib/email");
                notify(db, webhookReferrerUser.id, {
                  type: "referral",
                  title: "Referral Commission Earned!",
                  message: `${webhookPayerName} just purchased a challenge! You earned ${payment.currency} ${webhookCommissionAmount.toLocaleString()} commission.`,
                  link: "/dashboard/affiliate",
                  email: referralPurchaseEmail(
                    webhookReferrerUser.name || webhookReferrerUser.email || "Trader",
                    webhookPayerName,
                    payment.amount,
                    payment.currency,
                  ),
                });
              }
            }
          }
        } catch (e) {
          console.warn("[Payments] Failed to process referral commission (webhook):", e);
        }
      }
    }
  }

  return c.json({ status: "ok" });
});

// ─── Existing routes ───────────────────────────────────

// Get my payments
app.get("/my", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();

  const qPage = Number(c.req.query("page") || 1);
  const qPageSize = Number(c.req.query("pageSize") || 10);
  const page = Math.max(1, qPage);
  const pageSize = Math.min(50, Math.max(1, qPageSize));

  const whereClause: SQL = eq(payments.userId, userId);

  // Total matching count
  const totalRow = db.select({ count: count() }).from(payments).where(whereClause).get();
  const total = totalRow?.count || 0;

  // Page of payments
  const items = db
    .select()
    .from(payments)
    .where(whereClause)
    .orderBy(desc(payments.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  // User-wide stats (unfiltered)
  const all = db.select({ status: payments.status }).from(payments).where(whereClause).all();
  const byStatus = all.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});

  return c.json({
    payments: items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats: { total: all.length, byStatus },
  });
});

// Admin: List all payments (paginated + searchable)
app.get("/admin/all", requireAuth, requireAdmin, (c) => {
  const db = getDb();

  // Pagination params (clamped)
  const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") || "20") || 20));

  // Filters
  const search = (c.req.query("search") || "").trim();
  const status = c.req.query("status") || "";
  const provider = c.req.query("provider") || "";

  const conditions: SQL[] = [];
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        like(payments.reference, pattern),
        like(payments.description, pattern),
        like(payments.provider, pattern),
        like(users.name, pattern),
        like(users.email, pattern),
        sql`cast(${payments.amount} as text) like ${pattern}`,
        sql`cast(${payments.userId} as text) like ${pattern}`,
      )!,
    );
  }
  if (status && status !== "all") conditions.push(eq(payments.status, status));
  if (provider && provider !== "all") conditions.push(eq(payments.provider, provider));
  const whereClause: SQL = conditions.length > 0 ? and(...conditions)! : sql`1 = 1`;

  // Total matching count
  const totalRow = db
    .select({ count: count() })
    .from(payments)
    .leftJoin(users, eq(users.id, payments.userId))
    .where(whereClause)
    .get();
  const total = totalRow?.count || 0;

  // Page of payments with user info joined
  const rows = db
    .select({ payment: payments, userName: users.name, userEmail: users.email })
    .from(payments)
    .leftJoin(users, eq(users.id, payments.userId))
    .where(whereClause)
    .orderBy(desc(payments.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  const items = rows.map((r) => ({
    ...r.payment,
    userName: r.userName || null,
    userEmail: r.userEmail || null,
  }));

  // Platform-wide stats (unfiltered) so the stat cards stay accurate when filtered/paginated
  const all = db.select({ count: count() }).from(payments).get();
  const completed = db.select({ count: count() }).from(payments).where(eq(payments.status, "completed")).get();
  const pending = db.select({ count: count() }).from(payments).where(eq(payments.status, "pending")).get();
  const failed = db.select({ count: count() }).from(payments).where(eq(payments.status, "failed")).get();
  const refunded = db.select({ count: count() }).from(payments).where(eq(payments.status, "refunded")).get();
  const revenue = db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(payments).where(eq(payments.status, "completed")).get();

  return c.json({
    payments: items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats: {
      total: all?.count || 0,
      completed: completed?.count || 0,
      pending: pending?.count || 0,
      failed: failed?.count || 0,
      refunded: refunded?.count || 0,
      revenue: revenue?.total || 0,
    },
  });
});

// Admin: Payment stats
app.get("/admin/stats", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const total = db.select({ count: count() }).from(payments).get();
  const completed = db.select({ count: count() }).from(payments).where(eq(payments.status, "completed")).get();
  const pending = db.select({ count: count() }).from(payments).where(eq(payments.status, "pending")).get();
  const failed = db.select({ count: count() }).from(payments).where(eq(payments.status, "failed")).get();
  const refunded = db.select({ count: count() }).from(payments).where(eq(payments.status, "refunded")).get();
  const revenue = db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(payments).where(eq(payments.status, "completed")).get();
  return c.json({
    total: total?.count || 0,
    completed: completed?.count || 0,
    pending: pending?.count || 0,
    failed: failed?.count || 0,
    refunded: refunded?.count || 0,
    revenue: revenue?.total || 0,
  });
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
