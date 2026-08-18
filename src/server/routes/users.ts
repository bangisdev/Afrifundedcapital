import { Hono } from "hono";
import { getDb } from "../db";
import { users, sessions, auditLogs, settings, affiliates } from "../schema";
import { eq, desc, asc, like, count, sql, and, or, type SQL, type SQLWrapper } from "drizzle-orm";
import { requireAuth, requireAdmin, requirePermission } from "../middleware";
import { createNotification, notifyAdminsOfSecurityEvent } from "../lib/notifications";
import { writeAuditLog, redactSetting, attachSettingsLastChanged } from "../lib/audit";
import { validate, schemas } from "../lib/validate";

const app = new Hono();

// Get current user profile
app.get("/current", requireAuth, (c) => {
  const user = c.get("user");
  return c.json(user);
});

// Update profile (validated)
app.put("/profile", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await validate(c, schemas.profileUpdate);
  if (!body) return c.json({ error: "Validation failed" }, 400);
  const db = getDb();

  // Dynamic update map: any is required here because drizzle's .set() accepts
  // it, and the union of column types rejects a narrow index signature.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {};

  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) {
      updates[key] = value;
    }
  }
  updates.updatedAt = Date.now();

  if (Object.keys(updates).length <= 1) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  db.update(users).set(updates).where(eq(users.id, userId)).run();

  return c.json({ success: true });
});

// Complete onboarding (validated)
app.post("/onboarding", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await validate(c, schemas.onboarding);
  if (!body) return c.json({ error: "Validation failed" }, 400);
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

// Update notification preferences (validated)
app.put("/preferences", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await validate(c, schemas.notificationPreferences);
  if (!body) return c.json({ error: "Validation failed" }, 400);
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

  // Check if user already has an affiliate record
  const existing = db.select().from(affiliates).where(eq(affiliates.userId, userId)).get();
  if (existing) {
    return c.json({ referralCode: existing.referralCode });
  }

  // Generate unique code
  const code = "AFR" + Math.random().toString(36).substring(2, 8).toUpperCase();
  const now = Date.now();

  // Update user record
  db.update(users).set({ referralCode: code, updatedAt: now }).where(eq(users.id, userId)).run();

  // Create affiliate record
  db.insert(affiliates).values({
    userId,
    referralCode: code,
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

  return c.json({ referralCode: code });
});

// Admin: List users (paginated + searchable)
app.get("/list", requireAuth, requireAdmin, (c) => {
  const db = getDb();

  // Pagination params (clamped)
  const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") || "20") || 20));

  // Sorting (whitelisted columns, asc/desc)
  const SORTABLE: Record<string, SQLWrapper> = {
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    kycStatus: users.kycStatus,
    createdAt: users.createdAt,
  };
  const qSortBy = String(c.req.query("sortBy") || "createdAt");
  const qSortOrder = String(c.req.query("sortOrder") || "desc");
  const sortCol = SORTABLE[qSortBy] || users.createdAt;
  const sortOrder = qSortOrder.toLowerCase() === "asc" ? asc(sortCol) : desc(sortCol);

  // Filters
  const search = (c.req.query("search") || "").trim();
  const role = c.req.query("role") || "";
  const kycStatus = c.req.query("kycStatus") || "";

  const conditions: SQL[] = [];
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        like(users.name, pattern),
        like(users.email, pattern),
        like(users.phone, pattern),
        like(users.referralCode, pattern),
      )!,
    );
  }
  if (role && role !== "all") conditions.push(eq(users.role, role));
  if (kycStatus && kycStatus !== "all") conditions.push(eq(users.kycStatus, kycStatus));
  const whereClause: SQL = conditions.length > 0 ? and(...conditions)! : sql`1 = 1`;

  // Total matching count
  const totalRow = db.select({ count: count() }).from(users).where(whereClause).get();
  const total = totalRow?.count || 0;

  // Page of users
  const pageUsers = db
    .select()
    .from(users)
    .where(whereClause)
    .orderBy(sortOrder)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  // Strip sensitive fields (keep accountLockedUntil for lock UI)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- omit pattern
  const safeUsers = pageUsers.map(({ twoFactorSecret, loginAttempts, ...u }) => u);

  // Platform-wide stats (unfiltered) so the stat cards stay accurate
  const allUsers = db
    .select({ role: users.role, emailVerified: users.emailVerified, accountLockedUntil: users.accountLockedUntil })
    .from(users)
    .all();
  const stats = {
    total: allUsers.length,
    admins: allUsers.filter((u) => u.role && u.role !== "user").length,
    verified: allUsers.filter((u) => u.emailVerified).length,
    locked: allUsers.filter((u) => u.accountLockedUntil && u.accountLockedUntil > Date.now()).length,
  };

  return c.json({
    users: safeUsers,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats,
  });
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

// Admin: Update user role (validated)
app.put("/:id/role", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await validate(c, schemas.updateRole);
  if (!body) return c.json({ error: "Validation failed" }, 400);
  const db = getDb();

  const target = db.select().from(users).where(eq(users.id, id)).get();
  if (!target) return c.json({ error: "User not found" }, 404);
  const oldRole = target.role || "user";

  db.update(users).set({ role: body.role, updatedAt: Date.now() }).where(eq(users.id, id)).run();

  try {
    writeAuditLog(db, {
      userId: c.get("userId"),
      action: "user.role_changed",
      entity: "user",
      entityId: id,
      details: {
        targetEmail: target.email,
        fromRole: oldRole,
        toRole: body.role,
      },
      ipAddress: c.req.header("x-forwarded-for"),
    });
  } catch (e) {
    console.warn("[Audit] Failed to log role change:", e);
  }

  return c.json({ success: true });
});

