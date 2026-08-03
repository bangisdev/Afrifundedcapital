/**
 * Users route tests — admin audit log integration for sensitive user actions.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Hono } from "hono";
import {
  buildTestApp,
  cleanupTestDb,
  signUp,
  signIn,
  authGet,
  authPost,
  authPut,
  authDelete,
  getTestDb,
} from "./setup";
import { users, auditLogs, notifications } from "../schema";
import { eq, desc, and } from "drizzle-orm";

let app: Hono;
let adminCookie: string;
let traderId: number;

beforeAll(async () => {
  app = await buildTestApp();

  // Create a regular trader
  const trader = await signUp(app, {
    name: "Audit Trader",
    email: "audit-trader@test.com",
    password: "Secure@123",
  });
  traderId = Number((trader.body as Record<string, unknown>).id) || 0;

  // Create + promote an admin
  await signUp(app, {
    name: "Audit Admin",
    email: "audit-admin@test.com",
    password: "Admin@123",
  });
  const db = getTestDb();
  const adminUser = db.select().from(users).where(eq(users.email, "audit-admin@test.com")).get();
  if (adminUser) {
    await authPost(app, "/api/auth/promote-admin", "", { userId: adminUser.id });
  }
  const adminSignIn = await signIn(app, { email: "audit-admin@test.com", password: "Admin@123" });
  adminCookie = adminSignIn.cookie;

  if (!traderId) {
    const traderRow = db.select().from(users).where(eq(users.email, "audit-trader@test.com")).get();
    traderId = traderRow?.id || 0;
  }
});

afterAll(() => {
  cleanupTestDb();
});

// ═══════════════════════════════════════════════════════════════
//  AUDIT LOG: ROLE CHANGE
// ═══════════════════════════════════════════════════════════════

describe("PUT /api/users/:id/role", () => {
  it("writes a user.role_changed audit entry", async () => {
    const { status } = await authPut(app, `/api/users/${traderId}/role`, adminCookie, {
      role: "support_admin",
    });
    expect(status).toBe(200);

    const db = getTestDb();
    const audit = db.select().from(auditLogs)
      .where(eq(auditLogs.action, "user.role_changed"))
      .orderBy(desc(auditLogs.timestamp))
      .get();
    expect(audit).toBeTruthy();
    expect(audit?.entity).toBe("user");
    expect(audit?.entityId).toBe(String(traderId));
    expect(audit?.details).toContain("support_admin");
  });

  it("returns 404 for a missing user", async () => {
    const { status } = await authPut(app, "/api/users/999999/role", adminCookie, {
      role: "support_admin",
    });
    expect(status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════
//  AUDIT LOG: LIST WITH ACTOR JOINED
// ═══════════════════════════════════════════════════════════════

describe("GET /api/users/audit-logs", () => {
  it("returns the acting admin's name and email joined onto each log", async () => {
    // Force at least one audit entry from the admin (role change above)
    const { status, body } = await authGet(app, "/api/users/audit-logs?page=1&pageSize=50", adminCookie);
    expect(status).toBe(200);

    const logs = (body as Record<string, unknown>).logs as Array<Record<string, unknown>>;
    expect(logs.length).toBeGreaterThan(0);

    const roleLog = logs.find((l) => l.action === "user.role_changed");
    expect(roleLog).toBeTruthy();
    expect(roleLog?.userName).toBe("Audit Admin");
    expect(roleLog?.userEmail).toBe("audit-admin@test.com");
    expect(roleLog?.userDeleted).toBe(false);
  });

  it("search matches on the joined actor email", async () => {
    const { body } = await authGet(
      app,
      "/api/users/audit-logs?search=audit-admin%40test.com&page=1&pageSize=50",
      adminCookie,
    );
    const logs = (body as Record<string, unknown>).logs as Array<Record<string, unknown>>;
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.userEmail === "audit-admin@test.com")).toBe(true);
  });

  it("marks entries whose actor has been deleted", async () => {
    // Create a disposable admin, act with it, then delete it
    await signUp(app, { name: "Doomed Admin", email: "doomed-admin@test.com", password: "Admin@123" });
    const db = getTestDb();
    const doomed = db.select().from(users).where(eq(users.email, "doomed-admin@test.com")).get();
    if (!doomed) return;

    // Promote directly in DB (the test app only allows one super_admin via the endpoint)
    db.update(users).set({ role: "super_admin", onboardingComplete: true, updatedAt: Date.now() }).where(eq(users.id, doomed.id)).run();
    const doomedSignIn = await signIn(app, { email: "doomed-admin@test.com", password: "Admin@123" });
    const doomedCookie = doomedSignIn.cookie;

    await authPut(app, `/api/users/${traderId}/role`, doomedCookie, { role: "finance_admin" });

    // Delete the doomed admin (cascade removes their user row)
    const { status } = await authDelete(app, `/api/users/${doomed.id}`, adminCookie);
    expect(status).toBe(200);

    const { body } = await authGet(app, "/api/users/audit-logs?action=user.role_changed&page=1&pageSize=50", adminCookie);
    const logs = (body as Record<string, unknown>).logs as Array<Record<string, unknown>>;
    const doomedLog = logs.find((l) => l.userId === doomed.id);
    expect(doomedLog).toBeTruthy();
    expect(doomedLog?.userName).toBeFalsy();
    expect(doomedLog?.userEmail).toBeFalsy();
    expect(doomedLog?.userDeleted).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  AUDIT LOG: USER DELETION
// ═══════════════════════════════════════════════════════════════

describe("DELETE /api/users/:id", () => {
  it("writes a user.deleted audit entry before deleting", async () => {
    const created = await signUp(app, {
      name: "To Be Deleted",
      email: "delete-me@test.com",
      password: "Secure@123",
    });
    const db = getTestDb();
    const target = db.select().from(users).where(eq(users.email, "delete-me@test.com")).get();
    if (!target) return;

    const { status } = await authDelete(app, `/api/users/${target.id}`, adminCookie);
    expect(status).toBe(200);

    const audit = db.select().from(auditLogs)
      .where(eq(auditLogs.action, "user.deleted"))
      .orderBy(desc(auditLogs.timestamp))
      .get();
    expect(audit).toBeTruthy();
    expect(audit?.entityId).toBe(String(target.id));
    expect(audit?.details).toContain("delete-me@test.com");
    // Actor is the admin who performed the deletion
    expect(audit?.userId).toBeTruthy();

    const gone = db.select().from(users).where(eq(users.id, target.id)).get();
    expect(gone).toBeFalsy();
  });

  it("cannot delete yourself", async () => {
    const adminRow = getTestDb().select().from(users).where(eq(users.email, "audit-admin@test.com")).get();
    if (!adminRow) return;
    const { status } = await authDelete(app, `/api/users/${adminRow.id}`, adminCookie);
    expect(status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
//  AUDIT LOG: SETTINGS CHANGES (payment keys, payout thresholds)
// ═══════════════════════════════════════════════════════════════

describe("PUT /api/users/settings/:key", () => {
  it("writes settings.created with the full non-secret value", async () => {
    const { status } = await authPut(app, "/api/users/settings/affiliate_auto_approve_threshold", adminCookie, {
      value: 50000,
      group: "affiliates",
    });
    expect(status).toBe(200);

    const db = getTestDb();
    const audit = db.select().from(auditLogs)
      .where(eq(auditLogs.action, "settings.created"))
      .orderBy(desc(auditLogs.timestamp))
      .get();
    expect(audit).toBeTruthy();
    expect(audit?.entity).toBe("setting");
    expect(audit?.entityId).toBe("affiliate_auto_approve_threshold");
    // Non-secret values are stored in full so reviewers see exactly what changed
    expect(audit?.details).toContain("50000");
    expect(audit?.details).not.toContain("••••");
  });

  it("writes settings.updated with before/after values", async () => {
    const { status } = await authPut(app, "/api/users/settings/affiliate_auto_approve_threshold", adminCookie, {
      value: 100000,
    });
    expect(status).toBe(200);

    const db = getTestDb();
    const audit = db.select().from(auditLogs)
      .where(eq(auditLogs.action, "settings.updated"))
      .orderBy(desc(auditLogs.timestamp))
      .get();
    expect(audit).toBeTruthy();
    expect(audit?.entityId).toBe("affiliate_auto_approve_threshold");
    expect(audit?.details).toContain("50000"); // from
    expect(audit?.details).toContain("100000"); // to
  });

  it("redacts secrets so payment keys never land in the audit trail", async () => {
    const secretKey = "FLWSECK_TEST-super-secret-value-9876";
    const secretHash = "secret-hash-123";
    const { status } = await authPut(app, "/api/users/settings/flutterwave_config", adminCookie, {
      value: { publicKey: "FLWPUBK_TEST-pub123", secretKey, secretHash, isEnabled: true },
      group: "payments",
    });
    expect(status).toBe(200);

    const db = getTestDb();
    const audit = db.select().from(auditLogs)
      .where(eq(auditLogs.action, "settings.created"))
      .orderBy(desc(auditLogs.timestamp))
      .get();
    expect(audit).toBeTruthy();
    expect(audit?.entityId).toBe("flutterwave_config");
    // The secrets must never be persisted in plaintext
    expect(audit?.details).not.toContain(secretKey);
    expect(audit?.details).not.toContain(secretHash);
    // The masked form + non-secret fields remain visible for review
    expect(audit?.details).toContain("••••");
    expect(audit?.details).toContain("FLWPUBK_TEST-pub123");
  });

  it("shows the settings change in the audit-logs list with the actor joined", async () => {
    const { body } = await authGet(
      app,
      "/api/users/audit-logs?action=settings.created&page=1&pageSize=50",
      adminCookie,
    );
    const logs = (body as Record<string, unknown>).logs as Array<Record<string, unknown>>;
    const log = logs.find((l) => l.entityId === "flutterwave_config");
    expect(log).toBeTruthy();
    expect(log?.userEmail).toBe("audit-admin@test.com");
    expect(log?.userDeleted).toBe(false);
  });

  it("alerts other admins with a security notification (not the actor)", async () => {
    // Create a second admin who should receive the alert
    await signUp(app, { name: "Second Admin", email: "second-admin@test.com", password: "Admin@123" });
    const db = getTestDb();
    const second = db.select().from(users).where(eq(users.email, "second-admin@test.com")).get();
    const actor = db.select().from(users).where(eq(users.email, "audit-admin@test.com")).get();
    if (!second || !actor) return;
    db.update(users)
      .set({ role: "support_admin", onboardingComplete: true, updatedAt: Date.now() })
      .where(eq(users.id, second.id))
      .run();

    await authPut(app, "/api/users/settings/flutterwave_config", adminCookie, {
      value: { publicKey: "FLWPUBK_TEST-alert", secretKey: "FLWSECK_TEST-alert-1111", isEnabled: true },
      group: "payments",
    });

    // The other admin receives a security notification flagged with the key
    const secondNotif = db.select().from(notifications)
      .where(and(eq(notifications.userId, second.id), eq(notifications.type, "security")))
      .orderBy(desc(notifications.createdAt))
      .get();
    expect(secondNotif).toBeTruthy();
    expect(secondNotif?.title).toContain("Payment Config Changed");
    expect(secondNotif?.metadata).toContain("flutterwave_config");
    expect(secondNotif?.link).toBe("/admin/settings");

    // The actor is NOT notified about their own change
    const actorNotif = db.select().from(notifications)
      .where(and(eq(notifications.userId, actor.id), eq(notifications.type, "security")))
      .get();
    expect(actorNotif).toBeFalsy();
  });
});
