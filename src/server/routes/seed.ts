import { Hono } from "hono";
import { getDb, getSqlite } from "../db";
import { settings, challengeTemplates, accountSizes, users, affiliates, wallets, fundedAccounts, mt5Accounts, tradingMetrics, userChallenges, profitPayouts, kycDocuments, payments } from "../schema";
import { eq, count } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";
import { writeAuditLog, redactSetting } from "../lib/audit";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

const app = new Hono();

// ─── Bootstrap super admin (public, one-time) ─────────────
// POST /api/seed/admin — creates the initial super admin account
// Only works if no super_admin exists yet.
app.post("/admin", async (c) => {
  const db = getDb();

  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch {}

  const email = (body.email as string) || "admin@afrifundedcapital.com";
  const password = (body.password as string) || "Admin@123456";
  const name = (body.name as string) || "Super Admin";

  // Allow action=delete to remove a specific user by email
  const action = body.action as string;
  if (action === "delete") {
    const target = db.select().from(users).where(eq(users.email, email)).get();
    if (!target) return c.json({ error: "User not found" }, 404);
    // Prevent deleting the last super_admin
    if (target.role === "super_admin") {
      const allAdmins = db.select().from(users).where(eq(users.role, "super_admin")).all();
      if (allAdmins.length <= 1) {
        return c.json({ error: "Cannot delete the last super_admin" }, 400);
      }
    }
    const sqlite = getSqlite();
    sqlite.prepare("DELETE FROM sessions WHERE user_id = ?").run(target.id);
    sqlite.prepare("DELETE FROM accounts WHERE user_id = ?").run(String(target.id));
    sqlite.prepare("DELETE FROM notifications WHERE user_id = ?").run(target.id);
    sqlite.prepare("DELETE FROM wallets WHERE user_id = ?").run(target.id);
    sqlite.prepare("DELETE FROM certificates WHERE user_id = ?").run(target.id);
    sqlite.prepare("DELETE FROM kyc_documents WHERE user_id = ?").run(target.id);
    db.delete(users).where(eq(users.id, target.id)).run();
    return c.json({ success: true, message: `User ${email} deleted` });
  }

  // Check if super_admin already exists
  const existing = db
    .select()
    .from(users)
    .where(eq(users.role, "super_admin"))
    .get();

  if (existing) {
    // Allow force re-creation with {"force": true}
    const force = body.force === true || body.force === "true";
    if (!force) {
      return c.json({
        error: "Super admin already exists",
        hint: `Use email: ${existing.email}. Pass {"force": true} to recreate.`,
      }, 409);
    }
    // Delete existing admin and their sessions
    try {
      const sqlite = getSqlite();
      sqlite.prepare("DELETE FROM sessions WHERE user_id = ?").run(existing.id);
      sqlite.prepare("DELETE FROM accounts WHERE user_id = ?").run(String(existing.id));
      sqlite.prepare("DELETE FROM wallets WHERE user_id = ?").run(existing.id);
    } catch {}
    db.delete(users).where(eq(users.id, existing.id)).run();
  }

  // Hash password with scrypt (Node built-in, no native addons)
  const hashedPassword = await hashPassword(password);
  const now = Date.now();

  const result = db
    .insert(users)
    .values({
      name,
      email,
      emailVerified: true,
      role: "super_admin",
      onboardingComplete: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  // Store the hashed password in the accounts table via raw SQLite
  try {
    const sqlite = getSqlite();
    sqlite.prepare(
      "INSERT OR IGNORE INTO accounts (user_id, account_id, provider_id, password) VALUES (?, ?, ?, ?)"
    ).run(String(result.id), String(result.id), "email", hashedPassword);
  } catch (e) {
    console.warn("[Seed] Could not store password:", e);
  }

  // Create wallet for the admin
  try {
    const sqlite = getSqlite();
    sqlite.prepare(
      "INSERT OR IGNORE INTO wallets (user_id, balance, referral_balance, bonus_balance, currency, created_at, updated_at) VALUES (?, 0, 0, 0, 'NGN', ?, ?)"
    ).run(result.id, now, now);
  } catch (e) {
    // Wallet creation is non-critical
  }

  return c.json({
    success: true,
    message: "Super admin created successfully",
    credentials: { email, password, name },
  }, 201);
});

// List settings
app.get("/settings", requireAuth, (c) => {
  const db = getDb();
  const items = db.select().from(settings).all();
  return c.json(items.map((s) => ({ ...s, value: JSON.parse(s.value) })));
});

// Update setting
// NOTE: this is the endpoint the Admin → Settings page actually uses to save
// payment gateway keys (Flutterwave/Resend/Paystack) and payout thresholds,
// so every change is audited — with secret values redacted from the trail.
app.put("/settings/:key", requireAuth, requireAdmin, async (c) => {
  const key = c.req.param("key");
  const body = await c.req.json();
  const db = getDb();
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();

  let oldValue: unknown = null;
  if (existing) {
    try {
      oldValue = JSON.parse(existing.value);
    } catch {
      oldValue = existing.value;
    }
    db.update(settings).set({ value: JSON.stringify(body.value) }).where(eq(settings.key, key)).run();
  } else {
    db.insert(settings).values({ key, value: JSON.stringify(body.value), group: body.group || "general" }).run();
  }

  // Audit config edits — the most sensitive admin actions on the platform.
  // Values are redacted so secrets never land in the trail in plaintext.
  try {
    writeAuditLog(db, {
      userId: c.get("userId"),
      action: existing ? "settings.updated" : "settings.created",
      entity: "setting",
      entityId: key,
      details: {
        key,
        group: body.group || existing?.group || "general",
        from: redactSetting(key, oldValue),
        to: redactSetting(key, body.value),
      },
      ipAddress: c.req.header("x-forwarded-for") || undefined,
    });
  } catch (e) {
    console.warn("[Audit] Failed to log settings change:", e);
  }

  return c.json({ success: true });
});

// Seed initial data
app.post("/seed", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const now = Date.now();
  const userId = c.get("userId");

  // Seed challenge templates if none exist
  const existingTemplates = db.select({ cnt: count() }).from(challengeTemplates).all();
  if (existingTemplates.length === 0 || !existingTemplates[0] || (existingTemplates[0]?.cnt ?? 0) === 0) {
    const templates = [
      { name: "Two-Step Evaluation", type: "two_step", profitTarget: 8, dailyDrawdown: 5, maxDrawdown: 10, maxLeverage: 100, minTradingDays: 5, price: 50000, durationDays: 30 },
      { name: "One-Step Challenge", type: "one_step", profitTarget: 10, dailyDrawdown: 4, maxDrawdown: 8, maxLeverage: 50, minTradingDays: 3, price: 40000, durationDays: 30 },
      { name: "Instant Funding", type: "instant_funding", profitTarget: 10, dailyDrawdown: 5, maxDrawdown: 10, maxLeverage: 100, minTradingDays: 0, price: 80000, durationDays: 30 },
    ];

    for (const t of templates) {
      const result = db.insert(challengeTemplates).values({
        ...t,
        description: `${t.name} challenge with ${t.profitTarget}% profit target`,
        currency: "NGN",
        isActive: true,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      }).returning().get();

      // Add account sizes for each template
      const sizes = [
        { label: "$5,000", size: 5000, price: t.price * 0.5 },
        { label: "$10,000", size: 10000, price: t.price * 0.8 },
        { label: "$25,000", size: 25000, price: t.price },
        { label: "$50,000", size: 50000, price: t.price * 1.5 },
        { label: "$100,000", size: 100000, price: t.price * 2.5 },
        { label: "$200,000", size: 200000, price: t.price * 4 },
      ];

      sizes.forEach((s, i) => {
        db.insert(accountSizes).values({
          label: s.label,
          size: s.size,
          currency: "NGN",
          templateId: result.id,
          price: s.price,
          sortOrder: i,
          isActive: true,
        }).run();
      });
    }
  }

  return c.json({ success: true });
});

// ─── Backfill missing affiliate records + wallets for all existing users ────
app.post("/backfill-affiliates", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const now = Date.now();
  const allUsers = db.select().from(users).all();

  let createdAffiliates = 0;
  let createdWallets = 0;
  let skipped = 0;

  for (const user of allUsers) {
    // Check if affiliate record exists
    const existingAffiliate = db.select().from(affiliates).where(eq(affiliates.userId, user.id)).get();
    if (!existingAffiliate) {
      const code = "AFR" + Math.random().toString(36).substring(2, 8).toUpperCase();
      // Ensure uniqueness
      const codeExists = db.select().from(affiliates).where(eq(affiliates.referralCode, code)).get();
      const finalCode = codeExists ? "AFR" + Math.random().toString(36).substring(2, 8).toUpperCase() : code;

      db.insert(affiliates).values({
        userId: user.id,
        referralCode: finalCode,
        totalReferrals: 0,
        activeReferrals: 0,
        totalCommissions: 0,
        pendingCommissions: 0,
        paidCommissions: 0,
        commissionRate: 0.10,
        commissionLevels: 0,
        isActive: true,
        joinedAt: now,
      }).run();

      // Also set referralCode on user record
      db.update(users).set({ referralCode: finalCode, updatedAt: now }).where(eq(users.id, user.id)).run();
      createdAffiliates++;
    }

    // Check if wallet exists
    const existingWallet = db.select().from(wallets).where(eq(wallets.userId, user.id)).get();
    if (!existingWallet) {
      db.insert(wallets).values({
        userId: user.id,
        balance: 0,
        referralBalance: 0,
        bonusBalance: 0,
        currency: "NGN",
        createdAt: now,
        updatedAt: now,
      }).run();
      createdWallets++;
    }
  }

  return c.json({
    success: true,
    totalUsers: allUsers.length,
    createdAffiliates,
    createdWallets,
    skipped: allUsers.length - createdAffiliates,
  });
});

