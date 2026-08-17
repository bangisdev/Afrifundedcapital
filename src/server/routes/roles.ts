import { Hono } from "hono";
import { getDb } from "../db";
import { roles, userRoles, users } from "../schema";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../middleware";
import {
  parsePermissions,
  validatePermissions,
  resolveUserPermissions,
  resolveRolePermissions,
  ALL_PERMISSIONS,
} from "../lib/rbac";
import { writeAuditLog } from "../lib/audit";

const app = new Hono();

function clientIp(c: { req: { header(name: string): string | undefined } }): string | undefined {
  return c.req.header("x-forwarded-for") || undefined;
}

function serializeRole(r: typeof roles.$inferSelect, db: ReturnType<typeof getDb>) {
  return {
    ...r,
    permissions: parsePermissions(r.permissions),
    inheritedPermissions: r.parentRoleId != null ? resolveRolePermissions(db, r.id) : parsePermissions(r.permissions),
  };
}

// ─── List roles ────────────────────────────────────────────
app.get("/", requireAuth, requireSuperAdmin, (c) => {
  const db = getDb();
  const rows = db.select().from(roles).orderBy(desc(roles.createdAt)).all();
  const counts = rows.length
    ? db
        .select({ roleId: userRoles.roleId, cnt: sql<number>`COUNT(*)` })
        .from(userRoles)
        .where(inArray(userRoles.roleId, rows.map((r) => r.id)))
        .groupBy(userRoles.roleId)
        .all()
    : [];
  const countMap = new Map(counts.map((r) => [r.roleId, Number(r.cnt ?? 0)]));

  return c.json({
    roles: rows.map((r) => ({
      ...serializeRole(r, db),
      userCount: countMap.get(r.id) ?? 0,
    })),
    availablePermissions: ALL_PERMISSIONS,
  });
});

// ─── Create role ───────────────────────────────────────────
app.post("/", requireAuth, requireSuperAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return c.json({ error: "Role name is required" }, 400);

  const db = getDb();
  const existing = db.select().from(roles).where(eq(roles.name, name)).get();
  if (existing) return c.json({ error: "A role with this name already exists" }, 409);

  const parentRoleId = body.parentRoleId != null ? parseInt(String(body.parentRoleId), 10) : null;
  if (parentRoleId != null && !Number.isFinite(parentRoleId)) {
    return c.json({ error: "Invalid parent role id" }, 400);
  }
  if (parentRoleId != null && !db.select().from(roles).where(eq(roles.id, parentRoleId)).get()) {
    return c.json({ error: "Parent role not found" }, 400);
  }

  const permissions = validatePermissions(body.permissions);
  const row = db.insert(roles).values({
    name,
    description: body.description ? String(body.description) : null,
    permissions: JSON.stringify(permissions),
    isSystem: false,
    parentRoleId,
    createdAt: Date.now(),
  }).returning().get();

  writeAuditLog(db, {
    userId: c.get("userId"),
    action: "roles.created",
    entity: "role",
    entityId: row.id,
    details: { name, permissions, parentRoleId },
    ipAddress: clientIp(c),
  });

  return c.json({ role: serializeRole(row, db) }, 201);
});

// ─── Update role ───────────────────────────────────────────
app.put("/:id", requireAuth, requireSuperAdmin, async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();
  const existing = db.select().from(roles).where(eq(roles.id, id)).get();
  if (!existing) return c.json({ error: "Role not found" }, 404);

  const name = body.name !== undefined ? String(body.name).trim() : existing.name;
  if (!name) return c.json({ error: "Role name is required" }, 400);
  const nameClash = db.select().from(roles).where(eq(roles.name, name)).get();
  if (nameClash && nameClash.id !== id) return c.json({ error: "A role with this name already exists" }, 409);

  const parentRoleId = body.parentRoleId !== undefined
    ? (body.parentRoleId == null ? null : parseInt(String(body.parentRoleId), 10))
    : existing.parentRoleId;
  if (parentRoleId === id) return c.json({ error: "A role cannot be its own parent" }, 400);
  if (parentRoleId != null && !Number.isFinite(parentRoleId)) return c.json({ error: "Invalid parent role id" }, 400);
  if (parentRoleId != null && !db.select().from(roles).where(eq(roles.id, parentRoleId)).get()) {
    return c.json({ error: "Parent role not found" }, 400);
  }

  const permissions = body.permissions !== undefined ? validatePermissions(body.permissions) : parsePermissions(existing.permissions);

  db.update(roles).set({
    name,
    description: body.description !== undefined ? (body.description ? String(body.description) : null) : existing.description,
    permissions: JSON.stringify(permissions),
    parentRoleId,
  }).where(eq(roles.id, id)).run();

  const updated = db.select().from(roles).where(eq(roles.id, id)).get();
  writeAuditLog(db, {
    userId: c.get("userId"),
    action: "roles.updated",
    entity: "role",
    entityId: id,
    details: { name, permissions, parentRoleId },
    ipAddress: clientIp(c),
  });

  return c.json({ role: serializeRole(updated!, db) });
});

