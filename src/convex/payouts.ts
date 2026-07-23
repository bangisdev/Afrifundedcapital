import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth, requireRole } from "./users";
import { ROLES } from "./schema";

// ═══════════════════════════════════════════════
//  QUERIES
// ═══════════════════════════════════════════════

export const getMyPayouts = query({
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const payouts = await ctx.db
      .query("profitPayouts")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    // Enrich with challenge info
    const enriched = await Promise.all(
      payouts.map(async (p) => {
        const funded = await ctx.db.get(p.fundedAccountId);
        return {
          ...p,
          accountSize: funded?.accountSize,
        };
      }),
    );

    return enriched;
  },
});

export const getMyPayoutStats = query({
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const payouts = await ctx.db
      .query("profitPayouts")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();

    return {
      total: payouts.length,
      pending: payouts.filter((p) => p.status === "pending").length,
      approved: payouts.filter((p) => p.status === "approved").length,
      paid: payouts.filter((p) => p.status === "paid").length,
      rejected: payouts.filter((p) => p.status === "rejected").length,
      totalPaid: payouts
        .filter((p) => p.status === "paid")
        .reduce((sum, p) => sum + p.amount, 0),
      totalPending: payouts
        .filter((p) => p.status === "pending")
        .reduce((sum, p) => sum + p.amount, 0),
    };
  },
});

export const getMyFundedAccounts = query({
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const funded = await ctx.db
      .query("fundedAccounts")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();

    const enriched = await Promise.all(
      funded
        .filter((f) => f.isActive)
        .map(async (f) => {
          const challenge = await ctx.db.get(f.challengeId);
          const metrics = challenge
            ? await ctx.db
                .query("tradingMetrics")
                .withIndex("challengeId", (q) => q.eq("challengeId", challenge._id))
                .order("desc")
                .first()
            : null;

          return {
            ...f,
            templateName: challenge
              ? await ctx.db.get(challenge.templateId).then((t) => t?.name)
              : "",
            currentBalance: metrics?.balance || f.accountSize,
            currentEquity: metrics?.equity || f.accountSize,
            totalProfit: metrics ? metrics.totalProfit : 0,
          };
        }),
    );

    return enriched;
  },
});

export const listAllPayouts = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.FINANCE_ADMIN]);

    let payouts = await ctx.db.query("profitPayouts").order("desc").collect();
    if (args.status) {
      payouts = payouts.filter((p) => p.status === args.status);
    }

    const enriched = await Promise.all(
      payouts.slice(0, args.limit || 50).map(async (p) => {
        const user = await ctx.db.get(p.userId);
        const funded = await ctx.db.get(p.fundedAccountId);
        return {
          ...p,
          userName: user?.name,
          userEmail: user?.email,
          accountSize: funded?.accountSize,
        };
      }),
    );

    return enriched;
  },
});

export const getPayoutStats = query({
  handler: async (ctx) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.FINANCE_ADMIN]);

    const payouts = await ctx.db.query("profitPayouts").collect();

    return {
      total: payouts.length,
      pending: payouts.filter((p) => p.status === "pending").length,
      approved: payouts.filter((p) => p.status === "approved").length,
      paid: payouts.filter((p) => p.status === "paid").length,
      rejected: payouts.filter((p) => p.status === "rejected").length,
      totalPaid: payouts
        .filter((p) => p.status === "paid")
        .reduce((sum, p) => sum + p.amount, 0),
      totalPending: payouts
        .filter((p) => p.status === "pending")
        .reduce((sum, p) => sum + p.amount, 0),
    };
  },
});

// ═══════════════════════════════════════════════
//  MUTATIONS
// ═══════════════════════════════════════════════

