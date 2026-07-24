import { Hono } from "hono";
import { getDb } from "../db";
import { users, sessions, auditLogs, settings, wallets } from "../schema";
import { eq, desc, like, count, sql, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";
import { createNotification } from "../lib/notifications";

const app = new Hono();

// Get current user profile
app.get("/current", requireAuth, (c) => {
  const user = c.get("user");
  return c.json(user);
});

// Update profile
app.put("/profile", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const db = getDb();

  const allowedFields = ["name", "phone", "address", "country", "tradingExperience", "timezone", "dateOfBirth", "image"];
  const updates: Record<string, any> = {};

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }
  updates.updatedAt = Date.now();

  db.update(users).set(updates).where(eq(users.id, userId)).run();

  return c.json({ success: true });
});

// Complete onboarding
app.post("/onboarding", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const db = getDb();

  db.update(users).set({
    name: body.name || undefined,
    phone: body.phone || undefined,
    country: body.country || undefined,
    timezone: body.timezone || undefined,
    tradingExperience: body.tradingExperience || undefined,
    emailNotifications: body.emailNotifications ?? true,
    notificationPreferences: body.notificationPreferences ? JSON.stringify(body.notificationPreferences) : undefined,
    onboardingComplete: true,
    updatedAt: Date.now(),
  }).where(eq(users.id, userId)).run();

  return c.json({ success: true });
});

// Update notification preferences
app.put("/preferences", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const db = getDb();

  db.update(users).set({
    emailNotifications: body.emailNotifications ?? true,
    notificationPreferences: body.notificationPreferences ? JSON.stringify(body.notificationPreferences) : undefined,
    updatedAt: Date.now(),
  }).where(eq(users.id, userId)).run();

  return c.json({ success: true });
});

// Generate referral code
app.post("/referral-code", requireAuth, async (c) => {
  const userId = c.get("userId");
  const db = getDb();
  const code = "AFR" + Math.random().toString(36).substring(2, 8).toUpperCase();

  db.update(users).set({ referralCode: code, updatedAt: Date.now() }).where(eq(users.id, userId)).run();

  return c.json({ referralCode: code });
});

// Admin: List users
app.get("/list", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const allUsers = db.select().from(users).orderBy(desc(users.createdAt)).all();
  const safeUsers = allUsers.map(({ twoFactorSecret, accountLockedUntil, loginAttempts, ...u }) => u);
  return c.json(safeUsers);
});

// Admin: Get user stats
app.get("/stats", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const totalUsers = db.select({ count: count() }).from(users).get();
  const totalSessions = db.select({ count: count() }).from(sessions).get();

  return c.json({
    totalUsers: totalUsers?.count || 0,
    totalSessions: totalSessions?.count || 0,
  });
});

// Admin: Get user growth data
app.get("/growth", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const users30d = db.select({ count: count() }).from(users)
    .where(sql`created_at > ${thirtyDaysAgo}`).get();
  const totalUsers = db.select({ count: count() }).from(users).get();

  return c.json({
    totalUsers: totalUsers?.count || 0,
    newUsers30d: users30d?.count || 0,
  });
});

// Admin: Update user role
app.put("/:id/role", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const db = getDb();

  db.update(users).set({ role: body.role, updatedAt: Date.now() }).where(eq(users.id, id)).run();
  return c.json({ success: true });
});

// Admin: Toggle user status
app.put("/:id/status", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const db = getDb();

  if (body.locked) {
    db.update(users).set({ accountLockedUntil: Date.now() + 24 * 60 * 60 * 1000, updatedAt: Date.now() }).where(eq(users.id, id)).run();
  } else {
    db.update(users).set({ accountLockedUntil: null, loginAttempts: 0, updatedAt: Date.now() }).where(eq(users.id, id)).run();
  }
  return c.json({ success: true });
});

// Admin: List audit logs
app.get("/audit-logs", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const logs = db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(100).all();
  return c.json(logs);
});

// Admin: List users brief (for dropdowns)
app.get("/brief", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const brief = db.select({ id: users.id, name: users.name, email: users.email }).from(users).all();
  return c.json(brief);
});

// Admin: Update setting
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

// Admin: List settings
app.get("/settings", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const allSettings = db.select().from(settings).all();
  return c.json(allSettings.map((s) => ({ ...s, value: JSON.parse(s.value) })));
});

// Security: Notify password changed
app.post("/security/password-changed", requireAuth, async (c) => {
  const userId = c.get("userId");
  const db = getDb();
  createNotification(db, userId, {
    type: "security",
    title: "Password Changed",
    message: "Your password has been changed successfully. If you did not make this change, please contact support immediately.",
    link: "/dashboard/profile",
  });
  return c.json({ success: true });
});

// Security: Notify 2FA enabled
app.post("/security/2fa-enabled", requireAuth, async (c) => {
  const userId = c.get("userId");
  const db = getDb();
  db.update(users).set({ twoFactorEnabled: true, updatedAt: Date.now() }).where(eq(users.id, userId)).run();
  createNotification(db, userId, {
    type: "security",
    title: "Two-Factor Authentication Enabled",
    message: "Two-factor authentication has been enabled on your account. Your account is now more secure.",
    link: "/dashboard/profile",
  });
  return c.json({ success: true });
});

// Security: Notify 2FA disabled
app.post("/security/2fa-disabled", requireAuth, async (c) => {
  const userId = c.get("userId");
  const db = getDb();
  db.update(users).set({ twoFactorEnabled: false, updatedAt: Date.now() }).where(eq(users.id, userId)).run();
  createNotification(db, userId, {
    type: "security",
    title: "Two-Factor Authentication Disabled",
    message: "Two-factor authentication has been disabled on your account. Your account security has been reduced.",
    link: "/dashboard/profile",
  });
  return c.json({ success: true });
});

export default app;
