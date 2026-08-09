/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Auth hardening routes — email verification, password recovery, 2FA, session
 * management, and login history. Mounted at /api/auth alongside the inline
 * sign-up/sign-in routes in index.ts.
 */
import { Hono } from "hono";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { eq, and, gt, desc, ne } from "drizzle-orm";
import QRCode from "qrcode";

import { getDb, getSqlite } from "../db";
import { users, sessions, loginHistory } from "../schema";
import { writeAuditLog } from "../lib/audit";
import { sendEmail, emailVerificationEmail, passwordResetEmail, APP_URL } from "../lib/email";
import { signUpRateLimit } from "../middleware";
import {
  generateBase32Secret,
  verifyTotp,
  buildOtpauthUrl,
  generateBackupCodes,
  hashBackupCode,
  consumeBackupCode,
  consumeTwoFactorChallenge,
} from "../lib/security";

const scryptAsync = promisify(scrypt);

const COOKIE_NAME = "afc_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

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
    }),
  );
}

function getClientIp(c: { req: { header(name: string): string | undefined } }): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}

/** Resolve the acting user + session from the afc_session cookie, or null. */
function getAuth(c: { req: { header(name: string): string | undefined } }): { user: any; session: any } | null {
  try {
    const cookieHeader = c.req.header("cookie") || "";
    const token = parseCookies(cookieHeader)[COOKIE_NAME];
    if (!token) return null;
    const db = getDb();
    const session = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.token, token), gt(sessions.expiresAt, Date.now())))
      .get();
    if (!session) return null;
    const user = db.select().from(users).where(eq(users.id, session.userId)).get();
    if (!user) return null;
    return { user, session };
  } catch {
    return null;
  }
}

