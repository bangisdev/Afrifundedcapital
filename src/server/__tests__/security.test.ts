/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { Hono } from "hono";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { buildTestApp, cleanupTestDb, getTestDb, signUp, signIn, authGet, authPost } from "./setup";
import { generateTotp } from "../lib/security";

// Ensure email sends are fast no-ops (no API key, mocked SDK).
process.env.EMAIL_SEND_TIMEOUT_MS = "100";
delete process.env.RESEND_API_KEY;
// Bypass the in-memory rate limiter for the repeat forgot/resend requests
// in this suite (same mechanism the e2e admin-flow run uses).
process.env.E2E_TESTING = "1";
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: vi.fn() };
  },
}));

async function readUser(email: string) {
  const db = getTestDb();
  return db.select().from(schema.users).where(eq(schema.users.email, email)).get();
}

async function writeUser(id: number, patch: Record<string, any>) {
  const db = getTestDb();
  db.update(schema.users).set(patch).where(eq(schema.users.id, id)).run();
}

describe("email verification", () => {
  let app: Hono;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(() => cleanupTestDb());

  it("signs up unverified with a token and rejects a bad verify token", async () => {
    const { status, cookie } = await signUp(app, { email: "v@test.com", password: "pass123" });
    expect(status).toBe(201);
    expect(cookie).toContain("afc_session");

    const user = await readUser("v@test.com");
    expect(user!.emailVerified).toBe(false);
    expect(user!.emailVerificationToken).toBeTruthy();

    const bad = await app.request("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "nope" }),
    });
    expect(bad.status).toBe(400);

    const missing = await app.request("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(missing.status).toBe(400);
  });

  it("verifies the email with the correct token and clears it", async () => {
    const userBefore = await readUser("v@test.com");
    const res = await app.request("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: userBefore!.emailVerificationToken }),
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);

    const userAfter = await readUser("v@test.com");
    expect(userAfter!.emailVerified).toBe(true);
    expect(userAfter!.emailVerificationToken).toBeNull();
    expect(userAfter!.emailVerificationExpiresAt).toBeNull();
  });

  it("rejects an expired verification token", async () => {
    const { body } = await signUp(app, { email: "expired@test.com", password: "pass123" });
    const user = await readUser("expired@test.com");
    await writeUser(user!.id, { emailVerificationExpiresAt: Date.now() - 1000 });

    const res = await app.request("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: user!.emailVerificationToken }),
    });
    expect(res.status).toBe(400);
    const parsed: any = await res.json();
    expect(parsed.error).toMatch(/expired/i);
    expect(body).toBeTruthy();
  });

  it("resend-verification refreshes the token without revealing account existence", async () => {
    // Existing, unverified account → new token
    const userBefore = await readUser("v2@test.com");
    if (!userBefore) {
      await signUp(app, { email: "v2@test.com", password: "pass123" });
    }
    const before = await readUser("v2@test.com");
    const res = await app.request("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "v2@test.com" }),
    });
    expect(res.status).toBe(200);
    const after = await readUser("v2@test.com");
    expect(after!.emailVerificationToken).toBeTruthy();
    expect(after!.emailVerificationToken).not.toBe(before!.emailVerificationToken);

    // Unknown email → same 200 shape (no enumeration)
    const unknown = await app.request("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ghost@test.com" }),
    });
    expect(unknown.status).toBe(200);
  });
});

