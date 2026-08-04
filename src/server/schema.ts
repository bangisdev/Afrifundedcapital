import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

// ═══════════════════════════════════════════════
//  ENUMS
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

export const CHALLENGE_TYPES = {
  ONE_STEP: "one_step",
  TWO_STEP: "two_step",
  INSTANT_FUNDING: "instant_funding",
  EVALUATION: "evaluation",
} as const;

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

export const KYC_STATUS = {
  UNVERIFIED: "unverified",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

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

export const PAYOUT_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  PAID: "paid",
  REJECTED: "rejected",
} as const;

export const WALLET_TX_TYPES = {
  DEPOSIT: "deposit",
  WITHDRAWAL: "withdrawal",
  REFUND: "refund",
  CREDIT: "credit",
  REFERRAL_BONUS: "referral_bonus",
  CHALLENGE_PURCHASE: "challenge_purchase",
  COMMISSION: "commission",
  RESET_FEE: "reset_fee",
} as const;

export const COMMISSION_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  PAID: "paid",
  CANCELLED: "cancelled",
} as const;

export const CERTIFICATE_TYPES = {
  PHASE_1: "phase_1",
  PHASE_2: "phase_2",
  FUNDED: "funded",
} as const;

// ═══════════════════════════════════════════════
//  TABLES
// ═══════════════════════════════════════════════

// Users
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name"),
    email: text("email").unique(),
    emailVerified: integer("email_verified", { mode: "boolean" }).default(false),
    image: text("image"),
    isAnonymous: integer("is_anonymous", { mode: "boolean" }).default(false),
    role: text("role").default(ROLES.USER),

    // Profile
    phone: text("phone"),
    address: text("address"),
    country: text("country"),
    tradingExperience: text("trading_experience"),
    timezone: text("timezone"),
    dateOfBirth: text("date_of_birth"),

    // KYC
    kycStatus: text("kyc_status").default(KYC_STATUS.UNVERIFIED),
    kycVerifiedAt: integer("kyc_verified_at"),

    // Security
    twoFactorEnabled: integer("two_factor_enabled", { mode: "boolean" }).default(false),
    twoFactorSecret: text("two_factor_secret"),
    accountLockedUntil: integer("account_locked_until"),
    loginAttempts: integer("login_attempts").default(0),

    // Referral
    referralCode: text("referral_code").unique(),
    referredBy: integer("referred_by"),

    // Preferences
    emailNotifications: integer("email_notifications", { mode: "boolean" }).default(true),
    notificationPreferences: text("notification_preferences"), // JSON string

    // Onboarding
    onboardingComplete: integer("onboarding_complete", { mode: "boolean" }).default(false),

    // Demo
    isDemoSeeded: integer("is_demo_seeded", { mode: "boolean" }).default(false),

    createdAt: integer("created_at").default(Date.now()),
    updatedAt: integer("updated_at").default(Date.now()),
  },
  (table) => [index("idx_users_email").on(table.email), index("idx_users_role").on(table.role), index("idx_users_kyc").on(table.kycStatus), index("idx_users_ref_code").on(table.referralCode)],
);

// Better Auth tables (handled by better-auth, but we need sessions)
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id").notNull(),
    token: text("token").notNull(),
    deviceInfo: text("device_info"),
    ipAddress: text("ip_address"),
    lastActiveAt: integer("last_active_at"),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at"),
    updatedAt: integer("updated_at"),
  },
  (table) => [index("idx_sessions_user_id").on(table.userId), index("idx_sessions_token").on(table.token)],
);

// Login History
export const loginHistory = sqliteTable(
  "login_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    ipAddress: text("ip_address"),
    deviceInfo: text("device_info"),
    location: text("location"),
    success: integer("success", { mode: "boolean" }).notNull(),
    failedReason: text("failed_reason"),
    timestamp: integer("timestamp").notNull(),
  },
  (table) => [index("idx_login_history_user_id").on(table.userId), index("idx_login_history_ts").on(table.timestamp)],
);

// Audit Logs
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    details: text("details"),
    ipAddress: text("ip_address"),
    timestamp: integer("timestamp").notNull(),
  },
  (table) => [index("idx_audit_user_id").on(table.userId), index("idx_audit_action").on(table.action), index("idx_audit_entity").on(table.entity)],
);