/** Set the session cookie header on a response. */
function setSessionCookie(c: any, token: string): void {
  c.header(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION_MS / 1000}`,
  );
}

/** Read the email password hash (accounts table, with users-table fallback). */
function getPasswordHash(userId: number): string | null {
  try {
    const sqlite = getSqlite();
    const row = sqlite
      .prepare("SELECT password FROM accounts WHERE user_id = ? AND provider_id = 'email' LIMIT 1")
      .get(String(userId)) as { password?: string } | undefined;
    if (row?.password) return row.password;
  } catch { /* non-critical */ }
  try {
    const sqlite = getSqlite();
    const row = sqlite.prepare("SELECT password FROM users WHERE id = ?").get(userId) as { password?: string } | undefined;
    if (row?.password) return row.password;
  } catch { /* non-critical */ }
  return null;
}

function setPassword(userId: number, passwordHash: string): void {
  const sqlite = getSqlite();
  // Delete-then-insert (never INSERT OR REPLACE): the accounts PK is `id`, so
  // OR REPLACE silently inserts a SECOND email row and the unordered
  // `LIMIT 1` password lookup may keep returning the stale hash.
  sqlite.prepare("DELETE FROM accounts WHERE user_id = ? AND provider_id = 'email'").run(String(userId));
  sqlite
    .prepare("INSERT INTO accounts (user_id, account_id, provider_id, password) VALUES (?, ?, 'email', ?)")
    .run(String(userId), String(userId), passwordHash);
}

function recordLoginHistory(userId: number, success: boolean, c: any, failedReason?: string): void {
  try {
    const db = getDb();
    db.insert(loginHistory)
      .values({
        userId,
        ipAddress: getClientIp(c),
        deviceInfo: (c.req.header("user-agent") || "").slice(0, 200),
        location: null,
        success,
        failedReason: failedReason || null,
        timestamp: Date.now(),
      })
      .run();
  } catch { /* non-critical */ }
}

function userPublic(user: any): Record<string, unknown> {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: !!user.emailVerified,
    twoFactorEnabled: !!user.twoFactorEnabled,
  };
}

export const securityRouter = new Hono();

// ─── Email verification ─────────────────────────────────

// POST /api/auth/verify-email — { token }
securityRouter.post("/verify-email", async (c) => {
  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch { /* non-critical */ }
  const token = (body.token as string)?.trim();
  if (!token) return c.json({ error: "Verification token is required" }, 400);

  const db = getDb();
  const user = db.select().from(users).where(eq(users.emailVerificationToken, token)).get();
  if (!user) return c.json({ error: "Invalid or expired verification link" }, 400);
  if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < Date.now()) {
    return c.json({ error: "Verification link has expired. Request a new one." }, 400);
  }

  db.update(users)
    .set({ emailVerified: true, emailVerificationToken: null, emailVerificationExpiresAt: null, updatedAt: Date.now() })
    .where(eq(users.id, user.id))
    .run();

  writeAuditLog(db, {
    userId: user.id,
    action: "auth.email_verified",
    entity: "user",
    entityId: user.id,
    details: { email: user.email },
    ipAddress: getClientIp(c),
  });

  return c.json({ success: true, email: user.email });
});

// POST /api/auth/resend-verification — { email } (rate limited: 3/hour/IP)
securityRouter.post("/resend-verification", signUpRateLimit, async (c) => {
  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch { /* non-critical */ }
  const email = (body.email as string)?.trim().toLowerCase();
  if (!email) return c.json({ error: "Email is required" }, 400);

  const db = getDb();
  const user = db.select().from(users).where(eq(users.email, email)).get();
  // Do not reveal whether an account exists — always return success.
  if (user && !user.emailVerified) {
    const token = generateToken();
    db.update(users)
      .set({ emailVerificationToken: token, emailVerificationExpiresAt: Date.now() + EMAIL_VERIFY_TTL_MS, updatedAt: Date.now() })
      .where(eq(users.id, user.id))
      .run();
    const verifyUrl = `${APP_URL}/auth?verify=${token}`;
    void sendEmail({ ...emailVerificationEmail(user.name || user.email?.split("@")[0] || "Trader", verifyUrl), to: email }).catch(() => {});
    writeAuditLog(db, {
      userId: user.id,
      action: "auth.resend_verification",
      entity: "user",
      entityId: user.id,
      ipAddress: getClientIp(c),
    });
  }
  return c.json({ success: true, message: "If an account exists, a verification email has been sent." });
});

// ─── Password recovery ──────────────────────────────────

// POST /api/auth/forgot-password — { email } (rate limited)
securityRouter.post("/forgot-password", signUpRateLimit, async (c) => {
  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch { /* non-critical */ }
  const email = (body.email as string)?.trim().toLowerCase();
  if (!email) return c.json({ error: "Email is required" }, 400);

  const db = getDb();
  const user = db.select().from(users).where(eq(users.email, email)).get();
  // Always succeed to avoid user enumeration.
  if (user) {
    const token = generateToken();
    db.update(users)
      .set({ resetPasswordToken: token, resetPasswordExpiresAt: Date.now() + RESET_TTL_MS, updatedAt: Date.now() })
      .where(eq(users.id, user.id))
      .run();
    const resetUrl = `${APP_URL}/auth?reset=${token}`;
    void sendEmail({ ...passwordResetEmail(user.name || user.email?.split("@")[0] || "Trader", resetUrl), to: email }).catch(() => {});
    writeAuditLog(db, {
      userId: user.id,
      action: "auth.password_reset_request",
      entity: "user",
      entityId: user.id,
      ipAddress: getClientIp(c),
    });
  }
  return c.json({ success: true, message: "If an account exists, a password reset link has been sent." });
});

// POST /api/auth/reset-password — { token, password }
securityRouter.post("/reset-password", async (c) => {
  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch { /* non-critical */ }
  const token = (body.token as string)?.trim();
  const password = body.password as string;
  if (!token || !password) return c.json({ error: "Token and new password are required" }, 400);
  if (password.length < 6) return c.json({ error: "Password must be at least 6 characters" }, 400);

  const db = getDb();
  const user = db.select().from(users).where(eq(users.resetPasswordToken, token)).get();
  if (!user) return c.json({ error: "Invalid or expired reset link" }, 400);
  if (!user.resetPasswordExpiresAt || user.resetPasswordExpiresAt < Date.now()) {
    return c.json({ error: "Reset link has expired. Request a new one." }, 400);
  }

  const hashed = await hashPassword(password);
  try {
    setPassword(user.id, hashed);
  } catch {
    return c.json({ error: "Failed to update password" }, 500);
  }

  // Invalidate every session — the user must sign in again with the new password.
  db.delete(sessions).where(eq(sessions.userId, user.id)).run();
  db.update(users)
    .set({ resetPasswordToken: null, resetPasswordExpiresAt: null, updatedAt: Date.now() })
    .where(eq(users.id, user.id))
    .run();

  writeAuditLog(db, {
    userId: user.id,
    action: "auth.password_reset",
    entity: "user",
    entityId: user.id,
    ipAddress: getClientIp(c),
  });

  return c.json({ success: true, message: "Password updated. Please sign in." });
});

// POST /api/auth/change-password — { currentPassword, newPassword } (auth)
securityRouter.post("/change-password", async (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Authentication required" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch { /* non-critical */ }
  const currentPassword = body.currentPassword as string;
  const newPassword = body.newPassword as string;
  if (!currentPassword || !newPassword) return c.json({ error: "Current and new password are required" }, 400);
  if (newPassword.length < 6) return c.json({ error: "Password must be at least 6 characters" }, 400);

  const stored = getPasswordHash(auth.user.id);
  if (!stored || !(await verifyPassword(stored, currentPassword))) {
    return c.json({ error: "Current password is incorrect" }, 400);
  }

  const hashed = await hashPassword(newPassword);
  try {
    setPassword(auth.user.id, hashed);
  } catch {
    return c.json({ error: "Failed to update password" }, 500);
  }

  writeAuditLog(getDb(), {
    userId: auth.user.id,
    action: "auth.change_password",
    entity: "user",
    entityId: auth.user.id,
    ipAddress: getClientIp(c),
  });

  return c.json({ success: true, message: "Password updated." });
});

// ─── Two-factor authentication ──────────────────────────

// POST /api/auth/2fa/setup — (auth) → generates secret + QR + backup codes
securityRouter.post("/2fa/setup", async (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Authentication required" }, 401);

  const secret = generateBase32Secret();
  const otpauthUrl = buildOtpauthUrl(secret, auth.user.email || "");
  const backupCodes = generateBackupCodes();
  const hashed = backupCodes.map(hashBackupCode);

  const db = getDb();
  db.update(users)
    .set({
      twoFactorSecret: secret,
      twoFactorBackupCodes: JSON.stringify(hashed),
      updatedAt: Date.now(),
    })
    .where(eq(users.id, auth.user.id))
    .run();

  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(otpauthUrl, { width: 220, margin: 1 });
  } catch (e) {
    console.warn("[2FA] QR generation failed:", e);
  }

  writeAuditLog(db, {
    userId: auth.user.id,
    action: "auth.2fa_setup",
    entity: "user",
    entityId: auth.user.id,
    ipAddress: getClientIp(c),
  });

  return c.json({ secret, otpauthUrl, qrDataUrl, backupCodes });
});

// POST /api/auth/2fa/enable — { code } (auth)
securityRouter.post("/2fa/enable", async (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Authentication required" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch { /* non-critical */ }
  const code = (body.code as string)?.trim();
  if (!code) return c.json({ error: "Verification code is required" }, 400);

  const secret = auth.user.twoFactorSecret;
  if (!secret) return c.json({ error: "Run 2FA setup first" }, 400);
  if (!verifyTotp(secret, code)) {
    return c.json({ error: "Invalid code. Check the time on your authenticator app." }, 400);
  }

  getDb().update(users)
    .set({ twoFactorEnabled: true, updatedAt: Date.now() })
    .where(eq(users.id, auth.user.id))
    .run();

  writeAuditLog(getDb(), {
    userId: auth.user.id,
    action: "auth.2fa_enabled",
    entity: "user",
    entityId: auth.user.id,
    ipAddress: getClientIp(c),
  });

  return c.json({ success: true, message: "Two-factor authentication enabled." });
});

// POST /api/auth/2fa/disable — { code } (auth)
securityRouter.post("/2fa/disable", async (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Authentication required" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch { /* non-critical */ }
  const code = (body.code as string)?.trim();
  if (!code) return c.json({ error: "Verification code is required" }, 400);

  const secret = auth.user.twoFactorSecret;
  if (secret && verifyTotp(secret, code)) {
    // valid TOTP — proceed
  } else {
    let backupHashes: string[] = [];
    try { backupHashes = JSON.parse(auth.user.twoFactorBackupCodes || "[]"); } catch { backupHashes = []; }
    const cleaned = code.trim().toUpperCase();
    if (!consumeBackupCode(cleaned, backupHashes)) {
      return c.json({ error: "Invalid code." }, 400);
    }
  }

  getDb().update(users)
    .set({
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: null,
      updatedAt: Date.now(),
    })
    .where(eq(users.id, auth.user.id))
    .run();

  writeAuditLog(getDb(), {
    userId: auth.user.id,
    action: "auth.2fa_disabled",
    entity: "user",
    entityId: auth.user.id,
    ipAddress: getClientIp(c),
  });

  return c.json({ success: true, message: "Two-factor authentication disabled." });
});

// POST /api/auth/2fa/verify — { challengeToken, code } → issues the session
securityRouter.post("/2fa/verify", async (c) => {
  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch { /* non-critical */ }

  const challengeToken = (body.challengeToken as string)?.trim();
  const code = (body.code as string)?.trim();
  if (!challengeToken || !code) return c.json({ error: "Challenge token and code are required" }, 400);

  const userId = consumeTwoFactorChallenge(challengeToken);
  if (!userId) return c.json({ error: "Challenge expired. Sign in again." }, 401);

  const db = getDb();
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return c.json({ error: "User not found" }, 404);

  const secret = user.twoFactorSecret || "";
  let codeValid = verifyTotp(secret, code);
  if (!codeValid) {
    let backupHashes: string[] = [];
    try { backupHashes = JSON.parse(user.twoFactorBackupCodes || "[]"); } catch { backupHashes = []; }
    if (consumeBackupCode(code, backupHashes)) {
      codeValid = true;
      db.update(users)
        .set({ twoFactorBackupCodes: JSON.stringify(backupHashes), updatedAt: Date.now() })
        .where(eq(users.id, user.id))
        .run();
    }
  }
  if (!codeValid) {
    recordLoginHistory(user.id, false, c, "invalid_2fa_code");
    return c.json({ error: "Invalid code." }, 401);
  }

  // Issue the real session (mirrors sign-in in index.ts).
  const token = generateToken();
  const now = Date.now();
  const sessionId = generateToken();
  db.insert(sessions)
    .values({
      id: sessionId,
      token,
      userId: user.id,
      deviceInfo: (c.req.header("user-agent") || "").slice(0, 200),
      ipAddress: getClientIp(c),
      lastActiveAt: now,
      expiresAt: now + SESSION_DURATION_MS,
      createdAt: now,
    })
    .execute();

  setSessionCookie(c, token);
  recordLoginHistory(user.id, true, c);

  writeAuditLog(db, {
    userId: user.id,
    action: "auth.signin_2fa",
    entity: "user",
    entityId: user.id,
    details: { email: user.email },
    ipAddress: getClientIp(c),
  });

  return c.json({
    user: userPublic(user),
    session: { id: token, expiresAt: now + SESSION_DURATION_MS },
  });
});

// ─── Session management ─────────────────────────────────

// GET /api/auth/sessions — list the user's active sessions
securityRouter.get("/sessions", (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Authentication required" }, 401);

  const db = getDb();
  const rows = db.select().from(sessions).where(eq(sessions.userId, auth.user.id)).orderBy(desc(sessions.createdAt)).all();
  return c.json({
    sessions: rows.map((s) => ({
      id: s.id,
      deviceInfo: s.deviceInfo,
      ipAddress: s.ipAddress,
      lastActiveAt: s.lastActiveAt,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isCurrent: s.id === auth.session.id,
    })),
  });
});

// POST /api/auth/sessions/revoke — { sessionId } (may not revoke the current session)
securityRouter.post("/sessions/revoke", async (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Authentication required" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch { /* non-critical */ }
  const sessionId = (body.sessionId as string)?.trim();
  if (!sessionId) return c.json({ error: "sessionId is required" }, 400);
  if (sessionId === auth.session.id) {
    return c.json({ error: "You cannot revoke the session you are currently using" }, 400);
  }

  const db = getDb();
  const target = db.select().from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, auth.user.id))).get();
  if (!target) return c.json({ error: "Session not found" }, 404);

  db.delete(sessions).where(eq(sessions.id, sessionId)).run();
  writeAuditLog(db, {
    userId: auth.user.id,
    action: "auth.session_revoked",
    entity: "session",
    entityId: sessionId,
    details: { deviceInfo: target.deviceInfo },
    ipAddress: getClientIp(c),
  });
  return c.json({ success: true });
});

// POST /api/auth/sessions/revoke-others — sign out every device but this one
securityRouter.post("/sessions/revoke-others", async (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Authentication required" }, 401);

  const db = getDb();
  const { changes } = db.delete(sessions).where(and(eq(sessions.userId, auth.user.id), ne(sessions.id, auth.session.id))).run();

  writeAuditLog(db, {
    userId: auth.user.id,
    action: "auth.sessions_revoked",
    entity: "user",
    entityId: auth.user.id,
    details: { revoked: changes ?? 0 },
    ipAddress: getClientIp(c),
  });
  return c.json({ success: true, revoked: changes ?? 0 });
});

// GET /api/auth/login-history — recent sign-in attempts
securityRouter.get("/login-history", (c) => {
  const auth = getAuth(c);
  if (!auth) return c.json({ error: "Authentication required" }, 401);

  const db = getDb();
  const rows = db.select().from(loginHistory).where(eq(loginHistory.userId, auth.user.id)).orderBy(desc(loginHistory.timestamp)).limit(20).all();
  return c.json({
    history: rows.map((r) => ({
      id: r.id,
      ipAddress: r.ipAddress,
      deviceInfo: r.deviceInfo,
      success: !!r.success,
      failedReason: r.failedReason,
      timestamp: r.timestamp,
    })),
  });
});

export default securityRouter;
