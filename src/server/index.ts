import { Hono } from "hono";
import { cors } from "hono/cors";
import { getDb } from "./db";
import { users, sessions, settings } from "./schema";
import { eq, and, gt } from "drizzle-orm";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { initDatabase } from "./db";
import type { Plugin, ViteDevServer } from "vite";
import {
  signInRateLimit,
  signUpRateLimit,
  promoteAdminRateLimit,
  loginAccountLockout,
} from "./middleware";

// Import route modules
import usersRouter from "./routes/users";
import challengesRouter from "./routes/challenges";
import notificationsRouter from "./routes/notifications";
import walletsRouter from "./routes/wallets";
import paymentsRouter from "./routes/payments";
import tradingRouter from "./routes/trading";
import kycRouter from "./routes/kyc";
import supportRouter from "./routes/support";
import affiliatesRouter from "./routes/affiliates";
import couponsRouter from "./routes/coupons";
import certificatesRouter from "./routes/certificates";
import payoutsRouter from "./routes/payouts";
import seedRouter from "./routes/seed";

// Initialize database
initDatabase();

const scryptAsync = promisify(scrypt);

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const COOKIE_NAME = "afc_session";

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const [salt, keyHex] = stored.split(":");
  if (!salt || !keyHex) return false;
  const key = Buffer.from(keyHex, "hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return timingSafeEqual(key, derivedKey);
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader.split(";").map((ck) => {
      const [key, ...val] = ck.trim().split("=");
      return [key, val.join("=")];
    })
  );
}

const app = new Hono();

// CORS
app.use("*", cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173", "https://*.freebuff.dev", "https://*.vly.sh"],
  credentials: true,
}));

// Health check
app.get("/api/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

// Flutterwave public config (reads from settings table first, then env)
app.get("/api/payments/flutterwave-config", (c) => {
  let publicKey = process.env.FLW_PUBLIC_KEY || "";
  try {
    const db = getDb();
    const setting = db.select().from(settings).where(eq(settings.key, "flutterwave_config")).get();
    if (setting) {
      const config = JSON.parse(setting.value);
      if (config.publicKey) publicKey = config.publicKey;
    }
  } catch {}
  return c.json({ publicKey });
});

// ═══════════════════════════════════════════════
//  AUTH ROUTES — inlined to avoid sub-router issues
// ═══════════════════════════════════════════════

// POST /api/auth/sign-up/email — rate limited: 3 per hour per IP
app.post("/api/auth/sign-up/email", signUpRateLimit, async (c) => {
  try {
    let body: Record<string, unknown> = {};
    try { body = await c.req.json(); } catch {}

    const name = (body.name as string)?.trim();
    const email = (body.email as string)?.trim().toLowerCase();
    const password = body.password as string;

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }
    if (password.length < 6) {
      return c.json({ error: "Password must be at least 6 characters" }, 400);
    }

    const db = getDb();
    const existing = db.select().from(users).where(eq(users.email, email)).get();
    if (existing) {
      return c.json({ error: "An account with this email already exists" }, 409);
    }

    const hashedPassword = await hashPassword(password);
    const now = Date.now();

    const user = db
      .insert(users)
      .values({
        name: name || email.split("@")[0],
        email,
        emailVerified: true,
        role: null,
        onboardingComplete: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    // Store password in accounts table via raw SQLite
    try {
      const { getSqlite } = await import("./db");
      const sqlite = getSqlite();
      sqlite.prepare(
        "INSERT OR IGNORE INTO accounts (user_id, account_id, provider_id, password) VALUES (?, ?, ?, ?)"
      ).run(String(user.id), String(user.id), "email", hashedPassword);
    } catch (e) {
      console.warn("[Auth] Could not store password:", e);
    }

    // Create session
    const token = generateToken();
    const sessionId = generateToken();
    db.insert(sessions).values({
      id: sessionId,
      token,
      userId: user.id,
      expiresAt: now + SESSION_DURATION_MS,
      createdAt: now,
    }).execute();

    c.header("Set-Cookie", `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION_MS / 1000}`);

    return c.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      session: { id: token, expiresAt: now + SESSION_DURATION_MS },
    }, 201);
  } catch (err) {
    console.error("[Auth] sign-up error:", err);
    return c.json({ error: "Internal error during sign up" }, 500);
  }
});

