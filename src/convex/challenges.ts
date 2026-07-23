import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { requireAuth, requireRole, checkEmailPref } from "./users";
import { ROLES, CHALLENGE_TYPES, CHALLENGE_STATUS } from "./schema";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

// ═══════════════════════════════════════════════
//  SEED DATA — Default challenge templates
// ═══════════════════════════════════════════════

const DEFAULT_TEMPLATES = [
  {
    name: "One Step Challenge",
    description: "Pass one evaluation phase to get funded",
    type: CHALLENGE_TYPES.ONE_STEP,
    profitTarget: 10,
    dailyDrawdown: 5,
    maxDrawdown: 10,
    maxLeverage: 100,
    minTradingDays: 5,
    allowWeekendHolding: false,
    allowNewsTrading: false,
    allowEATrading: true,
    allowCopyTrading: false,
    durationDays: 30,
  },
  {
    name: "Two Step Challenge",
    description: "Pass two evaluation phases to get funded with higher capital",
    type: CHALLENGE_TYPES.TWO_STEP,
    profitTarget: 8,
    dailyDrawdown: 5,
    maxDrawdown: 12,
    maxLeverage: 100,
    minTradingDays: 5,
    allowWeekendHolding: false,
    allowNewsTrading: false,
    allowEATrading: true,
    allowCopyTrading: false,
    durationDays: 60,
  },
  {
    name: "Instant Funding",
    description: "Start trading with funded capital immediately",
    type: CHALLENGE_TYPES.INSTANT_FUNDING,
    profitTarget: 10,
    dailyDrawdown: 4,
    maxDrawdown: 8,
    maxLeverage: 100,
    minTradingDays: 0,
    allowWeekendHolding: true,
    allowNewsTrading: true,
    allowEATrading: true,
    allowCopyTrading: false,
    durationDays: 0,
  },
];

const DEFAULT_ACCOUNT_SIZES = [
  { label: "$5,000", size: 5000, price: 55 },
  { label: "$10,000", size: 10000, price: 99 },
  { label: "$25,000", size: 25000, price: 199 },
  { label: "$50,000", size: 50000, price: 349 },
  { label: "$100,000", size: 100000, price: 549 },
  { label: "$200,000", size: 200000, price: 999 },
];

// ═══════════════════════════════════════════════
//  QUERIES — TEMPLATES
// ═══════════════════════════════════════════════

