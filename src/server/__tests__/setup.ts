/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Test setup — creates a fresh SQLite test database and builds the Hono app
 * for each test suite.  Exports `buildTestApp()` so tests can import the
 * fully-wired Hono instance without relying on the Vite dev-server plugin.
 */
import { vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { eq, and, gt } from "drizzle-orm";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import path from "path";
import fs from "fs";

import * as schema from "../schema";
import { runMigrations } from "../migrate";

// ─── Unique test DB per run ──────────────────────────────────
const TEST_DB_PATH = path.join(
  process.cwd(),
  `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`,
);

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqliteInstance: InstanceType<typeof Database> | null = null;

/** Return (and lazily create) the Drizzle instance for the test DB. */
export function getTestDb() {
  if (!dbInstance) {
    sqliteInstance = new Database(TEST_DB_PATH);
    sqliteInstance.pragma("journal_mode = WAL");
    sqliteInstance.pragma("foreign_keys = ON");
    runMigrations(sqliteInstance);
    dbInstance = drizzle(sqliteInstance, { schema });
  }
  return dbInstance;
}

/** Return the raw SQLite handle (for operations that need raw SQL). */
export function getTestSqlite() {
  if (!sqliteInstance) getTestDb();
  return sqliteInstance!;
}

// ─── Crypto helpers ──────────────────────────────────────────
const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

// ─── Build the Hono app for tests ─────────────────────────────
export async function buildTestApp(): Promise<Hono> {
  // Reset module registry so route modules re-import with fresh mock
  vi.resetModules();

  const db = getTestDb();
  const sqlite = getTestSqlite();

  // Create a mock getDb that returns our test DB
  const mockGetDb = () => db;

  // Mock the db module so route modules get our test DB
  vi.doMock("../db", () => ({
    getDb: mockGetDb,
    getSqlite: () => sqlite,
    initDatabase: () => db,
  }));

  const scryptAsyncLocal = promisify(scrypt);

  async function hashPw(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const derivedKey = (await scryptAsyncLocal(password, salt, 64)) as Buffer;
    return `${salt}:${derivedKey.toString("hex")}`;
  }

  async function verifyPw(stored: string, password: string): Promise<boolean> {
    const [salt, keyHex] = stored.split(":");
    if (!salt || !keyHex) return false;
    const key = Buffer.from(keyHex, "hex");
    const derivedKey = (await scryptAsyncLocal(password, salt, 64)) as Buffer;
    return timingSafeEqual(key, derivedKey);
  }

  function genToken(): string {
    return randomBytes(32).toString("hex");
  }

  function parseCookies(header: string): Record<string, string> {
    return Object.fromEntries(
      header.split(";").map((ck) => {
        const [key, ...val] = ck.trim().split("=");
        return [key, val.join("=")];
      }),
    );
  }

  const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
  const COOKIE_NAME = "afc_session";

  const app = new Hono();

  // CORS
  app.use(
    "*",
    cors({
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      credentials: true,
    }),
  );

  // ── Health ───────────────────────────────────────────────────
  app.get("/api/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

  // ── Auth: Sign Up ────────────────────────────────────────────
  app.post("/api/auth/sign-up/email", async (c) => {
    let body: Record<string, unknown> = {};
    try { body = await c.req.json(); } catch {}

    const name = (body.name as string)?.trim();
    const email = (body.email as string)?.trim().toLowerCase();
    const password = body.password as string;

    if (!email || !password) return c.json({ error: "Email and password are required" }, 400);
    if (password.length < 6) return c.json({ error: "Password must be at least 6 characters" }, 400);

    const existing = db.select().from(schema.users).where(eq(schema.users.email, email)).get();
    if (existing) return c.json({ error: "An account with this email already exists" }, 409);

    const hashedPassword = await hashPw(password);
    const now = Date.now();

    const user = db
      .insert(schema.users)
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

    sqlite.prepare(
      "INSERT OR IGNORE INTO accounts (user_id, account_id, provider_id, password) VALUES (?, ?, ?, ?)"
    ).run(String(user.id), String(user.id), "email", hashedPassword);

    const token = genToken();
    const sessionId = genToken();
    db.insert(schema.sessions)
      .values({ id: sessionId, token, userId: user.id, expiresAt: now + SESSION_DURATION_MS, createdAt: now })
      .execute();

    c.header("Set-Cookie", `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION_MS / 1000}`);

    return c.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      session: { id: token, expiresAt: now + SESSION_DURATION_MS },
    }, 201);
  });

  // ── Auth: Sign In ────────────────────────────────────────────
  app.post("/api/auth/sign-in/email", async (c) => {
    let body: Record<string, unknown> = {};
    try { body = await c.req.json(); } catch {}

    const email = (body.email as string)?.trim().toLowerCase();
    const password = body.password as string;

    if (!email || !password) return c.json({ error: "Email and password are required" }, 400);

    const user = db.select().from(schema.users).where(eq(schema.users.email, email)).get();
    if (!user) return c.json({ error: "Invalid email or password" }, 401);

    let passwordHash: string | null = null;
    try {
      const row = sqlite.prepare(
        "SELECT password FROM accounts WHERE user_id = ? AND provider_id = 'email' LIMIT 1"
      ).get(String(user.id)) as { password: string } | undefined;
      if (row?.password) passwordHash = row.password;
    } catch {}

    if (!passwordHash) {
      try {
        const row = sqlite.prepare("SELECT password FROM users WHERE id = ?").get(user.id) as { password?: string } | undefined;
        if (row?.password) passwordHash = row.password;
      } catch {}
    }

    if (!passwordHash) return c.json({ error: "Invalid email or password" }, 401);

    const valid = await verifyPw(passwordHash, password);
    if (!valid) return c.json({ error: "Invalid email or password" }, 401);

    const token = genToken();
    const now = Date.now();
    const sessionId = genToken();
    db.insert(schema.sessions)
      .values({ id: sessionId, token, userId: user.id, expiresAt: now + SESSION_DURATION_MS, createdAt: now })
      .execute();

    c.header("Set-Cookie", `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION_MS / 1000}`);

    return c.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      session: { id: token, expiresAt: now + SESSION_DURATION_MS },
    });
  });

  // ── Auth: Session ────────────────────────────────────────────
  app.get("/api/auth/session", (c) => {
    try {
      const cookieHeader = c.req.header("cookie") || "";
      const cookies = parseCookies(cookieHeader);
      const token = cookies[COOKIE_NAME];
      if (!token) return c.json({ error: "No session" }, 401);

      const sess = db.select().from(schema.sessions)
        .where(and(eq(schema.sessions.token, token), gt(schema.sessions.expiresAt, Date.now())))
        .get();
      if (!sess) return c.json({ error: "Invalid or expired session" }, 401);

      const user = db.select().from(schema.users).where(eq(schema.users.id, sess.userId)).get();
      if (!user) return c.json({ error: "User not found" }, 401);

      return c.json({
        user: { id: user.id, name: user.name, email: user.email, role: user.role, isAnonymous: false },
        session: { id: sess.token, expiresAt: sess.expiresAt },
      });
    } catch {
      return c.json({ error: "Internal error" }, 500);
    }
  });

  // ── Auth: Sign Out ───────────────────────────────────────────
  app.post("/api/auth/sign-out", (c) => {
    const cookieHeader = c.req.header("cookie") || "";
    const cookies = parseCookies(cookieHeader);
    const token = cookies[COOKIE_NAME];
    if (token) {
      try { db.delete(schema.sessions).where(eq(schema.sessions.token, token)).run(); } catch {}
    }
    c.header("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return c.json({ success: true });
  });

  // ── Auth: Promote Admin ──────────────────────────────────────
  app.post("/api/auth/promote-admin", async (c) => {
    let body: Record<string, unknown> = {};
    try { body = await c.req.json(); } catch {}

    const userId = body.userId as number;
    if (!userId) return c.json({ error: "userId is required" }, 400);

    const user = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
    if (!user) return c.json({ error: "User not found" }, 404);
    if (user.role === "super_admin") return c.json({ success: true, message: "User is already super_admin" });

    const existingAdmin = db.select().from(schema.users).where(eq(schema.users.role, "super_admin")).get();
    if (existingAdmin) return c.json({ error: "A super_admin already exists. Use the dashboard to manage roles." }, 403);

    db.update(schema.users)
      .set({ role: "super_admin", onboardingComplete: true, updatedAt: Date.now() })
      .where(eq(schema.users.id, userId))
      .run();

    return c.json({ success: true, message: `User ${userId} promoted to super_admin` });
  });

  // ── Mount route modules ──────────────────────────────────────
  // The vi.doMock above ensures route modules get our test DB via getDb()
  const kycModule = await import("../routes/kyc");
  const paymentsModule = await import("../routes/payments");
  const challengesModule = await import("../routes/challenges");
  const walletsModule = await import("../routes/wallets");
  const notificationsModule = await import("../routes/notifications");
  const supportModule = await import("../routes/support");
  const couponsModule = await import("../routes/coupons");
  const certificatesModule = await import("../routes/certificates");
  const affiliatesModule = await import("../routes/affiliates");
  const tradingModule = await import("../routes/trading");
  const payoutsModule = await import("../routes/payouts");
  const usersModule = await import("../routes/users");

  app.route("/api/kyc", kycModule.default);
  app.route("/api/payments", paymentsModule.default);
  app.route("/api/challenges", challengesModule.default);
  app.route("/api/wallets", walletsModule.default);
  app.route("/api/notifications", notificationsModule.default);
  app.route("/api/support", supportModule.default);
  app.route("/api/coupons", couponsModule.default);
  app.route("/api/certificates", certificatesModule.default);
  app.route("/api/affiliates", affiliatesModule.default);
  app.route("/api/trading", tradingModule.default);
  app.route("/api/payouts", payoutsModule.default);
  app.route("/api/users", usersModule.default);

  // Unmock so other tests can re-mock cleanly
  vi.doUnmock("../db");

  return app;
}