// Get enabled payment providers
app.get("/providers", (c) => {
  return c.json([{ name: "flutterwave", enabled: true }]);
});

// ─── Admin: delete a user by email (requires auth) ────
app.post("/delete-user", requireAuth, requireAdmin, async (c) => {
  const db = getDb();
  const sqlite = getSqlite();

  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch {}

  const email = (body.email as string)?.trim().toLowerCase();
  if (!email) return c.json({ error: "Email is required" }, 400);

  const target = db.select().from(users).where(eq(users.email, email)).get();
  if (!target) return c.json({ error: "User not found" }, 404);

  // Prevent deleting the last super_admin
  if (target.role === "super_admin") {
    const allAdmins = db.select().from(users).where(eq(users.role, "super_admin")).all();
    if (allAdmins.length <= 1) {
      return c.json({ error: "Cannot delete the last super_admin" }, 400);
    }
  }

  // Cascade delete
  sqlite.prepare("DELETE FROM sessions WHERE user_id = ?").run(target.id);
  sqlite.prepare("DELETE FROM accounts WHERE user_id = ?").run(String(target.id));
  sqlite.prepare("DELETE FROM notifications WHERE user_id = ?").run(target.id);
  sqlite.prepare("DELETE FROM wallets WHERE user_id = ?").run(target.id);
  sqlite.prepare("DELETE FROM certificates WHERE user_id = ?").run(target.id);
  sqlite.prepare("DELETE FROM kyc_documents WHERE user_id = ?").run(target.id);
  db.delete(users).where(eq(users.id, target.id)).run();

  return c.json({ success: true, message: `User ${email} deleted` });
});

// ─── Public: check if super admin exists ───────────────────
app.get("/admin/status", (c) => {
  const db = getDb();
  const existing = db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.role, "super_admin"))
    .get();

  return c.json({
    seeded: !!existing,
    email: existing?.email || null,
  });
});

