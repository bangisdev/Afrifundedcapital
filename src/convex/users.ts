import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { ROLES, KYC_STATUS } from "./schema";

// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════

export async function getCurrentUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  return user;
}

export async function requireAuth(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Authentication required");
  return userId;
}

export async function requireRole(ctx: any, allowedRoles: string[]) {
  const userId = await requireAuth(ctx);
  const user = await ctx.db.get(userId);
  if (!user?.role || !allowedRoles.includes(user.role)) {
    throw new Error("Insufficient permissions");
  }
  return { userId, user };
}

// ═══════════════════════════════════════════════
//  NOTIFICATION PREFERENCES HELPERS
// ═══════════════════════════════════════════════

const PREFERENCE_KEY_MAP: Record<string, string> = {
  payment_confirmation: "email_payment",
  challenge_violation: "email_challenge",
  funded_confirmation: "email_challenge",
  kyc_notification: "email_kyc",
  support_reply: "email_support",
  marketing: "marketing",
};

/**
 * Check whether a user has opted in to a specific email notification type.
 * Can be called from any mutation or query context.
 * Returns true if the preference is not explicitly set to false.
 */
export async function checkEmailPref(
  ctx: any,
  userId: string,
  notificationType: string,
): Promise<boolean> {
  const user = await ctx.db.get(userId);
  if (!user) return false;
  if (!user.email) return false;
  if (user.emailNotifications === false) return false;

  const prefs = user.notificationPreferences || {};
  const prefKey = PREFERENCE_KEY_MAP[notificationType];
  if (!prefKey) return true; // Unknown types default to allowed

  return prefs[prefKey] !== false;
}

export const checkEmailPreference = query({
  args: {
    userId: v.id("users"),
    notificationType: v.string(),
  },
  handler: async (ctx, args) => {
    return await checkEmailPref(ctx, args.userId, args.notificationType);
  },
});

export function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "AFC";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ═══════════════════════════════════════════════
//  QUERIES
// ═══════════════════════════════════════════════

export const currentUser = query({
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});

export const getUserById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const listUsers = query({
  args: {
    search: v.optional(v.string()),
    role: v.optional(v.string()),
    kycStatus: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { search, role, kycStatus, limit = 20 } = args;
    let users = await ctx.db.query("users").collect();

    if (role) {
      users = users.filter((u) => u.role === role);
    }
    if (kycStatus) {
      users = users.filter((u) => u.kycStatus === kycStatus);
    }
    if (search) {
      const q = search.toLowerCase();
      users = users.filter(
        (u) =>
          u.name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q),
      );
    }

    users.sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0));
    const sliced = users.slice(0, limit);

    return {
      users: sliced,
      total: users.length,
    };
  },
});

export const getUserStats = query({
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return {
      total: users.length,
      verified: users.filter((u) => u.kycStatus === KYC_STATUS.APPROVED).length,
      pending: users.filter((u) => u.kycStatus === KYC_STATUS.PENDING).length,
      admins: users.filter((u) => u.role && u.role !== ROLES.USER).length,
    };
  },
});

export const getUserGrowth = query({
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();

    // Group by month (last 6 months)
    const months: Record<string, number> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months[key] = 0;
    }

    for (const user of users) {
      const d = new Date(user._creationTime ?? 0);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (months[key] !== undefined) {
        months[key]++;
      }
    }

    return Object.entries(months).map(([month, count]) => ({
      month,
      count,
    }));
  },
});

export const listUsersBrief = query({
  args: {
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN]);

    const { search, limit = 20 } = args;
    let users = await ctx.db.query("users").collect();

    if (search) {
      const q = search.toLowerCase();
      users = users.filter(
        (u) =>
          u.name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q),
      );
    }

    users.sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0));

    return users.slice(0, limit).map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
    }));
  },
});

