/**
 * RBAC tests — permission resolution (legacy role column + roles/user_roles
 * tables with parent inheritance), the `requirePermission` / RBAC-aware
 * `requireAdmin` middleware gates, and the /api/admin/roles management API.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Hono } from "hono";
import {
  buildTestApp,
  cleanupTestDb,
  signUp,
  signIn,
  authGet,
  authPost,
  authPut,
  getTestDb,
} from "./setup";
import { users, roles, userRoles } from "../schema";
import { eq } from "drizzle-orm";
import {
  resolveUserPermissions,
  resolveRolePermissions,
  hasPermission,
  PERMISSIONS,
} from "../lib/rbac";

let app: Hono;
let adminCookie: string;
let auditorId: number;
let auditorCookie: string;
let plainId: number;
let plainCookie: string;
let opsId: number;
let opsCookie: string;

async function signUpUser(name: string, email: string): Promise<{ id: number; cookie: string }> {
  await signUp(app, { name, email, password: "Secure@123" });
  const { cookie } = await signIn(app, { email, password: "Secure@123" });
  const db = getTestDb();
  const user = db.select().from(users).where(eq(users.email, email)).get();
  return { id: user!.id, cookie };
}

beforeAll(async () => {
  app = await buildTestApp();

  // Super admin (bootstrap promote).
  await signUp(app, { name: "RBAC Admin", email: "rbac-admin@test.com", password: "Secure@123" });
  const db = getTestDb();
  const adminUser = db.select().from(users).where(eq(users.email, "rbac-admin@test.com")).get();
  await authPost(app, "/api/auth/promote-admin", "", { userId: adminUser!.id });
  const { cookie } = await signIn(app, { email: "rbac-admin@test.com", password: "Secure@123" });
  adminCookie = cookie;

  const auditor = await signUpUser("RBAC Auditor", "rbac-auditor@test.com");
  auditorId = auditor.id;
  auditorCookie = auditor.cookie;

  const plain = await signUpUser("RBAC Plain", "rbac-plain@test.com");
  plainId = plain.id;
  plainCookie = plain.cookie;

  const ops = await signUpUser("RBAC Ops", "rbac-ops@test.com");
  opsId = ops.id;
  opsCookie = ops.cookie;
});

afterAll(() => {
  cleanupTestDb();
});

describe("permission resolution (lib/rbac)", () => {
  it("maps legacy role column values to permission sets", () => {
    const db = getTestDb();
    const superAdmin = resolveUserPermissions(db, { id: 1, role: "super_admin" });
    expect(hasPermission(superAdmin, PERMISSIONS.AUDIT_VIEW)).toBe(true);
    expect(hasPermission(superAdmin, "anything.else")).toBe(true); // wildcard

    const finance = resolveUserPermissions(db, { id: 1, role: "finance_admin" });
    expect(hasPermission(finance, PERMISSIONS.PAYMENTS_MANAGE)).toBe(true);
    expect(hasPermission(finance, PERMISSIONS.ADMIN_ACCESS)).toBe(true);
    expect(hasPermission(finance, PERMISSIONS.KYC_MANAGE)).toBe(false);

    const plain = resolveUserPermissions(db, { id: 1, role: "user" });
    expect(hasPermission(plain, PERMISSIONS.DASHBOARD_VIEW)).toBe(false);
  });

  it("resolves user_roles with transitive parent-role inheritance, cycle-safe", () => {
    const db = getTestDb();
    const now = Date.now();

    const parent = db.insert(roles).values({
      name: `rbac-parent-${now}`,
      permissions: JSON.stringify([PERMISSIONS.USERS_VIEW]),
      isSystem: false,
      parentRoleId: null,
      createdAt: now,
    }).returning().get();

    const child = db.insert(roles).values({
      name: `rbac-child-${now}`,
      permissions: JSON.stringify([PERMISSIONS.AUDIT_VIEW]),
      isSystem: false,
      parentRoleId: parent.id,
      createdAt: now,
    }).returning().get();

    // Cycle guard: make the parent point back at the child.
    db.update(roles).set({ parentRoleId: child.id }).where(eq(roles.id, parent.id)).run();

    const perms = resolveRolePermissions(db, child.id);
    expect(perms).toContain(PERMISSIONS.AUDIT_VIEW);
    expect(perms).toContain(PERMISSIONS.USERS_VIEW);

    // Use a synthetic id — this row exists only to exercise resolution and
    // must never leak into the HTTP middleware tests below.
    const syntheticUserId = 424242;
    db.insert(userRoles).values({
      userId: syntheticUserId,
      roleId: child.id,
      assignedBy: 0,
      assignedAt: now,
    }).run();

    const userPerms = resolveUserPermissions(db, { id: syntheticUserId, role: null });
    expect(hasPermission(userPerms, PERMISSIONS.AUDIT_VIEW)).toBe(true);
    expect(hasPermission(userPerms, PERMISSIONS.USERS_VIEW)).toBe(true); // inherited
  });

  it("seeds the built-in system roles at boot", async () => {
    const res = await authGet(app, "/api/admin/roles", adminCookie);
    expect(res.status).toBe(200);
    const names = (res.body.roles as Array<{ name: string; isSystem: boolean }>).map((r) => r.name);
    for (const expected of ["support_admin", "finance_admin", "compliance_admin"]) {
      expect(names).toContain(expected);
    }
    const support = (res.body.roles as Array<{ name: string; isSystem: boolean }>).find((r) => r.name === "support_admin");
    expect(support?.isSystem).toBe(true);
  });
});

describe("requirePermission middleware", () => {
  let auditorRoleId: number;

  beforeEach(async () => {
    // Fresh custom role for the auditor: only audit.view.
    const res = await authPost(app, "/api/admin/roles", adminCookie, {
      name: `auditor-${Date.now()}`,
      description: "Read-only audit reviewer",
      permissions: ["audit.view"],
    });
    expect(res.status).toBe(201);
    auditorRoleId = res.body.role.id;
    await authPut(app, `/api/admin/roles/users/${auditorId}/roles`, adminCookie, {
      roleIds: [auditorRoleId],
    });
  });

  it("allows a custom role that holds the permission", async () => {
    const res = await authGet(app, "/api/users/audit-logs", auditorCookie);
    expect(res.status).toBe(200);
  });

  it("rejects users without the permission", async () => {
    const res = await authGet(app, "/api/users/audit-logs", plainCookie);
    expect(res.status).toBe(403);
  });

  it("passes super_admin (wildcard) regardless of role tables", async () => {
    const res = await authGet(app, "/api/users/audit-logs", adminCookie);
    expect(res.status).toBe(200);
  });

  it("gates the secrets API behind settings.manage", async () => {
    const ok = await authPut(app, "/api/admin/secrets/RESEND_API_KEY", auditorCookie, { value: "re_abcdefghijklmnopqrstuvwx" });
    expect(ok.status).toBe(403);

    const denied = await authPut(app, "/api/admin/secrets/RESEND_API_KEY", plainCookie, { value: "re_abcdefghijklmnopqrstuvwx" });
    expect(denied.status).toBe(403);

    const allowed = await authPut(app, "/api/admin/secrets/RESEND_API_KEY", adminCookie, { value: "re_abcdefghijklmnopqrstuvwx" });
    expect(allowed.status).toBe(200);
  });
});

describe("RBAC-aware requireAdmin", () => {
  it("grants admin-area access to a custom role holding admin.access", async () => {
    const res = await authPost(app, "/api/admin/roles", adminCookie, {
      name: `ops-${Date.now()}`,
      permissions: ["admin.access"],
    });
    expect(res.status).toBe(201);
    const roleId = res.body.role.id;
    await authPut(app, `/api/admin/roles/users/${opsId}/roles`, adminCookie, { roleIds: [roleId] });

    // /api/trading/admin/mt5 is still guarded by the coarse requireAdmin gate.
    const allowed = await authGet(app, "/api/trading/admin/mt5", opsCookie);
    expect(allowed.status).toBe(200);

    const denied = await authGet(app, "/api/trading/admin/mt5", plainCookie);
    expect(denied.status).toBe(403);
  });
});

describe("roles admin API", () => {
  it("creates, updates, lists, and deletes custom roles", async () => {
    const created = await authPost(app, "/api/admin/roles", adminCookie, {
      name: `qa-role-${Date.now()}`,
      description: "QA tester",
      permissions: ["payments.view", "reports.view"],
    });
    expect(created.status).toBe(201);
    const roleId = created.body.role.id;
    expect(created.body.role.permissions).toEqual(["payments.view", "reports.view"]);

    // Duplicate name → 409
    const dup = await authPost(app, "/api/admin/roles", adminCookie, { name: created.body.role.name });
    expect(dup.status).toBe(409);

    // Unknown permissions are dropped on create
    const filtered = await authPost(app, "/api/admin/roles", adminCookie, {
      name: `filtered-${Date.now()}`,
      permissions: ["payments.view", "not.a.real.permission", "*"],
    });
    expect(filtered.status).toBe(201);
    expect(filtered.body.role.permissions).toEqual(["payments.view", "*"]);

    // Update
    const updated = await authPut(app, `/api/admin/roles/${roleId}`, adminCookie, {
      permissions: ["payments.manage", "payouts.view"],
    });
    expect(updated.status).toBe(200);
    expect(updated.body.role.permissions).toEqual(["payments.manage", "payouts.view"]);

    // Delete (no authDelete helper — issue the DELETE directly)
    const delRes = await app.request(`/api/admin/roles/${roleId}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    expect(delRes.status).toBe(200);
  });

  it("blocks deleting system roles", async () => {
    const list = await authGet(app, "/api/admin/roles", adminCookie);
    const support = (list.body.roles as Array<{ id: number; name: string; isSystem: boolean }>).find((r) => r.name === "support_admin");
    const res = await app.request(`/api/admin/roles/${support!.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(400);
  });

  it("assigns and reads a user's roles, and rejects unknown role ids", async () => {
    const list = await authGet(app, "/api/admin/roles", adminCookie);
    const finance = (list.body.roles as Array<{ id: number; name: string }>).find((r) => r.name === "finance_admin");

    const assigned = await authPut(app, `/api/admin/roles/users/${plainId}/roles`, adminCookie, {
      roleIds: [finance!.id],
    });
    expect(assigned.status).toBe(200);
    expect(assigned.body.roleIds).toEqual([finance!.id]);

    const read = await authGet(app, `/api/admin/roles/users/${plainId}/roles`, adminCookie);
    expect(read.status).toBe(200);
    expect(read.body.roleIds).toEqual([finance!.id]);

    // Now finance_admin (assigned via user_roles) → requirePermission(payouts.view)
    // passes on a granularly-gated endpoint.
    const allowed = await authGet(app, "/api/payouts/admin/stats", plainCookie);
    expect(allowed.status).toBe(200);

    const bad = await authPut(app, `/api/admin/roles/users/${plainId}/roles`, adminCookie, {
      roleIds: [999999],
    });
    expect(bad.status).toBe(400);
  });

  it("exposes the caller's effective permissions via /me", async () => {
    const me = await authGet(app, "/api/admin/roles/me", adminCookie);
    expect(me.status).toBe(200);
    expect(me.body.permissions).toContain("*");

    const auditorMe = await authGet(app, "/api/admin/roles/me", auditorCookie);
    expect(auditorMe.body.permissions).toContain("audit.view");
  });
});
