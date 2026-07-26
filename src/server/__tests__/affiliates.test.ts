/**
 * Affiliates route tests — get my affiliate data, track referral, admin list, approve commission.
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
import { users, affiliates, commissions } from "../schema";
import { eq } from "drizzle-orm";

let app: Hono;
let userCookie: string;
let adminCookie: string;

beforeAll(async () => {
  app = await buildTestApp();

  const { cookie: uc } = await signUp(app, {
    name: "Affiliate Trader",
    email: "affiliate-trader@test.com",
    password: "Secure@123",
  });
  userCookie = uc;

  const { cookie: ac } = await signUp(app, {
    name: "Affiliate Admin",
    email: "affiliate-admin@test.com",
    password: "Secure@123",
  });

  // Promote admin using the SAME DB instance the app uses
  const db = getTestDb();
  const adminUser = db.select().from(users).where(eq(users.email, "affiliate-admin@test.com")).get();
  if (adminUser) {
    await authPost(app, "/api/auth/promote-admin", "", { userId: adminUser.id });
  }

  const { cookie: reLogin } = await signIn(app, {
    email: "affiliate-admin@test.com",
    password: "Secure@123",
  });
  adminCookie = reLogin;

  // Get admin user ID for affiliate creation
  const adminUserAfter = db.select().from(users).where(eq(users.email, "affiliate-admin@test.com")).get();

  // Create an affiliate record for the admin
  db.insert(affiliates).values({
    userId: adminUserAfter!.id,
    referralCode: "AFFILIATEADMIN01",
    totalReferrals: 2,
    activeReferrals: 1,
    totalCommissions: 5000,
    pendingCommissions: 2500,
    paidCommissions: 2500,
    commissionRate: 0.1,
    joinedAt: Date.now(),
  }).run();

  // Get the affiliate ID
  const aff = db.select().from(affiliates).where(eq(affiliates.userId, adminUserAfter!.id)).get();

  // Create a commission
  db.insert(commissions).values({
    affiliateId: aff!.id,
    userId: adminUserAfter!.id,
    referralId: 0,
    amount: 2500,
    level: 1,
    status: "pending",
    source: "challenge_purchase",
    description: "Commission from referral purchase",
    createdAt: Date.now(),
  }).run();
});

afterAll(() => {
  cleanupTestDb();
});

// ═══════════════════════════════════════════════════════════════
//  MY AFFILIATE DATA
// ═══════════════════════════════════════════════════════════════

describe("GET /api/affiliates/my", () => {
  it("returns affiliate data for user with affiliate account", async () => {
    const { status, body } = await authGet(app, "/api/affiliates/my", adminCookie);
    expect(status).toBe(200);
    const affiliate = body as Record<string, unknown>;
    expect(affiliate).toHaveProperty("referralCode");
    expect(affiliate.referralCode).toBe("AFFILIATEADMIN01");
    expect(affiliate.totalReferrals).toBe(2);
  });

  it("returns null for user without affiliate account", async () => {
    const { status, body } = await authGet(app, "/api/affiliates/my", userCookie);
    expect(status).toBe(200);
    expect(body).toBeNull();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/affiliates/my");
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  TRACK REFERRAL
// ═══════════════════════════════════════════════════════════════

describe("POST /api/affiliates/track", () => {
  it("tracks a referral by code", async () => {
    // Create a fresh user to track referral (can't reuse existing user due to UNIQUE constraint)
    const { cookie: freshCookie } = await signUp(app, {
      name: "Referral User",
      email: "fresh-referral@test.com",
      password: "Secure@123",
    });

    const { status, body } = await authPost(app, "/api/affiliates/track", freshCookie, {
      code: "AFFILIATEADMIN01",
    });
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
  });

  it("succeeds even with non-existent code (no error)", async () => {
    const { cookie: extraUserCookie } = await signUp(app, {
      name: "Extra User",
      email: "extra-referral@test.com",
      password: "Secure@123",
    });
    const { status, body } = await authPost(app, "/api/affiliates/track", extraUserCookie, {
      code: "NONEXISTENT",
    });
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: LIST ALL AFFILIATES
// ═══════════════════════════════════════════════════════════════

describe("GET /api/affiliates/admin/all", () => {
  it("returns all affiliates as admin", async () => {
    const { status, body } = await authGet(app, "/api/affiliates/admin/all", adminCookie);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authGet(app, "/api/affiliates/admin/all", userCookie);
    expect(status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: APPROVE COMMISSION
// ═══════════════════════════════════════════════════════════════

describe("POST /api/affiliates/admin/commission/:id/approve", () => {
  it("approves a pending commission", async () => {
    const db = getTestDb();
    const commission = db.select().from(commissions).where(eq(commissions.status, "pending")).get();
    if (!commission) return;

    const { status, body } = await authPost(
      app,
      `/api/affiliates/admin/commission/${commission.id}/approve`,
      adminCookie,
    );
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);

    const updated = db.select().from(commissions).where(eq(commissions.id, commission.id)).get();
    expect(updated?.status).toBe("approved");
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authPost(
      app,
      "/api/affiliates/admin/commission/1/approve",
      userCookie,
    );
    expect(status).toBe(403);
  });
});