// Settings
export const settings = sqliteTable(
  "settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    key: text("key").notNull().unique(),
    value: text("value").notNull(), // JSON
    group: text("group").notNull(),
    description: text("description"),
  },
  (table) => [index("idx_settings_key").on(table.key), index("idx_settings_group").on(table.group)],
);

// Notifications
export const notifications = sqliteTable(
  "notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    read: integer("read", { mode: "boolean" }).default(false),
    link: text("link"),
    metadata: text("metadata"), // JSON
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_notif_user_read").on(table.userId, table.read), index("idx_notif_user_ts").on(table.userId, table.createdAt)],
);

// KYC Documents
export const kycDocuments = sqliteTable(
  "kyc_documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    documentType: text("document_type").notNull(),
    fileUrl: text("file_url").notNull(),
    fileHash: text("file_hash"),
    status: text("status").default(KYC_STATUS.UNVERIFIED),
    reviewedBy: integer("reviewed_by"),
    reviewedAt: integer("reviewed_at"),
    rejectionReason: text("rejection_reason"),
    notes: text("notes"),
    uploadedAt: integer("uploaded_at").notNull(),
  },
  (table) => [index("idx_kyc_user_id").on(table.userId), index("idx_kyc_status").on(table.status), index("idx_kyc_user_status").on(table.userId, table.status)],
);

// Challenge Templates
export const challengeTemplates = sqliteTable(
  "challenge_templates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).default(true),

    profitTarget: real("profit_target").notNull(),
    dailyDrawdown: real("daily_drawdown").notNull(),
    maxDrawdown: real("max_drawdown").notNull(),
    maxLeverage: integer("max_leverage").notNull(),
    minTradingDays: integer("min_trading_days").notNull(),
    maxTradingDays: integer("max_trading_days"),
    maxPositionSize: real("max_position_size"),
    consistencyTarget: real("consistency_target"),

    allowWeekendHolding: integer("allow_weekend_holding", { mode: "boolean" }).default(false),
    allowNewsTrading: integer("allow_news_trading", { mode: "boolean" }).default(true),
    allowEATrading: integer("allow_ea_trading", { mode: "boolean" }).default(true),
    allowCopyTrading: integer("allow_copy_trading", { mode: "boolean" }).default(false),

    price: real("price").notNull(),
    currency: text("currency").notNull().default("NGN"),
    durationDays: integer("duration_days").notNull(),
    resetFee: real("reset_fee"),
    extensionFee: real("extension_fee"),
    scalingPlan: text("scaling_plan"),
    maxAccountSize: real("max_account_size"),

    createdBy: integer("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("idx_ct_type").on(table.type), index("idx_ct_active").on(table.isActive)],
);

// Account Sizes
export const accountSizes = sqliteTable(
  "account_sizes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    label: text("label").notNull(),
    size: real("size").notNull(),
    currency: text("currency").notNull().default("NGN"),
    templateId: integer("template_id").notNull(),
    price: real("price").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("idx_as_template").on(table.templateId), index("idx_as_active").on(table.isActive)],
);

// User Challenges
export const userChallenges = sqliteTable(
  "user_challenges",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    templateId: integer("template_id").notNull(),
    accountSizeId: integer("account_size_id").notNull(),
    status: text("status").notNull().default(CHALLENGE_STATUS.PENDING),

    accountSize: real("account_size").notNull(),
    currency: text("currency").notNull().default("NGN"),
    profitTarget: real("profit_target").notNull(),
    dailyDrawdown: real("daily_drawdown").notNull(),
    maxDrawdown: real("max_drawdown").notNull(),
    maxLeverage: integer("max_leverage").notNull(),
    minTradingDays: integer("min_trading_days").notNull(),
    maxTradingDays: integer("max_trading_days"),

    startedAt: integer("started_at"),
    phase1PassedAt: integer("phase_1_passed_at"),
    phase2PassedAt: integer("phase_2_passed_at"),
    fundedAt: integer("funded_at"),
    expiresAt: integer("expires_at"),

    paymentId: integer("payment_id"),
    amountPaid: real("amount_paid").notNull(),

    violations: text("violations"), // JSON array
    mt5AccountId: integer("mt5_account_id"),

    currentPhase: integer("current_phase"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("idx_uc_user").on(table.userId), index("idx_uc_status").on(table.status), index("idx_uc_template").on(table.templateId), index("idx_uc_user_status").on(table.userId, table.status)],
);

