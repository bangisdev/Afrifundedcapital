import { createMiddleware } from "hono/factory";
import { getDb } from "./db";
import { sessions, users } from "./schema";
import { eq, and, gt } from "drizzle-orm";

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

  // Better Auth sets the session token in a cookie called "better-auth.session_token"
  // or it could be "auth_session" depending on config
  const token = cookies["better-auth.session_token"] || cookies["auth_session"];

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

  const token = cookies["better-auth.session_token"] || cookies["auth_session"];

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