export const listChallengeTemplates = query({
  args: {
    type: v.optional(v.string()),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let templates = await ctx.db.query("challengeTemplates").collect();
    if (args.type) {
      templates = templates.filter((t) => t.type === args.type);
    }
    if (!args.includeInactive) {
      templates = templates.filter((t) => t.isActive);
    }
    return templates.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getChallengeTemplate = query({
  args: { templateId: v.id("challengeTemplates") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.templateId);
  },
});

export const getAccountSizesForTemplate = query({
  args: { templateId: v.id("challengeTemplates") },
  handler: async (ctx, args) => {
    const sizes = await ctx.db
      .query("accountSizes")
      .withIndex("templateId", (q) => q.eq("templateId", args.templateId))
      .collect();
    return sizes.filter((s) => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const getAccountSize = query({
  args: { sizeId: v.id("accountSizes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sizeId);
  },
});

// ═══════════════════════════════════════════════
//  QUERIES — USER CHALLENGES
// ═══════════════════════════════════════════════

export const getMyChallenges = query({
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const challenges = await ctx.db
      .query("userChallenges")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();

    const enriched = await Promise.all(
      challenges.map(async (ch) => {
        const template = await ctx.db.get(ch.templateId);
        return {
          ...ch,
          templateName: template?.name,
          templateType: template?.type,
        };
      }),
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getMyChallengeById = query({
  args: { challengeId: v.id("userChallenges") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const challenge = await ctx.db.get(args.challengeId);
    if (!challenge || challenge.userId !== userId) throw new Error("Not found");
    return challenge;
  },
});

export const listAllChallenges = query({
  args: {
    status: v.optional(v.string()),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.CLIENT_MANAGER, ROLES.SUPPORT_ADMIN]);

    let challenges = await ctx.db.query("userChallenges").collect();

    if (args.status) {
      challenges = challenges.filter((c) => c.status === args.status);
    }
    challenges.sort((a, b) => b.createdAt - a.createdAt);

    const enriched = await Promise.all(
      challenges.slice(0, args.limit || 50).map(async (ch) => {
        const user = await ctx.db.get(ch.userId);
        const template = await ctx.db.get(ch.templateId);
        return {
          ...ch,
          userName: user?.name,
          userEmail: user?.email,
          templateName: template?.name,
        };
      }),
    );

    return enriched;
  },
});

export const getUserChallengeStats = query({
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const challenges = await ctx.db
      .query("userChallenges")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();

    return {
      total: challenges.length,
      active: challenges.filter((c) => c.status === CHALLENGE_STATUS.ACTIVE).length,
      funded: challenges.filter((c) => c.status === CHALLENGE_STATUS.FUNDED).length,
      passed: challenges.filter(
        (c) =>
          c.status === CHALLENGE_STATUS.PHASE_1_PASSED ||
          c.status === CHALLENGE_STATUS.PHASE_2_PASSED,
      ).length,
      violated: challenges.filter((c) => c.status === CHALLENGE_STATUS.VIOLATED).length,
    };
  },
});

export const getMyMetricsHistory = query({
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const challenges = await ctx.db
      .query("userChallenges")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();

    const ids = challenges.map((c) => c._id);
    const allMetrics: Array<{
      balance: number;
      equity: number;
      currentDrawdown: number;
      dailyDrawdown: number;
      totalProfit: number;
      profitTargetProgress: number;
      tradingDaysCount: number;
      recordedAt: number;
      challengeId: string;
    }> = [];

    for (const id of ids) {
      const metrics = await ctx.db
        .query("tradingMetrics")
        .withIndex("challengeId", (q) => q.eq("challengeId", id))
        .collect();

      for (const m of metrics) {
        allMetrics.push({
          balance: m.balance,
          equity: m.equity,
          currentDrawdown: m.currentDrawdown,
          dailyDrawdown: m.dailyDrawdown,
          totalProfit: m.totalProfit,
          profitTargetProgress: m.profitTargetProgress,
          tradingDaysCount: m.tradingDaysCount,
          recordedAt: m.recordedAt,
          challengeId: m.challengeId,
        });
      }
    }

    return allMetrics.sort((a, b) => a.recordedAt - b.recordedAt);
  },
});

export const getDashboardMetrics = query({
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const challenges = await ctx.db
      .query("userChallenges")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();

    const active = challenges.filter((c) => c.status === CHALLENGE_STATUS.ACTIVE);
    const funded = challenges.filter((c) => c.status === CHALLENGE_STATUS.FUNDED);

    // Get latest metrics for active challenges
    const activeMetrics = await Promise.all(
      active.map(async (ch) => {
        if (!ch.mt5AccountId) return null;
        const metrics = await ctx.db
          .query("tradingMetrics")
          .withIndex("challengeId", (q) => q.eq("challengeId", ch._id))
          .order("desc")
          .first();
        return metrics;
      }),
    );

    const latestMetrics = activeMetrics.filter(Boolean).pop();

    return {
      activeChallenges: active.length,
      fundedAccounts: funded.length,
      totalChallenges: challenges.length,
      latestMetrics,
    };
  },
});
// ═══════════════════════════════════════════════
//  MUTATIONS — TEMPLATES
// ═══════════════════════════════════════════════

export const seedChallengeTemplates = mutation({
  handler: async (ctx) => {
    const existing = await ctx.db.query("challengeTemplates").collect();
    if (existing.length > 0) return;

    // Find an admin user
    const users = await ctx.db.query("users").collect();
    const admin = users.find((u) => u.role && u.role !== ROLES.USER);
    const adminId = admin?._id || users[0]?._id;
    if (!adminId) return;

    for (const template of DEFAULT_TEMPLATES) {
      const templateId = await ctx.db.insert("challengeTemplates", {
        ...template,
        isActive: true,
        price: 0, // Set by account size
        currency: "NGN",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: adminId,
      });

      // Create account sizes for this template
      for (let i = 0; i < DEFAULT_ACCOUNT_SIZES.length; i++) {
        const size = DEFAULT_ACCOUNT_SIZES[i];
        await ctx.db.insert("accountSizes", {
          label: size.label,
          size: size.size,
          currency: "NGN",
          templateId,
          price: size.price,
          isActive: true,
          sortOrder: i,
        });
      }
    }
  },
});

export const createChallengeTemplate = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    type: v.string(),
    profitTarget: v.number(),
    dailyDrawdown: v.number(),
    maxDrawdown: v.number(),
    maxLeverage: v.number(),
    minTradingDays: v.number(),
    maxTradingDays: v.optional(v.number()),
    allowWeekendHolding: v.boolean(),
    allowNewsTrading: v.boolean(),
    allowEATrading: v.boolean(),
    allowCopyTrading: v.boolean(),
    durationDays: v.number(),
    resetFee: v.optional(v.number()),
    extensionFee: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, [ROLES.SUPER_ADMIN]);

    const templateId = await ctx.db.insert("challengeTemplates", {
      name: args.name,
      description: args.description,
      type: args.type as any,
      isActive: true,
      profitTarget: args.profitTarget,
      dailyDrawdown: args.dailyDrawdown,
      maxDrawdown: args.maxDrawdown,
      maxLeverage: args.maxLeverage,
      minTradingDays: args.minTradingDays,
      maxTradingDays: args.maxTradingDays,
      allowWeekendHolding: args.allowWeekendHolding,
      allowNewsTrading: args.allowNewsTrading,
      allowEATrading: args.allowEATrading,
      allowCopyTrading: args.allowCopyTrading,
      durationDays: args.durationDays,
      resetFee: args.resetFee,
      extensionFee: args.extensionFee,
      price: 0,
      currency: "NGN",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: userId,
    });

    return templateId;
  },
});

export const updateChallengeTemplate = mutation({
  args: {
    templateId: v.id("challengeTemplates"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    profitTarget: v.optional(v.number()),
    dailyDrawdown: v.optional(v.number()),
    maxDrawdown: v.optional(v.number()),
    maxLeverage: v.optional(v.number()),
    minTradingDays: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    resetFee: v.optional(v.number()),
    extensionFee: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN]);

    const updates: Record<string, any> = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.profitTarget !== undefined) updates.profitTarget = args.profitTarget;
    if (args.dailyDrawdown !== undefined) updates.dailyDrawdown = args.dailyDrawdown;
    if (args.maxDrawdown !== undefined) updates.maxDrawdown = args.maxDrawdown;
    if (args.maxLeverage !== undefined) updates.maxLeverage = args.maxLeverage;
    if (args.minTradingDays !== undefined) updates.minTradingDays = args.minTradingDays;
    if (args.isActive !== undefined) updates.isActive = args.isActive;
    if (args.resetFee !== undefined) updates.resetFee = args.resetFee;
    if (args.extensionFee !== undefined) updates.extensionFee = args.extensionFee;

    await ctx.db.patch(args.templateId, updates);
  },
});

