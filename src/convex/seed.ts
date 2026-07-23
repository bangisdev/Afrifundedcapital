import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { internal } from "./_generated/api";

// ═══════════════════════════════════════════════
//  SETTINGS QUERIES
// ═══════════════════════════════════════════════

export const getSettingByKey = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("settings")
      .withIndex("key", (q) => q.eq("key", args.key))
      .first();
    return settings || null;
  },
});

export const listSettings = query({
  args: { group: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let settings = await ctx.db.query("settings").collect();
    if (args.group) {
      settings = settings.filter((s) => s.group === args.group);
    }
    return settings.sort((a, b) => a.key.localeCompare(b.key));
  },
});

// ═══════════════════════════════════════════════
//  SETTINGS MUTATIONS
// ═══════════════════════════════════════════════

export const insertSetting = mutation({
  args: {
    key: v.string(),
    value: v.any(),
    group: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("settings", {
      key: args.key,
      value: args.value,
      group: args.group,
      description: args.description,
    });
  },
});

export const updateSetting = mutation({
  args: {
    key: v.string(),
    value: v.any(),
  },
  handler: async (ctx, args) => {
    const setting = await ctx.db
      .query("settings")
      .withIndex("key", (q) => q.eq("key", args.key))
      .first();

    if (setting) {
      await ctx.db.patch(setting._id, { value: args.value });
    }
  },
});

// ═══════════════════════════════════════════════
//  PAYMENT PROVIDER QUERIES
// ═══════════════════════════════════════════════

/**
 * Returns the list of enabled payment providers.
 * Admin can toggle these from the Settings page.
 */
export const getEnabledPaymentProviders = query({
  handler: async (ctx) => {
    const providersSetting = await ctx.db
      .query("settings")
      .withIndex("key", (q) => q.eq("key", "payment_providers"))
      .first();

    const defaultSetting = await ctx.db
      .query("settings")
      .withIndex("key", (q) => q.eq("key", "default_payment_provider"))
      .first();

    const rawProviders = (providersSetting?.value as string) || "flutterwave";
    const providers = rawProviders.split(",").map((p: string) => p.trim().toLowerCase()).filter(Boolean);
    const defaultProvider = (defaultSetting?.value as string) || "flutterwave";

    return {
      providers,
      defaultProvider,
    };
  },
});

// ═══════════════════════════════════════════════
//  SEED ACTION
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
//  INTERNAL HELPERS FOR DEMO TRADING DATA SEEDER
//  (consumed by convex/seed-trading.ts)
// ═══════════════════════════════════════════════

export const listChallengesForDemo = query({
  handler: async (ctx) => {
    const challenges = await ctx.db.query("userChallenges").collect();
    const eligible = challenges.filter(
      (c) =>
        c.status === "active" ||
        c.status === "funded" ||
        c.status === "phase_1_passed" ||
        c.status === "phase_2_passed",
    );

    // Only return challenges that don't already have any trading metrics
    // (per-challenge guard so already-seeded challenges are never re-seeded)
    const result = [];
    for (const challenge of eligible) {
      const existingMetrics = await ctx.db
        .query("tradingMetrics")
        .withIndex("challengeId", (q) => q.eq("challengeId", challenge._id))
        .first();
      if (!existingMetrics) {
        result.push(challenge);
      }
    }
    return result;
  },
});

export const createDemoMt5Account = mutation({
  args: {
    userId: v.id("users"),
    login: v.string(),
    password: v.string(),
    investorPassword: v.string(),
    balance: v.number(),
    equity: v.number(),
  },
  handler: async (ctx, args) => {
    const accountId = await ctx.db.insert("mt5Accounts", {
      userId: args.userId,
      login: args.login,
      password: args.password,
      investorPassword: args.investorPassword,
      server: "AfriFundedCapital-Demo",
      group: "AFC-Demo",
      leverage: 100,
      balance: args.balance,
      equity: args.equity,
      currency: "NGN",
      isActive: true,
      isSuspended: false,
      createdAt: Date.now(),
    });
    return accountId;
  },
});

export const linkMt5ToChallenge = mutation({
  args: {
    challengeId: v.id("userChallenges"),
    mt5AccountId: v.id("mt5Accounts"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.challengeId, {
      mt5AccountId: args.mt5AccountId,
      status: "active",
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const markUserAsDemoSeeded = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      isDemoSeeded: true,
    });
  },
});

export const getChallengeForReset = query({
  args: {
    challengeId: v.id("userChallenges"),
  },
  handler: async (ctx, args) => {
    const challenge = await ctx.db.get(args.challengeId);
    if (
      !challenge ||
      (challenge.status !== "active" &&
        challenge.status !== "funded" &&
        challenge.status !== "phase_1_passed" &&
        challenge.status !== "phase_2_passed")
    ) {
      return null;
    }
    return challenge;
  },
});

export const clearDemoDataForChallenge = mutation({
  args: {
    challengeId: v.id("userChallenges"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Delete all trading metrics for this challenge
    const metrics = await ctx.db
      .query("tradingMetrics")
      .withIndex("challengeId", (q) => q.eq("challengeId", args.challengeId))
      .collect();
    for (const m of metrics) {
      await ctx.db.delete(m._id);
    }

    // Delete all drawdown history for this challenge
    const drawdowns = await ctx.db
      .query("drawdownHistory")
      .withIndex("challengeId", (q) => q.eq("challengeId", args.challengeId))
      .collect();
    for (const d of drawdowns) {
      await ctx.db.delete(d._id);
    }

    // Check if user has any other challenges with metrics — if none left, reset isDemoSeeded
    const userChallenges = await ctx.db
      .query("userChallenges")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .collect();
    let anyRemainingMetrics = false;
    for (const ch of userChallenges) {
      if (ch._id === args.challengeId) continue;
      const existing = await ctx.db
        .query("tradingMetrics")
        .withIndex("challengeId", (q) => q.eq("challengeId", ch._id))
        .first();
      if (existing) {
        anyRemainingMetrics = true;
        break;
      }
    }
    if (!anyRemainingMetrics) {
      await ctx.db.patch(args.userId, {
        isDemoSeeded: false,
      });
    }
  },
});

// ═══════════════════════════════════════════════
//  MAIN SEED ACTION
// ═══════════════════════════════════════════════

export const seed = action({
  handler: async (ctx) => {
    // Seed default roles
    await ctx.runMutation((internal as any).roles.seedDefaultRoles);

    // Seed challenge templates
    await ctx.runMutation((internal as any).challenges.seedChallengeTemplates);

    // Seed default settings
    const defaultSettings = [
      { key: "platform_name", value: "AfriFundedCapital", group: "general", description: "Platform display name" },
      { key: "platform_currency", value: "NGN", group: "general", description: "Default platform currency" },
      { key: "min_withdrawal", value: 5000, group: "finance", description: "Minimum withdrawal amount" },
      { key: "profit_share_percent", value: 90, group: "challenges", description: "Trader profit share percentage" },
      { key: "affiliate_commission_percent", value: 10, group: "affiliates", description: "Default affiliate commission percentage" },
      { key: "max_affiliate_levels", value: 3, group: "affiliates", description: "Maximum multi-level affiliate depth" },
      { key: "require_kyc_for_challenge", value: true, group: "kyc", description: "Require KYC approval before purchasing challenges" },
      { key: "mt5_server", value: "AfriFundedCapital-Demo", group: "mt5", description: "Default MT5 server name" },
      { key: "mt5_group", value: "AFC-Demo", group: "mt5", description: "Default MT5 trading group" },
      { key: "default_leverage", value: 100, group: "mt5", description: "Default account leverage" },
      { key: "support_email", value: "support@afrifundedcapital.com", group: "general", description: "Support email address" },

      // Payment provider settings — enables admin to toggle providers later
      { key: "payment_providers", value: "flutterwave", group: "payments", description: "Enabled payment providers (comma-separated: flutterwave,paystack)" },
      { key: "default_payment_provider", value: "flutterwave", group: "payments", description: "Default payment provider shown at checkout" },
    ];

    for (const setting of defaultSettings) {
      const existing = await ctx.runQuery((internal as any).seed.getSettingByKey, { key: setting.key });
      if (!existing) {
        await ctx.runMutation((internal as any).seed.insertSetting, setting);
      }
    }
  },
});
