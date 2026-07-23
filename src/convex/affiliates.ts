import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth, requireRole } from "./users";
import { ROLES } from "./schema";

// ═══════════════════════════════════════════════
//  QUERIES
// ═══════════════════════════════════════════════

export const getMyAffiliate = query({
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const affiliate = await ctx.db
      .query("affiliates")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();

    if (!affiliate) return null;

    // Get referrals
    const referrals = await ctx.db
      .query("referrals")
      .withIndex("referrerId", (q) => q.eq("referrerId", userId))
      .collect();

    // Get commissions
    const commissions = await ctx.db
      .query("commissions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    return {
      ...affiliate,
      referrals: referrals.length,
      activeReferralsCount: referrals.filter((r) => r.status === "active" || r.status === "converted").length,
      recentCommissions: commissions.slice(0, 10),
    };
  },
});

export const listAffiliates = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.AFFILIATE_MANAGER, ROLES.MARKETING_ADMIN]);

    const affiliates = await ctx.db.query("affiliates").collect();
    const enriched = await Promise.all(
      affiliates.slice(0, args.limit || 50).map(async (a) => {
        const user = await ctx.db.get(a.userId);
        return { ...a, userName: user?.name, userEmail: user?.email };
      }),
    );

    return enriched;
  },
});

export const getAffiliateStats = query({
  handler: async (ctx) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.AFFILIATE_MANAGER]);

    const affiliates = await ctx.db.query("affiliates").collect();
    const commissions = await ctx.db.query("commissions").collect();
    const referrals = await ctx.db.query("referrals").collect();

    return {
      totalAffiliates: affiliates.length,
      activeAffiliates: affiliates.filter((a) => a.isActive).length,
      totalReferrals: referrals.length,
      activeReferrals: referrals.filter((r) => r.status === "active" || r.status === "converted").length,
      totalCommissions: commissions.reduce((s, c) => s + c.amount, 0),
      pendingCommissions: commissions.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0),
      paidCommissions: commissions.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0),
    };
  },
});

// ═══════════════════════════════════════════════
//  MUTATIONS
// ═══════════════════════════════════════════════

export const ensureAffiliate = mutation({
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const existing = await ctx.db
      .query("affiliates")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();

    if (existing) return existing._id;

    const user = await ctx.db.get(userId);
    const code = user?.referralCode || `AFC${userId.slice(0, 6).toUpperCase()}`;

    const id = await ctx.db.insert("affiliates", {
      userId,
      referralCode: code,
      totalReferrals: 0,
      activeReferrals: 0,
      totalCommissions: 0,
      pendingCommissions: 0,
      paidCommissions: 0,
      commissionRate: 10,
      commissionLevels: 1,
      isActive: true,
      joinedAt: Date.now(),
    });

    return id;
  },
});

export const trackReferral = mutation({
  args: {
    referredUserId: v.id("users"),
    referralCode: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the referrer by code
    const referrer = await ctx.db
      .query("users")
      .withIndex("referralCode", (q) => q.eq("referralCode", args.referralCode))
      .first();

    if (!referrer || referrer._id === args.referredUserId) return;

    // Find or create affiliate
    let affiliate = await ctx.db
      .query("affiliates")
      .withIndex("userId", (q) => q.eq("userId", referrer._id))
      .first();

    if (!affiliate) {
      const affId = await ctx.db.insert("affiliates", {
        userId: referrer._id,
        referralCode: args.referralCode,
        totalReferrals: 0,
        activeReferrals: 0,
        totalCommissions: 0,
        pendingCommissions: 0,
        paidCommissions: 0,
        commissionRate: 10,
        commissionLevels: 1,
        isActive: true,
        joinedAt: Date.now(),
      });
      affiliate = await ctx.db.get(affId);
    }

    if (!affiliate) return;

    // Check if already referred
    const existing = await ctx.db
      .query("referrals")
      .withIndex("referredId", (q) => q.eq("referredId", args.referredUserId))
      .first();

    if (existing) return;

    // Create referral
    await ctx.db.insert("referrals", {
      referrerId: referrer._id,
      referredId: args.referredUserId,
      affiliateId: affiliate._id,
      status: "pending",
      createdAt: Date.now(),
    });

    // Update affiliate counts
    await ctx.db.patch(affiliate._id, {
      totalReferrals: affiliate.totalReferrals + 1,
    });

    // Update referred user
    await ctx.db.patch(args.referredUserId, {
      referredBy: referrer._id,
    });
  },
});

