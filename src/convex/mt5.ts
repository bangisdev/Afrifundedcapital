import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { requireRole } from "./users";
import { ROLES } from "./schema";
import { internal } from "./_generated/api";

// ═══════════════════════════════════════════════
//  QUERIES
// ═══════════════════════════════════════════════

export const getMyMt5Accounts = query({
  handler: async (ctx) => {
    const { userId } = await requireRole(ctx, Object.values(ROLES));
    const accounts = await ctx.db
      .query("mt5Accounts")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();

    // Mask passwords
    return accounts.map((a) => ({
      ...a,
      password: "••••••••",
      investorPassword: "••••••••",
    }));
  },
});

export const getMt5Account = query({
  args: { accountId: v.id("mt5Accounts") },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, Object.values(ROLES));
    const account = await ctx.db.get(args.accountId);
    if (!account) throw new Error("Account not found");

    // Only allow same user or admin
    const user = await ctx.db.get(userId);
    if (account.userId !== userId && (!user?.role || user.role === ROLES.USER)) {
      throw new Error("Not authorized");
    }

    return {
      ...account,
      password: user?.role && user.role !== ROLES.USER ? account.password : "••••••••",
      investorPassword: user?.role && user.role !== ROLES.USER ? account.investorPassword : "••••••••",
    };
  },
});

export const listAllMt5Accounts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN]);

    const accounts = await ctx.db.query("mt5Accounts").collect();
    const enriched = await Promise.all(
      accounts.slice(0, args.limit || 50).map(async (a) => {
        const user = await ctx.db.get(a.userId);
        return { ...a, userName: user?.name, userEmail: user?.email };
      }),
    );

    return enriched;
  },
});

export const getMt5SyncQueue = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN]);

    let queue = await ctx.db.query("mt5SyncQueue").collect();
    if (args.status) queue = queue.filter((q) => q.status === args.status);
    return queue.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ═══════════════════════════════════════════════
//  MUTATIONS
// ═══════════════════════════════════════════════

export const createMt5Account = mutation({
  args: {
    userId: v.id("users"),
    login: v.string(),
    password: v.string(),
    server: v.string(),
    group: v.string(),
    leverage: v.number(),
    balance: v.optional(v.number()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN]);

    const accountId = await ctx.db.insert("mt5Accounts", {
      userId: args.userId,
      login: args.login,
      password: args.password,
      investorPassword: args.password, // Will be changed with generate_investor
      server: args.server,
      group: args.group,
      leverage: args.leverage,
      balance: args.balance || 0,
      equity: args.balance || 0,
      currency: args.currency || "USD",
      isActive: true,
      isSuspended: false,
      createdAt: Date.now(),
    });

    // Notify user
    await ctx.db.insert("notifications", {
      userId: args.userId,
      type: "mt5_account_created",
      title: "MT5 Account Created",
      message: `Your MT5 account (Login: ${args.login}) is ready.`,
      read: false,
      link: "/dashboard/trading",
      createdAt: Date.now(),
    });

    return accountId;
  },
});

export const updateMt5Account = mutation({
  args: {
    accountId: v.id("mt5Accounts"),
    balance: v.optional(v.number()),
    equity: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    isSuspended: v.optional(v.boolean()),
    group: v.optional(v.string()),
    leverage: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN]);

    const updates: Record<string, any> = {};
    if (args.balance !== undefined) updates.balance = args.balance;
    if (args.equity !== undefined) updates.equity = args.equity;
    if (args.isActive !== undefined) updates.isActive = args.isActive;
    if (args.isSuspended !== undefined) updates.isSuspended = args.isSuspended;
    if (args.group !== undefined) updates.group = args.group;
    if (args.leverage !== undefined) updates.leverage = args.leverage;

    updates.lastSyncAt = Date.now();

    await ctx.db.patch(args.accountId, updates);
  },
});

export const queueMt5Sync = mutation({
  args: {
    mt5AccountId: v.id("mt5Accounts"),
    action: v.string(),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN]);

    await ctx.db.insert("mt5SyncQueue", {
      mt5AccountId: args.mt5AccountId,
      action: args.action as any,
      status: "pending",
      payload: args.payload,
      retryCount: 0,
      maxRetries: 3,
      createdAt: Date.now(),
    });
  },
});

export const processMt5SyncQueue = mutation({
  args: {
    queueItemId: v.id("mt5SyncQueue"),
    status: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN]);

    const item = await ctx.db.get(args.queueItemId);
    if (!item) throw new Error("Queue item not found");

    await ctx.db.patch(args.queueItemId, {
      status: args.status as any,
      error: args.error,
      processedAt: Date.now(),
    });
  },
});

export const purgeMt5SyncQueue = mutation({
  args: {
    status: v.string(),
    olderThanHours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN]);

    let queue = await ctx.db.query("mt5SyncQueue").collect();

    const cutoff = args.olderThanHours
      ? Date.now() - args.olderThanHours * 60 * 60 * 1000
      : 0;

    let removed = 0;
    for (const item of queue) {
      if (item.status === args.status && (!cutoff || item.createdAt < cutoff)) {
        await ctx.db.delete(item._id);
        removed++;
      }
    }

    return removed;
  },
});

// ═══════════════════════════════════════════════
//  ACTIONS

// ═══════════════════════════════════════════════
//  ACTIONS — External API calls
// ═══════════════════════════════════════════════

export const syncMt5Account = action({
  args: {
    mt5AccountId: v.id("mt5Accounts"),
    balance: v.number(),
    equity: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation((internal as any).mt5.updateMt5Account, {
      accountId: args.mt5AccountId,
      balance: args.balance,
      equity: args.equity,
    });
  },
});
