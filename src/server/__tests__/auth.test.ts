/**
 * Auth endpoint tests — sign-up, sign-in, session, sign-out, role promotion.
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
  getTestDb,
} from "./setup";

let app: Hono;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(() => {
  cleanupTestDb();
});

// ═══════════════════════════════════════════════════════════════
//  SIGN UP
// ═══════════════════════════════════════════════════════════════

describe("POST /api/auth/sign-up/email", () => {
  it("creates a new user and returns a session cookie", async () => {
    const { status, body, cookie } = await signUp(app, {
      name: "Test Trader",
      email: "trader@test.com",
      password: "Secure@123",
    });

    expect(status).toBe(201);
    expect(body).toHaveProperty("user");
    expect(body).toHaveProperty("session");
    expect((body as Record<string, unknown>).user).toMatchObject({
      name: "Test Trader",
      email: "trader@test.com",
    });
    expect(cookie).toContain("afc_session=");
  });

  it("returns 409 when email already exists", async () => {
    const { status, body } = await signUp(app, {
      email: "trader@test.com",
      password: "Another@123",
    });

    expect(status).toBe(409);
    expect((body as Record<string, unknown>).error).toMatch(/already exists/i);
  });

  it("returns 400 when email is missing", async () => {
    const { status, body } = await signUp(app, {
      password: "Secure@123",
      email: "",
    });

    expect(status).toBe(400);
    expect((body as Record<string, unknown>).error).toMatch(/required/i);
  });

  it("returns 400 when password is too short", async () => {
    const { status, body } = await signUp(app, {
      email: "short@test.com",
      password: "123",
    });

    expect(status).toBe(400);
    expect((body as Record<string, unknown>).error).toMatch(/6 characters/i);
  });
});

// ═══════════════════════════════════════════════════════════════
//  SIGN IN
// ═══════════════════════════════════════════════════════════════

describe("POST /api/auth/sign-in/email", () => {
  it("returns a session cookie with valid credentials", async () => {
    const { status, body, cookie } = await signIn(app, {
      email: "trader@test.com",
      password: "Secure@123",
    });

    expect(status).toBe(200);
    expect(cookie).toContain("afc_session=");
    expect((body as Record<string, unknown>).user).toMatchObject({
      email: "trader@test.com",
    });
  });

  it("returns 401 with wrong password", async () => {
    const { status, body } = await signIn(app, {
      email: "trader@test.com",
      password: "WrongPassword!1",
    });

    expect(status).toBe(401);
    expect((body as Record<string, unknown>).error).toMatch(/invalid/i);
  });

  it("returns 401 with non-existent email", async () => {
    const { status } = await signIn(app, {
      email: "nobody@test.com",
      password: "Secure@123",
    });

    expect(status).toBe(401);
  });

  it("returns 400 when email is missing", async () => {
    const { status } = await signIn(app, {
      email: "",
      password: "Secure@123",
    });

    expect(status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
//  SESSION
// ═══════════════════════════════════════════════════════════════

describe("GET /api/auth/session", () => {
  it("returns user data with a valid session cookie", async () => {
    const { cookie } = await signIn(app, {
      email: "trader@test.com",
      password: "Secure@123",
    });

    const { status, body } = await authGet(app, "/api/auth/session", cookie);

    expect(status).toBe(200);
    expect((body as Record<string, unknown>).user).toMatchObject({
      email: "trader@test.com",
    });
  });

  it("returns 401 without a session cookie", async () => {
    const res = await app.request("/api/auth/session");
    expect(res.status).toBe(401);
  });

  it("returns 401 with an invalid session token", async () => {
    const res = await app.request("/api/auth/session", {
      headers: { Cookie: "afc_session=invalid-token-12345" },
    });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  SIGN OUT
// ═══════════════════════════════════════════════════════════════

describe("POST /api/auth/sign-out", () => {
  it("invalidates the session and clears the cookie", async () => {
    // Sign in first
    const { cookie } = await signIn(app, {
      email: "trader@test.com",
      password: "Secure@123",
    });

    // Sign out
    const res = await app.request("/api/auth/sign-out", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);

    // Set-Cookie should clear the cookie
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain("Max-Age=0");

    // Session should no longer work
    const { status } = await authGet(app, "/api/auth/session", cookie);
    expect(status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ROLE PROMOTION
// ═══════════════════════════════════════════════════════════════

describe("POST /api/auth/promote-admin", () => {
  it("promotes the first user to super_admin (bootstrap)", async () => {
    // Get the user ID from the DB
    const db = getTestDb();
    const user = db
      .select()
      .from((await import("../schema")).users)
      .where((await import("drizzle-orm")).eq((await import("../schema")).users.email, "trader@test.com"))
      .get();

    expect(user).toBeTruthy();

    const { status, body } = await authPost(app, "/api/auth/promote-admin", "", {
      userId: user!.id,
    });

    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);

    // Verify the user now has super_admin role
    const updated = db
      .select()
      .from((await import("../schema")).users)
      .where((await import("drizzle-orm")).eq((await import("../schema")).users.id, user!.id))
      .get();
    expect(updated!.role).toBe("super_admin");
  });

  it("returns 404 for non-existent user", async () => {
    const { status } = await authPost(app, "/api/auth/promote-admin", "", {
      userId: 99999,
    });

    expect(status).toBe(404);
  });

  it("returns error when userId is missing", async () => {
    const { status } = await authPost(app, "/api/auth/promote-admin", "", {});
    expect(status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
//  HEALTH CHECK
// ═══════════════════════════════════════════════════════════════

describe("GET /api/health", () => {
  it("returns ok status", async () => {
    const res = await app.request("/api/health");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty("status", "ok");
    expect(body).toHaveProperty("timestamp");
  });
});