// POST /api/auth/sign-in/email — rate limited: 5 per 15min per IP + account lockout
app.post("/api/auth/sign-in/email", signInRateLimit, loginAccountLockout, async (c) => {
  try {
    let body: Record<string, unknown> = {};
    try { body = await c.req.json(); } catch {}

    const email = (body.email as string)?.trim().toLowerCase();
    const password = body.password as string;

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const db = getDb();
    const user = db.select().from(users).where(eq(users.email, email)).get();
    if (!user) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    // Find password hash — try accounts table first, then fall back to users table
    let passwordHash: string | null = null;
    try {
      const { getSqlite } = await import("./db");
      const sqlite = getSqlite();
      const row = sqlite.prepare(
        "SELECT password FROM accounts WHERE user_id = ? AND provider_id = 'email' LIMIT 1"
      ).get(String(user.id)) as { password: string } | undefined;
      if (row?.password) passwordHash = row.password;
    } catch (e) {
      console.warn("[Auth] accounts table read failed:", e);
    }

    // Fallback: check if password is stored directly on user row
    if (!passwordHash) {
      try {
        const { getSqlite } = await import("./db");
        const sqlite = getSqlite();
        const row = sqlite.prepare("SELECT password FROM users WHERE id = ?").get(user.id) as { password?: string } | undefined;
        if (row?.password) passwordHash = row.password;
      } catch {}
    }

    if (!passwordHash) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    const valid = await verifyPassword(passwordHash, password);
    if (!valid) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    const token = generateToken();
    const now = Date.now();
    const sessionId = generateToken();
    db.insert(sessions).values({
      id: sessionId,
      token,
      userId: user.id,
      expiresAt: now + SESSION_DURATION_MS,
      createdAt: now,
    }).execute();

    c.header("Set-Cookie", `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION_MS / 1000}`);

    return c.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      session: { id: token, expiresAt: now + SESSION_DURATION_MS },
    });
  } catch (err) {
    console.error("[Auth] sign-in error:", err);
    return c.json({ error: "Internal error during sign in" }, 500);
  }
});

// POST /api/auth/reset-admin — force-recreate super admin (super_admin only)
app.post("/api/auth/reset-admin", async (c) => {
  // Require authentication + super_admin role
  try {
    const cookieHeader = c.req.header("cookie") || "";
    const cookies = parseCookies(cookieHeader);
    const token = cookies[COOKIE_NAME];
    if (!token) return c.json({ error: "Authentication required" }, 401);
    const db = getDb();
    const session = db.select().from(sessions).where(and(eq(sessions.token, token), gt(sessions.expiresAt, Date.now()))).get();
    if (!session) return c.json({ error: "Invalid session" }, 401);
    const caller = db.select().from(users).where(eq(users.id, session.userId)).get();
    if (!caller || caller.role !== "super_admin") return c.json({ error: "Super admin access required" }, 403);
  } catch { return c.json({ error: "Auth check failed" }, 401); }
  try {
    let body: Record<string, unknown> = {};
    try { body = await c.req.json(); } catch {}

    const email = (body.email as string) || "admin@afrifundedcapital.com";
    const password = (body.password as string) || "Admin@123456";
    const name = (body.name as string) || "Super Admin";

    const db = getDb();
    const sqlite = (await import("./db")).getSqlite();

    // Delete existing admin and related data
    const existingAdmin = db.select().from(users).where(eq(users.role, "super_admin")).get();
    if (existingAdmin) {
      sqlite.prepare("DELETE FROM sessions WHERE user_id = ?").run(existingAdmin.id);
      sqlite.prepare("DELETE FROM accounts WHERE user_id = ?").run(String(existingAdmin.id));
      sqlite.prepare("DELETE FROM wallets WHERE user_id = ?").run(existingAdmin.id);
      db.delete(users).where(eq(users.id, existingAdmin.id)).run();
    }

    // Also delete any user with the target email
    const existingEmail = db.select().from(users).where(eq(users.email, email)).get();
    if (existingEmail) {
      sqlite.prepare("DELETE FROM sessions WHERE user_id = ?").run(existingEmail.id);
      sqlite.prepare("DELETE FROM accounts WHERE user_id = ?").run(String(existingEmail.id));
      sqlite.prepare("DELETE FROM wallets WHERE user_id = ?").run(existingEmail.id);
      db.delete(users).where(eq(users.id, existingEmail.id)).run();
    }

    // Create fresh admin with scrypt hash
    const hashedPassword = await hashPassword(password);
    const now = Date.now();

    const user = db.insert(users).values({
      name,
      email,
      emailVerified: true,
      role: "super_admin",
      onboardingComplete: true,
      createdAt: now,
      updatedAt: now,
    }).returning().get();

    sqlite.prepare(
      "INSERT OR IGNORE INTO accounts (user_id, account_id, provider_id, password) VALUES (?, ?, ?, ?)"
    ).run(String(user.id), String(user.id), "email", hashedPassword);

    try {
      sqlite.prepare(
        "INSERT OR IGNORE INTO wallets (user_id, balance, referral_balance, bonus_balance, currency, created_at, updated_at) VALUES (?, 0, 0, 0, 'NGN', ?, ?)"
      ).run(user.id, now, now);
    } catch {}

    return c.json({
      success: true,
      message: "Super admin reset successfully",
      credentials: { email, password, name },
    });
  } catch (err) {
    console.error("[Auth] reset-admin error:", err);
    return c.json({ error: "Failed to reset admin" }, 500);
  }
});