// ─── Seed sample funded accounts, MT5 accounts & trading metrics ────
app.post("/funded", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const now = Date.now();
  const userId = c.get("userId");

  // Check if funded accounts already seeded for this user
  const existingFunded = db.select().from(fundedAccounts).where(eq(fundedAccounts.userId, userId)).get();
  if (existingFunded) {
    return c.json({ success: true, message: "Funded accounts already seeded for this user", skipped: true });
  }

  // Pick the first template + account size to use
  const template = db.select().from(challengeTemplates).limit(1).get();
  if (!template) {
    return c.json({ error: "No challenge templates found. Run /api/seed/seed first." }, 400);
  }
  const accountSize = db.select().from(accountSizes).where(eq(accountSizes.templateId, template.id)).limit(1).get();
  if (!accountSize) {
    return c.json({ error: "No account sizes found. Run /api/seed/seed first." }, 400);
  }

  const results = {
    mt5Accounts: 0,
    challenges: 0,
    fundedAccounts: 0,
    metricsPoints: 0,
    payoutRequests: 0,
  };

  // Create 3 sample funded accounts with different sizes
  const sampleConfigs = [
    { size: 10000, login: "AFC-" + String(100000 + userId).padStart(6, "0"), leverage: 100 },
    { size: 25000, login: "AFC-" + String(200000 + userId).padStart(6, "0"), leverage: 100 },
    { size: 50000, login: "AFC-" + String(300000 + userId).padStart(6, "0"), leverage: 50 },
  ];

  for (const cfg of sampleConfigs) {
    // Create MT5 account
    const mt5 = db.insert(mt5Accounts).values({
      userId,
      login: cfg.login,
      password: "Demo@" + cfg.login.slice(-4),
      investorPassword: "Investor@" + cfg.login.slice(-4),
      server: "AfriFundedCapital-Demo",
      group: "DEMO\\AFC",
      leverage: cfg.leverage,
      balance: cfg.size,
      equity: cfg.size,
      currency: "USD",
      isActive: true,
      isSuspended: false,
      lastSyncAt: now,
      createdAt: now,
      metadata: JSON.stringify({ seeded: true, accountSize: cfg.size }),
    }).returning().get();
    results.mt5Accounts++;

    // Create user challenge in funded status
    const challenge = db.insert(userChallenges).values({
      userId,
      templateId: template.id,
      accountSizeId: accountSize.id,
      status: "funded",
      accountSize: cfg.size,
      currency: "USD",
      profitTarget: template.profitTarget,
      dailyDrawdown: template.dailyDrawdown,
      maxDrawdown: template.maxDrawdown,
      maxLeverage: cfg.leverage,
      minTradingDays: template.minTradingDays,
      startedAt: now - 30 * 86400000,
      phase1PassedAt: now - 20 * 86400000,
      phase2PassedAt: now - 10 * 86400000,
      fundedAt: now - 5 * 86400000,
      expiresAt: now + 90 * 86400000,
      amountPaid: 0,
      mt5AccountId: mt5.id,
      currentPhase: 3,
      createdAt: now - 30 * 86400000,
      updatedAt: now,
    }).returning().get();
    results.challenges++;

    // Create funded account record
    const funded = db.insert(fundedAccounts).values({
      userId,
      challengeId: challenge.id,
      mt5AccountId: mt5.id,
      accountSize: cfg.size,
      currency: "USD",
      profitSharePercent: 80,
      isActive: true,
      activatedAt: now - 5 * 86400000,
      totalPayouts: 0,
    }).returning().get();
    results.fundedAccounts++;

    // Create sample payout requests with various statuses
    const payoutStatuses = [
      { status: "pending", daysAgo: 2, amount: cfg.size * 0.08 },
      { status: "approved", daysAgo: 7, amount: cfg.size * 0.05 },
      { status: "paid", daysAgo: 14, amount: cfg.size * 0.10 },
      { status: "rejected", daysAgo: 21, amount: cfg.size * 0.03 },
    ];

    for (const p of payoutStatuses) {
      const requestedAt = now - p.daysAgo * 86400000;
      const processedAt = p.status !== "pending" ? requestedAt + 2 * 86400000 : null;

      db.insert(profitPayouts).values({
        userId,
        fundedAccountId: funded.id,
        challengeId: challenge.id,
        amount: Math.round(p.amount * 100) / 100,
        currency: "USD",
        status: p.status,
        paymentMethod: "bank_transfer",
        paymentDetails: JSON.stringify({
          bankName: "Access Bank",
          accountNumber: "0123456789",
          accountName: "AfriFunded Test User",
        }),
        processedBy: p.status !== "pending" ? userId : null,
        notes: p.status === "rejected" ? "Incomplete banking details" : null,
        rejectionReason: p.status === "rejected" ? "Please update your bank account information" : null,
        requestedAt,
        processedAt,
      }).run();
      results.payoutRequests++;
    }

    // Generate 30 days of trading metrics history
    let balance = cfg.size;
    let peakBalance = cfg.size;

    for (let day = 29; day >= 0; day--) {
      const dayTs = now - day * 86400000;
      // Simulate realistic P&L: small daily swings
      const dailyPnL = (Math.random() - 0.45) * cfg.size * 0.02; // Slight upward bias
      const floatingPL = (Math.random() - 0.5) * cfg.size * 0.01;
      balance = Math.max(balance + dailyPnL, cfg.size * 0.85); // Never drop below 15%
      peakBalance = Math.max(peakBalance, balance);
      const equity = balance + floatingPL;
      const totalProfit = balance - cfg.size;
      const currentDD = ((peakBalance - equity) / peakBalance) * 100;
      const dailyDD = dailyPnL < 0 ? Math.abs(dailyPnL / balance) * 100 : 0;
      const remainingDD = template.maxDrawdown - currentDD;
      const profitProgress = Math.max(0, Math.min(100, (totalProfit / (cfg.size * template.profitTarget / 100)) * 100));

      db.insert(tradingMetrics).values({
        mt5AccountId: mt5.id,
        challengeId: challenge.id,
        balance: Math.round(balance * 100) / 100,
        equity: Math.round(equity * 100) / 100,
        floatingPL: Math.round(floatingPL * 100) / 100,
        dailyPL: Math.round(dailyPnL * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        currentDrawdown: Math.round(currentDD * 100) / 100,
        dailyDrawdown: Math.round(dailyDD * 100) / 100,
        trailingDrawdown: Math.round(currentDD * 100) / 100,
        relativeDrawdown: Math.round(currentDD * 100) / 100,
        absoluteDrawdown: Math.round(Math.max(0, (cfg.size - equity)) / cfg.size * 100 * 100) / 100,
        remainingDrawdown: Math.round(Math.max(0, remainingDD) * 100) / 100,
        profitTargetProgress: Math.round(profitProgress * 100) / 100,
        tradingDaysCount: 30 - day,
        openPositions: Math.floor(Math.random() * 5),
        closedTrades: (30 - day) * Math.floor(Math.random() * 8 + 2),
        winRate: Math.round((50 + Math.random() * 20) * 100) / 100,
        lossRate: Math.round((30 + Math.random() * 20) * 100) / 100,
        averageRR: Math.round((1.2 + Math.random() * 1.5) * 100) / 100,
        profitFactor: Math.round((1.0 + Math.random() * 1.5) * 100) / 100,
        expectancy: Math.round((10 + Math.random() * 50) * 100) / 100,
        largestWin: Math.round(cfg.size * 0.03 * Math.random() * 100) / 100,
        largestLoss: Math.round(-cfg.size * 0.02 * Math.random() * 100) / 100,
        consecutiveWins: Math.floor(Math.random() * 8) + 1,
        consecutiveLosses: Math.floor(Math.random() * 4) + 1,
        riskScore: Math.round((2 + Math.random() * 6) * 100) / 100,
        healthScore: Math.round((60 + Math.random() * 35) * 100) / 100,
        recordedAt: dayTs,
      }).run();
      results.metricsPoints++;
    }
  }

  return c.json({
    success: true,
    message: "Sample funded accounts seeded successfully",
    ...results,
  });
});