// Admin: Toggle user status (validated)
app.put("/:id/status", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await validate(c, schemas.updateStatus);
  if (!body) return c.json({ error: "Validation failed" }, 400);
  const db = getDb();

  const target = db.select().from(users).where(eq(users.id, id)).get();
  if (!target) return c.json({ error: "User not found" }, 404);

  if (body.locked) {
    db.update(users).set({ accountLockedUntil: Date.now() + 24 * 60 * 60 * 1000, updatedAt: Date.now() }).where(eq(users.id, id)).run();
  } else {
    db.update(users).set({ accountLockedUntil: null, loginAttempts: 0, updatedAt: Date.now() }).where(eq(users.id, id)).run();
  }

  try {
    writeAuditLog(db, {
      userId: c.get("userId"),
      action: body.locked ? "user.locked" : "user.unlocked",
      entity: "user",
      entityId: id,
      details: {
        targetEmail: target.email,
        locked: !!body.locked,
      },
      ipAddress: c.req.header("x-forwarded-for"),
    });
  } catch (e) {
    console.warn("[Audit] Failed to log status change:", e);
  }

  return c.json({ success: true });
});

// Admin: Update user profile fields (validated)
app.put("/:id/profile", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await validate(c, schemas.updateProfileAdmin);
  if (!body) return c.json({ error: "Validation failed" }, 400);
  const db = getDb();

  // Dynamic update map — see note above for why any is intentional here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) updates[key] = value;
  }
  updates.updatedAt = Date.now();

  if (Object.keys(updates).length > 1) {
    db.update(users).set(updates).where(eq(users.id, id)).run();
  }
  return c.json({ success: true });
});

// Admin: Delete user (cascade delete related data)
app.delete("/:id", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const callerId = c.get("userId");
  const db = getDb();

  // Prevent self-deletion
  if (id === callerId) {
    return c.json({ error: "Cannot delete your own account" }, 400);
  }

  const target = db.select().from(users).where(eq(users.id, id)).get();
  if (!target) return c.json({ error: "User not found" }, 404);

  // Prevent deleting the last super_admin
  if (target.role === "super_admin") {
    const allAdmins = db.select().from(users).where(eq(users.role, "super_admin")).all();
    if (allAdmins.length <= 1) {
      return c.json({ error: "Cannot delete the last super_admin" }, 400);
    }
  }

  // Cascade delete via raw SQLite
  try {
    const { getSqlite } = await import("../db");
    const sqlite = getSqlite();
    sqlite.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
    sqlite.prepare("DELETE FROM accounts WHERE user_id = ?").run(String(id));
    sqlite.prepare("DELETE FROM notifications WHERE user_id = ?").run(id);
    sqlite.prepare("DELETE FROM wallets WHERE user_id = ?").run(id);
    sqlite.prepare("DELETE FROM certificates WHERE user_id = ?").run(id);
    sqlite.prepare("DELETE FROM kyc_documents WHERE user_id = ?").run(id);
    sqlite.prepare("DELETE FROM user_challenges WHERE user_id = ?").run(id);
  } catch (e) {
    console.warn("[Users] Cascade delete warning:", e);
  }

  try {
    writeAuditLog(db, {
      userId: callerId,
      action: "user.deleted",
      entity: "user",
      entityId: id,
      details: {
        targetEmail: target.email,
        targetRole: target.role || "user",
        deletedBy: callerId,
      },
      ipAddress: c.req.header("x-forwarded-for"),
    });
  } catch (e) {
    console.warn("[Audit] Failed to log user deletion:", e);
  }

  db.delete(users).where(eq(users.id, id)).run();
  return c.json({ success: true });
});