// POST /api/auth/promote-admin — rate limited: 3 per day per IP (bootstrap only)
app.post("/api/auth/promote-admin", promoteAdminRateLimit, async (c) => {
  try {
    let body: Record<string, unknown> = {};
    try { body = await c.req.json(); } catch {}

    const userId = body.userId as number;
    if (!userId) return c.json({ error: "userId is required" }, 400);

    const db = getDb();
    const user = db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) return c.json({ error: "User not found" }, 404);

    // If already super_admin, return success
    if (user.role === "super_admin") {
      return c.json({ success: true, message: "User is already super_admin" });
    }

    // Check if another super_admin exists — if so, require auth
    const existingAdmin = db.select().from(users).where(eq(users.role, "super_admin")).get();
    if (existingAdmin) {
      return c.json({ error: "A super_admin already exists. Use the dashboard to manage roles." }, 403);
    }

    // Bootstrap: promote to super_admin (no auth required for first admin)
    db.update(users).set({ role: "super_admin", onboardingComplete: true, updatedAt: Date.now() }).where(eq(users.id, userId)).run();

    return c.json({ success: true, message: `User ${userId} promoted to super_admin` });
  } catch (err) {
    console.error("[Auth] promote-admin error:", err);
    return c.json({ error: "Failed to promote user" }, 500);
  }
});

// GET /api/auth/session
app.get("/api/auth/session", (c) => {
  try {
    const cookieHeader = c.req.header("cookie") || "";
    const cookies = parseCookies(cookieHeader);
    const token = cookies[COOKIE_NAME];

    if (!token) {
      return c.json({ error: "No session" }, 401);
    }

    const db = getDb();
    const session = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.token, token), gt(sessions.expiresAt, Date.now())))
      .get();

    if (!session) {
      return c.json({ error: "Invalid or expired session" }, 401);
    }

    const user = db.select().from(users).where(eq(users.id, session.userId)).get();
    if (!user) {
      return c.json({ error: "User not found" }, 401);
    }

    return c.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        isAnonymous: false,
        tradingExperience: user.tradingExperience,
        country: user.country,
        timezone: user.timezone,
        phone: user.phone,
        onboardingComplete: user.onboardingComplete,
        kycStatus: user.kycStatus,
        emailNotifications: user.emailNotifications,
        notificationPreferences: user.notificationPreferences,
        isDemoSeeded: user.isDemoSeeded,
        referralCode: user.referralCode,
      },
      session: {
        id: session.token,
        expiresAt: session.expiresAt,
      },
    });
  } catch (err) {
    console.error("[Auth] session error:", err);
    return c.json({ error: "Internal error" }, 500);
  }
});