// ─── Delete role ───────────────────────────────────────────
app.delete("/:id", requireAuth, requireSuperAdmin, (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const db = getDb();
  const existing = db.select().from(roles).where(eq(roles.id, id)).get();
  if (!existing) return c.json({ error: "Role not found" }, 404);
  if (existing.isSystem) {
    return c.json({ error: "System roles cannot be deleted" }, 400);
  }

  db.delete(userRoles).where(eq(userRoles.roleId, id)).run();
  // Orphan children: detach rather than cascade-delete.
  db.update(roles).set({ parentRoleId: null }).where(eq(roles.parentRoleId, id)).run();
  db.delete(roles).where(eq(roles.id, id)).run();

  writeAuditLog(db, {
    userId: c.get("userId"),
    action: "roles.deleted",
    entity: "role",
    entityId: id,
    details: { name: existing.name },
    ipAddress: clientIp(c),
  });

  return c.json({ success: true });
});

// ─── A user's assigned roles ───────────────────────────────
app.get("/users/:userId/roles", requireAuth, requireSuperAdmin, (c) => {
  const userId = parseInt(c.req.param("userId"), 10);
  const db = getDb();
  const target = db.select().from(users).where(eq(users.id, userId)).get();
  if (!target) return c.json({ error: "User not found" }, 404);

  const assignments = db.select().from(userRoles).where(eq(userRoles.userId, userId)).all();
  const roleRows = assignments.length
    ? db.select().from(roles).where(inArray(roles.id, assignments.map((a) => a.roleId))).all()
    : [];

  return c.json({
    userId,
    roleIds: assignments.map((a) => a.roleId),
    roles: roleRows.map((r) => serializeRole(r, db)),
  });
});

// ─── Replace a user's role assignments ─────────────────────
app.put("/users/:userId/roles", requireAuth, requireSuperAdmin, async (c) => {
  const userId = parseInt(c.req.param("userId"), 10);
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();
  const target = db.select().from(users).where(eq(users.id, userId)).get();
  if (!target) return c.json({ error: "User not found" }, 404);

  const roleIds: number[] = (Array.isArray(body.roleIds) ? (body.roleIds as unknown[]) : [])
    .map((r: unknown) => Number(r))
    .filter((n): n is number => Number.isFinite(n))
    .filter((n, i, arr) => arr.indexOf(n) === i);
  if (roleIds.length) {
    const found = db.select({ id: roles.id }).from(roles).where(inArray(roles.id, roleIds)).all();
    if (found.length !== roleIds.length) {
      return c.json({ error: "One or more role ids do not exist" }, 400);
    }
  }

  db.delete(userRoles).where(eq(userRoles.userId, userId)).run();
  const now = Date.now();
  for (const roleId of roleIds) {
    db.insert(userRoles).values({ userId, roleId, assignedBy: c.get("userId"), assignedAt: now }).run();
  }

  writeAuditLog(db, {
    userId: c.get("userId"),
    action: "roles.assigned",
    entity: "user",
    entityId: userId,
    details: { roleIds, targetEmail: target.email },
    ipAddress: clientIp(c),
  });

  return c.json({ userId, roleIds });
});

// ─── Caller's effective permissions (for UI gating) ────────
app.get("/me", requireAuth, (c) => {
  const user = c.get("user");
  const db = getDb();
  const permissions = resolveUserPermissions(db, { id: user.id, role: user.role });
  return c.json({
    userId: user.id,
    role: user.role,
    permissions: [...permissions].sort(),
  });
});

export default app;
