/**
 * Admin API for runtime-managed gateway secrets.
 *
 * GET    /api/admin/secrets        → status for every managed secret
 * PUT    /api/admin/secrets/:name  → set the encrypted override (admin-managed)
 * DELETE /api/admin/secrets/:name  → clear the override (fall back to env)
 *
 * Every mutation is audit-logged (values never appear in the trail) and other
 * admins are alerted, matching the existing settings-edit security posture.
 */
import { Hono } from "hono";
import { getDb } from "../db";
import { requireAuth, requireAdmin } from "../middleware";
import {
  SECRET_NAMES,
  getSecretStatus,
  setSecretOverride,
  clearSecretOverride,
  listSecretStatuses,
  isEncryptionKeyed,
} from "../lib/secrets";
import { writeAuditLog } from "../lib/audit";
import { notifyAdminsOfSecurityEvent } from "../lib/notifications";

const app = new Hono();

app.get("/", requireAuth, requireAdmin, (c) => {
  return c.json({
    items: listSecretStatuses(),
    // False when no APP_SECRETS_KEY / JWT_PRIVATE_KEY is set — overrides are
    // encrypted with an ephemeral key and won't survive a restart.
    encryptionKeyed: isEncryptionKeyed(),
  });
});

app.put("/:name", requireAuth, requireAdmin, async (c) => {
  const name = c.req.param("name");
  if (!(SECRET_NAMES as readonly string[]).includes(name)) {
    return c.json({ error: `Unknown secret '${name}'. Managed names: ${SECRET_NAMES.join(", ")}` }, 400);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const value = typeof body.value === "string" ? body.value.trim() : "";
  if (!value) {
    return c.json({ error: "value is required" }, 400);
  }

  setSecretOverride(name, value);

  const db = getDb();
  try {
    writeAuditLog(db, {
      userId: c.get("userId"),
      action: "secrets.updated",
      entity: "secret",
      entityId: name,
      details: {
        key: name,
        // Never include the value — masked only.
        masked: getSecretStatus(name).masked,
      },
      ipAddress: c.req.header("x-forwarded-for") || undefined,
    });
  } catch (e) {
    console.warn("[Audit] Failed to log secret update:", e);
  }

  try {
    const actor = c.get("user") as { name?: string } | undefined;
    notifyAdminsOfSecurityEvent(db, {
      actorId: c.get("userId"),
      actorName: actor?.name || `Admin #${c.get("userId")}`,
      key: name,
      action: "updated",
    });
  } catch (e) {
    console.warn("[Notification] Failed to alert admins of secret update:", e);
  }

  return c.json(getSecretStatus(name));
});

app.delete("/:name", requireAuth, requireAdmin, (c) => {
  const name = c.req.param("name");
  if (!(SECRET_NAMES as readonly string[]).includes(name)) {
    return c.json({ error: `Unknown secret '${name}'. Managed names: ${SECRET_NAMES.join(", ")}` }, 400);
  }

  clearSecretOverride(name);

  const db = getDb();
  try {
    writeAuditLog(db, {
      userId: c.get("userId"),
      action: "secrets.cleared",
      entity: "secret",
      entityId: name,
      details: { key: name },
      ipAddress: c.req.header("x-forwarded-for") || undefined,
    });
  } catch (e) {
    console.warn("[Audit] Failed to log secret clear:", e);
  }

  return c.json(getSecretStatus(name));
});

export default app;