export const createCommission = mutation({
  args: {
    affiliateId: v.id("affiliates"),
    userId: v.id("users"),
    referralId: v.id("referrals"),
    amount: v.number(),
    level: v.optional(v.number()),
    source: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.AFFILIATE_MANAGER]);

    const commissionId = await ctx.db.insert("commissions", {
      affiliateId: args.affiliateId,
      userId: args.userId,
      referralId: args.referralId,
      amount: args.amount,
      level: args.level || 1,
      status: "pending",
      source: args.source,
      description: args.description,
      createdAt: Date.now(),
    });

    // Update affiliate pending commissions
    const affiliate = await ctx.db.get(args.affiliateId);
    if (affiliate) {
      await ctx.db.patch(args.affiliateId, {
        pendingCommissions: affiliate.pendingCommissions + args.amount,
        totalCommissions: affiliate.totalCommissions + args.amount,
      });
    }

    // Notify user
    await ctx.db.insert("notifications", {
      userId: args.userId,
      type: "referral_commission",
      title: "Commission Earned!",
      message: `You earned ${args.amount} commission from a referral.`,
      read: false,
      link: "/dashboard/affiliate",
      createdAt: Date.now(),
    });

    return commissionId;
  },
});

export const approveCommission = mutation({
  args: {
    commissionId: v.id("commissions"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.AFFILIATE_MANAGER]);

    const commission = await ctx.db.get(args.commissionId);
    if (!commission) throw new Error("Commission not found");

    await ctx.db.patch(args.commissionId, { status: "approved" });

    // Update affiliate balances
    const affiliate = await ctx.db.get(commission.affiliateId);
    if (affiliate) {
      await ctx.db.patch(commission.affiliateId, {
        pendingCommissions: Math.max(0, affiliate.pendingCommissions - commission.amount),
        paidCommissions: affiliate.paidCommissions + commission.amount,
      });
    }

    // Credit wallet
    let wallet = await ctx.db
      .query("wallets")
      .withIndex("userId", (q) => q.eq("userId", commission.userId))
      .first();

    if (wallet) {
      const balanceBefore = wallet.balance;
      await ctx.db.patch(wallet._id, {
        balance: wallet.balance + commission.amount,
        referralBalance: wallet.referralBalance + commission.amount,
        updatedAt: Date.now(),
      });

      await ctx.db.insert("walletTransactions", {
        walletId: wallet._id,
        userId: commission.userId,
        type: "referral_bonus",
        amount: commission.amount,
        balanceBefore,
        balanceAfter: balanceBefore + commission.amount,
        description: `Commission approved: ${commission.description}`,
        createdAt: Date.now(),
      });
    }
  },
});

export const convertReferral = mutation({
  args: {
    referralId: v.id("referrals"),
    purchaseAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const { purchaseAmount } = args;
    const referral = await ctx.db.get(args.referralId);
    if (!referral) throw new Error("Referral not found");

    const affiliate = await ctx.db.get(referral.affiliateId);
    if (!affiliate) throw new Error("Affiliate not found");

    // Calculate commission (default 10%)
    const commissionAmount = Math.round(purchaseAmount * (affiliate.commissionRate / 100));

    // Update referral
    await ctx.db.patch(args.referralId, {
      status: "converted",
      commissionEarned: commissionAmount,
      convertedAt: Date.now(),
    });

    // Update affiliate
    await ctx.db.patch(referral.affiliateId, {
      activeReferrals: affiliate.activeReferrals + 1,
    });

    // Create commission record
    await ctx.db.insert("commissions", {
      affiliateId: referral.affiliateId,
      userId: referral.referrerId,
      referralId: args.referralId,
      amount: commissionAmount,
      level: 1,
      status: "approved",
      source: "challenge_purchase",
      description: `Commission from referral purchase of ${purchaseAmount}`,
      createdAt: Date.now(),
    });

    // Credit wallet
    let wallet = await ctx.db
      .query("wallets")
      .withIndex("userId", (q) => q.eq("userId", referral.referrerId))
      .first();

    if (wallet) {
      const balanceBefore = wallet.balance;
      await ctx.db.patch(wallet._id, {
        balance: wallet.balance + commissionAmount,
        referralBalance: wallet.referralBalance + commissionAmount,
        updatedAt: Date.now(),
      });

      await ctx.db.insert("walletTransactions", {
        walletId: wallet._id,
        userId: referral.referrerId,
        type: "referral_bonus",
        amount: commissionAmount,
        balanceBefore,
        balanceAfter: balanceBefore + commissionAmount,
        description: `Commission from referral purchase`,
        createdAt: Date.now(),
      });
    }
  },
});
