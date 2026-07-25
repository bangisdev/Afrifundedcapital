import { Hono } from "hono";
import { getDb, getSqlite } from "./db";
import { users, sessions } from "./schema";
import { eq, and, gt } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import { randomBytes } from "crypto";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const COOKIE_NAME = "afc_session";

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

// ─── Custom Auth Router ────────────────────────────────────
export const authRouter = new Hono();

// ─── POST /api/auth/sign-up/email ──────────────────────────
authRouter.post("/sign-up/email", async (c) => {
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

  // Check if user already exists
  const existing = db.select().from(users).where(eq(users.email, email)).get();
  if (existing) {
    return c.json({ error: "An account with this email already exists" }, 409);
  }

  // Hash password
  const hashedPassword = await hash(password);
  const now = Date.now();

  // Create user
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

  // Store password hash in accounts table using raw SQLite
  try {
    const sqlite = getSqlite();
    sqlite.prepare(
      "INSERT OR IGNORE INTO accounts (user_id, account_id, provider_id, password) VALUES (?, ?, ?, ?)"
    ).run(String(user.id), String(user.id), "email", hashedPassword);
  } catch (e) {
    console.warn("[Auth] Could not store password in accounts table:", e);
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

  // Set cookie
  c.header("Set-Cookie", `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION_MS / 1000}`);

  return c.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    session: { id: token, expiresAt: now + SESSION_DURATION_MS },
  }, 201);
});

// ─── POST /api/auth/sign-in/email ──────────────────────────
authRouter.post("/sign-in/email", async (c) => {
  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch {}

  const email = (body.email as string)?.trim().toLowerCase();
  const password = body.password as string;

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  const db = getDb();

  // Find user
  const user = db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  // Find password hash from accounts table using raw SQLite
  let passwordHash: string | null = null;
  try {
    const sqlite = getSqlite();
    const row = sqlite.prepare(
      "SELECT password FROM accounts WHERE user_id = ? AND provider_id = 'email' LIMIT 1"
    ).get(String(user.id)) as { password: string } | undefined;
    if (row) {
      passwordHash = row.password;
    }
  } catch (e) {
    console.warn("[Auth] Failed to read password:", e);
  }

  if (!passwordHash) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  // Verify password
  const valid = await verify(passwordHash, password);
  if (!valid) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  // Create session
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

  // Set cookie
  c.header("Set-Cookie", `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION_MS / 1000}`);

  return c.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    session: { id: token, expiresAt: now + SESSION_DURATION_MS },
  });
});

// ─── GET /api/auth/session ─────────────────────────────────
authRouter.get("/session", (c) => {
  const cookieHeader = c.req.header("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((ck) => {
      const [key, ...val] = ck.trim().split("=");
      return [key, val.join("=")];
    })
  );

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
});

// ─── POST /api/auth/sign-out ───────────────────────────────
authRouter.post("/sign-out", (c) => {
  const cookieHeader = c.req.header("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((ck) => {
      const [key, ...val] = ck.trim().split("=");
      return [key, val.join("=")];
    })
  );

  const token = cookies[COOKIE_NAME];
  if (token) {
    try {
      const db = getDb();
      db.delete(sessions).where(eq(sessions.token, token)).run();
    } catch (e) {
      // Non-critical
    }
  }

  c.header("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);

  return c.json({ success: true });
});

// ─── PUT /api/auth/update-user ─────────────────────────────
authRouter.put("/update-user", async (c) => {
  const cookieHeader = c.req.header("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((ck) => {
      const [key, ...val] = ck.trim().split("=");
      return [key, val.join("=")];
    })
  );

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

  // Only allow updating safe fields
  const allowedFields = [
    "name", "tradingExperience", "country", "timezone",
    "phone", "onboardingComplete", "emailNotifications",
    "notificationPreferences", "isDemoSeeded",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  updates.updatedAt = Date.now();

  try {
    db.update(users).set(updates).where(eq(users.id, session.userId)).run();
  } catch (e) {
    return c.json({ error: "Failed to update user" }, 500);
  }

  return c.json({ success: true });
});