// Funded Accounts
export const fundedAccounts = sqliteTable(
  "funded_accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    challengeId: integer("challenge_id").notNull(),
    mt5AccountId: integer("mt5_account_id").notNull(),
    accountSize: real("account_size").notNull(),
    currency: text("currency").notNull().default("NGN"),
    profitSharePercent: real("profit_share_percent").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    activatedAt: integer("activated_at").notNull(),
    terminatedAt: integer("terminated_at"),
    terminationReason: text("termination_reason"),
    totalPayouts: real("total_payouts").default(0),
    lastPayoutAt: integer("last_payout_at"),
  },
  (table) => [index("idx_fa_user").on(table.userId), index("idx_fa_challenge").on(table.challengeId), index("idx_fa_active").on(table.isActive)],
);

// MT5 Accounts
export const mt5Accounts = sqliteTable(
  "mt5_accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    login: text("login").notNull().unique(),
    password: text("password").notNull(),
    investorPassword: text("investor_password").notNull(),
    server: text("server").notNull().default("AfriFundedCapital-Demo"),
    group: text("group").notNull().default("DEMO\\AFC"),
    leverage: integer("leverage").notNull().default(100),
    balance: real("balance").notNull().default(0),
    equity: real("equity").notNull().default(0),
    currency: text("currency").notNull().default("NGN"),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    isSuspended: integer("is_suspended", { mode: "boolean" }).default(false),
    lastSyncAt: integer("last_sync_at"),
    createdAt: integer("created_at").notNull(),
    metadata: text("metadata"), // JSON
  },
  (table) => [index("idx_mt5_user").on(table.userId), index("idx_mt5_active").on(table.isActive), index("idx_mt5_login").on(table.login)],
);

// Trading Metrics
export const tradingMetrics = sqliteTable(
  "trading_metrics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mt5AccountId: integer("mt5_account_id").notNull(),
    challengeId: integer("challenge_id").notNull(),

    balance: real("balance").notNull(),
    equity: real("equity").notNull(),
    floatingPL: real("floating_pl").notNull(),
    dailyPL: real("daily_pl").notNull(),
    totalProfit: real("total_profit").notNull(),
    currentDrawdown: real("current_drawdown").notNull(),
    dailyDrawdown: real("daily_drawdown").notNull(),
    trailingDrawdown: real("trailing_drawdown").notNull(),
    relativeDrawdown: real("relative_drawdown").notNull(),
    absoluteDrawdown: real("absolute_drawdown").notNull(),
    remainingDrawdown: real("remaining_drawdown").notNull(),
    profitTargetProgress: real("profit_target_progress").notNull(),
    tradingDaysCount: integer("trading_days_count").notNull(),

    openPositions: integer("open_positions").notNull(),
    closedTrades: integer("closed_trades").notNull(),
    winRate: real("win_rate"),
    lossRate: real("loss_rate"),
    averageRR: real("average_rr"),
    profitFactor: real("profit_factor"),
    expectancy: real("expectancy"),
    largestWin: real("largest_win"),
    largestLoss: real("largest_loss"),
    consecutiveWins: integer("consecutive_wins"),
    consecutiveLosses: integer("consecutive_losses"),
    riskScore: real("risk_score"),
    healthScore: real("health_score"),

    recordedAt: integer("recorded_at").notNull(),
  },
  (table) => [index("idx_tm_mt5").on(table.mt5AccountId), index("idx_tm_challenge").on(table.challengeId), index("idx_tm_recorded").on(table.recordedAt)],
);

