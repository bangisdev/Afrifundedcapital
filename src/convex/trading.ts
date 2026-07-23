import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth, requireRole } from "./users";
import { ROLES, CHALLENGE_STATUS } from "./schema";

// ═══════════════════════════════════════════════
//  QUERIES
// ═══════════════════════════════════════════════

export const getChallengeMetrics = query({
  args: { challengeId: v.id("userChallenges") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const challenge = await ctx.db.get(args.challengeId);
    if (!challenge || challenge.userId !== userId) {
      throw new Error("Challenge not found");
    }

    const metrics = await ctx.db
      .query("tradingMetrics")
      .withIndex("challengeId", (q) => q.eq("challengeId", args.challengeId))
      .order("desc")
      .first();

    return metrics;
  },
});

export const getChallengeMetricsHistory = query({
  args: {
    challengeId: v.id("userChallenges"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const challenge = await ctx.db.get(args.challengeId);
    if (!challenge || challenge.userId !== userId) {
      throw new Error("Challenge not found");
    }

    const metrics = await ctx.db
      .query("tradingMetrics")
      .withIndex("challengeId", (q) => q.eq("challengeId", args.challengeId))
      .order("desc")
      .collect();

    return metrics.slice(0, args.limit || 100);
  },
});

export const getDrawdownHistory = query({
  args: {
    challengeId: v.id("userChallenges"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const challenge = await ctx.db.get(args.challengeId);
    if (!challenge || challenge.userId !== userId) {
      throw new Error("Challenge not found");
    }

    const history = await ctx.db
      .query("drawdownHistory")
      .withIndex("challengeId", (q) => q.eq("challengeId", args.challengeId))
      .order("desc")
      .collect();

    return history.slice(0, args.limit || 100);
  },
});

export const getAccountMetrics = query({
  args: { mt5AccountId: v.id("mt5Accounts") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const account = await ctx.db.get(args.mt5AccountId);
    if (!account) throw new Error("Account not found");
    if (account.userId !== userId) throw new Error("Not authorized");

    const metrics = await ctx.db
      .query("tradingMetrics")
      .withIndex("mt5AccountId", (q) => q.eq("mt5AccountId", args.mt5AccountId))
      .order("desc")
      .first();

    return metrics;
  },
});

// ═══════════════════════════════════════════════
//  MUTATIONS
// ═══════════════════════════════════════════════

export const recordTradingMetrics = mutation({
  args: {
    mt5AccountId: v.id("mt5Accounts"),
    challengeId: v.id("userChallenges"),
    balance: v.number(),
    equity: v.number(),
    floatingPL: v.number(),
    dailyPL: v.number(),
    totalProfit: v.number(),
    currentDrawdown: v.number(),
    dailyDrawdown: v.number(),
    trailingDrawdown: v.optional(v.number()),
    relativeDrawdown: v.optional(v.number()),
    absoluteDrawdown: v.optional(v.number()),
    remainingDrawdown: v.optional(v.number()),
    profitTargetProgress: v.number(),
    tradingDaysCount: v.number(),
    openPositions: v.number(),
    closedTrades: v.number(),
    winRate: v.optional(v.number()),
    lossRate: v.optional(v.number()),
    averageRR: v.optional(v.number()),
    profitFactor: v.optional(v.number()),
    expectancy: v.optional(v.number()),
    largestWin: v.optional(v.number()),
    largestLoss: v.optional(v.number()),
    consecutiveWins: v.optional(v.number()),
    consecutiveLosses: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Calculate derived metrics
    const riskScore = calculateRiskScore(args);
    const healthScore = calculateHealthScore(args);

    const metricsId = await ctx.db.insert("tradingMetrics", {
      mt5AccountId: args.mt5AccountId,
      challengeId: args.challengeId,
      balance: args.balance,
      equity: args.equity,
      floatingPL: args.floatingPL,
      dailyPL: args.dailyPL,
      totalProfit: args.totalProfit,
      currentDrawdown: args.currentDrawdown,
      dailyDrawdown: args.dailyDrawdown,
      trailingDrawdown: args.trailingDrawdown || 0,
      relativeDrawdown: args.relativeDrawdown || 0,
      absoluteDrawdown: args.absoluteDrawdown || 0,
      remainingDrawdown: args.remainingDrawdown || 0,
      profitTargetProgress: args.profitTargetProgress,
      tradingDaysCount: args.tradingDaysCount,
      openPositions: args.openPositions,
      closedTrades: args.closedTrades,
      winRate: args.winRate,
      lossRate: args.lossRate,
      averageRR: args.averageRR,
      profitFactor: args.profitFactor,
      expectancy: args.expectancy,
      largestWin: args.largestWin,
      largestLoss: args.largestLoss,
      consecutiveWins: args.consecutiveWins,
      consecutiveLosses: args.consecutiveLosses,
      riskScore,
      healthScore,
      recordedAt: Date.now(),
    });

    // Record drawdown history
    await ctx.db.insert("drawdownHistory", {
      challengeId: args.challengeId,
      mt5AccountId: args.mt5AccountId,
      balance: args.balance,
      equity: args.equity,
      drawdown: args.currentDrawdown,
      dailyDrawdown: args.dailyDrawdown,
      peakBalance: args.balance + args.totalProfit,
      recordedAt: Date.now(),
    });

    // Check for rule violations
    await checkChallengeRules(ctx, args);

    return metricsId;
  },
});

// ═══════════════════════════════════════════════
//  RULE ENGINE
// ═══════════════════════════════════════════════

async function checkChallengeRules(ctx: any, metrics: any) {
  const challenge = await ctx.db.get(metrics.challengeId);
  if (!challenge || challenge.status !== CHALLENGE_STATUS.ACTIVE) return;

  const template = await ctx.db.get(challenge.templateId);
  if (!template) return;

  const violations: Array<{ type: string; description: string; detectedAt: number; severity: string }> = challenge.violations || [];

  // Check profit target
  if (metrics.profitTargetProgress >= 100) {
    if (template.type === "one_step") {
      await ctx.db.patch(metrics.challengeId, {
        status: CHALLENGE_STATUS.PHASE_1_PASSED,
        phase1PassedAt: Date.now(),
        updatedAt: Date.now(),
      });
    } else if (template.type === "two_step") {
      if (challenge.currentPhase === 1) {
        await ctx.db.patch(metrics.challengeId, {
          currentPhase: 2,
          status: CHALLENGE_STATUS.PHASE_1_PASSED,
          phase1PassedAt: Date.now(),
          updatedAt: Date.now(),
        });
      } else if (challenge.currentPhase === 2) {
        await ctx.db.patch(metrics.challengeId, {
          status: CHALLENGE_STATUS.PHASE_2_PASSED,
          phase2PassedAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }
  }

  // Check max drawdown
  if (metrics.currentDrawdown >= challenge.maxDrawdown) {
    violations.push({
      type: "max_drawdown",
      description: `Maximum drawdown exceeded: ${metrics.currentDrawdown.toFixed(2)}% >= ${challenge.maxDrawdown}%`,
      detectedAt: Date.now(),
      severity: "critical",
    });
  }

  // Check daily drawdown
  if (metrics.dailyDrawdown >= challenge.dailyDrawdown) {
    violations.push({
      type: "daily_drawdown",
      description: `Daily drawdown exceeded: ${metrics.dailyDrawdown.toFixed(2)}% >= ${challenge.dailyDrawdown}%`,
      detectedAt: Date.now(),
      severity: "warning",
    });
  }

  // Check leverage
  if (template.maxLeverage && metrics.openPositions > 0) {
    // Simplified leverage check
    const usedMargin = metrics.openPositions * 100; // Simplified
    const leverageUsed = (usedMargin / metrics.balance) * 100;
    if (leverageUsed > template.maxLeverage) {
      violations.push({
        type: "leverage_exceeded",
        description: `Leverage exceeded: ${leverageUsed.toFixed(2)}x > ${template.maxLeverage}x`,
        detectedAt: Date.now(),
        severity: "warning",
      });
    }
  }

  // Check minimum trading days
  if (challenge.minTradingDays > 0 && metrics.tradingDaysCount < challenge.minTradingDays) {
    // Not a violation, but track progress
  }

  if (violations.length > (challenge.violations?.length || 0)) {
    const criticalViolation = violations.find((v) => v.severity === "critical" && !challenge.violations?.some((cv: any) => cv.type === v.type));
    if (criticalViolation) {
      await ctx.db.patch(metrics.challengeId, {
        violations,
        status: CHALLENGE_STATUS.VIOLATED,
        updatedAt: Date.now(),
      });

      // Notify user
      await ctx.db.insert("notifications", {
        userId: challenge.userId,
        type: "challenge_violated",
        title: "Challenge Violated",
        message: criticalViolation.description,
        read: false,
        link: `/dashboard/challenges/${metrics.challengeId}`,
        createdAt: Date.now(),
      });
    } else {
      await ctx.db.patch(metrics.challengeId, {
        violations,
        updatedAt: Date.now(),
      });
    }
  }
}

function calculateRiskScore(metrics: any): number {
  let score = 0;
  if (metrics.currentDrawdown > 5) score += 20;
  if (metrics.dailyDrawdown > 3) score += 20;
  if (metrics.openPositions > 5) score += 20;
  if ((metrics.winRate || 0) < 40) score += 20;
  if ((metrics.profitFactor || 2) < 1) score += 20;
  return Math.min(score, 100);
}

function calculateHealthScore(metrics: any): number {
  let score = 50;
  if ((metrics.winRate || 0) > 50) score += 10;
  if ((metrics.profitFactor || 1) > 1.5) score += 10;
  if ((metrics.averageRR || 1) > 1.5) score += 10;
  if (metrics.currentDrawdown < 5) score += 10;
  if (metrics.consecutiveWins && metrics.consecutiveWins > 3) score += 10;
  return Math.min(score, 100);
}
