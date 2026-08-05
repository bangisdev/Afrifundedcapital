import { createMiddleware } from "hono/factory";
import { getDb } from "./db";
import { sessions, users } from "./schema";
import { eq, and, gt } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════════
//  RATE LIMITER — in-memory sliding window with account lockout
// ═══════════════════════════════════════════════════════════════

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface FailedLoginEntry {
  attempts: number;
  lockedUntil: number | null;
}

// IP-based rate limit store: key → { count, resetAt }
const rateLimitStore = new Map<string, RateLimitEntry>();

// Email-based failed login tracker: email → { attempts, lockedUntil }
const failedLoginStore = new Map<string, FailedLoginEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetAt <= now) rateLimitStore.delete(key);
  }
  for (const [key, entry] of failedLoginStore) {
    // Remove if lockout has expired
    if (entry.lockedUntil && entry.lockedUntil <= now) {
      failedLoginStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

function getClientIp(c: { req: { header(name: string): string | undefined } }): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}

function getRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number; limit: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs, limit: maxRequests };
  }

  entry.count++;

  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt, limit: maxRequests };
  }

  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt, limit: maxRequests };
}

/**
 * Creates a rate limiter middleware for Hono.
 *
 * @param opts.maxRequests - Max requests allowed in the window
 * @param opts.windowMs - Time window in milliseconds
 * @param opts.keyPrefix - Prefix for the rate limit key (e.g., "sign-in")
 * @param opts.getKey - Optional function to derive the rate limit key (defaults to IP)
 * @param opts.refundOnSuccess - When true, a request that succeeds (2xx response)
 *   has its consumed slot refunded. Successful logins / session checks are the
 *   opposite of brute force, so they should not burn quota and lock out
 *   legitimate users — e.g. several staff members signing in from the same
 *   office IP.
 */