// ─── Bulk seed: runs all seed operations in one call ─────
// POST /api/seed/bulk — seeds templates, affiliates, funded accounts & payouts
app.post("/bulk", requireAuth, requireAdmin, async (c) => {
  const db = getDb();
  const now = Date.now();
  const userId = c.get("userId");
  const results: Record<string, unknown> = {};
  const errors: string[] = [];

  // ── 1. Seed challenge templates & account sizes ──
  try {
    const existingTemplates = db.select({ cnt: count() }).from(challengeTemplates).all();
    if (existingTemplates.length === 0 || !existingTemplates[0] || (existingTemplates[0]?.cnt ?? 0) === 0) {
      const templates = [
        { name: "Two-Step Evaluation", type: "two_step", profitTarget: 8, dailyDrawdown: 5, maxDrawdown: 10, maxLeverage: 100, minTradingDays: 5, price: 50000, durationDays: 30 },
        { name: "One-Step Challenge", type: "one_step", profitTarget: 10, dailyDrawdown: 4, maxDrawdown: 8, maxLeverage: 50, minTradingDays: 3, price: 40000, durationDays: 30 },
        { name: "Instant Funding", type: "instant_funding", profitTarget: 10, dailyDrawdown: 5, maxDrawdown: 10, maxLeverage: 100, minTradingDays: 0, price: 80000, durationDays: 30 },
      ];
      let templateCount = 0;
      let sizeCount = 0;
      for (const t of templates) {
        const result = db.insert(challengeTemplates).values({
          ...t,
          description: `${t.name} challenge with ${t.profitTarget}% profit target`,
          currency: "NGN",
          isActive: true,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        }).returning().get();
        templateCount++;
        const sizes = [
          { label: "$5,000", size: 5000, price: t.price * 0.5 },
          { label: "$10,000", size: 10000, price: t.price * 0.8 },
          { label: "$25,000", size: 25000, price: t.price },
          { label: "$50,000", size: 50000, price: t.price * 1.5 },
          { label: "$100,000", size: 100000, price: t.price * 2.5 },
          { label: "$200,000", size: 200000, price: t.price * 4 },
        ];
        sizes.forEach((s, i) => {
          db.insert(accountSizes).values({
            label: s.label, size: s.size, currency: "NGN",
            templateId: result.id, price: s.price, sortOrder: i, isActive: true,
          }).run();
          sizeCount++;
        });
      }
      results.templates = { created: templateCount, accountSizes: sizeCount };
    } else {
      results.templates = { skipped: true, reason: "Already seeded" };
    }
  } catch (e) {
    errors.push(`Templates: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 2. Backfill affiliates & wallets ──
  try {
    const allUsers = db.select().from(users).all();
    let createdAffiliates = 0;
    let createdWallets = 0;
    for (const user of allUsers) {
      const existingAffiliate = db.select().from(affiliates).where(eq(affiliates.userId, user.id)).get();
      if (!existingAffiliate) {
        const code = "AFR" + Math.random().toString(36).substring(2, 8).toUpperCase();
        const codeExists = db.select().from(affiliates).where(eq(affiliates.referralCode, code)).get();
        const finalCode = codeExists ? "AFR" + Math.random().toString(36).substring(2, 8).toUpperCase() : code;
        db.insert(affiliates).values({
          userId: user.id, referralCode: finalCode,
          totalReferrals: 0, activeReferrals: 0,
          totalCommissions: 0, pendingCommissions: 0, paidCommissions: 0,
          commissionRate: 0.10, commissionLevels: 0, isActive: true, joinedAt: now,
        }).run();
        db.update(users).set({ referralCode: finalCode, updatedAt: now }).where(eq(users.id, user.id)).run();
        createdAffiliates++;
      }
      const existingWallet = db.select().from(wallets).where(eq(wallets.userId, user.id)).get();
      if (!existingWallet) {
        db.insert(wallets).values({
          userId: user.id, balance: 0, referralBalance: 0, bonusBalance: 0,
          currency: "NGN", createdAt: now, updatedAt: now,
        }).run();
        createdWallets++;
      }
    }
    results.affiliates = { totalUsers: allUsers.length, createdAffiliates, createdWallets };
  } catch (e) {
    errors.push(`Affiliates: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 3. Seed funded accounts, MT5 accounts, metrics & payouts ──
  try {
    const existingFunded = db.select().from(fundedAccounts).where(eq(fundedAccounts.userId, userId)).get();
    if (existingFunded) {
      results.fundedAccounts = { skipped: true, reason: "Already seeded" };
    } else {
      const template = db.select().from(challengeTemplates).limit(1).get();
      const accountSize = template
        ? db.select().from(accountSizes).where(eq(accountSizes.templateId, template.id)).limit(1).get()
        : null;
      if (!template || !accountSize) {
        errors.push("Funded: No templates/sizes found (step 1 may have failed)");
      } else {
        const fundResults = { mt5Accounts: 0, challenges: 0, fundedAccounts: 0, metricsPoints: 0, payoutRequests: 0 };
        const sampleConfigs = [
          { size: 10000, login: "AFC-" + String(100000 + userId).padStart(6, "0"), leverage: 100 },
          { size: 25000, login: "AFC-" + String(200000 + userId).padStart(6, "0"), leverage: 100 },
          { size: 50000, login: "AFC-" + String(300000 + userId).padStart(6, "0"), leverage: 50 },
        ];
        for (const cfg of sampleConfigs) {
          const mt5 = db.insert(mt5Accounts).values({
            userId, login: cfg.login, password: "Demo@" + cfg.login.slice(-4),
            investorPassword: "Investor@" + cfg.login.slice(-4), server: "AfriFundedCapital-Demo",
            group: "DEMO\\AFC", leverage: cfg.leverage, balance: cfg.size, equity: cfg.size,
            currency: "USD", isActive: true, isSuspended: false, lastSyncAt: now, createdAt: now,
            metadata: JSON.stringify({ seeded: true, accountSize: cfg.size }),
          }).returning().get();
          fundResults.mt5Accounts++;
          const challenge = db.insert(userChallenges).values({
            userId, templateId: template.id, accountSizeId: accountSize.id, status: "funded",
            accountSize: cfg.size, currency: "USD", profitTarget: template.profitTarget,
            dailyDrawdown: template.dailyDrawdown, maxDrawdown: template.maxDrawdown,
            maxLeverage: cfg.leverage, minTradingDays: template.minTradingDays,
            startedAt: now - 30 * 86400000, phase1PassedAt: now - 20 * 86400000,
            phase2PassedAt: now - 10 * 86400000, fundedAt: now - 5 * 86400000,
            expiresAt: now + 90 * 86400000, amountPaid: 0, mt5AccountId: mt5.id,
            currentPhase: 3, createdAt: now - 30 * 86400000, updatedAt: now,
          }).returning().get();
          fundResults.challenges++;
          const funded = db.insert(fundedAccounts).values({
            userId, challengeId: challenge.id, mt5AccountId: mt5.id,
            accountSize: cfg.size, currency: "USD", profitSharePercent: 80,
            isActive: true, activatedAt: now - 5 * 86400000, totalPayouts: 0,
          }).returning().get();
          fundResults.fundedAccounts++;
          const payoutStatuses = [
            { status: "pending", daysAgo: 2, amount: cfg.size * 0.08 },
            { status: "approved", daysAgo: 7, amount: cfg.size * 0.05 },
            { status: "paid", daysAgo: 14, amount: cfg.size * 0.10 },
            { status: "rejected", daysAgo: 21, amount: cfg.size * 0.03 },
          ];
          for (const p of payoutStatuses) {
            const requestedAt = now - p.daysAgo * 86400000;
            const processedAt = p.status !== "pending" ? requestedAt + 2 * 86400000 : null;
            db.insert(profitPayouts).values({
              userId, fundedAccountId: funded.id, challengeId: challenge.id,
              amount: Math.round(p.amount * 100) / 100, currency: "USD", status: p.status,
              paymentMethod: "bank_transfer",
              paymentDetails: JSON.stringify({ bankName: "Access Bank", accountNumber: "0123456789", accountName: "AfriFunded Test User" }),
              processedBy: p.status !== "pending" ? userId : null,
              notes: p.status === "rejected" ? "Incomplete banking details" : null,
              rejectionReason: p.status === "rejected" ? "Please update your bank account information" : null,
              requestedAt, processedAt,
            }).run();
            fundResults.payoutRequests++;
          }
          let balance = cfg.size;
          let peakBalance = cfg.size;
          for (let day = 29; day >= 0; day--) {
            const dayTs = now - day * 86400000;
            const dailyPnL = (Math.random() - 0.45) * cfg.size * 0.02;
            const floatingPL = (Math.random() - 0.5) * cfg.size * 0.01;
            balance = Math.max(balance + dailyPnL, cfg.size * 0.85);
            peakBalance = Math.max(peakBalance, balance);
            const equity = balance + floatingPL;
            const totalProfit = balance - cfg.size;
            const currentDD = ((peakBalance - equity) / peakBalance) * 100;
            const dailyDD = dailyPnL < 0 ? Math.abs(dailyPnL / balance) * 100 : 0;
            const remainingDD = template.maxDrawdown - currentDD;
            const profitProgress = Math.max(0, Math.min(100, (totalProfit / (cfg.size * template.profitTarget / 100)) * 100));
            db.insert(tradingMetrics).values({
              mt5AccountId: mt5.id, challengeId: challenge.id,
              balance: Math.round(balance * 100) / 100, equity: Math.round(equity * 100) / 100,
              floatingPL: Math.round(floatingPL * 100) / 100, dailyPL: Math.round(dailyPnL * 100) / 100,
              totalProfit: Math.round(totalProfit * 100) / 100,
              currentDrawdown: Math.round(currentDD * 100) / 100, dailyDrawdown: Math.round(dailyDD * 100) / 100,
              trailingDrawdown: Math.round(currentDD * 100) / 100, relativeDrawdown: Math.round(currentDD * 100) / 100,
              absoluteDrawdown: Math.round(Math.max(0, (cfg.size - equity)) / cfg.size * 100 * 100) / 100,
              remainingDrawdown: Math.round(Math.max(0, remainingDD) * 100) / 100,
              profitTargetProgress: Math.round(profitProgress * 100) / 100,
              tradingDaysCount: 30 - day, openPositions: Math.floor(Math.random() * 5),
              closedTrades: (30 - day) * Math.floor(Math.random() * 8 + 2),
              winRate: Math.round((50 + Math.random() * 20) * 100) / 100,
              lossRate: Math.round((30 + Math.random() * 20) * 100) / 100,
              averageRR: Math.round((1.2 + Math.random() * 1.5) * 100) / 100,
              profitFactor: Math.round((1.0 + Math.random() * 1.5) * 100) / 100,
              expectancy: Math.round((10 + Math.random() * 50) * 100) / 100,
              largestWin: Math.round(cfg.size * 0.03 * Math.random() * 100) / 100,
              largestLoss: Math.round(-cfg.size * 0.02 * Math.random() * 100) / 100,
              consecutiveWins: Math.floor(Math.random() * 8) + 1,
              consecutiveLosses: Math.floor(Math.random() * 4) + 1,
              riskScore: Math.round((2 + Math.random() * 6) * 100) / 100,
              healthScore: Math.round((60 + Math.random() * 35) * 100) / 100,
              recordedAt: dayTs,
            }).run();
            fundResults.metricsPoints++;
          }
        }
        results.fundedAccounts = fundResults;
      }
    }
  } catch (e) {
    errors.push(`Funded: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 4. Seed sample users with challenges ──
  try {
    const nonAdminUsers = db.select().from(users).all().filter(u => u.role === "user");
    if (nonAdminUsers.length < 8) {
      // Get template + sizes
      const tmpl = db.select().from(challengeTemplates).limit(1).get();
      const sizes = tmpl ? db.select().from(accountSizes).where(eq(accountSizes.templateId, tmpl.id)).all() : [];
      if (tmpl && sizes.length > 0) {
        const size25k = sizes.find(s => s.size === 25000) || sizes[2] || sizes[0];
        const size50k = sizes.find(s => s.size === 50000) || sizes[3] || sizes[0];
        const size10k = sizes.find(s => s.size === 10000) || sizes[1] || sizes[0];
        const size100k = sizes.find(s => s.size === 100000) || sizes[4] || sizes[0];

        const sampleUsersData = [
          { name: "Adebayo Okonkwo", email: "adebayo@test.com", phone: "+234 801 234 5678", country: "Nigeria", tradingExperience: "intermediate", kycStatus: "approved", kycVerifiedAt: now - 30 * 86400000, onboardingComplete: true },
          { name: "Chioma Nwosu", email: "chioma@test.com", phone: "+234 802 345 6789", country: "Nigeria", tradingExperience: "beginner", kycStatus: "pending", onboardingComplete: true },
          { name: "Emeka Obi", email: "emeka@test.com", phone: "+234 803 456 7890", country: "Nigeria", tradingExperience: "advanced", kycStatus: "approved", kycVerifiedAt: now - 45 * 86400000, onboardingComplete: true },
          { name: "Fatima Bello", email: "fatima@test.com", phone: "+234 804 567 8901", country: "Nigeria", tradingExperience: "expert", kycStatus: "approved", kycVerifiedAt: now - 60 * 86400000, onboardingComplete: true },
          { name: "Tunde Adeyemi", email: "tunde@test.com", phone: "+234 805 678 9012", country: "Nigeria", tradingExperience: "intermediate", kycStatus: "approved", kycVerifiedAt: now - 20 * 86400000, onboardingComplete: true },
          { name: "Amina Yusuf", email: "amina@test.com", phone: "+234 806 789 0123", country: "Nigeria", tradingExperience: "beginner", kycStatus: "unverified", onboardingComplete: true },
          { name: "Oluwaseun Akinwale", email: "oluwaseun@test.com", phone: "+234 807 890 1234", country: "Nigeria", tradingExperience: "beginner", kycStatus: "unverified", onboardingComplete: false },
          { name: "Ngozi Eze", email: "ngozi@test.com", phone: "+234 808 901 2345", country: "Nigeria", tradingExperience: "intermediate", kycStatus: "rejected", onboardingComplete: true },
        ];

        let usersCreated = 0;
        for (const su of sampleUsersData) {
          const existingUser = db.select().from(users).where(eq(users.email, su.email)).get();
          if (existingUser) continue;

          const daysAgo = Math.floor(Math.random() * 60) + 5;
          const userCreatedAt = now - daysAgo * 86400000;
          const user = db.insert(users).values({
            name: su.name, email: su.email, emailVerified: true, role: "user",
            phone: su.phone, country: su.country, tradingExperience: su.tradingExperience,
            timezone: "Africa/Lagos", kycStatus: su.kycStatus, kycVerifiedAt: su.kycVerifiedAt,
            onboardingComplete: su.onboardingComplete, createdAt: userCreatedAt, updatedAt: now,
          }).returning().get();
          usersCreated++;

          db.insert(wallets).values({ userId: user.id, balance: 0, referralBalance: 0, bonusBalance: 0, currency: "NGN", createdAt: userCreatedAt, updatedAt: now }).run();
          const code = "AFR" + Math.random().toString(36).substring(2, 8).toUpperCase();
          db.insert(affiliates).values({ userId: user.id, referralCode: code, totalReferrals: 0, activeReferrals: 0, totalCommissions: 0, pendingCommissions: 0, paidCommissions: 0, commissionRate: 0.10, commissionLevels: 0, isActive: true, joinedAt: userCreatedAt }).run();
          db.update(users).set({ referralCode: code, updatedAt: now }).where(eq(users.id, user.id)).run();

          if (su.kycStatus === "approved" || su.kycStatus === "pending") {
            db.insert(kycDocuments).values({ userId: user.id, documentType: "passport", fileUrl: "/uploads/kyc/passport_" + user.id + ".jpg", status: su.kycStatus, reviewedBy: su.kycStatus === "approved" ? userId : null, reviewedAt: su.kycStatus === "approved" ? now - 25 * 86400000 : null, uploadedAt: userCreatedAt + 86400000 }).run();
          }
          if (su.kycStatus === "rejected") {
            db.insert(kycDocuments).values({ userId: user.id, documentType: "passport", fileUrl: "/uploads/kyc/passport_" + user.id + ".jpg", status: "rejected", reviewedBy: userId, reviewedAt: now - 5 * 86400000, rejectionReason: "Document is blurry", uploadedAt: userCreatedAt + 86400000 }).run();
          }
        }
        results.sampleUsers = { created: usersCreated };
      } else {
        results.sampleUsers = { skipped: true, reason: "No templates/sizes" };
      }
    } else {
      results.sampleUsers = { skipped: true, reason: "Already seeded" };
    }
  } catch (e) {
    errors.push(`SampleUsers: ${e instanceof Error ? e.message : String(e)}`);
  }

  return c.json({
    success: errors.length === 0,
    message: errors.length === 0
      ? "Bulk seed completed successfully"
      : `Bulk seed completed with ${errors.length} error(s)`,
    results,
    ...(errors.length > 0 ? { errors } : {}),
  });
});

// ─── Seed sample users with challenges in various states ────
// POST /api/seed/users — creates 8 demo users with varied profiles, KYC, challenges, and metrics
app.post("/users", requireAuth, requireAdmin, async (c) => {
  const db = getDb();
  const now = Date.now();
  const adminId = c.get("userId");

  // Simple check: if more than 2 non-admin users exist, skip
  const nonAdminUsers = db.select().from(users).all().filter(u => u.role === "user");
  if (nonAdminUsers.length >= 8) {
    return c.json({ success: true, message: "Sample users already seeded", skipped: true });
  }

  // Get first template + account sizes for challenge creation
  const template = db.select().from(challengeTemplates).limit(1).get();
  const allSizes = template
    ? db.select().from(accountSizes).where(eq(accountSizes.templateId, template.id)).all()
    : [];
  if (!template || allSizes.length === 0) {
    return c.json({ error: "No challenge templates/sizes found. Run /api/seed/seed first." }, 400);
  }

  const size5k = allSizes.find(s => s.size === 5000) || allSizes[0];
  const size10k = allSizes.find(s => s.size === 10000) || allSizes[1] || allSizes[0];
  const size25k = allSizes.find(s => s.size === 25000) || allSizes[2] || allSizes[0];
  const size50k = allSizes.find(s => s.size === 50000) || allSizes[3] || allSizes[0];
  const size100k = allSizes.find(s => s.size === 100000) || allSizes[4] || allSizes[0];
  const size200k = allSizes.find(s => s.size === 200000) || allSizes[5] || allSizes[0];

  // ── Sample user definitions ──
  const sampleUsers = [
    {
      name: "Adebayo Okonkwo", email: "adebayo@test.com", phone: "+234 801 234 5678",
      country: "Nigeria", tradingExperience: "intermediate", timezone: "Africa/Lagos",
      kycStatus: "approved", kycVerifiedAt: now - 30 * 86400000,
      onboardingComplete: true, emailVerified: true,
    },
    {
      name: "Chioma Nwosu", email: "chioma@test.com", phone: "+234 802 345 6789",
      country: "Nigeria", tradingExperience: "beginner", timezone: "Africa/Lagos",
      kycStatus: "pending", onboardingComplete: true, emailVerified: true,
    },
    {
      name: "Emeka Obi", email: "emeka@test.com", phone: "+234 803 456 7890",
      country: "Nigeria", tradingExperience: "advanced", timezone: "Africa/Lagos",
      kycStatus: "approved", kycVerifiedAt: now - 45 * 86400000,
      onboardingComplete: true, emailVerified: true,
    },
    {
      name: "Fatima Bello", email: "fatima@test.com", phone: "+234 804 567 8901",
      country: "Nigeria", tradingExperience: "expert", timezone: "Africa/Lagos",
      kycStatus: "approved", kycVerifiedAt: now - 60 * 86400000,
      onboardingComplete: true, emailVerified: true,
    },
    {
      name: "Tunde Adeyemi", email: "tunde@test.com", phone: "+234 805 678 9012",
      country: "Nigeria", tradingExperience: "intermediate", timezone: "Africa/Lagos",
      kycStatus: "approved", kycVerifiedAt: now - 20 * 86400000,
      onboardingComplete: true, emailVerified: true,
    },
    {
      name: "Amina Yusuf", email: "amina@test.com", phone: "+234 806 789 0123",
      country: "Nigeria", tradingExperience: "beginner", timezone: "Africa/Lagos",
      kycStatus: "unverified", onboardingComplete: true, emailVerified: true,
    },
    {
      name: "Oluwaseun Akinwale", email: "oluwaseun@test.com", phone: "+234 807 890 1234",
      country: "Nigeria", tradingExperience: "beginner", timezone: "Africa/Lagos",
      kycStatus: "unverified", onboardingComplete: false, emailVerified: true,
    },
    {
      name: "Ngozi Eze", email: "ngozi@test.com", phone: "+234 808 901 2345",
      country: "Nigeria", tradingExperience: "intermediate", timezone: "Africa/Lagos",
      kycStatus: "rejected", onboardingComplete: true, emailVerified: true,
    },
  ];

  const createdUsers: number[] = [];
  const results = {
    users: 0, wallets: 0, affiliates: 0, challenges: 0,
    mt5Accounts: 0, fundedAccounts: 0, kycDocs: 0, payments: 0, metricsPoints: 0,
  };

  // ── Create each user with their associated data ──
  for (const su of sampleUsers) {
    // Skip if user already exists
    const existingUser = db.select().from(users).where(eq(users.email, su.email)).get();
    if (existingUser) {
      createdUsers.push(existingUser.id);
      continue;
    }

    // Create user
    const daysAgo = Math.floor(Math.random() * 60) + 5;
    const userCreatedAt = now - daysAgo * 86400000;
    const user = db.insert(users).values({
      name: su.name,
      email: su.email,
      emailVerified: su.emailVerified,
      role: "user",
      phone: su.phone,
      country: su.country,
      tradingExperience: su.tradingExperience,
      timezone: su.timezone,
      kycStatus: su.kycStatus,
      kycVerifiedAt: su.kycVerifiedAt,
      onboardingComplete: su.onboardingComplete,
      createdAt: userCreatedAt,
      updatedAt: now,
    }).returning().get();
    createdUsers.push(user.id);
    results.users++;

    // Create wallet
    db.insert(wallets).values({
      userId: user.id, balance: 0, referralBalance: 0, bonusBalance: 0,
      currency: "NGN", createdAt: userCreatedAt, updatedAt: now,
    }).run();
    results.wallets++;

    // Create affiliate record
    const code = "AFR" + Math.random().toString(36).substring(2, 8).toUpperCase();
    db.insert(affiliates).values({
      userId: user.id, referralCode: code,
      totalReferrals: Math.floor(Math.random() * 5), activeReferrals: Math.floor(Math.random() * 3),
      totalCommissions: Math.round(Math.random() * 50000),
      pendingCommissions: Math.round(Math.random() * 20000),
      paidCommissions: Math.round(Math.random() * 30000),
      commissionRate: 0.10, commissionLevels: 0, isActive: true, joinedAt: userCreatedAt,
    }).run();
    db.update(users).set({ referralCode: code, updatedAt: now }).where(eq(users.id, user.id)).run();
    results.affiliates++;

    // Create KYC documents for approved/pending users
    if (su.kycStatus === "approved" || su.kycStatus === "pending") {
      db.insert(kycDocuments).values({
        userId: user.id, documentType: "passport",
        fileUrl: "/uploads/kyc/passport_" + user.id + ".jpg",
        status: su.kycStatus,
        reviewedBy: su.kycStatus === "approved" ? adminId : null,
        reviewedAt: su.kycStatus === "approved" ? now - 25 * 86400000 : null,
        uploadedAt: userCreatedAt + 86400000,
      }).run();
      results.kycDocs++;
      if (su.kycStatus === "approved") {
        db.insert(kycDocuments).values({
          userId: user.id, documentType: "proof_of_address",
          fileUrl: "/uploads/kyc/address_" + user.id + ".jpg",
          status: su.kycStatus,
          reviewedBy: adminId,
          reviewedAt: now - 24 * 86400000,
          uploadedAt: userCreatedAt + 2 * 86400000,
        }).run();
        results.kycDocs++;
      }
    }
    if (su.kycStatus === "rejected") {
      db.insert(kycDocuments).values({
        userId: user.id, documentType: "passport",
        fileUrl: "/uploads/kyc/passport_" + user.id + ".jpg",
        status: "rejected",
        reviewedBy: adminId,
        reviewedAt: now - 5 * 86400000,
        rejectionReason: "Document is blurry and unreadable. Please upload a clearer image.",
        uploadedAt: userCreatedAt + 86400000,
      }).run();
      results.kycDocs++;
    }
  }

  // ── Create challenges in various states for each user ──
  const challengeConfigs: Array<{
    email: string; status: string; accountSize: typeof size25k;
    daysAgo: number; hasMt5: boolean; hasFunded: boolean;
    extraDaysToPhase1?: number; extraDaysToPhase2?: number; extraDaysToFunded?: number;
  }> = [
    // User 1: Adebayo — Active challenge in Phase 1
    { email: "adebayo@test.com", status: "active", accountSize: size25k, daysAgo: 14,
      hasMt5: true, hasFunded: false },
    // User 2: Chioma — Phase 1 passed, in Phase 2
    { email: "chioma@test.com", status: "phase_1_passed", accountSize: size50k, daysAgo: 25,
      hasMt5: true, hasFunded: false, extraDaysToPhase1: 15 },
    // User 3: Emeka — Phase 2 passed, awaiting funding
    { email: "emeka@test.com", status: "phase_2_passed", accountSize: size100k, daysAgo: 40,
      hasMt5: true, hasFunded: false, extraDaysToPhase1: 12, extraDaysToPhase2: 28 },
    // User 4: Fatima — Fully funded
    { email: "fatima@test.com", status: "funded", accountSize: size25k, daysAgo: 60,
      hasMt5: true, hasFunded: true, extraDaysToPhase1: 10, extraDaysToPhase2: 22, extraDaysToFunded: 30 },
    // User 5: Tunde — Violated (daily drawdown breach)
    { email: "tunde@test.com", status: "violated", accountSize: size50k, daysAgo: 18,
      hasMt5: false, hasFunded: false },
    // User 6: Amina — Expired
    { email: "amina@test.com", status: "expired", accountSize: size10k, daysAgo: 35,
      hasMt5: false, hasFunded: false },
    // User 8: Ngozi — Refunded
    { email: "ngozi@test.com", status: "refunded", accountSize: size25k, daysAgo: 10,
      hasMt5: false, hasFunded: false },
  ];

  for (const cc of challengeConfigs) {
    const user = db.select().from(users).where(eq(users.email, cc.email)).get();
    if (!user) continue;

    // Skip if user already has challenges
    const existingChallenge = db.select().from(userChallenges).where(eq(userChallenges.userId, user.id)).get();
    if (existingChallenge) continue;

    const accountSize = cc.accountSize;
    const challengeStartedAt = now - cc.daysAgo * 86400000;
    const phase1At = cc.extraDaysToPhase1 ? now - (cc.daysAgo - cc.extraDaysToPhase1) * 86400000 : null;
    const phase2At = cc.extraDaysToPhase2 ? now - (cc.daysAgo - cc.extraDaysToPhase2) * 86400000 : null;
    const fundedAt = cc.extraDaysToFunded ? now - (cc.daysAgo - cc.extraDaysToFunded) * 86400000 : null;

    // Create a payment record
    const paymentRef = "PAY-" + Math.random().toString(36).substring(2, 10).toUpperCase();
    const payment = db.insert(payments).values({
      userId: user.id, amount: accountSize.price, currency: "NGN",
      provider: "flutterwave", status: "completed",
      reference: paymentRef, description: "Challenge purchase: " + template.name,
      templateId: template.id, accountSizeId: accountSize.id,
      createdAt: challengeStartedAt - 86400000, completedAt: challengeStartedAt,
    }).returning().get();
    results.payments++;

    // Create MT5 account for users who have them
    let mt5Id: number | null = null;
    if (cc.hasMt5) {
      const login = "AFC-" + String(500000 + user.id).padStart(6, "0");
      const mt5 = db.insert(mt5Accounts).values({
        userId: user.id, login,
        password: "Demo@" + login.slice(-4),
        investorPassword: "Investor@" + login.slice(-4),
        server: "AfriFundedCapital-Demo", group: "DEMO\\AFC",
        leverage: template.maxLeverage, balance: accountSize.size, equity: accountSize.size,
        currency: "USD", isActive: cc.status !== "violated" && cc.status !== "expired",
        isSuspended: cc.status === "violated",
        lastSyncAt: now, createdAt: challengeStartedAt,
        metadata: JSON.stringify({ seeded: true, accountSize: accountSize.size }),
      }).returning().get();
      mt5Id = mt5.id;
      results.mt5Accounts++;
    }

    // Create user challenge
    const challengeViolations = cc.status === "violated"
      ? JSON.stringify([{ type: "daily_drawdown_breach", date: now - 5 * 86400000, details: "Daily drawdown exceeded 5%" }])
      : null;

    const challenge = db.insert(userChallenges).values({
      userId: user.id, templateId: template.id, accountSizeId: accountSize.id,
      status: cc.status, accountSize: accountSize.size, currency: "USD",
      profitTarget: template.profitTarget, dailyDrawdown: template.dailyDrawdown,
      maxDrawdown: template.maxDrawdown, maxLeverage: template.maxLeverage,
      minTradingDays: template.minTradingDays,
      startedAt: challengeStartedAt,
      phase1PassedAt: phase1At, phase2PassedAt: phase2At, fundedAt,
      expiresAt: challengeStartedAt + template.durationDays * 86400000,
      amountPaid: accountSize.price,
      violations: challengeViolations,
      mt5AccountId: mt5Id,
      currentPhase: cc.status === "active" ? 1 : cc.status === "phase_1_passed" ? 2 : cc.status === "phase_2_passed" ? 2 : cc.status === "funded" ? 3 : 1,
      createdAt: challengeStartedAt, updatedAt: now,
    }).returning().get();
    results.challenges++;

    // Create funded account record
    if (cc.hasFunded && mt5Id) {
      const funded = db.insert(fundedAccounts).values({
        userId: user.id, challengeId: challenge.id, mt5AccountId: mt5Id,
        accountSize: accountSize.size, currency: "USD", profitSharePercent: 80,
        isActive: true, activatedAt: fundedAt || now, totalPayouts: 0,
      }).returning().get();
      results.fundedAccounts++;

      // Generate 30 days of trading metrics for funded user
      let balance = accountSize.size;
      let peakBalance = accountSize.size;
      for (let day = 29; day >= 0; day--) {
        const dayTs = now - day * 86400000;
        const dailyPnL = (Math.random() - 0.45) * accountSize.size * 0.02;
        const floatingPL = (Math.random() - 0.5) * accountSize.size * 0.01;
        balance = Math.max(balance + dailyPnL, accountSize.size * 0.85);
        peakBalance = Math.max(peakBalance, balance);
        const equity = balance + floatingPL;
        const totalProfit = balance - accountSize.size;
        const currentDD = ((peakBalance - equity) / peakBalance) * 100;
        const dailyDD = dailyPnL < 0 ? Math.abs(dailyPnL / balance) * 100 : 0;
        const remainingDD = template.maxDrawdown - currentDD;
        const profitProgress = Math.max(0, Math.min(100, (totalProfit / (accountSize.size * template.profitTarget / 100)) * 100));

        db.insert(tradingMetrics).values({
          mt5AccountId: mt5Id, challengeId: challenge.id,
          balance: Math.round(balance * 100) / 100, equity: Math.round(equity * 100) / 100,
          floatingPL: Math.round(floatingPL * 100) / 100, dailyPL: Math.round(dailyPnL * 100) / 100,
          totalProfit: Math.round(totalProfit * 100) / 100,
          currentDrawdown: Math.round(currentDD * 100) / 100,
          dailyDrawdown: Math.round(dailyDD * 100) / 100,
          trailingDrawdown: Math.round(currentDD * 100) / 100,
          relativeDrawdown: Math.round(currentDD * 100) / 100,
          absoluteDrawdown: Math.round(Math.max(0, (accountSize.size - equity)) / accountSize.size * 100 * 100) / 100,
          remainingDrawdown: Math.round(Math.max(0, remainingDD) * 100) / 100,
          profitTargetProgress: Math.round(profitProgress * 100) / 100,
          tradingDaysCount: 30 - day, openPositions: Math.floor(Math.random() * 5),
          closedTrades: (30 - day) * Math.floor(Math.random() * 8 + 2),
          winRate: Math.round((50 + Math.random() * 20) * 100) / 100,
          lossRate: Math.round((30 + Math.random() * 20) * 100) / 100,
          averageRR: Math.round((1.2 + Math.random() * 1.5) * 100) / 100,
          profitFactor: Math.round((1.0 + Math.random() * 1.5) * 100) / 100,
          expectancy: Math.round((10 + Math.random() * 50) * 100) / 100,
          largestWin: Math.round(accountSize.size * 0.03 * Math.random() * 100) / 100,
          largestLoss: Math.round(-accountSize.size * 0.02 * Math.random() * 100) / 100,
          consecutiveWins: Math.floor(Math.random() * 8) + 1,
          consecutiveLosses: Math.floor(Math.random() * 4) + 1,
          riskScore: Math.round((2 + Math.random() * 6) * 100) / 100,
          healthScore: Math.round((60 + Math.random() * 35) * 100) / 100,
          recordedAt: dayTs,
        }).run();
        results.metricsPoints++;
      }
    }
  }

  return c.json({
    success: true,
    message: `Sample users seeded: ${results.users} users, ${results.challenges} challenges, ${results.fundedAccounts} funded`,
    ...results,
  });
});

export default app;
