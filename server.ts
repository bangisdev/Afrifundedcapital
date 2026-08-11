/**
 * Production server — serves built static files + Hono API routes.
 * Run with: bun run server.ts
 * (Used inside Docker production container)
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { getDb, initDatabase } from "./src/server/db";
import { users, sessions, settings } from "./src/server/schema";
import { eq, and, gt } from "drizzle-orm";

// Import all route modules
import usersRouter from "./src/server/routes/users";
import challengesRouter from "./src/server/routes/challenges";
import notificationsRouter from "./src/server/routes/notifications";
import walletsRouter from "./src/server/routes/wallets";
import paymentsRouter from "./src/server/routes/payments";
import tradingRouter from "./src/server/routes/trading";
import kycRouter from "./src/server/routes/kyc";
import supportRouter from "./src/server/routes/support";
import affiliatesRouter from "./src/server/routes/affiliates";
import couponsRouter from "./src/server/routes/coupons";
import certificatesRouter from "./src/server/routes/certificates";
import payoutsRouter from "./src/server/routes/payouts";
import seedRouter from "./src/server/routes/seed";
import { startMT5Scheduler } from "./src/server/lib/mt5/scheduler";
import { startViolationDigestScheduler } from "./src/server/lib/violation-digest";

// Initialize database + migrations
initDatabase();

// Background MT5 sync + retry-queue scheduler (no-op without a gateway).
startMT5Scheduler(getDb());
// Weekly violation summary email to admins (idempotent, dedup'd).
startViolationDigestScheduler(getDb());

const COOKIE_NAME = "afc_session";
const PORT = parseInt(process.env.PORT || "5173", 10);

const app = new Hono();

// ─── CORS ───────────────────────────────────────────────
app.use("*", cors({
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : ["http://localhost:5173", "http://127.0.0.1:5173", "https://*.freebuff.dev"],
  credentials: true,
}));

// ─── Health check ───────────────────────────────────────
app.get("/api/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

// ─── Session helper (inline for production) ─────────────
function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader.split(";").map((ck) => {
      const [key, ...val] = ck.trim().split("=");
      return [key, val.join("=")];
    })
  );
}

// Re-use auth routes from the Hono app
// We'll mount the same auth logic
const scryptAsync = (await import("crypto")).promisify((await import("crypto")).scrypt);
const { randomBytes, timingSafeEqual } = await import("crypto");

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

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Auth routes ────────────────────────────────────────
app.post("/api/auth/sign-up/email", async (c) => {
  try {
    let body: Record<string, unknown> = {};
    try { body = await c.req.json(); } catch { /* malformed JSON body falls back to empty */ }

    const name = (body.name as string)?.trim();
    const email = (body.email as string)?.trim().toLowerCase();
    const password = body.password as string;

    if (!email || !password) return c.json({ error: "Email and password are required" }, 400);
    if (password.length < 6) return c.json({ error: "Password must be at least 6 characters" }, 400);

    const db = getDb();
    const existing = db.select().from(users).where(eq(users.email, email)).get();
    if (existing) return c.json({ error: "An account with this email already exists" }, 409);

    const hashedPassword = await hashPassword(password);
    const now = Date.now();

    const user = db.insert(users).values({
      name: name || email.split("@")[0],
      email,
      emailVerified: true,
      role: null,
      onboardingComplete: false,
      createdAt: now,
      updatedAt: now,
    }).returning().get();

    // Store password
    try {
      const { getSqlite } = await import("./src/server/db");
      const sqlite = getSqlite();
      sqlite.prepare("INSERT OR IGNORE INTO accounts (user_id, account_id, provider_id, password) VALUES (?, ?, ?, ?)")
        .run(String(user.id), String(user.id), "email", hashedPassword);
    } catch (e) { console.warn("[Auth] Could not store password:", e); }

    const token = generateToken();
    const sessionId = generateToken();
    db.insert(sessions).values({
      id: sessionId, token, userId: user.id,
      expiresAt: now + SESSION_DURATION_MS, createdAt: now,
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

app.post("/api/auth/sign-in/email", async (c) => {
  try {
    let body: Record<string, unknown> = {};
    try { body = await c.req.json(); } catch { /* malformed JSON body falls back to empty */ }

    const email = (body.email as string)?.trim().toLowerCase();
    const password = body.password as string;

    if (!email || !password) return c.json({ error: "Email and password are required" }, 400);

    const db = getDb();
    const user = db.select().from(users).where(eq(users.email, email)).get();
    if (!user) return c.json({ error: "Invalid email or password" }, 401);

    let passwordHash: string | null = null;
    try {
      const { getSqlite } = await import("./src/server/db");
      const sqlite = getSqlite();
      const row = sqlite.prepare("SELECT password FROM accounts WHERE user_id = ? AND provider_id = 'email' LIMIT 1")
        .get(String(user.id)) as { password: string } | undefined;
      if (row?.password) passwordHash = row.password;
    } catch { /* legacy accounts without a password hash are rejected below */ }

    if (!passwordHash) return c.json({ error: "Invalid email or password" }, 401);

    const valid = await verifyPassword(passwordHash, password);
    if (!valid) return c.json({ error: "Invalid email or password" }, 401);

    const token = generateToken();
    const now = Date.now();
    db.insert(sessions).values({
      id: generateToken(), token, userId: user.id,
      expiresAt: now + SESSION_DURATION_MS, createdAt: now,
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

app.get("/api/auth/session", (c) => {
  try {
    const cookieHeader = c.req.header("cookie") || "";
    const cookies = parseCookies(cookieHeader);
    const token = cookies[COOKIE_NAME];
    if (!token) return c.json({ error: "No session" }, 401);

    const db = getDb();
    const session = db.select().from(sessions)
      .where(and(eq(sessions.token, token), gt(sessions.expiresAt, Date.now()))).get();
    if (!session) return c.json({ error: "Invalid or expired session" }, 401);

    const user = db.select().from(users).where(eq(users.id, session.userId)).get();
    if (!user) return c.json({ error: "User not found" }, 401);

    return c.json({
      user: {
        id: user.id, name: user.name, email: user.email, image: user.image,
        role: user.role, isAnonymous: false,
        tradingExperience: user.tradingExperience, country: user.country,
        timezone: user.timezone, phone: user.phone,
        onboardingComplete: user.onboardingComplete, kycStatus: user.kycStatus,
        emailNotifications: user.emailNotifications,
        notificationPreferences: user.notificationPreferences,
        isDemoSeeded: user.isDemoSeeded, referralCode: user.referralCode,
      },
      session: { id: session.token, expiresAt: session.expiresAt },
    });
  } catch (err) {
    console.error("[Auth] session error:", err);
    return c.json({ error: "Internal error" }, 500);
  }
});

app.post("/api/auth/sign-out", (c) => {
  try {
    const cookieHeader = c.req.header("cookie") || "";
    const cookies = parseCookies(cookieHeader);
    const token = cookies[COOKIE_NAME];
    if (token) {
      try {
        const db = getDb();
        db.delete(sessions).where(eq(sessions.token, token)).run();
      } catch { /* session may already be gone; sign-out still succeeds */ }
    }
    c.header("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return c.json({ success: true });
  } catch { return c.json({ success: true }); }
});

// ─── API routes ─────────────────────────────────────────
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

// ─── Settings (simplified for production) ───────────────
app.get("/api/settings/public", (c) => {
  try {
    const db = getDb();
    const allSettings = db.select().from(settings).all();
    const result: Record<string, unknown> = {};
    for (const s of allSettings) {
      try { result[s.key] = JSON.parse(s.value); } catch { result[s.key] = s.value; }
    }
    return c.json(result);
  } catch { return c.json({}); }
});

app.get("/api/payments/flutterwave-config", (c) => {
  let publicKey = process.env.FLW_PUBLIC_KEY || "";
  try {
    const db = getDb();
    const setting = db.select().from(settings).where(eq(settings.key, "flutterwave_config")).get();
    if (setting) {
      const config = JSON.parse(setting.value);
      if (config.publicKey) publicKey = config.publicKey;
    }
  } catch { /* missing settings table or unparseable config falls back to env key */ }
  return c.json({ publicKey });
});

// ─── Static files + SPA fallback ────────────────────────
app.use("/*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ root: "./dist", path: "/index.html" }));

// ─── Start server ───────────────────────────────────────
console.log(`\n  🚀 AfriFundedCapital server running on http://localhost:${PORT}\n`);

export default {
  port: PORT,
  fetch: app.fetch,
};
