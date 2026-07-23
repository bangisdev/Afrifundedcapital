import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth, requireRole } from "./users";
import { ROLES } from "./schema";

// ═══════════════════════════════════════════════
//  QUERIES
// ═══════════════════════════════════════════════

export const listCoupons = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.MARKETING_ADMIN as string]);

    let coupons = await ctx.db.query("coupons").collect();
    if (!args.includeInactive) {
      coupons = coupons.filter((c) => c.isActive);
    }
    return coupons.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getCouponByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const coupon = await ctx.db
      .query("coupons")
      .withIndex("code", (q) => q.eq("code", args.code.toUpperCase()))
      .first();

    if (!coupon) return null;
    if (!coupon.isActive) return null;
    if (coupon.expiresAt && coupon.expiresAt < Date.now()) return null;
    if (coupon.maxUses && coupon.currentUses >= coupon.maxUses) return null;

    return coupon;
  },
});

export const getCouponStats = query({
  handler: async (ctx) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.MARKETING_ADMIN as string]);

    const coupons = await ctx.db.query("coupons").collect();
    const redemptions = await ctx.db.query("couponRedemptions").collect();

    return {
      totalCoupons: coupons.length,
      activeCoupons: coupons.filter((c) => c.isActive).length,
      totalRedemptions: redemptions.length,
      totalDiscount: redemptions.reduce((s, r) => s + r.discountAmount, 0),
    };
  },
});

// ═══════════════════════════════════════════════
//  MUTATIONS
// ═══════════════════════════════════════════════

export const createCoupon = mutation({
  args: {
    code: v.string(),
    discountType: v.union(v.literal("fixed"), v.literal("percentage")),
    discountValue: v.number(),
    minPurchaseAmount: v.optional(v.number()),
    maxUses: v.optional(v.number()),
    maxUsesPerUser: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    description: v.optional(v.string()),
    templateIds: v.optional(v.array(v.id("challengeTemplates"))),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.MARKETING_ADMIN as string]);

    // Check for duplicate code
    const existing = await ctx.db
      .query("coupons")
      .withIndex("code", (q) => q.eq("code", args.code.toUpperCase()))
      .first();

    if (existing) throw new Error("Coupon code already exists");

    await ctx.db.insert("coupons", {
      code: args.code.toUpperCase(),
      discountType: args.discountType,
      discountValue: args.discountValue,
      minPurchaseAmount: args.minPurchaseAmount,
      maxUses: args.maxUses,
      maxUsesPerUser: args.maxUsesPerUser,
      currentUses: 0,
      isActive: true,
      expiresAt: args.expiresAt,
      description: args.description,
      templateIds: args.templateIds,
      createdBy: userId,
      createdAt: Date.now(),
    });
  },
});

export const updateCoupon = mutation({
  args: {
    couponId: v.id("coupons"),
    discountType: v.optional(v.union(v.literal("fixed"), v.literal("percentage"))),
    discountValue: v.optional(v.number()),
    minPurchaseAmount: v.optional(v.number()),
    maxUses: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    expiresAt: v.optional(v.number()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.MARKETING_ADMIN as string]);

    const updates: Record<string, any> = {};
    if (args.discountType !== undefined) updates.discountType = args.discountType;
    if (args.discountValue !== undefined) updates.discountValue = args.discountValue;
    if (args.minPurchaseAmount !== undefined) updates.minPurchaseAmount = args.minPurchaseAmount;
    if (args.maxUses !== undefined) updates.maxUses = args.maxUses;
    if (args.isActive !== undefined) updates.isActive = args.isActive;
    if (args.expiresAt !== undefined) updates.expiresAt = args.expiresAt;
    if (args.description !== undefined) updates.description = args.description;

    await ctx.db.patch(args.couponId, updates);
  },
});

export const deleteCoupon = mutation({
  args: { couponId: v.id("coupons") },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.MARKETING_ADMIN as string]);
    await ctx.db.delete(args.couponId);
  },
});
