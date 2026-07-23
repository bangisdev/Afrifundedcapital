import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireRole, currentUser } from "./users";
import { ROLES } from "./schema";

// Default permission sets
const PERMISSIONS = {
  // User management
  USERS_VIEW: "users:view",
  USERS_CREATE: "users:create",
  USERS_EDIT: "users:edit",
  USERS_DELETE: "users:delete",
  USERS_MANAGE_ROLES: "users:manage_roles",

  // KYC
  KYC_VIEW: "kyc:view",
  KYC_REVIEW: "kyc:review",
  KYC_APPROVE: "kyc:approve",

  // Challenges
  CHALLENGES_VIEW: "challenges:view",
  CHALLENGES_CREATE: "challenges:create",
  CHALLENGES_EDIT: "challenges:edit",
  CHALLENGES_DELETE: "challenges:delete",
  CHALLENGES_MANAGE: "challenges:manage",

  // Payments
  PAYMENTS_VIEW: "payments:view",
  PAYMENTS_REFUND: "payments:refund",
  PAYMENTS_MANAGE: "payments:manage",

  // Affiliates
  AFFILIATES_VIEW: "affiliates:view",
  AFFILIATES_MANAGE: "affiliates:manage",
  AFFILIATES_PAYOUTS: "affiliates:payouts",

  // Support
  SUPPORT_VIEW: "support:view",
  SUPPORT_REPLY: "support:reply",
  SUPPORT_MANAGE: "support:manage",

  // Settings
  SETTINGS_VIEW: "settings:view",
  SETTINGS_EDIT: "settings:edit",

  // Admin
  ADMIN_ACCESS: "admin:access",
  ADMIN_MANAGE_ROLES: "admin:manage_roles",
  ADMIN_AUDIT_LOG: "admin:audit_log",
  ADMIN_MT5: "admin:mt5",

  // Certificates
  CERTIFICATES_VIEW: "certificates:view",
  CERTIFICATES_ISSUE: "certificates:issue",

  // Coupons
  COUPONS_VIEW: "coupons:view",
  COUPONS_CREATE: "coupons:create",
  COUPONS_EDIT: "coupons:edit",
  COUPONS_DELETE: "coupons:delete",
};

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),
  [ROLES.SUPPORT_ADMIN]: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_EDIT,
    PERMISSIONS.KYC_VIEW,
    PERMISSIONS.KYC_REVIEW,
    PERMISSIONS.KYC_APPROVE,
    PERMISSIONS.CHALLENGES_VIEW,
    PERMISSIONS.PAYMENTS_VIEW,
    PERMISSIONS.SUPPORT_VIEW,
    PERMISSIONS.SUPPORT_REPLY,
    PERMISSIONS.SUPPORT_MANAGE,
    PERMISSIONS.ADMIN_ACCESS,
    PERMISSIONS.CERTIFICATES_VIEW,
  ],
  [ROLES.FINANCE_ADMIN]: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.PAYMENTS_VIEW,
    PERMISSIONS.PAYMENTS_REFUND,
    PERMISSIONS.PAYMENTS_MANAGE,
    PERMISSIONS.AFFILIATES_VIEW,
    PERMISSIONS.AFFILIATES_MANAGE,
    PERMISSIONS.AFFILIATES_PAYOUTS,
    PERMISSIONS.ADMIN_ACCESS,
    PERMISSIONS.SETTINGS_VIEW,
  ],
  [ROLES.CLIENT_MANAGER]: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_EDIT,
    PERMISSIONS.KYC_VIEW,
    PERMISSIONS.KYC_REVIEW,
    PERMISSIONS.CHALLENGES_VIEW,
    PERMISSIONS.CHALLENGES_MANAGE,
    PERMISSIONS.ADMIN_ACCESS,
    PERMISSIONS.CERTIFICATES_VIEW,
    PERMISSIONS.CERTIFICATES_ISSUE,
  ],
  [ROLES.COMPLIANCE_ADMIN]: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.KYC_VIEW,
    PERMISSIONS.KYC_REVIEW,
    PERMISSIONS.KYC_APPROVE,
    PERMISSIONS.CHALLENGES_VIEW,
    PERMISSIONS.PAYMENTS_VIEW,
    PERMISSIONS.ADMIN_ACCESS,
    PERMISSIONS.ADMIN_AUDIT_LOG,
  ],
  [ROLES.MARKETING_ADMIN]: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.COUPONS_VIEW,
    PERMISSIONS.COUPONS_CREATE,
    PERMISSIONS.COUPONS_EDIT,
    PERMISSIONS.COUPONS_DELETE,
    PERMISSIONS.AFFILIATES_VIEW,
    PERMISSIONS.AFFILIATES_MANAGE,
    PERMISSIONS.SETTINGS_VIEW,
    PERMISSIONS.ADMIN_ACCESS,
  ],
  [ROLES.AFFILIATE_MANAGER]: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.AFFILIATES_VIEW,
    PERMISSIONS.AFFILIATES_MANAGE,
    PERMISSIONS.AFFILIATES_PAYOUTS,
    PERMISSIONS.ADMIN_ACCESS,
  ],
  [ROLES.USER]: [],
};