// ─── Cleanup ──────────────────────────────────────────────────
export function cleanupTestDb() {
  try {
    if (sqliteInstance) {
      sqliteInstance.close();
      sqliteInstance = null;
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    for (const ext of ["-wal", "-shm"]) {
      const p = TEST_DB_PATH + ext;
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  } catch {}
  dbInstance = null;
}

// ─── Auth helpers ─────────────────────────────────────────────
export async function signUp(
  app: Hono,
  data: { name?: string; email: string; password: string },
): Promise<{ status: number; body: Record<string, unknown>; cookie: string }> {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const setCookie = res.headers.get("set-cookie") || "";
  const cookieMatch = setCookie.match(/afc_session=([^;]+)/);
  const cookie = cookieMatch ? `afc_session=${cookieMatch[1]}` : "";
  const body = await res.json();
  return { status: res.status, body: body as Record<string, unknown>, cookie };
}

export async function signIn(
  app: Hono,
  data: { email: string; password: string },
): Promise<{ status: number; body: Record<string, unknown>; cookie: string }> {
  const res = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const setCookie = res.headers.get("set-cookie") || "";
  const cookieMatch = setCookie.match(/afc_session=([^;]+)/);
  const cookie = cookieMatch ? `afc_session=${cookieMatch[1]}` : "";
  const body = await res.json();
  return { status: res.status, body: body as Record<string, unknown>, cookie };
}

export async function authGet(
  app: Hono,
  url: string,
  cookie: string,
): Promise<{ status: number; body: any }> {
  const res = await app.request(url, {
    method: "GET",
    headers: { Cookie: cookie },
  });
  const body = await res.json();
  return { status: res.status, body };
}

export async function authPost(
  app: Hono,
  url: string,
  cookie: string,
  data?: unknown,
): Promise<{ status: number; body: any }> {
  const res = await app.request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: data ? JSON.stringify(data) : undefined,
  });
  const body = await res.json();
  return { status: res.status, body };
}

export async function authPut(
  app: Hono,
  url: string,
  cookie: string,
  data?: unknown,
): Promise<{ status: number; body: any }> {
  const res = await app.request(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: data ? JSON.stringify(data) : undefined,
  });
  const body = await res.json();
  return { status: res.status, body };
}

export async function authDelete(
  app: Hono,
  url: string,
  cookie: string,
): Promise<{ status: number; body: any }> {
  const res = await app.request(url, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
  const body = await res.json();
  return { status: res.status, body };
}
