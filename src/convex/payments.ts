import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { requireAuth, requireRole } from "./users";
import { ROLES, PAYMENT_STATUS } from "./schema";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

// ═══════════════════════════════════════════════
//  QUERIES
// ═══════════════════════════════════════════════

export const getMyPayments = query({
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const payments = await ctx.db
      .query("payments")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    return payments;
  },
});

export const getPaymentById = query({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || (payment.userId !== userId)) {
      // Check admin
      const user = await ctx.db.get(userId);
      if (!user?.role || user.role === ROLES.USER) throw new Error("Not found");
    }
    return payment;
  },
});

export const listAllPayments = query({
  args: {
    status: v.optional(v.string()),
    provider: v.optional(v.string()),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.FINANCE_ADMIN]);

    let payments = await ctx.db.query("payments").order("desc").collect();
    if (args.status) payments = payments.filter((p) => p.status === args.status);
    if (args.provider) payments = payments.filter((p) => p.provider === args.provider);

    const enriched = await Promise.all(
      payments.slice(0, args.limit || 50).map(async (p) => {
        const user = await ctx.db.get(p.userId);
        return { ...p, userName: user?.name, userEmail: user?.email };
      }),
    );

    return enriched;
  },
});

export const getPaymentStats = query({
  handler: async (ctx) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.FINANCE_ADMIN]);
    const payments = await ctx.db.query("payments").collect();

    return {
      total: payments.length,
      completed: payments.filter((p) => p.status === PAYMENT_STATUS.COMPLETED).length,
      pending: payments.filter((p) => p.status === PAYMENT_STATUS.PENDING).length,
      failed: payments.filter((p) => p.status === PAYMENT_STATUS.FAILED).length,
      refunded: payments.filter((p) => p.status === PAYMENT_STATUS.REFUNDED).length,
      totalRevenue: payments
        .filter((p) => p.status === PAYMENT_STATUS.COMPLETED)
        .reduce((sum, p) => sum + p.amount, 0),
    };
  },
});

export const getRevenueGrowth = query({
  handler: async (ctx) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.FINANCE_ADMIN]);
    const payments = await ctx.db.query("payments").collect();
    const completed = payments.filter((p) => p.status === PAYMENT_STATUS.COMPLETED);

    // Group by month (last 6 months)
    const months: Record<string, number> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months[key] = 0;
    }

    for (const p of completed) {
      const d = new Date(p.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (months[key] !== undefined) {
        months[key] += p.amount;
      }
    }

    return Object.entries(months).map(([month, revenue]) => ({
      month,
      revenue,
    }));
  },
});

// ═══════════════════════════════════════════════
//  MUTATIONS
// ═══════════════════════════════════════════════

