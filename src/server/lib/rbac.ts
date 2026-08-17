/**
 * Role-based access control — wires the (previously dormant) `roles` and
 * `user_roles` tables into authorization.
 *
 * Permission model:
 *   • `users.role` (legacy single column) keeps working — built-in role values
 *     map to permission sets below, with `super_admin`/`admin` granting "*".
 *   • `user_roles` → `roles` rows contribute permissions, merged with the
 *     legacy role. `parentRoleId` grants transitive inheritance.
 *   • A custom role may hold `admin.access` to enter the coarse `requireAdmin`
 *     gates (which most admin routes still use), or granular permissions such
 *     as `audit.view` / `settings.manage` to pass `requirePermission(...)`.
 */
import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db";
import { roles, userRoles } from "../schema";

export const WILDCARD = "*";

export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  USERS_VIEW: "users.view",
  USERS_MANAGE: "users.manage",
  KYC_VIEW: "kyc.view",
  KYC_MANAGE: "kyc.manage",
  PAYMENTS_VIEW: "payments.view",
  PAYMENTS_MANAGE: "payments.manage",
  PAYOUTS_VIEW: "payouts.view",
  PAYOUTS_MANAGE: "payouts.manage",
  CHALLENGES_VIEW: "challenges.view",
  CHALLENGES_MANAGE: "challenges.manage",
  MT5_VIEW: "mt5.view",
  MT5_MANAGE: "mt5.manage",
  SUPPORT_VIEW: "support.view",
  SUPPORT_MANAGE: "support.manage",
  AFFILIATES_VIEW: "affiliates.view",
  AFFILIATES_MANAGE: "affiliates.manage",
  COUPONS_VIEW: "coupons.view",
  COUPONS_MANAGE: "coupons.manage",
  CERTIFICATES_VIEW: "certificates.view",
  CERTIFICATES_MANAGE: "certificates.manage",
  AUDIT_VIEW: "audit.view",
  SETTINGS_MANAGE: "settings.manage",
  ROLES_MANAGE: "roles.manage",
  NOTIFICATIONS_VIEW: "notifications.view",
  NOTIFICATIONS_MANAGE: "notifications.manage",
  REPORTS_VIEW: "reports.view",
  /** Meta-permission: grants entry through the coarse `requireAdmin` gate. */
  ADMIN_ACCESS: "admin.access",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: string[] = [...Object.values(PERMISSIONS), WILDCARD];

/** Legacy `users.role` column values → permission sets (kept in sync with the seeded system roles). */
export const LEGACY_ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: [WILDCARD],
  admin: [WILDCARD],
  support_admin: [
    PERMISSIONS.ADMIN_ACCESS,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.CHALLENGES_VIEW,
    PERMISSIONS.SUPPORT_VIEW,
    PERMISSIONS.SUPPORT_MANAGE,
    PERMISSIONS.NOTIFICATIONS_VIEW,
    PERMISSIONS.NOTIFICATIONS_MANAGE,
    PERMISSIONS.AUDIT_VIEW,
  ],
  finance_admin: [
    PERMISSIONS.ADMIN_ACCESS,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PAYMENTS_VIEW,
    PERMISSIONS.PAYMENTS_MANAGE,
    PERMISSIONS.PAYOUTS_VIEW,
    PERMISSIONS.PAYOUTS_MANAGE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.AUDIT_VIEW,
  ],
  client_manager: [
    PERMISSIONS.ADMIN_ACCESS,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.CHALLENGES_VIEW,
    PERMISSIONS.CHALLENGES_MANAGE,
    PERMISSIONS.NOTIFICATIONS_VIEW,
    PERMISSIONS.NOTIFICATIONS_MANAGE,
  ],
  compliance_admin: [
    PERMISSIONS.ADMIN_ACCESS,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.KYC_VIEW,
    PERMISSIONS.KYC_MANAGE,
    PERMISSIONS.CHALLENGES_VIEW,
    PERMISSIONS.AUDIT_VIEW,
  ],
  marketing_admin: [
    PERMISSIONS.ADMIN_ACCESS,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.COUPONS_VIEW,
    PERMISSIONS.COUPONS_MANAGE,
    PERMISSIONS.AFFILIATES_VIEW,
    PERMISSIONS.REPORTS_VIEW,
  ],
  affiliate_manager: [
    PERMISSIONS.ADMIN_ACCESS,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.AFFILIATES_VIEW,
    PERMISSIONS.AFFILIATES_MANAGE,
    PERMISSIONS.PAYMENTS_VIEW,
    PERMISSIONS.REPORTS_VIEW,
  ],
  user: [],
};

