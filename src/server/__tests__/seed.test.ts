/**
 * Seed route tests — the PUT /api/seed/settings/:key endpoint is the path the
 * Admin → Settings page actually uses to save payment gateway keys
 * (Flutterwave/Resend/Paystack) and payout thresholds, so every config edit
 * must be audited with secret values redacted from the trail.
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
  getTestDb,
} from "./setup";
import { users, auditLogs } from "../schema";
import { eq, desc } from "drizzle-orm";

let app: Hono;
let adminCookie: string;

beforeAll(async () => {
  app = await buildTestApp();

  await signUp(app, { name: "Seed Admin", email: "seed-admin@test.com", password: "Admin@123" });
  const db = getTestDb();
  const adminUser = db.select().from(users).where(eq(users.email, "seed-admin@test.com")).get();
  if (adminUser) {
    await authPost(app, "/api/auth/promote-admin", "", { userId: adminUser.id });
  }
  const adminSignIn = await signIn(app, { email: "seed-admin@test.com", password: "Admin@123" });
  adminCookie = adminSignIn.cookie;
});

afterAll(() => {
  cleanupTestDb();
});

// ═══════════════════════════════════════════════════════════════
//  SETTINGS AUDIT (production AdminSettings path)
// ═══════════════════════════════════════════════════════════════

describe("PUT /api/seed/settings/:key", () => {
  it("writes settings.created audit entry for a new config key", async () => {
    const { status } = await authPut(app, "/api/seed/settings/affiliate_auto_approve_threshold", adminCookie, {
      value: 25000,
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
    expect(audit?.details).toContain("25000");
  });

  it("writes settings.updated with redacted Flutterwave keys", async () => {
    const secretKey = "FLWSECK_TEST-seed-admin-secret-5555";
    // First save creates the config
    await authPut(app, "/api/seed/settings/flutterwave_config", adminCookie, {
      value: { publicKey: "FLWPUBK_TEST-old", secretKey: "old-secret", secretHash: "old-hash", isEnabled: false },
      group: "payments",
    });
    // Second save updates it
    const { status } = await authPut(app, "/api/seed/settings/flutterwave_config", adminCookie, {
      value: { publicKey: "FLWPUBK_TEST-new", secretKey, secretHash: "new-hash-xyz", isEnabled: true },
      group: "payments",
    });
    expect(status).toBe(200);

    const db = getTestDb();
    const audit = db.select().from(auditLogs)
      .where(eq(auditLogs.action, "settings.updated"))
      .orderBy(desc(auditLogs.timestamp))
      .get();
    expect(audit).toBeTruthy();
    expect(audit?.entityId).toBe("flutterwave_config");
    // Secrets are redacted — never the plaintext, old or new
    expect(audit?.details).not.toContain("FLWSECK_TEST-seed-admin-secret-5555");
    expect(audit?.details).not.toContain("old-secret");
    expect(audit?.details).not.toContain("new-hash-xyz");
    // Masked + non-secret fields stay visible for review
    expect(audit?.details).toContain("••••");
    expect(audit?.details).toContain("FLWPUBK_TEST-new");
  });

  it("exposes the settings change through the audit-logs endpoint with the actor", async () => {
    const { body } = await authGet(
      app,
      "/api/users/audit-logs?action=settings.updated&page=1&pageSize=50",
      adminCookie,
    );
    const logs = (body as Record<string, unknown>).logs as Array<Record<string, unknown>>;
    const log = logs.find((l) => l.entityId === "flutterwave_config");
    expect(log).toBeTruthy();
    expect(log?.userEmail).toBe("seed-admin@test.com");
    expect(log?.userDeleted).toBe(false);
  });

  it("returns 403 for non-admin users", async () => {
    await signUp(app, { name: "Seed Trader", email: "seed-trader@test.com", password: "Secure@123" });
    const traderSignIn = await signIn(app, { email: "seed-trader@test.com", password: "Secure@123" });
    const { status } = await authPut(app, "/api/seed/settings/flutterwave_config", traderSignIn.cookie, {
      value: { publicKey: "p" },
    });
    expect(status).toBe(403);
  });
});