// POST /api/auth/sign-out
app.post("/api/auth/sign-out", (c) => {
  try {
    const cookieHeader = c.req.header("cookie") || "";
    const cookies = parseCookies(cookieHeader);
    const token = cookies[COOKIE_NAME];

    if (token) {
      try {
        const db = getDb();
        db.delete(sessions).where(eq(sessions.token, token)).run();
      } catch {}
    }

    c.header("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return c.json({ success: true });
  } catch (err) {
    console.error("[Auth] sign-out error:", err);
    return c.json({ success: true });
  }
});

// POST /api/auth/cleanup-orphan — reset password or delete users (super_admin only)
app.post("/api/auth/cleanup-orphan", async (c) => {
  // Require authentication + super_admin role
  try {
    const cookieHeader = c.req.header("cookie") || "";
    const cookies = parseCookies(cookieHeader);
    const token = cookies[COOKIE_NAME];
    if (!token) return c.json({ error: "Authentication required" }, 401);
    const db = getDb();
    const session = db.select().from(sessions).where(and(eq(sessions.token, token), gt(sessions.expiresAt, Date.now()))).get();
    if (!session) return c.json({ error: "Invalid session" }, 401);
    const caller = db.select().from(users).where(eq(users.id, session.userId)).get();
    if (!caller || caller.role !== "super_admin") return c.json({ error: "Super admin access required" }, 403);
  } catch { return c.json({ error: "Auth check failed" }, 401); }
  try {
    let body: Record<string, unknown> = {};
    try { body = await c.req.json(); } catch {}

    const email = (body.email as string)?.trim().toLowerCase();
    const action = (body.action as string) || "reset-password"; // "reset-password" or "delete"
    const newPassword = (body.password as string) || "Admin@123456";

    if (!email) {
      return c.json({ error: "Email is required" }, 400);
    }

    const db = getDb();
    const user = db.select().from(users).where(eq(users.email, email)).get();
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    const sqlite = (await import("./db")).getSqlite();

    // If action is delete, remove the user entirely
    if (action === "delete") {
      sqlite.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
      sqlite.prepare("DELETE FROM accounts WHERE user_id = ?").run(String(user.id));
      sqlite.prepare("DELETE FROM notifications WHERE user_id = ?").run(user.id);
      sqlite.prepare("DELETE FROM wallets WHERE user_id = ?").run(user.id);
      sqlite.prepare("DELETE FROM certificates WHERE user_id = ?").run(user.id);
      sqlite.prepare("DELETE FROM kyc_documents WHERE user_id = ?").run(user.id);
      db.delete(users).where(eq(users.id, user.id)).run();

      return c.json({
        success: true,
        message: `User ${email} deleted successfully`,
        email,
      });
    }

    // Default: reset password with scrypt
    sqlite.prepare("DELETE FROM accounts WHERE user_id = ? AND provider_id = 'email'").run(String(user.id));
    sqlite.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);

    const hashedPassword = await hashPassword(newPassword);
    sqlite.prepare(
      "INSERT OR REPLACE INTO accounts (user_id, account_id, provider_id, password) VALUES (?, ?, 'email', ?)"
    ).run(String(user.id), String(user.id), hashedPassword);

    return c.json({
      success: true,
      message: `Password reset for ${email}. You can now sign in with: ${newPassword}`,
      email,
    });
  } catch (err) {
    console.error("[Auth] cleanup-orphan error:", err);
    return c.json({ error: "Failed to cleanup orphan" }, 500);
  }
});