export const createAccountSize = mutation({
  args: {
    templateId: v.id("challengeTemplates"),
    label: v.string(),
    size: v.number(),
    price: v.number(),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN]);

    const sizeId = await ctx.db.insert("accountSizes", {
      label: args.label,
      size: args.size,
      currency: "NGN",
      templateId: args.templateId,
      price: args.price,
      isActive: true,
      sortOrder: args.sortOrder,
    });

    return sizeId;
  },
});

export const updateAccountSize = mutation({
  args: {
    sizeId: v.id("accountSizes"),
    label: v.optional(v.string()),
    size: v.optional(v.number()),
    price: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN]);

    const updates: Record<string, any> = {};
    if (args.label !== undefined) updates.label = args.label;
    if (args.size !== undefined) updates.size = args.size;
    if (args.price !== undefined) updates.price = args.price;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    await ctx.db.patch(args.sizeId, updates);
  },
});

// ═══════════════════════════════════════════════
//  MUTATIONS — USER CHALLENGES
// ═══════════════════════════════════════════════

export const createUserChallenge = mutation({
  args: {
    templateId: v.id("challengeTemplates"),
    accountSizeId: v.id("accountSizes"),
    paymentId: v.id("payments"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const template = await ctx.db.get(args.templateId);
    if (!template || !template.isActive) throw new Error("Challenge template not available");

    const accountSize = await ctx.db.get(args.accountSizeId);
    if (!accountSize || !accountSize.isActive) throw new Error("Account size not available");

    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.status !== "completed") throw new Error("Payment not completed");

    // Create challenge
    const challengeId = await ctx.db.insert("userChallenges", {
      userId,
      templateId: args.templateId,
      accountSizeId: args.accountSizeId,
      status: CHALLENGE_STATUS.PENDING,
      accountSize: accountSize.size,
      currency: "NGN",
      profitTarget: template.profitTarget,
      dailyDrawdown: template.dailyDrawdown,
      maxDrawdown: template.maxDrawdown,
      maxLeverage: template.maxLeverage,
      minTradingDays: template.minTradingDays,
      maxTradingDays: template.maxTradingDays,
      paymentId: args.paymentId,
      amountPaid: payment.amount,
      currentPhase: template.type === CHALLENGE_TYPES.TWO_STEP ? 1 : 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Update payment with challenge link
    await ctx.db.patch(args.paymentId, { challengeId });

    // Notify user
    await ctx.db.insert("notifications", {
      userId,
      type: "challenge_started",
      title: "Challenge Started",
      message: `Your ${template.name} (${accountSize.label}) has been created.`,
      read: false,
      link: `/dashboard/challenges/${challengeId}`,
      createdAt: Date.now(),
    });

    return challengeId;
  },
});

export const startUserChallenge = mutation({
  args: { challengeId: v.id("userChallenges") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const challenge = await ctx.db.get(args.challengeId);
    if (!challenge || challenge.userId !== userId) throw new Error("Not found");
    if (challenge.status !== CHALLENGE_STATUS.PENDING) throw new Error("Invalid state");

    const template = await ctx.db.get(challenge.templateId);
    const now = Date.now();

    await ctx.db.patch(args.challengeId, {
      status: CHALLENGE_STATUS.ACTIVE,
      startedAt: now,
      expiresAt: template?.durationDays ? now + template.durationDays * 24 * 60 * 60 * 1000 : undefined,
      updatedAt: now,
    });
  },
});

export const updateChallengeStatus = mutation({
  args: {
    challengeId: v.id("userChallenges"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.CLIENT_MANAGER]);

    const challenge = await ctx.db.get(args.challengeId);
    if (!challenge) throw new Error("Challenge not found");

    const now = Date.now();

    await ctx.db.patch(args.challengeId, {
      status: args.status as any,
      updatedAt: now,
    });      // If funded, create funded account
    if (args.status === CHALLENGE_STATUS.FUNDED && challenge.mt5AccountId) {
      await ctx.db.insert("fundedAccounts", {
        userId: challenge.userId,
        challengeId: args.challengeId,
        mt5AccountId: challenge.mt5AccountId,
        accountSize: challenge.accountSize,
        currency: challenge.currency,
        profitSharePercent: 90,
        isActive: true,
        activatedAt: now,
      });

      // Notify user
      await ctx.db.insert("notifications", {
        userId: challenge.userId,
        type: "challenge_funded",
        title: "Congratulations — You're Funded!",
        message: `Your account of ${challenge.accountSize} is now funded. Start trading!`,
        read: false,
        link: `/dashboard/challenges/${args.challengeId}`,
        createdAt: now,
      });

      // Auto-issue funded certificate
      try {
        // Generate certificate number and verification code
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let certNum = "AFC-CERT-";
        for (let i = 0; i < 8; i++) certNum += chars[Math.floor(Math.random() * chars.length)];

        let verCode = "";
        for (let i = 0; i < 16; i++) {
          verCode += chars[Math.floor(Math.random() * chars.length)];
          if (i === 3 || i === 7 || i === 11) verCode += "-";
        }

        await ctx.db.insert("certificates", {
          userId: challenge.userId,
          challengeId: args.challengeId,
          type: "funded",
          certificateNumber: certNum,
          verificationCode: verCode,
          issuedAt: Date.now(),
        });

        await ctx.db.insert("notifications", {
          userId: challenge.userId,
          type: "certificate_issued",
          title: "Funded Certificate Issued",
          message: "Your funded trader certificate is ready! View and share it in your dashboard.",
          read: false,
          link: "/dashboard/certificates",
          createdAt: Date.now(),
        });
      } catch (e: any) {
        console.error("Failed to auto-issue certificate:", e.message);
      }

      // Send funded confirmation email with certificate verification link if available
      try {
        const user = await ctx.db.get(challenge.userId);
        const shouldEmail = await checkEmailPref(ctx, challenge.userId, "funded_confirmation");
        if (user?.email && shouldEmail) {
          // Look for existing certificate for this challenge
          const certificates = await ctx.db
            .query("certificates")
            .withIndex("challengeId", (q) => q.eq("challengeId", args.challengeId))
            .collect();
          const cert = certificates.find((c) => c.type === "funded");

          await (ctx.scheduler as any).runAfter(0, (internal as any).email.sendFundedConfirmation, {
            email: user.email,
            name: user.name || "Trader",
            accountSize: `$${challenge.accountSize.toLocaleString()}`,
            profitSharePercent: 90,
            verificationCode: cert?.verificationCode,
          });
        }
      } catch (e: any) {
        console.error("Failed to send funded email:", e.message);
      }
    }
  },
});

export const addChallengeViolation = mutation({
  args: {
    challengeId: v.id("userChallenges"),
    type: v.string(),
    description: v.string(),
    severity: v.union(v.literal("warning"), v.literal("critical")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.CLIENT_MANAGER]);

    const challenge = await ctx.db.get(args.challengeId);
    if (!challenge) throw new Error("Challenge not found");

    const violations = challenge.violations || [];
    violations.push({
      type: args.type,
      description: args.description,
      detectedAt: Date.now(),
      severity: args.severity,
    });

    const updates: Record<string, any> = {
      violations,
      updatedAt: Date.now(),
    };

    // If critical violation, mark as violated
    if (args.severity === "critical") {
      updates.status = CHALLENGE_STATUS.VIOLATED;

      await ctx.db.insert("notifications", {
        userId: challenge.userId,
        type: "challenge_violated",
        title: "Challenge Violated",
        message: `Critical violation: ${args.description}`,
        read: false,
        link: `/dashboard/challenges/${args.challengeId}`,
        createdAt: Date.now(),
      });

      // Send violation email
      try {
        const template = await ctx.db.get(challenge.templateId);
        const user = await ctx.db.get(challenge.userId);
        const shouldEmail = await checkEmailPref(ctx, challenge.userId, "challenge_violation");
        if (user?.email && shouldEmail) {
          await (ctx.scheduler as any).runAfter(0, (internal as any).email.sendChallengeViolation, {
            email: user.email,
            name: user.name || "Trader",
            challengeName: template?.name || "Challenge",
            accountSize: `$${challenge.accountSize.toLocaleString()}`,
            violationType: args.type,
            description: args.description,
            severity: args.severity,
          });
        }
      } catch (e: any) {
        console.error("Failed to send violation email:", e.message);
      }
    }

    await ctx.db.patch(args.challengeId, updates);
  },
});