/** System roles seeded idempotently at boot (isSystem: true — not deletable via the API). */
export const SYSTEM_ROLES: Array<{ name: string; description: string; permissions: string[] }> = [
  {
    name: "support_admin",
    description: "Answers support tickets and keeps traders informed.",
    permissions: LEGACY_ROLE_PERMISSIONS.support_admin,
  },
  {
    name: "finance_admin",
    description: "Manages payments, payouts, and financial reports.",
    permissions: LEGACY_ROLE_PERMISSIONS.finance_admin,
  },
  {
    name: "client_manager",
    description: "Manages traders, challenges, and account lifecycle.",
    permissions: LEGACY_ROLE_PERMISSIONS.client_manager,
  },
  {
    name: "compliance_admin",
    description: "Reviews KYC documents and audits activity.",
    permissions: LEGACY_ROLE_PERMISSIONS.compliance_admin,
  },
  {
    name: "marketing_admin",
    description: "Runs coupons and affiliate campaigns.",
    permissions: LEGACY_ROLE_PERMISSIONS.marketing_admin,
  },
  {
    name: "affiliate_manager",
    description: "Manages affiliates and referral commissions.",
    permissions: LEGACY_ROLE_PERMISSIONS.affiliate_manager,
  },
];

/** Parses the JSON `permissions` column, tolerating legacy/malformed values. */
export function parsePermissions(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

/** Filters a submitted permission list to known values (custom roles may opt into "*"). */
export function validatePermissions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(ALL_PERMISSIONS);
  return [...new Set(value.filter((p): p is string => typeof p === "string" && allowed.has(p)))];
}

/**
 * Effective permissions of one `roles` row, following `parentRoleId` transitively.
 * Cycle-safe via the `seen` set.
 */
export function resolveRolePermissions(db: Db, roleId: number, seen = new Set<number>()): string[] {
  if (seen.has(roleId)) return [];
  seen.add(roleId);
  const role = db.select().from(roles).where(eq(roles.id, roleId)).get();
  if (!role) return [];
  const perms = parsePermissions(role.permissions);
  if (role.parentRoleId != null) {
    perms.push(...resolveRolePermissions(db, role.parentRoleId, seen));
  }
  return perms;
}

/** Effective permission set for a user: legacy `users.role` + all assigned `user_roles`. */
export function resolveUserPermissions(db: Db, user: { id: number; role: string | null }): Set<string> {
  const set = new Set<string>();
  const legacy = user.role ? LEGACY_ROLE_PERMISSIONS[user.role] : undefined;
  if (legacy) for (const p of legacy) set.add(p);
  const rows = db.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, user.id)).all();
  for (const row of rows) {
    for (const p of resolveRolePermissions(db, row.roleId)) set.add(p);
  }
  return set;
}

export function hasPermission(permissions: Set<string>, permission: string): boolean {
  return permissions.has(WILDCARD) || permissions.has(permission);
}

/** Idempotently seeds the built-in system roles (called at boot from migrate.ts). */
export function ensureSystemRoles(db: Db): void {
  const now = Date.now();
  const existing = db.select({ name: roles.name }).from(roles).where(inArray(roles.name, SYSTEM_ROLES.map((r) => r.name))).all();
  const existingNames = new Set(existing.map((r) => r.name));
  for (const sr of SYSTEM_ROLES) {
    if (existingNames.has(sr.name)) continue;
    db.insert(roles).values({
      name: sr.name,
      description: sr.description,
      permissions: JSON.stringify(sr.permissions),
      isSystem: true,
      parentRoleId: null,
      createdAt: now,
    }).run();
  }
}
