import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// ═══════════════════════════════════════════════
//  ENUMS & CONSTANTS
// ═══════════════════════════════════════════════

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  SUPPORT_ADMIN: "support_admin",
  FINANCE_ADMIN: "finance_admin",
  CLIENT_MANAGER: "client_manager",
  COMPLIANCE_ADMIN: "compliance_admin",
  MARKETING_ADMIN: "marketing_admin",
  AFFILIATE_MANAGER: "affiliate_manager",
  USER: "user",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.SUPER_ADMIN),
  v.literal(ROLES.SUPPORT_ADMIN),
  v.literal(ROLES.FINANCE_ADMIN),
  v.literal(ROLES.CLIENT_MANAGER),
  v.literal(ROLES.COMPLIANCE_ADMIN),
  v.literal(ROLES.MARKETING_ADMIN),
  v.literal(ROLES.AFFILIATE_MANAGER),
  v.literal(ROLES.USER),
);
export type Role = Infer<typeof roleValidator>;

export const CHALLENGE_TYPES = {
  ONE_STEP: "one_step",
  TWO_STEP: "two_step",
  INSTANT_FUNDING: "instant_funding",
  EVALUATION: "evaluation",
} as const;

export const challengeTypeValidator = v.union(
  v.literal(CHALLENGE_TYPES.ONE_STEP),
  v.literal(CHALLENGE_TYPES.TWO_STEP),
  v.literal(CHALLENGE_TYPES.INSTANT_FUNDING),
  v.literal(CHALLENGE_TYPES.EVALUATION),
);
export type ChallengeType = Infer<typeof challengeTypeValidator>;

export const CHALLENGE_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  PHASE_1_PASSED: "phase_1_passed",
  PHASE_2_PASSED: "phase_2_passed",
  FUNDED: "funded",
  VIOLATED: "violated",
  EXPIRED: "expired",
  REFUNDED: "refunded",
} as const;

export const challengeStatusValidator = v.union(
  v.literal(CHALLENGE_STATUS.PENDING),
  v.literal(CHALLENGE_STATUS.ACTIVE),
  v.literal(CHALLENGE_STATUS.PHASE_1_PASSED),
  v.literal(CHALLENGE_STATUS.PHASE_2_PASSED),
  v.literal(CHALLENGE_STATUS.FUNDED),
  v.literal(CHALLENGE_STATUS.VIOLATED),
  v.literal(CHALLENGE_STATUS.EXPIRED),
  v.literal(CHALLENGE_STATUS.REFUNDED),
);

export const KYC_STATUS = {
  UNVERIFIED: "unverified",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export const kycStatusValidator = v.union(
  v.literal(KYC_STATUS.UNVERIFIED),
  v.literal(KYC_STATUS.PENDING),
  v.literal(KYC_STATUS.APPROVED),
  v.literal(KYC_STATUS.REJECTED),
);

export const DOCUMENT_TYPES = {
  PASSPORT: "passport",
  NATIONAL_ID: "national_id",
  DRIVERS_LICENSE: "drivers_license",
  PROOF_OF_ADDRESS: "proof_of_address",
  SELFIE: "selfie",
} as const;

export const PAYMENT_STATUS = {
  PENDING: "pending",
  COMPLETED: "completed",
  FAILED: "failed",
  REFUNDED: "refunded",
} as const;

export const TICKET_STATUS = {
  OPEN: "open",
  PENDING: "pending",
  WAITING_ON_CUSTOMER: "waiting_on_customer",
  RESOLVED: "resolved",
  CLOSED: "closed",
} as const;

export const WALLET_TRANSACTION_TYPES = {
  DEPOSIT: "deposit",
  WITHDRAWAL: "withdrawal",
  REFUND: "refund",
  CREDIT: "credit",
  REFERRAL_BONUS: "referral_bonus",
  CHALLENGE_PURCHASE: "challenge_purchase",
  COMMISSION: "commission",
  RESET_FEE: "reset_fee",
} as const;

// ═══════════════════════════════════════════════
//  VALIDATORS
// ═══════════════════════════════════════════════

export const paymentProviderValidator = v.union(
  v.literal("flutterwave"),
  v.literal("paystack"),
  v.literal("stripe"),
  v.literal("bank_transfer"),
  v.literal("crypto"),
);

export const ticketPriorityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("urgent"),
);