// Drawdown History
export const drawdownHistory = sqliteTable(
  "drawdown_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    challengeId: integer("challenge_id").notNull(),
    mt5AccountId: integer("mt5_account_id").notNull(),
    balance: real("balance").notNull(),
    equity: real("equity").notNull(),
    drawdown: real("drawdown").notNull(),
    dailyDrawdown: real("daily_drawdown").notNull(),
    peakBalance: real("peak_balance").notNull(),
    recordedAt: integer("recorded_at").notNull(),
  },
  (table) => [index("idx_dd_challenge").on(table.challengeId), index("idx_dd_mt5").on(table.mt5AccountId, table.recordedAt)],
);

// Payments
export const payments = sqliteTable(
  "payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    amount: real("amount").notNull(),
    currency: text("currency").notNull().default("NGN"),
    provider: text("provider").notNull(),
    status: text("status").notNull().default(PAYMENT_STATUS.PENDING),
    reference: text("reference").notNull().unique(),
    description: text("description"),
    metadata: text("metadata"), // JSON

    challengeId: integer("challenge_id"),
    templateId: integer("template_id"),
    accountSizeId: integer("account_size_id"),

    invoiceUrl: text("invoice_url"),
    createdAt: integer("created_at").notNull(),
    completedAt: integer("completed_at"),
  },
  (table) => [index("idx_pay_user").on(table.userId), index("idx_pay_ref").on(table.reference), index("idx_pay_status").on(table.status), index("idx_pay_provider").on(table.provider)],
);

// Payment Logs
export const paymentLogs = sqliteTable(
  "payment_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    paymentId: integer("payment_id").notNull(),
    provider: text("provider").notNull(),
    event: text("event").notNull(),
    data: text("data"), // JSON
    ipAddress: text("ip_address"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_pl_payment").on(table.paymentId), index("idx_pl_event").on(table.event)],
);

// Flutterwave Transactions
export const flutterwaveTransactions = sqliteTable(
  "flutterwave_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    paymentId: integer("payment_id").notNull(),
    transactionId: text("transaction_id").notNull(),
    flwRef: text("flw_ref").notNull(),
    status: text("status").notNull(),
    amount: real("amount").notNull(),
    currency: text("currency").notNull(),
    chargedAmount: real("charged_amount").notNull(),
    processorResponse: text("processor_response").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerName: text("customer_name"),
    paymentType: text("payment_type").notNull(),
    createdAt: integer("created_at").notNull(),
    verifiedAt: integer("verified_at"),
  },
  (table) => [index("idx_flw_payment").on(table.paymentId), index("idx_flw_tx_id").on(table.transactionId), index("idx_flw_ref").on(table.flwRef)],
);

// Paystack Transactions
export const paystackTransactions = sqliteTable(
  "paystack_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    paymentId: integer("payment_id").notNull(),
    reference: text("reference").notNull(),
    transactionId: text("transaction_id").notNull(),
    status: text("status").notNull(),
    amount: real("amount").notNull(),
    currency: text("currency").notNull(),
    fees: real("fees"),
    customerEmail: text("customer_email").notNull(),
    authorization: text("authorization"), // JSON
    createdAt: integer("created_at").notNull(),
    verifiedAt: integer("verified_at"),
  },
  (table) => [index("idx_pst_payment").on(table.paymentId), index("idx_pst_ref").on(table.reference)],
);

// Wallets
export const wallets = sqliteTable(
  "wallets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().unique(),
    balance: real("balance").notNull().default(0),
    referralBalance: real("referral_balance").notNull().default(0),
    bonusBalance: real("bonus_balance").notNull().default(0),
    currency: text("currency").notNull().default("NGN"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("idx_wallet_user").on(table.userId)],
);

// Wallet Transactions
export const walletTransactions = sqliteTable(
  "wallet_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    walletId: integer("wallet_id").notNull(),
    userId: integer("user_id").notNull(),
    type: text("type").notNull(),
    amount: real("amount").notNull(),
    balanceBefore: real("balance_before").notNull(),
    balanceAfter: real("balance_after").notNull(),
    description: text("description").notNull(),
    reference: text("reference"),
    paymentId: integer("payment_id"),
    metadata: text("metadata"), // JSON
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_wtx_wallet").on(table.walletId), index("idx_wtx_user").on(table.userId), index("idx_wtx_type").on(table.type), index("idx_wtx_created").on(table.createdAt)],
);

