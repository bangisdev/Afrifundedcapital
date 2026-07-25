import { Hono } from "hono";
import { getDb } from "../db";
import { settings, challengeTemplates, accountSizes, users } from "../schema";
import { eq, count, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";
import { hash } from "@node-rs/argon2";
import { randomBytes } from "crypto";

const app = new Hono();

// ─── Bootstrap super admin (public, one-time) ─────────────
// POST /api/seed/admin — creates the initial super admin account
// Only works if no super_admin exists yet.
app.post("/admin", async (c) => {
  const db = getDb();

  // Check if super_admin already exists
  const existing = db
    .select()
    .from(users)
    .where(eq(users.role, "super_admin"))
    .get();

  if (existing) {
    return c.json({
      error: "Super admin already exists",
      hint: `Use email: ${existing.email}`,
    }, 409);
  }

  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch {}

  const email = (body.email as string) || "admin@afrifundedcapital.com";
  const password = (body.password as string) || "Admin@123456";
  const name = (body.name as string) || "Super Admin";

  // Hash password with argon2 (same as Better Auth uses)
  const hashedPassword = await hash(password);
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

  // Store the hashed password in the accounts table (Better Auth format)
  // Better Auth stores passwords in the `accounts` table via its adapter.
  // We need to insert into accounts manually since we're bypassing Better Auth.
  db.run(
    sql`INSERT INTO accounts (user_id, account_id, provider_id, password) VALUES (${result.id}, ${String(result.id)}, ${"email"}, ${hashedPassword})`
  );

  // Create wallet for the admin
  try {
    db.run(
      sql`INSERT INTO wallets (user_id, balance, referral_balance, bonus_balance, currency, created_at, updated_at) VALUES (${result.id}, 0, 0, 0, 'NGN', ${now}, ${now})`
    );
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

// Get enabled payment providers
app.get("/providers", (c) => {
  return c.json([{ name: "flutterwave", enabled: true }]);
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