// POST /api/auth/nuke-duplicate — remove all super_admins except specified email (super_admin only)
app.post("/api/auth/nuke-duplicate", async (c) => {
  // Require authentication + super_admin role
  try {
    const cookieHeader = c.req.header("cookie") || "";
    const cookies = parseCookies(cookieHeader);
    const token = cookies[COOKIE_NAME];
    if (!token) return c.json({ error: "Authentication required" }, 401);
    const db = getDb();
    const session = db.select().from(sessions).where(and(eq(sessions.token, token), gt(sessions.expiresAt, Date.now()))).get();
    if (!session) return c.json({ error: "Invalid session" }, 401);
    const caller = db.select().from(users).where(eq(users.id, session.userId)).get();
    if (!caller || caller.role !== "super_admin") return c.json({ error: "Super admin access required" }, 403);
  } catch { return c.json({ error: "Auth check failed" }, 401); }
  try {
    let body: Record<string, unknown> = {};
    try { body = await c.req.json(); } catch {}

    const keepEmail = (body.email as string)?.trim().toLowerCase() || "admin@afrifundedcapital.com";
    const sqlite = (await import("./db")).getSqlite();
    const db = getDb();

    // Find all super_admins
    const allAdmins = sqlite.prepare("SELECT id, email FROM users WHERE role = 'super_admin'").all() as Array<{ id: number; email: string }>;

    const deleted: string[] = [];
    for (const admin of allAdmins) {
      if (admin.email === keepEmail) continue; // Skip the one we want to keep
      sqlite.prepare("DELETE FROM sessions WHERE user_id = ?").run(admin.id);
      sqlite.prepare("DELETE FROM accounts WHERE user_id = ?").run(String(admin.id));
      sqlite.prepare("DELETE FROM notifications WHERE user_id = ?").run(admin.id);
      sqlite.prepare("DELETE FROM wallets WHERE user_id = ?").run(admin.id);
      sqlite.prepare("DELETE FROM certificates WHERE user_id = ?").run(admin.id);
      sqlite.prepare("DELETE FROM kyc_documents WHERE user_id = ?").run(admin.id);
      db.delete(users).where(eq(users.id, admin.id)).run();
      deleted.push(admin.email);
    }

    return c.json({ success: true, deleted, kept: keepEmail });
  } catch (err) {
    console.error("[Auth] nuke-duplicate error:", err);
    return c.json({ error: "Failed to nuke duplicates" }, 500);
  }
});

// POST /api/auth/delete-user — delete a user by email (admin only)
app.post("/api/auth/delete-user", async (c) => {
  try {
    // Require authentication
    const cookieHeader = c.req.header("cookie") || "";
    const cookies = parseCookies(cookieHeader);
    const token = cookies[COOKIE_NAME];
    if (!token) return c.json({ error: "Not authenticated" }, 401);

    const db = getDb();
    const session = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.token, token), gt(sessions.expiresAt, Date.now())))
      .get();
    if (!session) return c.json({ error: "Invalid session" }, 401);

    const caller = db.select().from(users).where(eq(users.id, session.userId)).get();
    if (!caller || caller.role !== "super_admin") {
      return c.json({ error: "Only super_admin can delete users" }, 403);
    }

    let body: Record<string, unknown> = {};
    try { body = await c.req.json(); } catch {}

    const email = (body.email as string)?.trim().toLowerCase();
    if (!email) return c.json({ error: "Email is required" }, 400);

    // Prevent deleting yourself
    if (email === caller.email) {
      return c.json({ error: "Cannot delete your own account" }, 400);
    }

    const target = db.select().from(users).where(eq(users.email, email)).get();
    if (!target) return c.json({ error: "User not found" }, 404);

    // Prevent deleting the last super_admin
    if (target.role === "super_admin") {
      const adminCount = db.select().from(users).where(eq(users.role, "super_admin")).all().length;
      if (adminCount <= 1) {
        return c.json({ error: "Cannot delete the last super_admin" }, 400);
      }
    }

    // Cascade delete related data
    const sqlite = (await import("./db")).getSqlite();
    sqlite.prepare("DELETE FROM sessions WHERE user_id = ?").run(target.id);
    sqlite.prepare("DELETE FROM accounts WHERE user_id = ?").run(String(target.id));
    sqlite.prepare("DELETE FROM notifications WHERE user_id = ?").run(target.id);
    sqlite.prepare("DELETE FROM wallets WHERE user_id = ?").run(target.id);
    sqlite.prepare("DELETE FROM certificates WHERE user_id = ?").run(target.id);
    sqlite.prepare("DELETE FROM kyc_documents WHERE user_id = ?").run(target.id);
    db.delete(users).where(eq(users.id, target.id)).run();

    return c.json({ success: true, message: `User ${email} deleted` });
  } catch (err) {
    console.error("[Auth] delete-user error:", err);
    return c.json({ error: "Failed to delete user" }, 500);
  }
});

