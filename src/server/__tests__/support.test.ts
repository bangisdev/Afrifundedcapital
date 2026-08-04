/**
 * Support route tests — create tickets, list, messages, admin management.
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
import { users } from "../schema";
import { eq } from "drizzle-orm";

let app: Hono;
let userCookie: string;
let adminCookie: string;

beforeAll(async () => {
  app = await buildTestApp();

  const { cookie: uc } = await signUp(app, {
    name: "Support Trader",
    email: "support-trader@test.com",
    password: "Secure@123",
  });
  userCookie = uc;

  await signUp(app, {
    name: "Support Admin",
    email: "support-admin@test.com",
    password: "Secure@123",
  });

  // Promote admin using the SAME DB instance the app uses
  const db = getTestDb();
  const adminUser = db.select().from(users).where(eq(users.email, "support-admin@test.com")).get();
  if (adminUser) {
    await authPost(app, "/api/auth/promote-admin", "", { userId: adminUser.id });
  }

  const { cookie: reLogin } = await signIn(app, {
    email: "support-admin@test.com",
    password: "Secure@123",
  });
  adminCookie = reLogin;
});

afterAll(() => {
  cleanupTestDb();
});

// ═══════════════════════════════════════════════════════════════
//  CREATE TICKET
// ═══════════════════════════════════════════════════════════════

describe("POST /api/support/create", () => {
  it("creates a new support ticket", async () => {
    const { status, body } = await authPost(app, "/api/support/create", userCookie, {
      subject: "Cannot access my account",
      category: "account",
      priority: "high",
    });
    expect(status).toBe(200);
    const ticket = body as Record<string, unknown>;
    expect(ticket).toHaveProperty("id");
    expect(ticket.subject).toBe("Cannot access my account");
    expect(ticket.status).toBe("open");
    expect(ticket.priority).toBe("high");
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/support/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: "Test", category: "general" }),
    });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  MY TICKETS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/support/my", () => {
  it("returns user's tickets", async () => {
    const { status, body } = await authGet(app, "/api/support/my", userCookie);
    expect(status).toBe(200);
    expect(Array.isArray(body.tickets)).toBe(true);
    expect(body.tickets.length).toBeGreaterThanOrEqual(1);
    expect(typeof body.total).toBe("number");
  });
});

// ═══════════════════════════════════════════════════════════════
//  TICKET MESSAGES
// ═══════════════════════════════════════════════════════════════

describe("POST /api/support/:id/messages", () => {
  it("adds a message to a ticket", async () => {
    const { body: tickets } = await authGet(app, "/api/support/my", userCookie);
    const ticket = ((tickets as Record<string, unknown>).tickets as Record<string, unknown>[])[0];
    if (!ticket) return;

    const { status, body } = await authPost(app, `/api/support/${ticket.id}/messages`, userCookie, {
      message: "I need help with my withdrawal",
    });
    expect(status).toBe(200);
    const msg = body as Record<string, unknown>;
    expect(msg.message).toBe("I need help with my withdrawal");
  });
});

describe("GET /api/support/:id/messages", () => {
  it("returns messages for a ticket", async () => {
    const { body: tickets } = await authGet(app, "/api/support/my", userCookie);
    const ticket = ((tickets as Record<string, unknown>).tickets as Record<string, unknown>[])[0];
    if (!ticket) return;

    const { status, body } = await authGet(app, `/api/support/${ticket.id}/messages`, userCookie);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: LIST ALL TICKETS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/support/admin/all", () => {
  it("returns all tickets as admin", async () => {
    const { status, body } = await authGet(app, "/api/support/admin/all", adminCookie);
    expect(status).toBe(200);
    expect(Array.isArray((body as { tickets?: unknown[] }).tickets)).toBe(true);
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authGet(app, "/api/support/admin/all", userCookie);
    expect(status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: UPDATE TICKET STATUS (uses PUT)
// ═══════════════════════════════════════════════════════════════

describe("PUT /api/support/admin/:id/status", () => {
  it("updates ticket status as admin", async () => {
    const { body: listBody } = await authGet(app, "/api/support/admin/all", adminCookie);
    const ticket = ((listBody as { tickets: Record<string, unknown>[] }).tickets)[0];
    if (!ticket) return;

    const { status, body } = await authPut(app, `/api/support/admin/${ticket.id}/status`, adminCookie, {
      status: "pending",
    });
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: ASSIGN TICKET (uses PUT)
// ═══════════════════════════════════════════════════════════════

describe("PUT /api/support/admin/:id/assign", () => {
  it("assigns a ticket as admin", async () => {
    const { body: listBody } = await authGet(app, "/api/support/admin/all", adminCookie);
    const ticket = ((listBody as { tickets: Record<string, unknown>[] }).tickets)[0];
    if (!ticket) return;

    const { status, body } = await authPut(app, `/api/support/admin/${ticket.id}/assign`, adminCookie, {
      userId: 1,
    });
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
  });
});