// Admin: List audit logs — granular `audit.view` (custom roles with only this
// permission can read the trail without entering the full admin area).
app.get("/audit-logs", requireAuth, requirePermission("audit.view"), (c) => {
  const db = getDb();

  // Pagination params (clamped)
  const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") || "20") || 20));

  // Filters
  const search = (c.req.query("search") || "").trim();
  const action = c.req.query("action") || "";
  // Precise entity scoping — e.g. ?entity=setting&entityId=flutterwave_config
  // so deep links (like Admin Settings → Audit Logs) land on exactly the
  // entries for one config key.
  const entity = c.req.query("entity") || "";
  const entityId = c.req.query("entityId") || "";

  const conditions: SQL[] = [];
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        like(auditLogs.action, pattern),
        like(auditLogs.entity, pattern),
        like(auditLogs.details, pattern),
        sql`cast(${auditLogs.entityId} as text) like ${pattern}`,
        like(users.name, pattern),
        like(users.email, pattern),
      )!,
    );
  }
  if (action && action !== "all") conditions.push(eq(auditLogs.action, action));
  if (entity) conditions.push(eq(auditLogs.entity, entity));
  if (entityId) conditions.push(eq(auditLogs.entityId, entityId));
  const whereClause: SQL = conditions.length > 0 ? and(...conditions)! : sql`1 = 1`;

  // Total matching count
  const totalRow = db
    .select({ count: count() })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(whereClause)
    .get();
  const total = totalRow?.count || 0;

  // Page of logs with user info joined
  const rows = db
    .select({ log: auditLogs, userName: users.name, userEmail: users.email })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(whereClause)
    .orderBy(desc(auditLogs.timestamp))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  const logs = rows.map(({ log, userName, userEmail }) => ({
    ...log,
    userName,
    userEmail,
    // The join is null when the acting user has been deleted since the event —
    // flag it so the UI can show "Deleted user #id" instead of a bare user id.
    userDeleted: !userName && !userEmail ? true : false,
  }));

  // Platform-wide stats (unfiltered)
  const allLogs = db.select({ action: auditLogs.action }).from(auditLogs).all();
  const byAction = allLogs.reduce<Record<string, number>>((acc, l) => {
    acc[l.action] = (acc[l.action] || 0) + 1;
    return acc;
  }, {});

  return c.json({
    logs,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats: { total: allLogs.length, byAction },
  });
});

// Admin: List users brief (for dropdowns)
app.get("/brief", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const brief = db.select({ id: users.id, name: users.name, email: users.email }).from(users).all();
  return c.json(brief);
});

// Admin: Update setting
// Config edits (payment keys, payout thresholds) are the most sensitive admin
// actions — every change is audited with secret values redacted from the trail.
app.put("/settings/:key", requireAuth, requireAdmin, async (c) => {
  const key = c.req.param("key");
  const body = await validate(c, schemas.updateSetting);
  if (!body) return c.json({ error: "Validation failed" }, 400);
  const db = getDb();

  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  let oldValue: unknown = null;
  if (existing) {
    try {
      oldValue = JSON.parse(existing.value);
    } catch (e) {
      console.warn(`[Settings] Failed to parse existing value for key "${key}":`, e);
      oldValue = existing.value;
    }
    db.update(settings).set({ value: JSON.stringify(body.value) }).where(eq(settings.key, key)).run();
  } else {
    db.insert(settings).values({ key, value: JSON.stringify(body.value), group: body.group || "general" }).run();
  }

  try {
    writeAuditLog(db, {
      userId: c.get("userId"),
      action: existing ? "settings.updated" : "settings.created",
      entity: "setting",
      entityId: key,
      details: {
        key,
        group: body.group || existing?.group || "general",
        from: redactSetting(key, oldValue),
        to: redactSetting(key, body.value),
      },
      ipAddress: c.req.header("x-forwarded-for") || undefined,
    });
  } catch (e) {
    console.warn("[Audit] Failed to log settings change:", e);
  }

  // Alert other admins — config edits are a security event.
  try {
    const actor = c.get("user") as { name?: string } | undefined;
    notifyAdminsOfSecurityEvent(db, {
      actorId: c.get("userId"),
      actorName: actor?.name || `Admin #${c.get("userId")}`,
      key,
      action: existing ? "updated" : "created",
    });
  } catch (e) {
    console.warn("[Notification] Failed to alert admins of settings change:", e);
  }

  return c.json({ success: true });
});

// Admin: List settings
// Enriched with who last changed each config (from the audit trail).
app.get("/settings", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const allSettings = db.select().from(settings).all();
  const parsed = allSettings.map((s) => ({ ...s, value: JSON.parse(s.value) }));
  return c.json(attachSettingsLastChanged(db, parsed));
});

// Admin: Get single user details
// NOTE: registered AFTER the static admin routes (/audit-logs, /brief, /settings)
// so the :id param never shadows them (Hono matches in registration order).
app.get("/:id", requireAuth, requireAdmin, (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const user = db.select().from(users).where(eq(users.id, id)).get();
  if (!user) return c.json({ error: "User not found" }, 404);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- omit pattern
  const { twoFactorSecret, accountLockedUntil, loginAttempts, ...safe } = user;
  return c.json(safe);
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