// Affiliates
export const affiliates = sqliteTable(
  "affiliates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().unique(),
    referralCode: text("referral_code").notNull().unique(),
    totalReferrals: integer("total_referrals").notNull().default(0),
    activeReferrals: integer("active_referrals").notNull().default(0),
    totalCommissions: real("total_commissions").notNull().default(0),
    pendingCommissions: real("pending_commissions").notNull().default(0),
    paidCommissions: real("paid_commissions").notNull().default(0),
    commissionRate: real("commission_rate").notNull().default(0.1),
    commissionLevels: integer("commission_levels").default(0),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    joinedAt: integer("joined_at").notNull(),
  },
  (table) => [index("idx_aff_user").on(table.userId), index("idx_aff_code").on(table.referralCode)],
);

// Referrals
export const referrals = sqliteTable(
  "referrals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    referrerId: integer("referrer_id").notNull(),
    referredId: integer("referred_id").notNull().unique(),
    affiliateId: integer("affiliate_id").notNull(),
    status: text("status").notNull().default("pending"),
    commissionEarned: real("commission_earned"),
    convertedAt: integer("converted_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_ref_referrer").on(table.referrerId), index("idx_ref_referred").on(table.referredId), index("idx_ref_status").on(table.status)],
);

// Commissions
export const commissions = sqliteTable(
  "commissions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    affiliateId: integer("affiliate_id").notNull(),
    userId: integer("user_id").notNull(),
    referralId: integer("referral_id").notNull(),
    amount: real("amount").notNull(),
    level: integer("level").notNull().default(1),
    status: text("status").notNull().default(COMMISSION_STATUS.PENDING),
    source: text("source").notNull(),
    description: text("description").notNull(),
    createdAt: integer("created_at").notNull(),
    paidAt: integer("paid_at"),
  },
  (table) => [index("idx_comm_affiliate").on(table.affiliateId), index("idx_comm_user").on(table.userId), index("idx_comm_status").on(table.status)],
);

// Commission Payouts
export const commissionPayouts = sqliteTable(
  "commission_payouts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    affiliateId: integer("affiliate_id").notNull(),
    amount: real("amount").notNull(),
    currency: text("currency").notNull().default("NGN"),
    status: text("status").notNull().default(PAYOUT_STATUS.PENDING),
    paymentMethod: text("payment_method"),
    paymentDetails: text("payment_details"),
    processedBy: integer("processed_by"),
    notes: text("notes"),
    requestedAt: integer("requested_at").notNull(),
    processedAt: integer("processed_at"),
  },
  (table) => [index("idx_cp_user").on(table.userId), index("idx_cp_status").on(table.status)],
);

// Profit Payouts
export const profitPayouts = sqliteTable(
  "profit_payouts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    fundedAccountId: integer("funded_account_id").notNull(),
    challengeId: integer("challenge_id").notNull(),
    amount: real("amount").notNull(),
    currency: text("currency").notNull().default("NGN"),
    status: text("status").notNull().default(PAYOUT_STATUS.PENDING),
    paymentMethod: text("payment_method").notNull(),
    paymentDetails: text("payment_details").notNull(),
    processedBy: integer("processed_by"),
    notes: text("notes"),
    rejectionReason: text("rejection_reason"),
    requestedAt: integer("requested_at").notNull(),
    processedAt: integer("processed_at"),
  },
  (table) => [index("idx_pp_user").on(table.userId), index("idx_pp_status").on(table.status), index("idx_pp_funding").on(table.fundedAccountId), index("idx_pp_challenge").on(table.challengeId)],
);

// Coupons
export const coupons = sqliteTable(
  "coupons",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull().unique(),
    discountType: text("discount_type").notNull(),
    discountValue: real("discount_value").notNull(),
    minPurchaseAmount: real("min_purchase_amount"),
    maxUses: integer("max_uses"),
    currentUses: integer("current_uses").notNull().default(0),
    maxUsesPerUser: integer("max_uses_per_user"),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    expiresAt: integer("expires_at"),
    description: text("description"),
    templateIds: text("template_ids"), // JSON array
    createdBy: integer("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_coupon_code").on(table.code), index("idx_coupon_active").on(table.isActive)],
);