export function rateLimiter(opts: {
  maxRequests: number;
  windowMs: number;
  keyPrefix: string;
  getKey?: (c: { req: { header(name: string): string | undefined } }) => string;
  refundOnSuccess?: boolean;
}) {
  return createMiddleware(async (c, next) => {
    // End-to-end test mode (opt-in via E2E_TESTING=1, set by the Playwright
    // webServer): the admin-flow suite signs in dozens of times from a single
    // IP, which would exhaust production-grade limits and lock the admin
    // account. Skipping here keeps production fully protected while the
    // e2e run stays deterministic.
    if (process.env.E2E_TESTING === "1") {
      return next();
    }

    const ip = getClientIp(c);
    const customKey = opts.getKey ? opts.getKey(c) : ip;
    const key = `${opts.keyPrefix}:${customKey}`;

    const result = getRateLimit(key, opts.maxRequests, opts.windowMs);

    // Set rate limit headers
    c.header("X-RateLimit-Limit", String(result.limit));
    c.header("X-RateLimit-Remaining", String(result.remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json(
        {
          error: "Too many requests. Please try again later.",
          retryAfter,
        },
        429
      );
    }

    await next();

    // Refund the consumed slot when the downstream handler succeeded. Keeps
    // brute-force protection (failed attempts still count) without penalizing
    // legitimate successful requests.
    if (opts.refundOnSuccess && c.res.status >= 200 && c.res.status < 300) {
      const entry = rateLimitStore.get(key);
      if (entry) {
        entry.count = Math.max(0, entry.count - 1);
        if (entry.count === 0) rateLimitStore.delete(key);
      }
    }
  });
}

/**
 * Account lockout protection for login attempts.
 * Tracks failed attempts per email and locks after MAX_FAILED_ATTEMPTS.
 */
export function accountLockout(opts: {
  maxAttempts?: number;
  lockoutDurationMs?: number;
  windowMs?: number;
}) {
  const maxAttempts = opts.maxAttempts ?? 5;
  const lockoutDurationMs = opts.lockoutDurationMs ?? 15 * 60 * 1000; // 15 minutes

  return createMiddleware(async (c, next) => {
    // Same e2e escape hatch as the rate limiter above.
    if (process.env.E2E_TESTING === "1") {
      return next();
    }

    // Clone request to read body without consuming it for the handler
    let email: string | null = null;
    try {
      const clonedReq = c.req.raw.clone();
      const body = await clonedReq.json() as Record<string, unknown>;
      email = (body.email as string)?.trim().toLowerCase() || null;
    } catch { /* non-critical */ }

    if (!email) {
      await next();
      return;
    }

    const entry = failedLoginStore.get(email);
    const now = Date.now();

    // Check if account is locked
    if (entry?.lockedUntil && entry.lockedUntil > now) {
      const retryAfter = Math.ceil((entry.lockedUntil - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json(
        {
          error: `Account temporarily locked due to too many failed login attempts. Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
          retryAfter,
        },
        429
      );
    }

    // Run the handler, then check if login failed
    await next();

    // After handler: check if login failed (401 response)
    const responseStatus = c.res.status;
    if (responseStatus === 401) {
      if (!entry || (entry.lockedUntil && entry.lockedUntil <= now) || (!entry.lockedUntil && entry.attempts === 0)) {
        // Start new tracking window or reset after lockout expired
        failedLoginStore.set(email, {
          attempts: 1,
          lockedUntil: null,
        });
      } else {
        entry.attempts++;
        if (entry.attempts >= maxAttempts) {
          entry.lockedUntil = now + lockoutDurationMs;
          console.warn(
            `[Security] Account locked: ${email} — ${entry.attempts} failed attempts. Locked for ${lockoutDurationMs / 60000} minutes.`
          );
        }
      }
    } else if (responseStatus === 200 || responseStatus === 201) {
      // Successful login — clear failed attempts
      failedLoginStore.delete(email);
    }
  });
}

// Pre-configured rate limiters for common auth endpoints
export const signInRateLimit = rateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000, // 5 attempts per 15 minutes
  keyPrefix: "sign-in",
  // Successful logins shouldn't consume brute-force quota — only failures do.
  refundOnSuccess: true,
});

export const signUpRateLimit = rateLimiter({
  maxRequests: 3,
  windowMs: 60 * 60 * 1000, // 3 registrations per hour
  keyPrefix: "sign-up",
  refundOnSuccess: true,
});

export const promoteAdminRateLimit = rateLimiter({
  maxRequests: 3,
  windowMs: 24 * 60 * 60 * 1000, // 3 attempts per day
  keyPrefix: "promote-admin",
});

export const sessionCheckRateLimit = rateLimiter({
  maxRequests: 30,
  windowMs: 5 * 60 * 1000, // 30 session checks per 5 minutes
  keyPrefix: "session",
  // Valid-session checks are legitimate traffic — refund on success.
  refundOnSuccess: true,
});

export const loginAccountLockout = accountLockout({
  maxAttempts: 5,
  lockoutDurationMs: 15 * 60 * 1000, // Lock for 15 minutes
  windowMs: 15 * 60 * 1000,
});

// ═══════════════════════════════════════════════════════════════
//  EXISTING AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

interface AuthUser {
  id: number;
  name: string | null;
  email: string;
  role: string | null;
  image: string | null;
  kycStatus: string | null;
  onboardingComplete: boolean | null;
  referralCode: string | null;
  emailNotifications: boolean | null;
  notificationPreferences: string | null;
  isDemoSeeded: boolean | null;
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
    userId: number;
  }
}

export const requireAuth = createMiddleware(async (c, next) => {
  const cookieHeader = c.req.header("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, ...val] = c.trim().split("=");
      return [key, val.join("=")];
    })
  );

  // Check all possible session cookie names
  const token = cookies["afc_session"] || cookies["better-auth.session_token"] || cookies["auth_session"];

  if (!token) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const db = getDb();

  // Find session by token
  const session = db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.token, token),
        gt(sessions.expiresAt, Date.now())
      )
    )
    .get();

  if (!session) {
    return c.json({ error: "Invalid or expired session" }, 401);
  }

  // Get user
  const user = db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .get();

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  c.set("user", {
    id: user.id,
    name: user.name,
    email: user.email!,
    role: user.role,
    image: user.image,
    kycStatus: user.kycStatus,
    onboardingComplete: user.onboardingComplete,
    referralCode: user.referralCode,
    emailNotifications: user.emailNotifications,
    notificationPreferences: user.notificationPreferences,
    isDemoSeeded: user.isDemoSeeded,
  });
  c.set("userId", user.id);

  await next();
});

export const optionalAuth = createMiddleware(async (c, next) => {
  const cookieHeader = c.req.header("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, ...val] = c.trim().split("=");
      return [key, val.join("=")];
    })
  );

  const token = cookies["afc_session"] || cookies["better-auth.session_token"] || cookies["auth_session"];

  if (token) {
    const db = getDb();
    const session = db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.token, token),
          gt(sessions.expiresAt, Date.now())
        )
      )
      .get();

    if (session) {
      const user = db
        .select()
        .from(users)
        .where(eq(users.id, session.userId))
        .get();

      if (user) {
        c.set("user", {
          id: user.id,
          name: user.name,
          email: user.email!,
          role: user.role,
          image: user.image,
          kycStatus: user.kycStatus,
          onboardingComplete: user.onboardingComplete,
          referralCode: user.referralCode,
          emailNotifications: user.emailNotifications,
          notificationPreferences: user.notificationPreferences,
          isDemoSeeded: user.isDemoSeeded,
        });
        c.set("userId", user.id);
      }
    }
  }

  await next();
});

export const requireAdmin = createMiddleware(async (c, next) => {
  const user = c.get("user");
  const adminRoles = [
    "super_admin",
    "support_admin",
    "finance_admin",
    "client_manager",
    "compliance_admin",
    "marketing_admin",
    "affiliate_manager",
  ];

  if (!user || !adminRoles.includes(user.role || "")) {
    return c.json({ error: "Admin access required" }, 403);
  }

  await next();
});

export const requireSuperAdmin = createMiddleware(async (c, next) => {
  const user = c.get("user");

  if (!user || user.role !== "super_admin") {
    return c.json({ error: "Super admin access required" }, 403);
  }

  await next();
});
