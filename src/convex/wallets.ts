import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth, requireRole } from "./users";
import { ROLES, WALLET_TRANSACTION_TYPES } from "./schema";

// ═══════════════════════════════════════════════
//  QUERIES
// ═══════════════════════════════════════════════

export const getMyWallet = query({
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    let wallet = await ctx.db
      .query("wallets")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();

    // Create wallet if it doesn't exist
    if (!wallet) {
      const id = await ctx.db.insert("wallets", {
        userId,
        balance: 0,
        referralBalance: 0,
        bonusBalance: 0,
        currency: "NGN",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      wallet = await ctx.db.get(id);
    }

    return wallet;
  },
});

export const getMyWalletTransactions = query({
  args: {
    limit: v.optional(v.number()),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    let transactions = await ctx.db
      .query("walletTransactions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    if (args.type) {
      transactions = transactions.filter((t) => t.type === args.type);
    }

    return transactions.slice(0, args.limit || 50);
  },
});

export const listAllWallets = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.FINANCE_ADMIN]);

    const wallets = await ctx.db.query("wallets").collect();
    const enriched = await Promise.all(
      wallets.slice(0, args.limit || 50).map(async (w) => {
        const user = await ctx.db.get(w.userId);
        return { ...w, userName: user?.name, userEmail: user?.email };
      }),
    );

    return enriched;
  },
});

// ═══════════════════════════════════════════════
//  MUTATIONS
// ═══════════════════════════════════════════════

export const creditWallet = mutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    type: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.FINANCE_ADMIN]);

    let wallet = await ctx.db
      .query("wallets")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .first();

    if (!wallet) {
      const id = await ctx.db.insert("wallets", {
        userId: args.userId,
        balance: 0,
        referralBalance: 0,
        bonusBalance: 0,
        currency: "NGN",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      wallet = await ctx.db.get(id);
    }

    const balanceBefore = wallet!.balance;
    const balanceAfter = balanceBefore + args.amount;

    await ctx.db.patch(wallet!._id, {
      balance: balanceAfter,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("walletTransactions", {
      walletId: wallet!._id,
      userId: args.userId,
      type: args.type as any,
      amount: args.amount,
      balanceBefore,
      balanceAfter,
      description: args.description,
      createdAt: Date.now(),
    });

    // Audit
    await ctx.db.insert("auditLogs", {
      userId: args.userId,
      action: "wallet_credited",
      entity: "wallets",
      entityId: wallet!._id,
      details: `${args.amount} ${args.type}: ${args.description}`,
      timestamp: Date.now(),
    });
  },
});

export const debitWallet = mutation({
  args: {
    amount: v.number(),
    description: v.string(),
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    let wallet = await ctx.db
      .query("wallets")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();

    if (!wallet) throw new Error("Wallet not found");
    if (wallet.balance < args.amount) throw new Error("Insufficient balance");

    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore - args.amount;

    await ctx.db.patch(wallet._id, {
      balance: balanceAfter,
      updatedAt: Date.now(),
    });

    const txId = await ctx.db.insert("walletTransactions", {
      walletId: wallet._id,
      userId,
      type: "withdrawal" as any,
      amount: args.amount,
      balanceBefore,
      balanceAfter,
      description: args.description,
      reference: args.reference,
      createdAt: Date.now(),
    });

    return txId;
  },
});

export const requestWithdrawal = mutation({
  args: {
    amount: v.number(),
    paymentMethod: v.string(),
    paymentDetails: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    let wallet = await ctx.db
      .query("wallets")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();

    if (!wallet) throw new Error("Wallet not found");
    if (wallet.balance < args.amount) throw new Error("Insufficient balance");

    // Create payout request
    const payoutId = await ctx.db.insert("commissionPayouts", {
      userId,
      affiliateId: "" as any, // Will link later
      amount: args.amount,
      currency: "NGN",
      status: "pending",
      paymentMethod: args.paymentMethod,
      paymentDetails: args.paymentDetails,
      requestedAt: Date.now(),
    });

    return payoutId;
  },
});

export const processPayout = mutation({
  args: {
    payoutId: v.id("commissionPayouts"),
    status: v.string(),
    processedBy: v.id("users"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.FINANCE_ADMIN, ROLES.AFFILIATE_MANAGER as string]);

    const payout = await ctx.db.get(args.payoutId);
    if (!payout) throw new Error("Payout not found");

    await ctx.db.patch(args.payoutId, {
      status: args.status as any,
      processedBy: args.processedBy,
      notes: args.notes,
      processedAt: Date.now(),
    });

    // If approved, debit from wallet
    if (args.status === "paid") {
      const wallet = await ctx.db
        .query("wallets")
        .withIndex("userId", (q) => q.eq("userId", payout.userId))
        .first();

      if (wallet) {
        const balanceBefore = wallet.balance;
        await ctx.db.patch(wallet._id, {
          balance: balanceBefore - payout.amount,
          updatedAt: Date.now(),
        });

        await ctx.db.insert("walletTransactions", {
          walletId: wallet._id,
          userId: payout.userId,
          type: "withdrawal",
          amount: payout.amount,
          balanceBefore,
          balanceAfter: balanceBefore - payout.amount,
          description: "Withdrawal processed",
          createdAt: Date.now(),
        });
      }
    }
  },
});
