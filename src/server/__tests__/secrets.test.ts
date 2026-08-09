/**
 * Runtime secret override tests.
 *
 * Covers the admin-only /api/admin/secrets API: admin gating, unknown-name and
 * empty-value validation, the encrypted-at-rest roundtrip (source "db" takes
 * precedence over env, ciphertext never contains the plaintext), the clear
 * path back to env, and the audit trail entries written for each mutation.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Hono } from "hono";
import {
  ApiEnvelope,
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
import { settings, auditLogs } from "../schema";
import { eq, desc } from "drizzle-orm";
import { getMT5Config, MT5_CONFIG_SETTING } from "../lib/mt5/config";
import { setSecretOverride, clearSecretOverride } from "../lib/secrets";

let app: Hono;
let userCookie: string;
let adminCookie: string;

const TEST_USER = { name: "Secret User", email: "secret-user@test.com", password: "Secure@123" };
const TEST_ADMIN = { name: "Secret Admin", email: "secret-admin@test.com", password: "Admin@123" };

beforeAll(async () => {
  // Stable master key so overrides encrypt deterministically (mirrors a real
  // deployment with APP_SECRETS_KEY set in the Keys/API keys tab).
  process.env.APP_SECRETS_KEY = "test-master-key-0123456789abcdef";
  // Environment fallback values — the overrides below must win over these.
  process.env.FLW_SECRET_KEY = "FLWSECK_TEST-envkey-0001";
  process.env.FLW_SECRET_HASH = "env-hash";
  process.env.RESEND_API_KEY = "";

  app = await buildTestApp();

  await signUp(app, TEST_USER);
  const userSignIn = await signIn(app, TEST_USER);
  userCookie = userSignIn.cookie;

  const adminSignUp = await signUp(app, TEST_ADMIN);
  const adminSignIn = await signIn(app, TEST_ADMIN);
  adminCookie = adminSignIn.cookie;
  const adminId = (adminSignUp.body.user as { id: number }).id;
  await authPost(app, "/api/auth/promote-admin", adminCookie, { userId: adminId });
});

afterAll(() => {
  delete process.env.APP_SECRETS_KEY;
  delete process.env.FLW_SECRET_KEY;
  delete process.env.FLW_SECRET_HASH;
  delete process.env.RESEND_API_KEY;
  cleanupTestDb();
});

function latestAudit(action: string) {
  return getTestDb()
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.action, action))
    .orderBy(desc(auditLogs.timestamp))
    .get();
}

describe("Admin secret override API", () => {
  it("lists managed secrets with env fallback sources", async () => {
    const { status, body } = await authGet(app, "/api/admin/secrets", adminCookie);
    expect(status).toBe(200);
    const items = (body as ApiEnvelope).items as Array<{ name: string; source: string; configured: boolean }>;
    expect(items.map((i) => i.name).sort()).toEqual([
      "FLW_SECRET_HASH",
      "FLW_SECRET_KEY",
      "MT5_GATEWAY_API_KEY",
      "PAYSTACK_SECRET_KEY",
      "RESEND_API_KEY",
      "SMTP_PASSWORD",
    ]);
    const flw = items.find((i) => i.name === "FLW_SECRET_KEY")!;
    expect(flw.source).toBe("env");
    expect(flw.configured).toBe(true);
    const resend = items.find((i) => i.name === "RESEND_API_KEY")!;
    expect(resend.source).toBe("none");
    expect(resend.configured).toBe(false);
    expect((body as ApiEnvelope).encryptionKeyed).toBe(true);
  });

  it("requires admin", async () => {
    const { status } = await authGet(app, "/api/admin/secrets", userCookie);
    expect(status).toBe(403);
    const { status: putStatus } = await authPut(app, "/api/admin/secrets/FLW_SECRET_KEY", userCookie, {
      value: "FLWSECK_TEST-nope",
    });
    expect(putStatus).toBe(403);
  });

  it("rejects unknown secret names and empty values", async () => {
    const unknown = await authPut(app, "/api/admin/secrets/STRIPE_SECRET_KEY", adminCookie, { value: "x" });
    expect(unknown.status).toBe(400);

    const empty = await authPut(app, "/api/admin/secrets/FLW_SECRET_KEY", adminCookie, { value: "   " });
    expect(empty.status).toBe(400);
  });

  it("stores an encrypted override that takes precedence over env", async () => {
    const secretValue = "FLWSECK_TEST-9f3a8c2b7d1e4f5a6b7c8d9e0f1a2b3c";
    const { status, body } = await authPut(app, "/api/admin/secrets/FLW_SECRET_KEY", adminCookie, {
      value: secretValue,
    });
    expect(status).toBe(200);
    expect((body as ApiEnvelope).source).toBe("db");
    expect((body as ApiEnvelope).configured).toBe(true);
    expect((body as ApiEnvelope).masked).toContain(secretValue.slice(-4));

    // Ciphertext at rest: JSON envelope, and the plaintext never appears.
    const row = getTestDb()
      .select()
      .from(settings)
      .where(eq(settings.key, "secret_override:FLW_SECRET_KEY"))
      .get();
    expect(row).toBeTruthy();
    const payload = JSON.parse(row!.value) as { v: number; iv: string; tag: string; data: string };
    expect(payload.v).toBe(1);
    expect(payload.iv).toBeTruthy();
    expect(payload.tag).toBeTruthy();
    expect(payload.data).toBeTruthy();
    expect(row!.value).not.toContain(secretValue);
    expect(row!.value).not.toContain(secretValue.slice(0, 20));

    // Audit entry written with no plaintext in the trail.
    const entry = latestAudit("secrets.updated");
    expect(entry).toBeTruthy();
    expect(entry!.entity).toBe("secret");
    expect(entry!.entityId).toBe("FLW_SECRET_KEY");
    expect(entry!.details).toContain("FLW_SECRET_KEY");
    expect(entry!.details).not.toContain(secretValue);
  });

  it("clears the override and falls back to the environment", async () => {
    const { status, body } = await authDelete(app, "/api/admin/secrets/FLW_SECRET_KEY", adminCookie);
    expect(status).toBe(200);
    expect((body as ApiEnvelope).source).toBe("env");
    expect((body as ApiEnvelope).configured).toBe(true); // env fallback still present

    const row = getTestDb()
      .select()
      .from(settings)
      .where(eq(settings.key, "secret_override:FLW_SECRET_KEY"))
      .get();
    expect(row).toBeUndefined();

    const entry = latestAudit("secrets.cleared");
    expect(entry).toBeTruthy();
    expect(entry!.entityId).toBe("FLW_SECRET_KEY");
  });

  it("does not expose secret overrides via the generic settings endpoint", async () => {
    // Seed an override first, then confirm /api/seed/settings hides it.
    await authPut(app, "/api/admin/secrets/RESEND_API_KEY", adminCookie, {
      value: "re_9f3a8c2b7d1e4f5a6b7c8d9e0f1a2b3c4d5e6f",
    });
    const { status, body } = await authGet(app, "/api/seed/settings", adminCookie);
    expect(status).toBe(200);
    const keys = (body as ApiEnvelope[]).map((s) => s.key);
    expect(keys).not.toContain("secret_override:RESEND_API_KEY");

    // Cleanup so later tests in the same suite are unaffected.
    await authDelete(app, "/api/admin/secrets/RESEND_API_KEY", adminCookie);
  });
});

describe("MT5 gateway apiKey resolution", () => {
  it("resolves the gateway apiKey through the secret store (override > env > legacy JSON)", async () => {
    const db = getTestDb();
    db.delete(settings).where(eq(settings.key, MT5_CONFIG_SETTING)).run();
    // These direct lib calls bind the real (non-mocked) getDb, so pass the
    // test db explicitly — the same db getMT5Config is given.
    clearSecretOverride("MT5_GATEWAY_API_KEY", db);

    try {
      // Environment-only: getMT5Config picks up the env var even with no row.
      process.env.MT5_GATEWAY_API_KEY = "env-mt5-key-0001";
      expect(getMT5Config(db).apiKey).toBe("env-mt5-key-0001");

      // Admin override wins over the env var.
      setSecretOverride("MT5_GATEWAY_API_KEY", "override-mt5-key-0002", db);
      expect(getMT5Config(db).apiKey).toBe("override-mt5-key-0002");

      // Clearing the override falls back to the env var.
      clearSecretOverride("MT5_GATEWAY_API_KEY", db);
      expect(getMT5Config(db).apiKey).toBe("env-mt5-key-0001");

      // Legacy JSON apiKey is the final fallback when neither override nor env
      // is present (pre-secret-store installs keep working).
      delete process.env.MT5_GATEWAY_API_KEY;
      db.insert(settings)
        .values({
          key: MT5_CONFIG_SETTING,
          value: JSON.stringify({ enabled: true, baseUrls: ["https://gw.test:8443"], apiKey: "legacy-key-0003" }),
          group: "mt5",
        })
        .run();
      expect(getMT5Config(db).apiKey).toBe("legacy-key-0003");

      // Override takes precedence over the legacy JSON value too.
      setSecretOverride("MT5_GATEWAY_API_KEY", "override-mt5-key-0004", db);
      expect(getMT5Config(db).apiKey).toBe("override-mt5-key-0004");
    } finally {
      delete process.env.MT5_GATEWAY_API_KEY;
      clearSecretOverride("MT5_GATEWAY_API_KEY", db);
      db.delete(settings).where(eq(settings.key, MT5_CONFIG_SETTING)).run();
    }
  });
});
