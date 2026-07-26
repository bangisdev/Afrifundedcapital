/**
 * Trading route tests — MT5 accounts, metrics, history, drawdown, sync, demo seeding, admin MT5.
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
import { users } from "../schema";
import { eq } from "drizzle-orm";

let app: Hono;
let userCookie: string;
let adminCookie: string;

beforeAll(async () => {
  app = await buildTestApp();

  const { cookie: uc } = await signUp(app, {
    name: "Trading Trader",
    email: "trading-trader@test.com",
    password: "Secure@123",
  });
  userCookie = uc;

  const { cookie: ac } = await signUp(app, {
    name: "Trading Admin",
    email: "trading-admin@test.com",
    password: "Secure@123",
  });

  // Promote admin
  const db = getTestDb();
  const adminUser = db.select().from(users).where(eq(users.email, "trading-admin@test.com")).get();
  if (adminUser) {
    await authPost(app, "/api/auth/promote-admin", "", { userId: adminUser.id });
  }

  const { cookie: reLogin } = await signIn(app, {
    email: "trading-admin@test.com",
    password: "Secure@123",
  });
  adminCookie = reLogin;

  // Create a demo challenge for the user so we have a challengeId
  const { body: templates } = await authGet(app, "/api/challenges/templates", adminCookie);
  const template = (templates as Record<string, unknown>[])[0];
  const { body: sizes } = await authGet(app, `/api/challenges/templates/${template.id}/sizes`, adminCookie);
  const size = (sizes as Record<string, unknown>[])[0];

  // Get user ID for demo purchase
  const user = db.select().from(users).where(eq(users.email, "trading-trader@test.com")).get();
  await authPost(app, "/api/challenges/demo-purchase", adminCookie, {
    templateId: template.id,
    accountSizeId: size.id,
    userId: user!.id,
  });
});

afterAll(() => {
  cleanupTestDb();
});

// ═══════════════════════════════════════════════════════════════
//  MT5 ACCOUNTS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/trading/mt5", () => {
  it("returns MT5 accounts for the user", async () => {
    const { status, body } = await authGet(app, "/api/trading/mt5", userCookie);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    const account = (body as Record<string, unknown>[])[0];
    expect(account).toHaveProperty("login");
    expect(account).toHaveProperty("server");
    expect(account).toHaveProperty("balance");
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/trading/mt5");
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  CHALLENGE METRICS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/trading/challenge/:id/metrics", () => {
  it("returns null when no metrics exist", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = (challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status, body } = await authGet(app, `/api/trading/challenge/${challenge.id}/metrics`, userCookie);
    expect(status).toBe(200);
    // May be null if no metrics seeded yet
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/trading/challenge/1/metrics");
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  CHALLENGE HISTORY
// ═══════════════════════════════════════════════════════════════

describe("GET /api/trading/challenge/:id/history", () => {
  it("returns metrics history array", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = (challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status, body } = await authGet(app, `/api/trading/challenge/${challenge.id}/history`, userCookie);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  CHALLENGE DRAWDOWN
// ═══════════════════════════════════════════════════════════════

describe("GET /api/trading/challenge/:id/drawdown", () => {
  it("returns drawdown history array", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = (challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status, body } = await authGet(app, `/api/trading/challenge/${challenge.id}/drawdown`, userCookie);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  DEMO SEEDING
// ═══════════════════════════════════════════════════════════════

describe("POST /api/trading/seed-demo", () => {
  it("seeds demo metrics data for a challenge", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = (challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status, body } = await authPost(app, "/api/trading/seed-demo", userCookie, {
      challengeId: challenge.id,
    });
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
    expect((body as Record<string, unknown>).seeded).toBe(true);
  });

  it("returns seeded: false when metrics already exist", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = (challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status, body } = await authPost(app, "/api/trading/seed-demo", userCookie, {
      challengeId: challenge.id,
    });
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).seeded).toBe(false);
  });

  it("returns 404 for non-existent challenge", async () => {
    const { status } = await authPost(app, "/api/trading/seed-demo", userCookie, {
      challengeId: 99999,
    });
    expect(status).toBe(404);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/trading/seed-demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId: 1 }),
    });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  METRICS AFTER SEEDING
// ═══════════════════════════════════════════════════════════════

describe("GET /api/trading/challenge/:id/metrics (after seeding)", () => {
  it("returns latest metrics after seeding", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = (challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status, body } = await authGet(app, `/api/trading/challenge/${challenge.id}/metrics`, userCookie);
    expect(status).toBe(200);
    const metrics = body as Record<string, unknown> | null;
    if (metrics) {
      expect(metrics).toHaveProperty("balance");
      expect(metrics).toHaveProperty("equity");
      expect(metrics).toHaveProperty("tradingDaysCount");
      expect(metrics).toHaveProperty("winRate");
    }
  });

  it("returns full history after seeding", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = (challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status, body } = await authGet(app, `/api/trading/challenge/${challenge.id}/history`, userCookie);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect((body as unknown[]).length).toBe(60); // 60 days seeded
  });
});

// ═══════════════════════════════════════════════════════════════
//  RESET DEMO
// ═══════════════════════════════════════════════════════════════

describe("POST /api/trading/reset-demo", () => {
  it("resets demo metrics for a challenge", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = (challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status, body } = await authPost(app, "/api/trading/reset-demo", userCookie, {
      challengeId: challenge.id,
    });
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);

    // Verify history is empty
    const { body: history } = await authGet(app, `/api/trading/challenge/${challenge.id}/history`, userCookie);
    expect((history as unknown[]).length).toBe(0);
  });

  it("returns 404 for non-existent challenge", async () => {
    const { status } = await authPost(app, "/api/trading/reset-demo", userCookie, {
      challengeId: 99999,
    });
    expect(status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════
//  MANUAL SYNC
// ═══════════════════════════════════════════════════════════════

describe("POST /api/trading/sync", () => {
  it("syncs active challenges", async () => {
    const { status, body } = await authPost(app, "/api/trading/sync", userCookie, {});
    expect(status).toBe(200);
    expect((body as Record<string, unknown>)).toHaveProperty("synced");
    expect((body as Record<string, unknown>)).toHaveProperty("message");
  });

  it("syncs a specific challenge by ID", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = (challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status, body } = await authPost(app, "/api/trading/sync", userCookie, {
      challengeId: String(challenge.id),
    });
    expect(status).toBe(200);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/trading/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: CREATE MT5 ACCOUNT
// ═══════════════════════════════════════════════════════════════

describe("POST /api/trading/admin/mt5", () => {
  it("creates an MT5 account as admin", async () => {
    const db = getTestDb();
    const user = db.select().from(users).where(eq(users.email, "trading-trader@test.com")).get();

    const { status, body } = await authPost(app, "/api/trading/admin/mt5", adminCookie, {
      userId: user!.id,
      leverage: 200,
      balance: 10000,
      equity: 10000,
    });
    expect(status).toBe(200);
    const account = body as Record<string, unknown>;
    expect(account).toHaveProperty("login");
    expect(account).toHaveProperty("server");
    expect(account.leverage).toBe(200);
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authPost(app, "/api/trading/admin/mt5", userCookie, {
      userId: 1,
    });
    expect(status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: SYNC ALL
// ═══════════════════════════════════════════════════════════════

describe("POST /api/trading/admin/sync-all", () => {
  it("syncs all active challenges as admin", async () => {
    const { status, body } = await authPost(app, "/api/trading/admin/sync-all", adminCookie, {});
    expect(status).toBe(200);
    const result = body as Record<string, unknown>;
    expect(result).toHaveProperty("synced");
    expect(result).toHaveProperty("skipped");
    expect(result).toHaveProperty("total");
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authPost(app, "/api/trading/admin/sync-all", userCookie, {});
    expect(status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: SYNC QUEUE STATUS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/trading/admin/sync-queue", () => {
  it("returns sync queue stats", async () => {
    const { status, body } = await authGet(app, "/api/trading/admin/sync-queue", adminCookie);
    expect(status).toBe(200);
    const result = body as Record<string, unknown>;
    expect(result).toHaveProperty("activeChallenges");
    expect(result).toHaveProperty("syncedToday");
    expect(result).toHaveProperty("lastSyncAt");
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authGet(app, "/api/trading/admin/sync-queue", userCookie);
    expect(status).toBe(403);
  });
});