export const initiatePayment = mutation({
  args: {
    amount: v.number(),
    currency: v.optional(v.string()),
    provider: v.string(),
    templateId: v.optional(v.id("challengeTemplates")),
    accountSizeId: v.optional(v.id("accountSizes")),
    couponCode: v.optional(v.string()),
    description: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    // Generate reference
    const ref = `AFC-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const currency = args.currency || "NGN";

    // Calculate final amount with coupon if provided
    let finalAmount = args.amount;
    let discountAmount = 0;
    let couponId: Id<"coupons"> | undefined;

    if (args.couponCode) {
      const coupon = await ctx.db
        .query("coupons")
        .withIndex("code", (q) => q.eq("code", args.couponCode!))
        .first();

      if (coupon && coupon.isActive) {
        // Check expiry
        if (coupon.expiresAt && coupon.expiresAt < Date.now()) {
          throw new Error("Coupon has expired");
        }
        // Check usage
        if (coupon.maxUses && coupon.currentUses >= coupon.maxUses) {
          throw new Error("Coupon usage limit reached");
        }

        if (coupon.discountType === "fixed") {
          discountAmount = Math.min(coupon.discountValue, finalAmount);
        } else {
          discountAmount = Math.round(finalAmount * (coupon.discountValue / 100));
        }
        finalAmount -= discountAmount;
        couponId = coupon._id;
      }
    }

    // Create payment record
    const paymentId = await ctx.db.insert("payments", {
      userId,
      amount: finalAmount,
      currency,
      provider: args.provider as any,
      status: PAYMENT_STATUS.PENDING,
      reference: ref,
      description: args.description,
      templateId: args.templateId,
      accountSizeId: args.accountSizeId,
      metadata: {
        ...args.metadata,
        originalAmount: args.amount,
        discountAmount,
        couponId,
      },
      createdAt: Date.now(),
    });

    // Log coupon redemption
    if (couponId) {
      await ctx.db.insert("couponRedemptions", {
        couponId,
        userId,
        paymentId,
        discountAmount,
        originalAmount: args.amount,
        redeemedAt: Date.now(),
      });

      const couponDoc = await ctx.db.get(couponId);
      if (couponDoc) {
        await ctx.db.patch(couponId, {
          currentUses: (couponDoc.currentUses || 0) + 1,
        });
      }
    }

    // Log the payment initiation
    await ctx.db.insert("paymentLogs", {
      paymentId,
      provider: args.provider as any,
      event: "payment_initiated",
      data: { amount: args.amount, currency, reference: ref },
      createdAt: Date.now(),
    });

    return { paymentId, reference: ref, amount: finalAmount };
  },
});

export const completePayment = mutation({
  args: {
    paymentId: v.id("payments"),
    providerTransactionId: v.optional(v.string()),
    providerData: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN]);

    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Payment not found");
    if (payment.status !== PAYMENT_STATUS.PENDING) throw new Error("Invalid payment state");

    await ctx.db.patch(args.paymentId, {
      status: PAYMENT_STATUS.COMPLETED,
      completedAt: Date.now(),
    });

    // Notify user
    await ctx.db.insert("notifications", {
      userId: payment.userId,
      type: "payment_received",
      title: "Payment Received",
      message: `Payment of ${payment.currency} ${payment.amount} received successfully.`,
      read: false,
      link: `/dashboard/payments/${args.paymentId}`,
      createdAt: Date.now(),
    });

    await ctx.db.insert("paymentLogs", {
      paymentId: args.paymentId,
      provider: payment.provider,
      event: "payment_completed",
      data: args.providerData || {},
      createdAt: Date.now(),
    });
  },
});

export const failPayment = mutation({
  args: {
    paymentId: v.id("payments"),
    reason: v.optional(v.string()),
    providerData: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Payment not found");

    await ctx.db.patch(args.paymentId, {
      status: PAYMENT_STATUS.FAILED,
    });

    await ctx.db.insert("notifications", {
      userId: payment.userId,
      type: "payment_failed",
      title: "Payment Failed",
      message: args.reason || "Your payment could not be processed.",
      read: false,
      link: `/dashboard/payments/${args.paymentId}`,
      createdAt: Date.now(),
    });

    await ctx.db.insert("paymentLogs", {
      paymentId: args.paymentId,
      provider: payment.provider,
      event: "payment_failed",
      data: { reason: args.reason, ...(args.providerData || {}) },
      createdAt: Date.now(),
    });
  },
});

export const refundPayment = mutation({
  args: {
    paymentId: v.id("payments"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.FINANCE_ADMIN]);

    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Payment not found");
    if (payment.status !== PAYMENT_STATUS.COMPLETED) throw new Error("Can only refund completed payments");

    await ctx.db.patch(args.paymentId, {
      status: PAYMENT_STATUS.REFUNDED,
    });

    // Add funds to user wallet
    let wallet = await ctx.db
      .query("wallets")
      .withIndex("userId", (q) => q.eq("userId", payment.userId))
      .first();

    if (wallet) {
      await ctx.db.patch(wallet._id, {
        balance: wallet.balance + payment.amount,
        updatedAt: Date.now(),
      });

      await ctx.db.insert("walletTransactions", {
        walletId: wallet._id,
        userId: payment.userId,
        type: "refund",
        amount: payment.amount,
        balanceBefore: wallet.balance,
        balanceAfter: wallet.balance + payment.amount,
        description: args.reason || `Refund for payment ${payment.reference}`,
        paymentId: args.paymentId,
        createdAt: Date.now(),
      });
    }

    await ctx.db.insert("notifications", {
      userId: payment.userId,
      type: "payment_failed",
      title: "Payment Refunded",
      message: `Your payment of ${payment.amount} has been refunded.`,
      read: false,
      createdAt: Date.now(),
    });
  },
});

// ═══════════════════════════════════════════════
//  WEBHOOK HANDLER — Flutterwave
// ═══════════════════════════════════════════════

export const handleFlutterwaveWebhook = action({
  args: {
    payload: v.any(),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    const { payload, signature } = args;

    // Verify webhook signature (verif-hash)
    const secretHash = process.env.FLW_SECRET_HASH;
    if (!secretHash || signature !== secretHash) {
      throw new Error("Invalid webhook signature");
    }

    const event = payload.event;
    const data = payload.data;

    // Find payment by reference
    const payment = await ctx.runQuery((internal as any).payments.getPaymentByReference, {
      reference: data.tx_ref,
    });

    if (!payment) {
      console.error("Payment not found for reference:", data.tx_ref);
      return { status: "ignored", reason: "Payment not found" };
    }

    // Record Flutterwave transaction
    if (event === "charge.completed" && data.status === "successful") {
      await ctx.runMutation((internal as any).payments.completePayment, {
        paymentId: payment._id,
        providerTransactionId: data.id?.toString(),
        providerData: data,
      });

      // Record in flutterwave_transactions
      await ctx.runMutation((internal as any).payments.recordFlutterwaveTransaction, {
        paymentId: payment._id,
        transactionId: data.id?.toString(),
        flwRef: data.flw_ref,
        status: data.status,
        amount: data.amount,
        currency: data.currency,
        chargedAmount: data.charged_amount,
        processorResponse: data.processor_response,
        customerEmail: data.customer?.email,
        customerName: data.customer?.name,
        paymentType: data.payment_type,
      });

      // If this payment was for a challenge, create the user challenge
      if (payment.templateId && payment.accountSizeId) {
        await ctx.runMutation((internal as any).challenges.createUserChallenge, {
          templateId: payment.templateId,
          accountSizeId: payment.accountSizeId,
          paymentId: payment._id,
        });
      }
    } else if (event === "charge.failed") {
      await ctx.runMutation((internal as any).payments.failPayment, {
        paymentId: payment._id,
        reason: data.processor_response || "Transaction failed",
        providerData: data,
      });
    }

    return { status: "processed" };
  },
});

export const getPaymentByReference = query({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    const payments = await ctx.db.query("payments").collect();
    return payments.find((p) => p.reference === args.reference);
  },
});

export const recordFlutterwaveTransaction = mutation({
  args: {
    paymentId: v.id("payments"),
    transactionId: v.string(),
    flwRef: v.string(),
    status: v.string(),
    amount: v.number(),
    currency: v.string(),
    chargedAmount: v.number(),
    processorResponse: v.string(),
    customerEmail: v.string(),
    customerName: v.optional(v.string()),
    paymentType: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("flutterwaveTransactions", {
      paymentId: args.paymentId,
      transactionId: args.transactionId,
      flwRef: args.flwRef,
      status: args.status,
      amount: args.amount,
      currency: args.currency,
      chargedAmount: args.chargedAmount,
      processorResponse: args.processorResponse,
      customerEmail: args.customerEmail,
      customerName: args.customerName,
      paymentType: args.paymentType,
      createdAt: Date.now(),
      verifiedAt: Date.now(),
    });
  },
});

// ═══════════════════════════════════════════════
//  WEBHOOK HANDLER — Paystack
// ═══════════════════════════════════════════════

export const handlePaystackWebhook = action({
  args: {
    payload: v.any(),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    const { payload, signature } = args;

    // Verify signature (will be done in HTTP handler via crypto)
    const event = payload.event;
    const data = payload.data;

    const payment = await ctx.runQuery((internal as any).payments.getPaymentByReference, {
      reference: data.reference,
    });

    if (!payment) {
      console.error("Payment not found for reference:", data.reference);
      return { status: "ignored" };
    }

    if (event === "charge.success") {
      await ctx.runMutation((internal as any).payments.completePayment, {
        paymentId: payment._id,
        providerTransactionId: data.id?.toString(),
        providerData: data,
      });

      await ctx.runMutation((internal as any).payments.recordPaystackTransaction, {
        paymentId: payment._id,
        reference: data.reference,
        transactionId: data.id?.toString(),
        status: data.status,
        amount: data.amount / 100, // Paystack returns amount in kobo
        currency: data.currency,
        fees: data.fees ? data.fees / 100 : undefined,
        customerEmail: data.customer?.email,
        authorization: data.authorization,
      });

      if (payment.templateId && payment.accountSizeId) {
        await ctx.runMutation((internal as any).challenges.createUserChallenge, {
          templateId: payment.templateId,
          accountSizeId: payment.accountSizeId,
          paymentId: payment._id,
        });
      }
    } else if (event === "charge.failed") {
      await ctx.runMutation((internal as any).payments.failPayment, {
        paymentId: payment._id,
        reason: data.gateway_response || "Transaction failed",
        providerData: data,
      });
    }

    return { status: "processed" };
  },
});

export const recordPaystackTransaction = mutation({
  args: {
    paymentId: v.id("payments"),
    reference: v.string(),
    transactionId: v.string(),
    status: v.string(),
    amount: v.number(),
    currency: v.string(),
    fees: v.optional(v.number()),
    customerEmail: v.string(),
    authorization: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("paystackTransactions", {
      paymentId: args.paymentId,
      reference: args.reference,
      transactionId: args.transactionId,
      status: args.status,
      amount: args.amount,
      currency: args.currency,
      fees: args.fees,
      customerEmail: args.customerEmail,
      authorization: args.authorization,
      createdAt: Date.now(),
      verifiedAt: Date.now(),
    });
  },
});

// ═══════════════════════════════════════════════
//  FLUTTERWAVE FRONTEND ACTIONS
// ═══════════════════════════════════════════════

/**
 * Returns the Flutterwave public key for frontend checkout initialization.
 * The public key is safe to expose to the client.
 */
export const getFlutterwaveConfig = action({
  args: {},
  handler: async () => {
    return {
      publicKey: process.env.FLW_PUBLIC_KEY || "",
    };
  },
});

/**
 * Verifies a Flutterwave transaction from the frontend callback
 * by calling the Flutterwave verification API with the secret key.
 * If verified, completes the payment and creates the challenge.
 */
export const verifyFlutterwaveTransaction = action({
  args: {
    paymentId: v.id("payments"),
    transactionId: v.string(),
    flwRef: v.string(),
  },
  handler: async (ctx, args) => {
    const secretKey = process.env.FLW_SECRET_KEY;
    if (!secretKey) {
      throw new Error("Flutterwave secret key not configured");
    }

    // Verify the transaction with Flutterwave API
    const verifyUrl = `https://api.flutterwave.com/v3/transactions/${args.transactionId}/verify`;
    const response = await fetch(verifyUrl, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Flutterwave verification failed: ${response.status}`);
    }

    const verification = await response.json();

    if (verification.status !== "success" || verification.data?.status !== "successful") {
      // Payment wasn't successful — mark as failed
      await ctx.runMutation((internal as any).payments.failPayment, {
        paymentId: args.paymentId,
        reason: verification.data?.processor_response || "Verification failed",
        providerData: verification.data,
      });
      throw new Error("Payment verification failed: transaction not successful");
    }

    const data = verification.data;

    // Get payment to check if already completed (idempotency)
    const payment = await ctx.runQuery((internal as any).payments.getPaymentByIdAction, {
      paymentId: args.paymentId,
    });

    if (!payment) {
      throw new Error("Payment not found");
    }

    // If already completed, return early (idempotent)
    if (payment.status === "completed") {
      return { status: "already_completed", message: "Payment was already processed" };
    }

    // Complete the payment
    await ctx.runMutation((internal as any).payments.completePayment, {
      paymentId: args.paymentId,
      providerTransactionId: args.transactionId,
      providerData: data,
    });

    // Record Flutterwave transaction
    await ctx.runMutation((internal as any).payments.recordFlutterwaveTransaction, {
      paymentId: args.paymentId,
      transactionId: args.transactionId,
      flwRef: args.flwRef,
      status: data.status,
      amount: data.amount || 0,
      currency: data.currency || "NGN",
      chargedAmount: data.charged_amount || 0,
      processorResponse: data.processor_response || "",
      customerEmail: data.customer?.email || "",
      customerName: data.customer?.name,
      paymentType: data.payment_type || "card",
    });      // Create user challenge if payment was for a challenge
    if (payment.templateId && payment.accountSizeId) {
      await ctx.runMutation((internal as any).challenges.createUserChallenge, {
        templateId: payment.templateId as any,
        accountSizeId: payment.accountSizeId as any,
        paymentId: args.paymentId,
      });
    }

    // Send payment confirmation email
    try {
      const user = await ctx.runQuery((internal as any).users.getUserById, {
        userId: payment.userId,
      });

      if (user?.email) {
        const template = payment.templateId
          ? await ctx.runQuery((internal as any).challenges.getChallengeTemplate, {
              templateId: payment.templateId,
            })
          : null;

        const accountSize = payment.accountSizeId
          ? await ctx.runQuery((internal as any).challenges.getAccountSize, {
              sizeId: payment.accountSizeId,
            })
          : null;

        await ctx.runAction((internal as any).email.sendPaymentConfirmation, {
          email: user.email,
          name: user.name || "Trader",
          amount: payment.amount,
          currency: payment.currency,
          reference: payment.reference,
          challengeName: template?.name || "Trading",
          accountSize: accountSize?.label || "",
          provider: payment.provider,
        });
      }
    } catch (emailError: any) {
      // Email failure shouldn't block the payment flow
      console.error("Failed to send payment confirmation email:", emailError.message);
    }

    return {
      status: "completed",
      message: "Payment verified and challenge created successfully",
    };
  },
});

export const getPaymentByIdAction = query({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.paymentId);
  },
});