export const ticketCategoryValidator = v.union(
  v.literal("general"),
  v.literal("kyc"),
  v.literal("payment"),
  v.literal("challenge"),
  v.literal("trading"),
  v.literal("withdrawal"),
  v.literal("technical"),
  v.literal("other"),
);

export const notificationTypeValidator = v.union(
  v.literal("payment_received"),
  v.literal("payment_failed"),
  v.literal("kyc_approved"),
  v.literal("kyc_rejected"),
  v.literal("kyc_pending"),
  v.literal("challenge_started"),
  v.literal("challenge_phase_1"),
  v.literal("challenge_phase_2"),
  v.literal("challenge_funded"),
  v.literal("challenge_violated"),
  v.literal("challenge_expired"),
  v.literal("mt5_account_created"),
  v.literal("certificate_issued"),
  v.literal("referral_commission"),
  v.literal("support_reply"),
  v.literal("coupon_applied"),
  v.literal("payout_processed"),
  v.literal("violation_warning"),
  v.literal("system"),
);

export const couponDiscountTypeValidator = v.union(
  v.literal("fixed"),
  v.literal("percentage"),
);

export const challengeViolationValidator = v.object({
  type: v.string(),
  description: v.string(),
  detectedAt: v.number(),
  severity: v.union(v.literal("warning"), v.literal("critical")),
});

// ═══════════════════════════════════════════════
//  SCHEMA DEFINITION
// ═══════════════════════════════════════════════

