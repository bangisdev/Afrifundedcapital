import { Hono } from "hono";
import { getDb, getSqlite } from "../db";
import { settings, challengeTemplates, accountSizes, users, affiliates, wallets } from "../schema";
import { eq, count } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";
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
app.put("/settings/:key", requireAuth, requireAdmin, async (c) => {
  const key = c.req.param("key");
  const body = await c.req.json();
  const db = getDb();
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  if (existing) {
    db.update(settings).set({ value: JSON.stringify(body.value) }).where(eq(settings.key, key)).run();
  } else {
    db.insert(settings).values({ key, value: JSON.stringify(body.value), group: body.group || "general" }).run();
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

export default app;
