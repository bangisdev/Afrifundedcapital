/**
 * Payouts route tests — my payouts, stats, funded accounts, request, admin approve/reject.
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
import { users, mt5Accounts, fundedAccounts, profitPayouts, userChallenges, auditLogs } from "../schema";
import { eq, desc } from "drizzle-orm";

let app: Hono;
let userCookie: string;
let adminCookie: string;

beforeAll(async () => {
  app = await buildTestApp();

  const { cookie: uc } = await signUp(app, {
    name: "Payout Trader",
    email: "payout-trader@test.com",
    password: "Secure@123",
  });
  userCookie = uc;

  await signUp(app, {
    name: "Payout Admin",
    email: "payout-admin@test.com",
    password: "Secure@123",
  });

  // Promote admin directly in DB
  const db = getTestDb();
  const adminUser = db.select().from(users).where(eq(users.email, "payout-admin@test.com")).get();
  if (adminUser) {
    db.update(users).set({ role: "super_admin", onboardingComplete: true, updatedAt: Date.now() }).where(eq(users.id, adminUser.id)).run();
  }

  const { cookie: reLogin } = await signIn(app, {
    email: "payout-admin@test.com",
    password: "Secure@123",
  });
  adminCookie = reLogin;

  // Create a demo challenge and advance it to funded
  const user = db.select().from(users).where(eq(users.email, "payout-trader@test.com")).get();
  const { body: templates } = await authGet(app, "/api/challenges/templates", adminCookie);
  const template = (templates as Array<{ id: number }>)[0];
  const { body: sizes } = await authGet(app, `/api/challenges/templates/${template.id}/sizes`, adminCookie);
  const size = (sizes as Array<{ id: number; size: number }>)[0];

  await authPost(app, "/api/challenges/demo-purchase", adminCookie, {
    templateId: template.id,
    accountSizeId: size.id,
    userId: user!.id,
  });

  // Get challenge and update to funded status (uses PUT, not POST!)
  // challenges/my returns an envelope { challenges, total, ... } — unwrap it.
  const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
  const challengeList = Array.isArray(challenges)
    ? challenges
    : (challenges as Record<string, any>).challenges || [];
  const challenge = (challengeList as Array<{ id: number }>)[0];
  if (challenge) {
    await authPut(app, `/api/challenges/admin/${challenge.id}/status`, adminCookie, {
      status: "funded",
    });
  }

  // Create a funded account record for the user
  const mt5 = db.select().from(mt5Accounts).where(eq(mt5Accounts.userId, user!.id)).get();
  if (mt5 && challenge) {
    db.insert(fundedAccounts).values({
      userId: user!.id,
      challengeId: challenge.id,
      mt5AccountId: mt5.id,
      accountSize: size.size,
      currency: "NGN",
      profitSharePercent: 80,
      isActive: true,
      activatedAt: Date.now(),
    }).run();
  }
});

afterAll(() => {
  cleanupTestDb();
});

// ═══════════════════════════════════════════════════════════════
//  MY PAYOUTS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/payouts/my", () => {
  it("returns user's payouts", async () => {
    const { status, body } = await authGet(app, "/api/payouts/my", userCookie);
    expect(status).toBe(200);
    expect(Array.isArray(body.payouts)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect(typeof body.totalPages).toBe("number");
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/payouts/my");
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  MY PAYOUT STATS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/payouts/my/stats", () => {
  it("returns payout statistics", async () => {
    const { status, body } = await authGet(app, "/api/payouts/my/stats", userCookie);
    expect(status).toBe(200);
    const stats = body as Record<string, unknown>;
    expect(stats).toHaveProperty("totalPayouts");
    expect(stats).toHaveProperty("totalPaid");
    expect(stats).toHaveProperty("totalPending");
    expect(stats.totalPayouts).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
//  MY FUNDED ACCOUNTS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/payouts/my/funded", () => {
  it("returns funded accounts", async () => {
    const { status, body } = await authGet(app, "/api/payouts/my/funded", userCookie);
    expect(status).toBe(200);
    const env = body as Record<string, any>;
    expect(Array.isArray(env.accounts)).toBe(true);
    expect(env.accounts.length).toBeGreaterThanOrEqual(1);
    expect(env.total).toBeGreaterThanOrEqual(1);
    expect(env.page).toBe(1);
    expect(env.pageSize).toBe(10);
    expect(env.totalPages).toBeGreaterThanOrEqual(1);
    const account = env.accounts[0];
    expect(account).toHaveProperty("accountSize");
    expect(account).toHaveProperty("profitSharePercent");
    expect(account.isActive).toBe(true);
  });

  it("sorts funded accounts by accountSize when sortBy is provided", async () => {
    // Seed two extra funded accounts with distinct sizes for the user
    const db = getTestDb();
    const user = db.select().from(users).where(eq(users.email, "payout-trader@test.com")).get();
    const challenge = db.select().from(userChallenges).where(eq(userChallenges.userId, user!.id)).get();
    const mt5 = db.select().from(mt5Accounts).where(eq(mt5Accounts.userId, user!.id)).get();
    const insertedIds: number[] = [];
    for (const size of [5000, 25000, 15000]) {
      const res = db
        .insert(fundedAccounts)
        .values({
          userId: user!.id,
          challengeId: challenge!.id,
          mt5AccountId: mt5!.id,
          accountSize: size,
          currency: "NGN",
          profitSharePercent: 80,
          isActive: true,
          activatedAt: Date.now(),
        })
        .returning({ id: fundedAccounts.id })
        .get();
      insertedIds.push(res.id);
    }

    try {
      const { status, body } = await authGet(
        app,
        "/api/payouts/my/funded?sortBy=accountSize&sortOrder=asc",
        userCookie
      );
      expect(status).toBe(200);
      const env = body as Record<string, any>;
      const sizes = (env.accounts as Array<Record<string, number>>).map((a) => a.accountSize);
      for (let i = 1; i < sizes.length; i++) {
        expect(sizes[i - 1]).toBeLessThanOrEqual(sizes[i]);
      }

      const descRes = await authGet(app, "/api/payouts/my/funded?sortBy=accountSize&sortOrder=desc", userCookie);
      const descEnv = descRes.body as Record<string, any>;
      const descSizes = (descEnv.accounts as Array<Record<string, number>>).map((a) => a.accountSize);
      for (let i = 1; i < descSizes.length; i++) {
        expect(descSizes[i - 1]).toBeGreaterThanOrEqual(descSizes[i]);
      }
    } finally {
      for (const id of insertedIds) {
        db.delete(fundedAccounts).where(eq(fundedAccounts.id, id)).run();
      }
    }
  });

  it("falls back to the default sort for an unknown sortBy", async () => {
    const { status, body } = await authGet(app, "/api/payouts/my/funded?sortBy=notAColumn&sortOrder=asc", userCookie);
    expect(status).toBe(200);
    const env = body as Record<string, any>;
    // Default is activatedAt desc — newest first
    const activatedAts = (env.accounts as Array<Record<string, number>>).map((a) => a.activatedAt);
    for (let i = 1; i < activatedAts.length; i++) {
      expect(activatedAts[i - 1]).toBeGreaterThanOrEqual(activatedAts[i]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
//  REQUEST PAYOUT
// ═══════════════════════════════════════════════════════════════

describe("POST /api/payouts/request", () => {
  it("creates a payout request", async () => {
    const db = getTestDb();
    const user = db.select().from(users).where(eq(users.email, "payout-trader@test.com")).get();
    const funded = db.select().from(fundedAccounts).where(eq(fundedAccounts.userId, user!.id)).get();

    const { status, body } = await authPost(app, "/api/payouts/request", userCookie, {
      fundedAccountId: funded!.id,
      challengeId: funded!.challengeId,
      amount: 5000,
      currency: "NGN",
      paymentMethod: "bank_transfer",
      paymentDetails: JSON.stringify({ bank: "GTB", account: "0123456789" }),
    });
    expect(status).toBe(200);
    const payout = body as Record<string, unknown>;
    expect(payout).toHaveProperty("id");
    expect(payout.status).toBe("pending");
    expect(payout.amount).toBe(5000);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/payouts/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fundedAccountId: 1, challengeId: 1, amount: 1000 }),
    });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: PAYOUT STATS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/payouts/admin/stats", () => {
  it("returns payout statistics as admin", async () => {
    const { status, body } = await authGet(app, "/api/payouts/admin/stats", adminCookie);
    expect(status).toBe(200);
    const stats = body as Record<string, unknown>;
    expect(stats).toHaveProperty("total");
    expect(stats).toHaveProperty("pending");
    expect(stats).toHaveProperty("totalPaid");
    expect(stats.total).toBeGreaterThanOrEqual(1);
    expect(stats.pending).toBeGreaterThanOrEqual(1);
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authGet(app, "/api/payouts/admin/stats", userCookie);
    expect(status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: LIST ALL PAYOUTS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/payouts/admin/all", () => {
  it("returns all payouts as admin", async () => {
    const { status, body } = await authGet(app, "/api/payouts/admin/all", adminCookie);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authGet(app, "/api/payouts/admin/all", userCookie);
    expect(status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: APPROVE PAYOUT
// ═══════════════════════════════════════════════════════════════

describe("POST /api/payouts/admin/:id/approve", () => {
  it("approves a pending payout", async () => {
    const db = getTestDb();
    const payout = db.select().from(profitPayouts).where(eq(profitPayouts.status, "pending")).get();
    if (!payout) return;

    const { status, body } = await authPost(app, `/api/payouts/admin/${payout.id}/approve`, adminCookie);
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);

    const updated = db.select().from(profitPayouts).where(eq(profitPayouts.id, payout.id)).get();
    expect(updated?.status).toBe("approved");
    expect(updated?.processedAt).toBeTruthy();

    // Audit log entry written by the approving admin
    const audit = db.select().from(auditLogs)
      .where(eq(auditLogs.action, "payout.approved"))
      .orderBy(desc(auditLogs.timestamp))
      .get();
    expect(audit).toBeTruthy();
    expect(audit?.entity).toBe("payout");
    expect(audit?.details).toContain(`"amount":${payout.amount}`);
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authPost(app, "/api/payouts/admin/1/approve", userCookie);
    expect(status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: REJECT PAYOUT
// ═══════════════════════════════════════════════════════════════

describe("POST /api/payouts/admin/:id/reject", () => {
  it("rejects a payout with a reason", async () => {
    const db = getTestDb();
    const user = db.select().from(users).where(eq(users.email, "payout-trader@test.com")).get();
    const funded = db.select().from(fundedAccounts).where(eq(fundedAccounts.userId, user!.id)).get();
    if (!funded) return;

    const newPayout = db.insert(profitPayouts).values({
      userId: user!.id,
      fundedAccountId: funded.id,
      challengeId: funded.challengeId,
      amount: 3000,
      currency: "NGN",
      status: "pending",
      paymentMethod: "bank_transfer",
      paymentDetails: JSON.stringify({ bank: "UBA", account: "9876543210" }),
      requestedAt: Date.now(),
    }).returning().get();

    const { status, body } = await authPost(app, `/api/payouts/admin/${newPayout.id}/reject`, adminCookie, {
      reason: "Insufficient trading history",
    });
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);

    const updated = db.select().from(profitPayouts).where(eq(profitPayouts.id, newPayout.id)).get();
    expect(updated?.status).toBe("rejected");
    expect(updated?.rejectionReason).toBe("Insufficient trading history");

    // Audit log entry written by the rejecting admin with the reason captured
    const audit = db.select().from(auditLogs)
      .where(eq(auditLogs.action, "payout.rejected"))
      .orderBy(desc(auditLogs.timestamp))
      .get();
    expect(audit).toBeTruthy();
    expect(audit?.details).toContain("Insufficient trading history");
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authPost(app, "/api/payouts/admin/1/reject", userCookie, {
      reason: "Test",
    });
    expect(status).toBe(403);
  });
});