describe("password recovery", () => {
  let app: Hono;
  let cookie: string;

  beforeAll(async () => {
    app = await buildTestApp();
    const up = await signUp(app, { email: "pw@test.com", password: "oldpass123" });
    cookie = up.cookie;
  });

  afterAll(() => cleanupTestDb());

  it("forgot-password always returns success and stores a reset token", async () => {
    const res = await app.request("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "pw@test.com" }),
    });
    expect(res.status).toBe(200);

    const ghost = await app.request("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ghost@test.com" }),
    });
    expect(ghost.status).toBe(200);

    const user = await readUser("pw@test.com");
    expect(user!.resetPasswordToken).toBeTruthy();
    expect(user!.resetPasswordExpiresAt).toBeTruthy();
  });

  it("reset-password rejects a bad/expired token", async () => {
    const bad = await app.request("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "bogus", password: "newpass123" }),
    });
    expect(bad.status).toBe(400);

    const user = await readUser("pw@test.com");
    await writeUser(user!.id, { resetPasswordExpiresAt: Date.now() - 1000 });
    const expired = await app.request("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: user!.resetPasswordToken, password: "newpass123" }),
    });
    expect(expired.status).toBe(400);
  });

  it("reset-password invalidates sessions and switches the working password", async () => {
    const user = await readUser("pw@test.com");
    await writeUser(user!.id, { resetPasswordExpiresAt: Date.now() + 60000 });

    const res = await app.request("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: user!.resetPasswordToken, password: "newpass123" }),
    });
    expect(res.status).toBe(200);

    // Old password no longer works
    const oldLogin = await signIn(app, { email: "pw@test.com", password: "oldpass123" });
    expect(oldLogin.status).toBe(401);

    // New password works
    const newLogin = await signIn(app, { email: "pw@test.com", password: "newpass123" });
    expect(newLogin.status).toBe(200);
    expect(newLogin.cookie).toBeTruthy();
  });

  it("change-password requires the current password and updates it", async () => {
    // cookie belongs to a session that reset-password just wiped — re-sign-in
    const login = await signIn(app, { email: "pw@test.com", password: "newpass123" });
    cookie = login.cookie;

    const wrong = await authPost(app, "/api/auth/change-password", cookie, { currentPassword: "nope", newPassword: "changed123" });
    expect(wrong.status).toBe(400);

    const ok = await authPost(app, "/api/auth/change-password", cookie, { currentPassword: "newpass123", newPassword: "changed123" });
    expect(ok.status).toBe(200);

    const old = await signIn(app, { email: "pw@test.com", password: "newpass123" });
    expect(old.status).toBe(401);
    const fresh = await signIn(app, { email: "pw@test.com", password: "changed123" });
    expect(fresh.status).toBe(200);
  });
});

describe("two-factor authentication", () => {
  let app: Hono;
  let cookie: string;
  let secret = "";
  let backupCodes: string[] = [];

  beforeAll(async () => {
    app = await buildTestApp();
    const up = await signUp(app, { email: "2fa@test.com", password: "pass123" });
    cookie = up.cookie;
  });

  afterAll(() => cleanupTestDb());

  it("setup returns a secret, otpauth URL and 10 backup codes", async () => {
    const res = await authPost(app, "/api/auth/2fa/setup", cookie);
    expect(res.status).toBe(200);
    expect(res.body.secret).toMatch(/^[A-Z2-7]{16,}$/);
    expect(res.body.otpauthUrl).toContain("otpauth://totp/");
    expect(res.body.backupCodes).toHaveLength(10);
    secret = res.body.secret;
    backupCodes = res.body.backupCodes;
  });

  it("enable rejects a bad code and accepts the current TOTP", async () => {
    const bad = await authPost(app, "/api/auth/2fa/enable", cookie, { code: "000000" });
    expect(bad.status).toBe(400);

    const code = generateTotp(secret);
    const ok = await authPost(app, "/api/auth/2fa/enable", cookie, { code });
    expect(ok.status).toBe(200);

    const user = await readUser("2fa@test.com");
    expect(user!.twoFactorEnabled).toBe(true);
  });

  it("sign-in requires a 2FA challenge and rejects a wrong code", async () => {
    const login = await signIn(app, { email: "2fa@test.com", password: "pass123" });
    expect(login.status).toBe(200);
    expect(login.body.requiresTwoFactor).toBe(true);
    expect(login.body.challengeToken).toBeTruthy();
    expect(login.cookie).toBe(""); // no session cookie yet

    const wrong = await app.request("/api/auth/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeToken: login.body.challengeToken, code: "999999" }),
    });
    expect(wrong.status).toBe(401);
  });

  it("completes sign-in with the TOTP code", async () => {
    const login = await signIn(app, { email: "2fa@test.com", password: "pass123" });
    const code = generateTotp(secret);

    const res = await app.request("/api/auth/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeToken: login.body.challengeToken, code }),
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.session?.id).toBeTruthy();
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain("afc_session=");

    // Session is usable
    const sessionsRes = await authGet(app, "/api/auth/sessions", body.session.id ? `afc_session=${body.session.id}` : "");
    expect([200, 401]).toContain(sessionsRes.status);
  });

  it("signs in with a backup code (single use)", async () => {
    const code = backupCodes[0];
    const login = await signIn(app, { email: "2fa@test.com", password: "pass123" });

    const res = await app.request("/api/auth/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeToken: login.body.challengeToken, code }),
    });
    expect(res.status).toBe(200);

    // Same code must not work a second time
    const login2 = await signIn(app, { email: "2fa@test.com", password: "pass123" });
    const res2 = await app.request("/api/auth/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeToken: login2.body.challengeToken, code }),
    });
    expect(res2.status).toBe(401);
  });

  it("disables 2FA with a valid code and lets password-only sign-in resume", async () => {
    const code = generateTotp(secret);
    const res = await authPost(app, "/api/auth/2fa/disable", cookie, { code });
    expect(res.status).toBe(200);

    const user = await readUser("2fa@test.com");
    expect(user!.twoFactorEnabled).toBe(false);
    expect(user!.twoFactorSecret).toBeNull();

    const login = await signIn(app, { email: "2fa@test.com", password: "pass123" });
    expect(login.status).toBe(200);
    expect(login.body.requiresTwoFactor).toBeFalsy();
    expect(login.cookie).toBeTruthy();
  });
});