export const listAuditLogs = query({
  args: {
    limit: v.optional(v.number()),
    action: v.optional(v.string()),
    entity: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.COMPLIANCE_ADMIN]);

    const { limit = 50, action, entity } = args;
    let logs = await ctx.db.query("auditLogs").order("desc").take(200);

    if (action) logs = logs.filter((l) => l.action === action);
    if (entity) logs = logs.filter((l) => l.entity === entity);

    const enriched = await Promise.all(
      logs.slice(0, limit).map(async (log) => {
        let userName: string | undefined;
        if (log.userId) {
          const user = await ctx.db.get(log.userId);
          userName = user?.name || user?.email;
        }
        return { ...log, userName };
      }),
    );

    return enriched;
  },
});

// ═══════════════════════════════════════════════
//  MUTATIONS
// ═══════════════════════════════════════════════

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    country: v.optional(v.string()),
    tradingExperience: v.optional(v.string()),
    timezone: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Check if KYC is approved — locked fields
    if (user.kycStatus === KYC_STATUS.APPROVED) {
      // Allow name, phone, address changes — but these require ticket approval
      // For now, allow updates but flag them
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.phone !== undefined) updates.phone = args.phone;
    if (args.address !== undefined) updates.address = args.address;
    if (args.country !== undefined) updates.country = args.country;
    if (args.tradingExperience !== undefined) updates.tradingExperience = args.tradingExperience;
    if (args.timezone !== undefined) updates.timezone = args.timezone;
    if (args.dateOfBirth !== undefined) updates.dateOfBirth = args.dateOfBirth;

    await ctx.db.patch(userId, updates);

    // Audit log
    await ctx.db.insert("auditLogs", {
      userId,
      action: "profile_updated",
      entity: "users",
      entityId: userId,
      details: JSON.stringify(Object.keys(updates)),
      timestamp: Date.now(),
    });
  },
});

export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId: adminId } = await requireRole(ctx, [
      ROLES.SUPER_ADMIN,
      ROLES.CLIENT_MANAGER,
    ]);

    if (args.role) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.db.patch(args.userId, { role: args.role as any });
    }

    await ctx.db.insert("auditLogs", {
      userId: adminId,
      action: "user_role_updated",
      entity: "users",
      entityId: args.userId,
      details: `Role updated to ${args.role}`,
      timestamp: Date.now(),
    });
  },
});

export const toggleUserStatus = mutation({
  args: {
    userId: v.id("users"),
    locked: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId: adminId } = await requireRole(ctx, [ROLES.SUPER_ADMIN]);

    await ctx.db.patch(args.userId, {
      accountLockedUntil: args.locked ? Date.now() + 365 * 24 * 60 * 60 * 1000 : undefined,
    });

    await ctx.db.insert("auditLogs", {
      userId: adminId,
      action: args.locked ? "user_locked" : "user_unlocked",
      entity: "users",
      entityId: args.userId,
      timestamp: Date.now(),
    });
  },
});

export const generateReferralCodeForUser = mutation({
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    let code = generateReferralCode();
    // Ensure uniqueness
    const existing = await ctx.db
      .query("users")
      .withIndex("referralCode", (q) => q.eq("referralCode", code))
      .first();
    if (existing) {
      code = generateReferralCode();
    }

    await ctx.db.patch(userId, { referralCode: code });
    return code;
  },
});

export const getAllUsersReport = query({
  handler: async (ctx) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN]);
    const users = await ctx.db.query("users").collect();

    return users.map((u) => ({
      name: u.name || "",
      email: u.email || "",
      role: u.role || "user",
      kycStatus: u.kycStatus || "unverified",
      twoFactorEnabled: u.twoFactorEnabled || false,
      emailNotifications: u.emailNotifications !== false,
      referralCode: u.referralCode || "",
      country: u.country || "",
      createdAt: new Date(u._creationTime ?? 0).toISOString(),
    }));
  },
});

export const updatePreferences = mutation({
  args: {
    emailNotifications: v.optional(v.boolean()),
    notificationPreferences: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const updates: Record<string, unknown> = {};
    if (args.emailNotifications !== undefined) updates.emailNotifications = args.emailNotifications;
    if (args.notificationPreferences !== undefined) updates.notificationPreferences = args.notificationPreferences;

    await ctx.db.patch(userId, updates);
  },
});