// Coupon Redemptions
export const couponRedemptions = sqliteTable(
  "coupon_redemptions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    couponId: integer("coupon_id").notNull(),
    userId: integer("user_id").notNull(),
    paymentId: integer("payment_id").notNull(),
    discountAmount: real("discount_amount").notNull(),
    originalAmount: real("original_amount").notNull(),
    redeemedAt: integer("redeemed_at").notNull(),
  },
  (table) => [index("idx_cr_coupon").on(table.couponId), index("idx_cr_user").on(table.userId)],
);

// Certificates
export const certificates = sqliteTable(
  "certificates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    challengeId: integer("challenge_id").notNull(),
    type: text("type").notNull(),
    certificateNumber: text("certificate_number").notNull().unique(),
    verificationCode: text("verification_code").notNull().unique(),
    certificateUrl: text("certificate_url"),
    issuedAt: integer("issued_at").notNull(),
    issuedBy: integer("issued_by"),
  },
  (table) => [index("idx_cert_user").on(table.userId), index("idx_cert_challenge").on(table.challengeId), index("idx_cert_number").on(table.certificateNumber), index("idx_cert_verification").on(table.verificationCode)],
);

// Certificate Verifications
export const certificateVerifications = sqliteTable(
  "certificate_verifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    certificateId: integer("certificate_id").notNull(),
    verifiedBy: integer("verified_by"),
    ipAddress: text("ip_address"),
    verifiedAt: integer("verified_at").notNull(),
  },
  (table) => [index("idx_cv_certificate").on(table.certificateId)],
);

// Support Tickets
export const supportTickets = sqliteTable(
  "support_tickets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    subject: text("subject").notNull(),
    category: text("category").notNull(),
    priority: text("priority").notNull().default("medium"),
    status: text("status").notNull().default(TICKET_STATUS.OPEN),
    assignedTo: integer("assigned_to"),
    attachments: text("attachments"), // JSON array
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    resolvedAt: integer("resolved_at"),
  },
  (table) => [index("idx_st_user").on(table.userId), index("idx_st_status").on(table.status), index("idx_st_assigned").on(table.assignedTo), index("idx_st_priority").on(table.priority)],
);

// Support Ticket Messages
export const supportTicketMessages = sqliteTable(
  "support_ticket_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticketId: integer("ticket_id").notNull(),
    userId: integer("user_id").notNull(),
    message: text("message").notNull(),
    isInternal: integer("is_internal", { mode: "boolean" }).default(false),
    attachments: text("attachments"), // JSON array
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_stm_ticket").on(table.ticketId, table.createdAt)],
);

// Roles
export const roles = sqliteTable(
  "roles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull().unique(),
    description: text("description"),
    permissions: text("permissions").notNull(), // JSON array
    isSystem: integer("is_system", { mode: "boolean" }).default(false),
    parentRoleId: integer("parent_role_id"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_role_name").on(table.name)],
);

// User Roles
export const userRoles = sqliteTable(
  "user_roles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    roleId: integer("role_id").notNull(),
    assignedBy: integer("assigned_by").notNull(),
    assignedAt: integer("assigned_at").notNull(),
  },
  (table) => [index("idx_ur_user").on(table.userId), index("idx_ur_role").on(table.roleId)],
);

// Activity Logs
export const activityLogs = sqliteTable(
  "activity_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    activity: text("activity").notNull(),
    details: text("details"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    timestamp: integer("timestamp").notNull(),
  },
  (table) => [index("idx_al_user").on(table.userId, table.timestamp)],
);

// MT5 Sync Queue
export const mt5SyncQueue = sqliteTable(
  "mt5_sync_queue",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mt5AccountId: integer("mt5_account_id").notNull(),
    action: text("action").notNull(),
    status: text("status").notNull().default("pending"),
    payload: text("payload"), // JSON
    error: text("error"),
    retryCount: integer("retry_count").notNull().default(0),
    maxRetries: integer("max_retries").notNull().default(3),
    createdAt: integer("created_at").notNull(),
    processedAt: integer("processed_at"),
  },
  (table) => [index("idx_msq_mt5").on(table.mt5AccountId), index("idx_msq_status").on(table.status)],
);