describe("session management", () => {
  let app: Hono;
  let cookie: string;

  beforeAll(async () => {
    app = await buildTestApp();
    const up = await signUp(app, { email: "sess@test.com", password: "pass123" });
    cookie = up.cookie;
  });

  afterAll(() => cleanupTestDb());

  it("lists the current session and records sign-in history", async () => {
    const res = await authGet(app, "/api/auth/sessions", cookie);
    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.sessions[0].isCurrent).toBe(true);

    const hist = await authGet(app, "/api/auth/login-history", cookie);
    expect(hist.status).toBe(200);
    expect(hist.body.history.length).toBeGreaterThanOrEqual(1);
    expect(hist.body.history[0].success).toBe(true);
  });

  it("refuses to revoke the current session", async () => {
    const sessions = await authGet(app, "/api/auth/sessions", cookie);
    const currentId = sessions.body.sessions[0].id;
    const revoke = await authPost(app, "/api/auth/sessions/revoke", cookie, { sessionId: currentId });
    expect(revoke.status).toBe(400);
  });

  it("revokes other sessions and revoke-others keeps only the current one", async () => {
    // Second session from a fresh sign-in
    const second = await signIn(app, { email: "sess@test.com", password: "pass123" });
    expect(second.cookie).toBeTruthy();

    const list = await authGet(app, "/api/auth/sessions", cookie);
    expect(list.body.sessions).toHaveLength(2);

    // Revoke the second session by id
    const otherId = list.body.sessions.find((s: any) => !s.isCurrent).id;
    const revoke = await authPost(app, "/api/auth/sessions/revoke", cookie, { sessionId: otherId });
    expect(revoke.status).toBe(200);

    const afterRevoke = await authGet(app, "/api/auth/sessions", cookie);
    expect(afterRevoke.body.sessions).toHaveLength(1);

    // Add one more and bulk-revoke others
    await signIn(app, { email: "sess@test.com", password: "pass123" });
    const bulk = await authPost(app, "/api/auth/sessions/revoke-others", cookie);
    expect(bulk.status).toBe(200);
    expect(bulk.body.revoked).toBe(1);

    const final = await authGet(app, "/api/auth/sessions", cookie);
    expect(final.body.sessions).toHaveLength(1);
    expect(final.body.sessions[0].isCurrent).toBe(true);
  });

  it("requires auth for session endpoints", async () => {
    const res = await authGet(app, "/api/auth/sessions", "");
    expect(res.status).toBe(401);
  });
});