export const requestPayout = mutation({
  args: {
    fundedAccountId: v.id("fundedAccounts"),
    amount: v.number(),
    currency: v.optional(v.string()),
    paymentMethod: v.string(),
    paymentDetails: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    // Verify the funded account belongs to this user
    const funded = await ctx.db.get(args.fundedAccountId);
    if (!funded || funded.userId !== userId) {
      throw new Error("Funded account not found");
    }
    if (!funded.isActive) {
      throw new Error("Funded account is not active");
    }

    // Get latest metrics to check available profit
    const metrics = await ctx.db
      .query("tradingMetrics")
      .withIndex("challengeId", (q) => q.eq("challengeId", funded.challengeId))
      .order("desc")
      .first();

    const totalProfit = metrics?.totalProfit || 0;
    const totalPaidPayouts = await ctx.db
      .query("profitPayouts")
      .withIndex("fundedAccountId", (q) => q.eq("fundedAccountId", args.fundedAccountId))
      .filter((q) => q.eq(q.field("status"), "paid"))
      .collect();

    const alreadyPaid = totalPaidPayouts.reduce((s, p) => s + p.amount, 0);
    const availableProfit = totalProfit - alreadyPaid;

    // Calculate profit share (default 90% to trader)
    const profitSharePercent = funded.profitSharePercent || 90;
    const maxPayout = Math.max(0, availableProfit * (profitSharePercent / 100));

    if (args.amount <= 0) {
      throw new Error("Amount must be greater than zero");
    }
    if (args.amount > maxPayout) {
      throw new Error(
        `Maximum available payout is ${funded.currency} ${maxPayout.toFixed(2)}`,
      );
    }

    // Check minimum payout (e.g., $50 or equivalent)
    if (args.amount < 50) {
      throw new Error("Minimum payout amount is 50");
    }

    const payoutId = await ctx.db.insert("profitPayouts", {
      userId,
      fundedAccountId: args.fundedAccountId,
      challengeId: funded.challengeId,
      amount: args.amount,
      currency: args.currency || funded.currency || "USD",
      status: "pending",
      paymentMethod: args.paymentMethod,
      paymentDetails: args.paymentDetails,
      requestedAt: Date.now(),
    });

    // Notify user
    await ctx.db.insert("notifications", {
      userId,
      type: "payout_processed",
      title: "Payout Requested",
      message: `Your payout request of ${args.currency || "USD"} ${args.amount} has been submitted for review.`,
      read: false,
      link: "/dashboard/payouts",
      createdAt: Date.now(),
    });

    // Audit log
    await ctx.db.insert("auditLogs", {
      userId,
      action: "payout_requested",
      entity: "profitPayouts",
      entityId: payoutId,
      details: `Amount: ${args.amount} ${args.currency || "USD"}`,
      timestamp: Date.now(),
    });

    return payoutId;
  },
});

export const processPayout = mutation({
  args: {
    payoutId: v.id("profitPayouts"),
    status: v.union(
      v.literal("approved"),
      v.literal("paid"),
      v.literal("rejected"),
    ),
    processedBy: v.id("users"),
    notes: v.optional(v.string()),
    rejectionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.FINANCE_ADMIN]);

    const payout = await ctx.db.get(args.payoutId);
    if (!payout) throw new Error("Payout not found");
    if (payout.status !== "pending" && payout.status !== "approved") {
      throw new Error("Payout already processed");
    }

    const updates: Record<string, any> = {
      status: args.status,
      processedBy: args.processedBy,
      processedAt: Date.now(),
    };
    if (args.notes !== undefined) updates.notes = args.notes;
    if (args.rejectionReason !== undefined) updates.rejectionReason = args.rejectionReason;

    await ctx.db.patch(args.payoutId, updates);

    // Update funded account totals
    if (args.status === "paid") {
      const funded = await ctx.db.get(payout.fundedAccountId);
      if (funded) {
        await ctx.db.patch(payout.fundedAccountId, {
          totalPayouts: (funded.totalPayouts || 0) + payout.amount,
          lastPayoutAt: Date.now(),
        });
      }

      // Notify user
      await ctx.db.insert("notifications", {
        userId: payout.userId,
        type: "payout_processed",
        title: "Payout Paid",
        message: `Your payout of ${payout.currency} ${payout.amount} has been paid out.`,
        read: false,
        link: "/dashboard/payouts",
        createdAt: Date.now(),
      });
    } else if (args.status === "approved") {
      await ctx.db.insert("notifications", {
        userId: payout.userId,
        type: "payout_processed",
        title: "Payout Approved",
        message: `Your payout of ${payout.currency} ${payout.amount} has been approved and is being processed.`,
        read: false,
        link: "/dashboard/payouts",
        createdAt: Date.now(),
      });
    } else if (args.status === "rejected") {
      await ctx.db.insert("notifications", {
        userId: payout.userId,
        type: "payout_processed",
        title: "Payout Rejected",
        message: args.rejectionReason
          ? `Your payout request was rejected: ${args.rejectionReason}`
          : "Your payout request was rejected.",
        read: false,
        link: "/dashboard/payouts",
        createdAt: Date.now(),
      });
    }

    // Audit log
    await ctx.db.insert("auditLogs", {
      userId: payout.userId,
      action: `payout_${args.status}`,
      entity: "profitPayouts",
      entityId: args.payoutId,
      details: `Status: ${args.status}, Amount: ${payout.amount}`,
      timestamp: Date.now(),
    });
  },
});
