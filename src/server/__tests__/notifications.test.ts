/**
 * Notifications route tests — unread count, my notifications, mark read, broadcast.
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
import { users, notifications } from "../schema";
import { eq } from "drizzle-orm";

let app: Hono;
let userCookie: string;
let adminCookie: string;

beforeAll(async () => {
  app = await buildTestApp();

  const { cookie: uc } = await signUp(app, {
    name: "Notif Trader",
    email: "notif-trader@test.com",
    password: "Secure@123",
  });
  userCookie = uc;

  const { cookie: ac } = await signUp(app, {
    name: "Notif Admin",
    email: "notif-admin@test.com",
    password: "Secure@123",
  });

  // Promote admin using the SAME DB instance the app uses
  const db = getTestDb();
  const adminUser = db.select().from(users).where(eq(users.email, "notif-admin@test.com")).get();
  if (adminUser) {
    await authPost(app, "/api/auth/promote-admin", "", { userId: adminUser.id });
  }

  const { cookie: reLogin } = await signIn(app, {
    email: "notif-admin@test.com",
    password: "Secure@123",
  });
  adminCookie = reLogin;

  // Insert test notifications for the admin user
  const adminUserAfter = db.select().from(users).where(eq(users.email, "notif-admin@test.com")).get();
  const now = Date.now();
  db.insert(notifications).values({
    userId: adminUserAfter!.id,
    type: "payment",
    title: "Test Payment",
    message: "You received a payment",
    read: false,
    createdAt: now,
  }).run();
  db.insert(notifications).values({
    userId: adminUserAfter!.id,
    type: "support",
    title: "Support Reply",
    message: "Your ticket was answered",
    read: true,
    createdAt: now - 1000,
  }).run();
});

afterAll(() => {
  cleanupTestDb();
});

// ═══════════════════════════════════════════════════════════════
//  UNREAD COUNT
// ═══════════════════════════════════════════════════════════════

describe("GET /api/notifications/unread-count", () => {
  it("returns unread count", async () => {
    const { status, body } = await authGet(app, "/api/notifications/unread-count", adminCookie);
    expect(status).toBe(200);
    expect(typeof body).toBe("number");
    expect(body).toBeGreaterThanOrEqual(1);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/notifications/unread-count");
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  MY NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/notifications/my", () => {
  it("returns notifications for the user", async () => {
    const { status, body } = await authGet(app, "/api/notifications/my", adminCookie);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════
//  MARK AS READ (uses PUT)
// ═══════════════════════════════════════════════════════════════

describe("PUT /api/notifications/:id/read", () => {
  it("marks a notification as read", async () => {
    const { body: notifs } = await authGet(app, "/api/notifications/my", adminCookie);
    const notif = (notifs as Record<string, unknown>[])[0];
    if (!notif) return;

    const { status, body } = await authPut(app, `/api/notifications/${notif.id}/read`, adminCookie);
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
  });
});

describe("PUT /api/notifications/read-all", () => {
  it("marks all notifications as read", async () => {
    const { status, body } = await authPut(app, "/api/notifications/read-all", adminCookie);
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);

    const { body: count } = await authGet(app, "/api/notifications/unread-count", adminCookie);
    expect(count).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
//  DELETE NOTIFICATION
// ═══════════════════════════════════════════════════════════════

describe("DELETE /api/notifications/:id", () => {
  it("deletes a notification", async () => {
    const { body: notifs } = await authGet(app, "/api/notifications/my", adminCookie);
    const notif = (notifs as Record<string, unknown>[])[0];
    if (!notif) return;

    const res = await app.request(`/api/notifications/${notif.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: BROADCAST
// ═══════════════════════════════════════════════════════════════

describe("POST /api/notifications/broadcast", () => {
  it("broadcasts notification to all users", async () => {
    const { status, body } = await authPost(app, "/api/notifications/broadcast", adminCookie, {
      title: "System Maintenance",
      message: "Scheduled maintenance tonight",
      type: "broadcast",
    });
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
    expect((body as Record<string, unknown>).sentTo).toBeGreaterThanOrEqual(2);
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authPost(app, "/api/notifications/broadcast", userCookie, {
      title: "Test",
      message: "Test message",
    });
    expect(status).toBe(403);
  });
});

describe("POST /api/notifications/broadcast/segmented", () => {
  it("broadcasts to specific users", async () => {
    const { status, body } = await authPost(app, "/api/notifications/broadcast/segmented", adminCookie, {
      title: "Segmented Message",
      message: "Targeted notification",
      userIds: [1, 2],
    });
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
    expect((body as Record<string, unknown>).sentTo).toBe(2);
  });

  it("returns 400 when no target specified", async () => {
    const { status } = await authPost(app, "/api/notifications/broadcast/segmented", adminCookie, {
      title: "Test",
      message: "Test",
    });
    expect(status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: STATS & ALL
// ═══════════════════════════════════════════════════════════════

describe("GET /api/notifications/admin/stats", () => {
  it("returns notification stats", async () => {
    const { status, body } = await authGet(app, "/api/notifications/admin/stats", adminCookie);
    expect(status).toBe(200);
    const stats = body as Record<string, unknown>;
    expect(stats).toHaveProperty("total");
    expect(stats).toHaveProperty("unread");
  });
});

describe("GET /api/notifications/admin/all", () => {
  it("returns all notifications as admin", async () => {
    const { status, body } = await authGet(app, "/api/notifications/admin/all", adminCookie);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });
});