const schema = defineSchema(
  {
    // ── Auth Tables (from Convex Auth) ──
    ...authTables,

    // ── Users ──
    users: defineTable({
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),
      role: v.optional(roleValidator),

      // Profile fields — locked after KYC
      phone: v.optional(v.string()),
      address: v.optional(v.string()),
      country: v.optional(v.string()),
      tradingExperience: v.optional(v.string()),
      timezone: v.optional(v.string()),
      dateOfBirth: v.optional(v.string()),

      // KYC
      kycStatus: v.optional(kycStatusValidator),
      kycVerifiedAt: v.optional(v.number()),

      // Security
      twoFactorEnabled: v.optional(v.boolean()),
      twoFactorSecret: v.optional(v.string()),
      accountLockedUntil: v.optional(v.number()),
      loginAttempts: v.optional(v.number()),

      // Referral
      referralCode: v.optional(v.string()),
      referredBy: v.optional(v.id("users")),

      // Preferences
      emailNotifications: v.optional(v.boolean()),
      notificationPreferences: v.optional(v.any()),
    })
      .index("email", ["email"])
      .index("referralCode", ["referralCode"])
      .index("kycStatus", ["kycStatus"])
      .index("role", ["role"]),

    // ── Sessions ──
    sessions: defineTable({
      userId: v.id("users"),
      token: v.string(),
      deviceInfo: v.optional(v.string()),
      ipAddress: v.optional(v.string()),
      lastActiveAt: v.number(),
      expiresAt: v.number(),
    })
      .index("userId", ["userId"])
      .index("token", ["token"]),

    // ── Login History ──
    loginHistory: defineTable({
      userId: v.id("users"),
      ipAddress: v.optional(v.string()),
      deviceInfo: v.optional(v.string()),
      location: v.optional(v.string()),
      success: v.boolean(),
      failedReason: v.optional(v.string()),
      timestamp: v.number(),
    })
      .index("userId", ["userId"])
      .index("timestamp", ["timestamp"]),

    // ── Audit Logs ──
    auditLogs: defineTable({
      userId: v.optional(v.id("users")),
      action: v.string(),
      entity: v.string(),
      entityId: v.optional(v.string()),
      details: v.optional(v.string()),
      ipAddress: v.optional(v.string()),
      timestamp: v.number(),
    })
      .index("userId", ["userId"])
      .index("action", ["action"])
      .index("entity", ["entity"])
      .index("timestamp", ["timestamp"]),

    // ── Settings ──
    settings: defineTable({
      key: v.string(),
      value: v.any(),
      group: v.string(),
      description: v.optional(v.string()),
    })
      .index("key", ["key"])
      .index("group", ["group"]),

    // ── Notifications ──
    notifications: defineTable({
      userId: v.id("users"),
      type: notificationTypeValidator,
      title: v.string(),
      message: v.string(),
      read: v.boolean(),
      link: v.optional(v.string()),
      metadata: v.optional(v.any()),
      createdAt: v.number(),
    })
      .index("userId", ["userId", "read"])
      .index("userId_createdAt", ["userId", "createdAt"]),

    // ── KYC Documents ──
    kycDocuments: defineTable({
      userId: v.id("users"),
      documentType: v.union(
        v.literal(DOCUMENT_TYPES.PASSPORT),
        v.literal(DOCUMENT_TYPES.NATIONAL_ID),
        v.literal(DOCUMENT_TYPES.DRIVERS_LICENSE),
        v.literal(DOCUMENT_TYPES.PROOF_OF_ADDRESS),
        v.literal(DOCUMENT_TYPES.SELFIE),
      ),
      fileUrl: v.string(),
      fileHash: v.optional(v.string()),
      status: kycStatusValidator,
      reviewedBy: v.optional(v.id("users")),
      reviewedAt: v.optional(v.number()),
      rejectionReason: v.optional(v.string()),
      notes: v.optional(v.string()),
      uploadedAt: v.number(),
    })
      .index("userId", ["userId"])
      .index("status", ["status"])
      .index("userId_status", ["userId", "status"]),

    // ── Challenge Templates ──
    challengeTemplates: defineTable({
      name: v.string(),
      description: v.optional(v.string()),
      type: challengeTypeValidator,
      isActive: v.boolean(),

      // Rules
      profitTarget: v.number(),
      dailyDrawdown: v.number(),
      maxDrawdown: v.number(),
      maxLeverage: v.number(),
      minTradingDays: v.number(),
      maxTradingDays: v.optional(v.number()),
      maxPositionSize: v.optional(v.number()),
      consistencyTarget: v.optional(v.number()),

      // Restrictions
      allowWeekendHolding: v.boolean(),
      allowNewsTrading: v.boolean(),
      allowEATrading: v.boolean(),
      allowCopyTrading: v.boolean(),

      // Pricing
      price: v.number(),
      currency: v.string(),

      // Duration
      durationDays: v.number(),

      // Fees
      resetFee: v.optional(v.number()),
      extensionFee: v.optional(v.number()),

      // Scaling
      scalingPlan: v.optional(v.string()),
      maxAccountSize: v.optional(v.number()),

      // Metadata
      createdAt: v.number(),
      updatedAt: v.number(),
      createdBy: v.id("users"),
    })
      .index("type", ["type"])
      .index("isActive", ["isActive"]),

    // ── Account Sizes ──
    accountSizes: defineTable({
      label: v.string(),
      size: v.number(),
      currency: v.string(),
      templateId: v.id("challengeTemplates"),
      price: v.number(),
      isActive: v.boolean(),
      sortOrder: v.number(),
    })
      .index("templateId", ["templateId"])
      .index("isActive", ["isActive"]),

    // ── User Challenges ──
    userChallenges: defineTable({
      userId: v.id("users"),
      templateId: v.id("challengeTemplates"),
      accountSizeId: v.id("accountSizes"),
      status: challengeStatusValidator,

      // Challenge config snapshot
      accountSize: v.number(),
      currency: v.string(),
      profitTarget: v.number(),
      dailyDrawdown: v.number(),
      maxDrawdown: v.number(),
      maxLeverage: v.number(),
      minTradingDays: v.number(),
      maxTradingDays: v.optional(v.number()),

      // Timeline
      startedAt: v.optional(v.number()),
      phase1PassedAt: v.optional(v.number()),
      phase2PassedAt: v.optional(v.number()),
      fundedAt: v.optional(v.number()),
      expiresAt: v.optional(v.number()),

      // Payment
      paymentId: v.optional(v.id("payments")),
      amountPaid: v.number(),

      // Violations
      violations: v.optional(v.array(challengeViolationValidator)),

      // MT5
      mt5AccountId: v.optional(v.id("mt5Accounts")),

      // Tracking
      currentPhase: v.optional(v.union(v.literal(1), v.literal(2))),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("userId", ["userId"])
      .index("status", ["status"])
      .index("templateId", ["templateId"])
      .index("userId_status", ["userId", "status"]),

    // ── Funded Accounts ──
    fundedAccounts: defineTable({
      userId: v.id("users"),
      challengeId: v.id("userChallenges"),
      mt5AccountId: v.id("mt5Accounts"),
      accountSize: v.number(),
      currency: v.string(),
      profitSharePercent: v.number(),
      isActive: v.boolean(),
      activatedAt: v.number(),
      terminatedAt: v.optional(v.number()),
      terminationReason: v.optional(v.string()),
      totalPayouts: v.optional(v.number()),
      lastPayoutAt: v.optional(v.number()),
    })
      .index("userId", ["userId"])
      .index("challengeId", ["challengeId"])
      .index("isActive", ["isActive"]),

    // ── MT5 Accounts ──
    mt5Accounts: defineTable({
      userId: v.id("users"),
      login: v.string(),
      password: v.string(),
      investorPassword: v.string(),
      server: v.string(),
      group: v.string(),
      leverage: v.number(),
      balance: v.number(),
      equity: v.number(),
      currency: v.string(),
      isActive: v.boolean(),
      isSuspended: v.boolean(),
      lastSyncAt: v.optional(v.number()),
      createdAt: v.number(),
      metadata: v.optional(v.any()),
    })
      .index("userId", ["userId"])
      .index("login", ["login"])
      .index("isActive", ["isActive"]),

    // ── Trading Metrics ──
    tradingMetrics: defineTable({
      mt5AccountId: v.id("mt5Accounts"),
      challengeId: v.id("userChallenges"),

      // Current metrics
      balance: v.number(),
      equity: v.number(),
      floatingPL: v.number(),
      dailyPL: v.number(),
      totalProfit: v.number(),
      currentDrawdown: v.number(),
      dailyDrawdown: v.number(),
      trailingDrawdown: v.number(),
      relativeDrawdown: v.number(),
      absoluteDrawdown: v.number(),
      remainingDrawdown: v.number(),
      profitTargetProgress: v.number(),
      tradingDaysCount: v.number(),

      // Stats
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
      riskScore: v.optional(v.number()),
      healthScore: v.optional(v.number()),

      recordedAt: v.number(),
    })
      .index("mt5AccountId", ["mt5AccountId"])
      .index("challengeId", ["challengeId"])
      .index("recordedAt", ["recordedAt"]),

    // ── Drawdown History ──
    drawdownHistory: defineTable({
      challengeId: v.id("userChallenges"),
      mt5AccountId: v.id("mt5Accounts"),
      balance: v.number(),
      equity: v.number(),
      drawdown: v.number(),
      dailyDrawdown: v.number(),
      peakBalance: v.number(),
      recordedAt: v.number(),
    })
      .index("challengeId", ["challengeId"])
      .index("mt5AccountId", ["mt5AccountId", "recordedAt"]),

    // ── Payments ──
    payments: defineTable({
      userId: v.id("users"),
      amount: v.number(),
      currency: v.string(),
      provider: paymentProviderValidator,
      status: v.union(
        v.literal(PAYMENT_STATUS.PENDING),
        v.literal(PAYMENT_STATUS.COMPLETED),
        v.literal(PAYMENT_STATUS.FAILED),
        v.literal(PAYMENT_STATUS.REFUNDED),
      ),
      reference: v.string(),
      description: v.optional(v.string()),
      metadata: v.optional(v.any()),

      // Challenge linking
      challengeId: v.optional(v.id("userChallenges")),
      templateId: v.optional(v.id("challengeTemplates")),
      accountSizeId: v.optional(v.id("accountSizes")),

      // Invoice
      invoiceUrl: v.optional(v.string()),

      createdAt: v.number(),
      completedAt: v.optional(v.number()),
    })
      .index("userId", ["userId"])
      .index("reference", ["reference"])
      .index("status", ["status"])
      .index("provider", ["provider"]),

    // ── Payment Logs ──
    paymentLogs: defineTable({
      paymentId: v.id("payments"),
      provider: paymentProviderValidator,
      event: v.string(),
      data: v.any(),
      ipAddress: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("paymentId", ["paymentId"])
      .index("event", ["event"]),

    // ── Flutterwave Transactions ──
    flutterwaveTransactions: defineTable({
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
      createdAt: v.number(),
      verifiedAt: v.optional(v.number()),
    })
      .index("paymentId", ["paymentId"])
      .index("transactionId", ["transactionId"])
      .index("flwRef", ["flwRef"]),

    // ── Paystack Transactions ──
    paystackTransactions: defineTable({
      paymentId: v.id("payments"),
      reference: v.string(),
      transactionId: v.string(),
      status: v.string(),
      amount: v.number(),
      currency: v.string(),
      fees: v.optional(v.number()),
      customerEmail: v.string(),
      authorization: v.optional(v.any()),
      createdAt: v.number(),
      verifiedAt: v.optional(v.number()),
    })
      .index("paymentId", ["paymentId"])
      .index("reference", ["reference"]),

    // ── Wallets ──
    wallets: defineTable({
      userId: v.id("users"),
      balance: v.number(),
      referralBalance: v.number(),
      bonusBalance: v.number(),
      currency: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("userId", ["userId"]),

    // ── Wallet Transactions ──
    walletTransactions: defineTable({
      walletId: v.id("wallets"),
      userId: v.id("users"),
      type: v.union(
        v.literal(WALLET_TRANSACTION_TYPES.DEPOSIT),
        v.literal(WALLET_TRANSACTION_TYPES.WITHDRAWAL),
        v.literal(WALLET_TRANSACTION_TYPES.REFUND),
        v.literal(WALLET_TRANSACTION_TYPES.CREDIT),
        v.literal(WALLET_TRANSACTION_TYPES.REFERRAL_BONUS),
        v.literal(WALLET_TRANSACTION_TYPES.CHALLENGE_PURCHASE),
        v.literal(WALLET_TRANSACTION_TYPES.COMMISSION),
        v.literal(WALLET_TRANSACTION_TYPES.RESET_FEE),
      ),
      amount: v.number(),
      balanceBefore: v.number(),
      balanceAfter: v.number(),
      description: v.string(),
      reference: v.optional(v.string()),
      paymentId: v.optional(v.id("payments")),
      metadata: v.optional(v.any()),
      createdAt: v.number(),
    })
      .index("walletId", ["walletId"])
      .index("userId", ["userId"])
      .index("type", ["type"])
      .index("createdAt", ["createdAt"]),

    // ── Affiliates ──
    affiliates: defineTable({
      userId: v.id("users"),
      referralCode: v.string(),
      totalReferrals: v.number(),
      activeReferrals: v.number(),
      totalCommissions: v.number(),
      pendingCommissions: v.number(),
      paidCommissions: v.number(),
      commissionRate: v.number(),
      commissionLevels: v.optional(v.number()),
      isActive: v.boolean(),
      joinedAt: v.number(),
    })
      .index("userId", ["userId"])
      .index("referralCode", ["referralCode"]),

    // ── Referrals ──
    referrals: defineTable({
      referrerId: v.id("users"),
      referredId: v.id("users"),
      affiliateId: v.id("affiliates"),
      status: v.union(
        v.literal("pending"),
        v.literal("active"),
        v.literal("converted"),
      ),
      commissionEarned: v.optional(v.number()),
      convertedAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("referrerId", ["referrerId"])
      .index("referredId", ["referredId"])
      .index("status", ["status"]),

    // ── Commissions ──
    commissions: defineTable({
      affiliateId: v.id("affiliates"),
      userId: v.id("users"),
      referralId: v.id("referrals"),
      amount: v.number(),
      level: v.number(),
      status: v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("paid"),
        v.literal("cancelled"),
      ),
      source: v.string(),
      description: v.string(),
      createdAt: v.number(),
      paidAt: v.optional(v.number()),
    })
      .index("affiliateId", ["affiliateId"])
      .index("userId", ["userId"])
      .index("status", ["status"]),

    // ── Commission Payouts ──
    commissionPayouts: defineTable({
      userId: v.id("users"),
      affiliateId: v.id("affiliates"),
      amount: v.number(),
      currency: v.string(),
      status: v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("paid"),
        v.literal("rejected"),
      ),
      paymentMethod: v.optional(v.string()),
      paymentDetails: v.optional(v.string()),
      processedBy: v.optional(v.id("users")),
      notes: v.optional(v.string()),
      requestedAt: v.number(),
      processedAt: v.optional(v.number()),
    })
      .index("userId", ["userId"])
      .index("status", ["status"]),

    // ── Profit Payouts (Funded Trader Withdrawals) ──
    profitPayouts: defineTable({
      userId: v.id("users"),
      fundedAccountId: v.id("fundedAccounts"),
      challengeId: v.id("userChallenges"),
      amount: v.number(),
      currency: v.string(),
      status: v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("paid"),
        v.literal("rejected"),
      ),
      paymentMethod: v.string(),
      paymentDetails: v.string(),
      processedBy: v.optional(v.id("users")),
      notes: v.optional(v.string()),
      rejectionReason: v.optional(v.string()),
      requestedAt: v.number(),
      processedAt: v.optional(v.number()),
    })
      .index("userId", ["userId"])
      .index("status", ["status"])
      .index("fundedAccountId", ["fundedAccountId"])
      .index("challengeId", ["challengeId"]),

    // ── Coupons ──
    coupons: defineTable({
      code: v.string(),
      discountType: couponDiscountTypeValidator,
      discountValue: v.number(),
      minPurchaseAmount: v.optional(v.number()),
      maxUses: v.optional(v.number()),
      currentUses: v.number(),
      maxUsesPerUser: v.optional(v.number()),
      isActive: v.boolean(),
      expiresAt: v.optional(v.number()),
      description: v.optional(v.string()),
      templateIds: v.optional(v.array(v.id("challengeTemplates"))),
      createdBy: v.id("users"),
      createdAt: v.number(),
    })
      .index("code", ["code"])
      .index("isActive", ["isActive"]),

    // ── Coupon Redemptions ──
    couponRedemptions: defineTable({
      couponId: v.id("coupons"),
      userId: v.id("users"),
      paymentId: v.id("payments"),
      discountAmount: v.number(),
      originalAmount: v.number(),
      redeemedAt: v.number(),
    })
      .index("couponId", ["couponId"])
      .index("userId", ["userId"]),

    // ── Certificates ──
    certificates: defineTable({
      userId: v.id("users"),
      challengeId: v.id("userChallenges"),
      type: v.union(
        v.literal("phase_1"),
        v.literal("phase_2"),
        v.literal("funded"),
      ),
      certificateNumber: v.string(),
      verificationCode: v.string(),
      certificateUrl: v.optional(v.string()),
      issuedAt: v.number(),
      issuedBy: v.optional(v.id("users")),
    })
      .index("userId", ["userId"])
      .index("challengeId", ["challengeId"])
      .index("certificateNumber", ["certificateNumber"])
      .index("verificationCode", ["verificationCode"]),

    // ── Certificate Verifications ──
    certificateVerifications: defineTable({
      certificateId: v.id("certificates"),
      verifiedBy: v.optional(v.id("users")),
      ipAddress: v.optional(v.string()),
      verifiedAt: v.number(),
    })
      .index("certificateId", ["certificateId"]),

    // ── Support Tickets ──
    supportTickets: defineTable({
      userId: v.id("users"),
      subject: v.string(),
      category: ticketCategoryValidator,
      priority: ticketPriorityValidator,
      status: v.union(
        v.literal(TICKET_STATUS.OPEN),
        v.literal(TICKET_STATUS.PENDING),
        v.literal(TICKET_STATUS.WAITING_ON_CUSTOMER),
        v.literal(TICKET_STATUS.RESOLVED),
        v.literal(TICKET_STATUS.CLOSED),
      ),
      assignedTo: v.optional(v.id("users")),
      attachments: v.optional(v.array(v.string())),
      createdAt: v.number(),
      updatedAt: v.number(),
      resolvedAt: v.optional(v.number()),
    })
      .index("userId", ["userId"])
      .index("status", ["status"])
      .index("assignedTo", ["assignedTo"])
      .index("priority", ["priority"]),

    // ── Support Ticket Messages ──
    supportTicketMessages: defineTable({
      ticketId: v.id("supportTickets"),
      userId: v.id("users"),
      message: v.string(),
      isInternal: v.optional(v.boolean()),
      attachments: v.optional(v.array(v.string())),
      createdAt: v.number(),
    })
      .index("ticketId", ["ticketId", "createdAt"]),

    // ── Roles (for custom RBAC) ──
    roles: defineTable({
      name: v.string(),
      description: v.optional(v.string()),
      permissions: v.array(v.string()),
      isSystem: v.boolean(),
      parentRoleId: v.optional(v.id("roles")),
      createdAt: v.number(),
    })
      .index("name", ["name"]),

    // ── User Roles (many-to-many) ──
    userRoles: defineTable({
      userId: v.id("users"),
      roleId: v.id("roles"),
      assignedBy: v.id("users"),
      assignedAt: v.number(),
    })
      .index("userId", ["userId"])
      .index("roleId", ["roleId"]),

    // ── Activity Logs ──
    activityLogs: defineTable({
      userId: v.id("users"),
      activity: v.string(),
      details: v.optional(v.string()),
      ipAddress: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      timestamp: v.number(),
    })
      .index("userId", ["userId", "timestamp"]),

    // ── MT5 Sync Queue ──
    mt5SyncQueue: defineTable({
      mt5AccountId: v.id("mt5Accounts"),
      action: v.union(
        v.literal("sync"),
        v.literal("create"),
        v.literal("update"),
        v.literal("delete"),
        v.literal("suspend"),
        v.literal("activate"),
        v.literal("reset_password"),
      ),
      status: v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
      ),
      payload: v.optional(v.any()),
      error: v.optional(v.string()),
      retryCount: v.number(),
      maxRetries: v.number(),
      createdAt: v.number(),
      processedAt: v.optional(v.number()),
    })
      .index("mt5AccountId", ["mt5AccountId"])
      .index("status", ["status"]),
  },
);

export default schema;