// PUT /api/auth/update-user
app.put("/api/auth/update-user", async (c) => {
  try {
    const cookieHeader = c.req.header("cookie") || "";
    const cookies = parseCookies(cookieHeader);
    const token = cookies[COOKIE_NAME];
    if (!token) return c.json({ error: "Not authenticated" }, 401);

    const db = getDb();
    const session = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.token, token), gt(sessions.expiresAt, Date.now())))
      .get();

    if (!session) return c.json({ error: "Invalid session" }, 401);

    let body: Record<string, unknown> = {};
    try { body = await c.req.json(); } catch {}

    const allowedFields = [
      "name", "tradingExperience", "country", "timezone",
      "phone", "onboardingComplete", "emailNotifications",
      "notificationPreferences", "isDemoSeeded", "role",
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ error: "No valid fields to update" }, 400);
    }

    updates.updatedAt = Date.now();
    db.update(users).set(updates).where(eq(users.id, session.userId)).run();

    // Also update role via raw SQLite if provided (Drizzle may skip it)
    if (updates.role) {
      try {
        const { getSqlite } = await import("./db");
        const sqlite = getSqlite();
        sqlite.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").run(updates.role, Date.now(), session.userId);
      } catch {}
    }

    return c.json({ success: true });
  } catch (err) {
    console.error("[Auth] update-user error:", err);
    return c.json({ error: "Failed to update user" }, 500);
  }
});

// ═══════════════════════════════════════════════
//  OTHER ROUTES
// ═══════════════════════════════════════════════
app.route("/api/users", usersRouter);
app.route("/api/challenges", challengesRouter);
app.route("/api/notifications", notificationsRouter);
app.route("/api/wallets", walletsRouter);
app.route("/api/payments", paymentsRouter);
app.route("/api/trading", tradingRouter);
app.route("/api/kyc", kycRouter);
app.route("/api/support", supportRouter);
app.route("/api/affiliates", affiliatesRouter);
app.route("/api/coupons", couponsRouter);
app.route("/api/certificates", certificatesRouter);
app.route("/api/payouts", payoutsRouter);
app.route("/api/seed", seedRouter);

// ═══════════════════════════════════════════════
//  VITE PLUGIN — mounts Hono into dev server
// ═══════════════════════════════════════════════
export function honoPlugin(): Plugin {
  let server: ViteDevServer | null = null;

  return {
    name: "hono-server",
    configureServer(devServer) {
      server = devServer;
      devServer.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          return next();
        }
        try {
          const protocol = req.headers["x-forwarded-proto"] || "http";
          const host = req.headers.host || "localhost:5173";
          const url = new URL(req.url!, `${protocol}://${host}`);

          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (v) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
          }

          let body: BodyInit | undefined;
          if (req.method !== "GET" && req.method !== "HEAD") {
            const raw = await new Promise<Buffer>((resolve, reject) => {
              const chunks: Buffer[] = [];
              req.on("data", (chunk: Buffer) => chunks.push(chunk));
              req.on("end", () => resolve(Buffer.concat(chunks)));
              req.on("error", reject);
            });
            body = new Uint8Array(raw) as unknown as BodyInit;
          }

          const webReq = new Request(url.toString(), {
            method: req.method,
            headers,
            body,
          });

          const webRes = await app.fetch(webReq);

          res.statusCode = webRes.status;
          webRes.headers.forEach((v, k) => res.setHeader(k, v));
          const resBody = await webRes.arrayBuffer();
          res.end(Buffer.from(resBody));
        } catch (err) {
          console.error("[Hono] Error:", err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      });
    },
  };
}

export default app;