// ═══════════════════════════════════════════════
//  QUERIES
// ═══════════════════════════════════════════════

export const listRoles = query({
  handler: async (ctx) => {
    return await ctx.db.query("roles").collect();
  },
});

export const getRoleById = query({
  args: { roleId: v.id("roles") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.roleId);
  },
});

export const getUserPermissions = query({
  handler: async (ctx) => {
    const userId = await requireRole(ctx, Object.values(ROLES));
    const user = await ctx.db.get(userId.userId);
    if (!user?.role) return [];

    // Get base permissions from default role
    const basePerms = DEFAULT_ROLE_PERMISSIONS[user.role] || [];

    // Check for additional custom roles
    const userRoles = await ctx.db
      .query("userRoles")
      .withIndex("userId", (q) => q.eq("userId", userId.userId))
      .collect();

    const customPerms: string[] = [];
    for (const ur of userRoles) {
      const role = await ctx.db.get(ur.roleId);
      if (role?.permissions) {
        customPerms.push(...role.permissions);
      }
    }

    return [...new Set([...basePerms, ...customPerms])];
  },
});

// ═══════════════════════════════════════════════
//  MUTATIONS
// ═══════════════════════════════════════════════

export const seedDefaultRoles = mutation({
  handler: async (ctx) => {
    const existing = await ctx.db.query("roles").collect();
    if (existing.length > 0) return;

    for (const [roleName, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      await ctx.db.insert("roles", {
        name: roleName,
        description: `Default ${roleName} role`,
        permissions,
        isSystem: true,
        createdAt: Date.now(),
      });
    }
  },
});

export const createRole = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    permissions: v.array(v.string()),
    parentRoleId: v.optional(v.id("roles")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN]);

    const roleId = await ctx.db.insert("roles", {
      name: args.name,
      description: args.description,
      permissions: args.permissions,
      isSystem: false,
      parentRoleId: args.parentRoleId,
      createdAt: Date.now(),
    });

    return roleId;
  },
});

export const updateRole = mutation({
  args: {
    roleId: v.id("roles"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    permissions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN]);

    const updates: Record<string, any> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.permissions !== undefined) updates.permissions = args.permissions;

    await ctx.db.patch(args.roleId, updates);
  },
});

export const deleteRole = mutation({
  args: { roleId: v.id("roles") },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN]);

    const role = await ctx.db.get(args.roleId);
    if (role?.isSystem) {
      throw new Error("Cannot delete system roles");
    }

    await ctx.db.delete(args.roleId);
  },
});

export const assignUserRole = mutation({
  args: {
    targetUserId: v.id("users"),
    roleId: v.id("roles"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, [ROLES.SUPER_ADMIN]);

    // Check if already assigned
    const existing = await ctx.db
      .query("userRoles")
      .withIndex("userId", (q) => q.eq("userId", args.targetUserId))
      .collect();

    const alreadyAssigned = existing.find((ur) => ur.roleId === args.roleId);
    if (alreadyAssigned) {
      throw new Error("User already has this role");
    }

    await ctx.db.insert("userRoles", {
      userId: args.targetUserId,
      roleId: args.roleId,
      assignedBy: userId,
      assignedAt: Date.now(),
    });
  },
});

export const removeUserRole = mutation({
  args: {
    targetUserId: v.id("users"),
    roleId: v.id("roles"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN]);

    const existing = await ctx.db
      .query("userRoles")
      .withIndex("userId", (q) => q.eq("userId", args.targetUserId))
      .collect();

    const match = existing.find((ur) => ur.roleId === args.roleId);
    if (match) {
      await ctx.db.delete(match._id);
    }
  },
});

export const checkPermission = mutation({
  args: {
    permission: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireRole(ctx, Object.values(ROLES));
    const user = await ctx.db.get(userId.userId);
    if (!user?.role) return false;

    const perms = DEFAULT_ROLE_PERMISSIONS[user.role] || [];
    return perms.includes(args.permission);
  },
});

export { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS };
