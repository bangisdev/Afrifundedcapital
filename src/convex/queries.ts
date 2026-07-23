import { v } from "convex/values";
import { query } from "./_generated/server";

// ═══════════════════════════════════════════════
//  INTERNAL QUERIES — Used by daily MT5 sync action
// ═══════════════════════════════════════════════

export const getAllActiveMt5Accounts = query({
  handler: async (ctx) => {
    const accounts = await ctx.db.query("mt5Accounts").collect();
    return accounts.filter((a) => a.isActive && !a.isSuspended);
  },
});

export const getChallengeByMt5Account = query({
  args: { mt5AccountId: v.id("mt5Accounts") },
  handler: async (ctx, args) => {
    const challenges = await ctx.db.query("userChallenges").collect();
    return challenges.find((c) => c.mt5AccountId === args.mt5AccountId && (c.status === "active" || c.status === "funded")) || null;
  },
});

export const getLatestMetricsForChallenge = query({
  args: { challengeId: v.id("userChallenges") },
  handler: async (ctx, args) => {
    const metrics = await ctx.db
      .query("tradingMetrics")
      .withIndex("challengeId", (q) => q.eq("challengeId", args.challengeId))
      .order("desc")
      .first();
    return metrics;
  },
});

export const getPendingSyncItems = query({
  handler: async (ctx) => {
    const items = await ctx.db.query("mt5SyncQueue").collect();
    return items
      .filter((item) => item.status === "pending")
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getMt5AccountById = query({
  args: { accountId: v.id("mt5Accounts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.accountId);
  },
});

export const getSyncQueueItem = query({
  args: { queueItemId: v.id("mt5SyncQueue") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.queueItemId);
  },
});