export const resetChallenge = mutation({
  args: {
    challengeId: v.id("userChallenges"),
    resetFee: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN]);

    const challenge = await ctx.db.get(args.challengeId);
    if (!challenge) throw new Error("Challenge not found");

    await ctx.db.patch(args.challengeId, {
      status: CHALLENGE_STATUS.ACTIVE,
      violations: [],
      updatedAt: Date.now(),
    });
  },
});

export const getAllChallengesReport = query({
  handler: async (ctx) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.CLIENT_MANAGER]);
    const challenges = await ctx.db.query("userChallenges").order("desc").collect();

    const enriched = await Promise.all(
      challenges.map(async (ch) => {
        const user = await ctx.db.get(ch.userId);
        const template = await ctx.db.get(ch.templateId);
        return {
          userName: user?.name || "",
          userEmail: user?.email || "",
          templateName: template?.name || "",
          accountSize: ch.accountSize,
          status: ch.status,
          profitTarget: ch.profitTarget,
          amountPaid: ch.amountPaid,
          violationsCount: ch.violations?.length || 0,
          createdAt: new Date(ch.createdAt).toISOString(),
          startedAt: ch.startedAt ? new Date(ch.startedAt).toISOString() : "",
          fundedAt: ch.fundedAt ? new Date(ch.fundedAt).toISOString() : "",
        };
      }),
    );

    return enriched;
  },
});
