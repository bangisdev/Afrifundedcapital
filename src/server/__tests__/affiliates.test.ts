/**
 * Affiliates route tests — get my affiliate data, track referral, admin list, approve commission.
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
  getTestDb,
} from "./setup";
import { users, affiliates, referrals, commissions, commissionPayouts } from "../schema";
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

  await signUp(app, {
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
//  MY AFFILIATE PAYOUTS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/affiliates/payouts", () => {
  it("returns an empty envelope for a user without payouts", async () => {
    const { status, body } = await authGet(app, "/api/affiliates/payouts", userCookie);
    expect(status).toBe(200);
    const env = body as ApiEnvelope;
    expect(Array.isArray(env.payouts)).toBe(true);
    expect(env.payouts.length).toBe(0);
    expect(env.total).toBe(0);
    expect(env.page).toBe(1);
    expect(env.pageSize).toBe(10);
    expect(env.totalPages).toBe(1);
    expect(env.stats.total).toBe(0);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/affiliates/payouts");
    expect(res.status).toBe(401);
  });

  it("paginates payouts server-side", async () => {
    // Seed 12 payouts for the admin's affiliate record
    const db = getTestDb();
    const aff = db.select().from(affiliates).where(eq(affiliates.referralCode, "AFFILIATEADMIN01")).get();
    expect(aff).toBeTruthy();
    const now = Date.now();
    for (let i = 1; i <= 12; i++) {
      db.insert(commissionPayouts)
        .values({
          userId: aff!.userId,
          affiliateId: aff!.id,
          amount: 5000 * i,
          status: i % 3 === 0 ? "pending" : "paid",
          paymentMethod: "bank_transfer",
          paymentDetails: "GTBank 0123456789",
          requestedAt: now - i * 1000,
        })
        .run();
    }

    const page1 = (await authGet(app, "/api/affiliates/payouts?page=1&pageSize=10", adminCookie))
      .body as ApiEnvelope;
    expect(page1.payouts.length).toBe(10);
    expect(page1.total).toBe(12);
    expect(page1.page).toBe(1);
    expect(page1.pageSize).toBe(10);
    expect(page1.totalPages).toBe(2);
    // Stats are unfiltered by pagination
    expect(page1.stats.total).toBe(12);
    expect(page1.stats.byStatus.paid).toBe(8);
    expect(page1.stats.byStatus.pending).toBe(4);

    const page2 = (await authGet(app, "/api/affiliates/payouts?page=2&pageSize=10", adminCookie))
      .body as ApiEnvelope;
    expect(page2.payouts.length).toBe(2);
    expect(page2.page).toBe(2);
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
//  MY REFERRALS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/affiliates/referrals", () => {
  it("returns an empty envelope for a user without referrals", async () => {
    const { status, body } = await authGet(app, "/api/affiliates/referrals", userCookie);
    expect(status).toBe(200);
    const env = body as ApiEnvelope;
    expect(Array.isArray(env.referrals)).toBe(true);
    expect(env.referrals.length).toBe(0);
    expect(env.total).toBe(0);
    expect(env.page).toBe(1);
    expect(env.pageSize).toBe(10);
    expect(env.totalPages).toBe(1);
    expect(env.stats.total).toBe(0);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/affiliates/referrals");
    expect(res.status).toBe(401);
  });

  it("lists referrals with referred user info and supports sorting", async () => {
    const db = getTestDb();
    const aff = db.select().from(affiliates).where(eq(affiliates.referralCode, "AFFILIATEADMIN01")).get();
    expect(aff).toBeTruthy();

    // Seed two referred users + referral rows for the admin's affiliate
    await signUp(app, { name: "Referral Alpha", email: "ref-alpha@test.com", password: "Secure@123" });
    await signUp(app, { name: "Referral Beta", email: "ref-beta@test.com", password: "Secure@123" });
    const userA = db.select().from(users).where(eq(users.email, "ref-alpha@test.com")).get();
    const userB = db.select().from(users).where(eq(users.email, "ref-beta@test.com")).get();

    db.insert(referrals).values({
      referrerId: aff!.userId,
      referredId: userA!.id,
      affiliateId: aff!.id,
      status: "converted",
      commissionEarned: 5000,
      convertedAt: Date.now() - 2000,
      createdAt: Date.now() - 2000,
    }).run();
    db.insert(referrals).values({
      referrerId: aff!.userId,
      referredId: userB!.id,
      affiliateId: aff!.id,
      status: "pending",
      createdAt: Date.now() - 1000,
    }).run();

    const { status, body } = await authGet(app, "/api/affiliates/referrals?sortBy=status&sortOrder=asc", adminCookie);
    expect(status).toBe(200);
    const env = body as ApiEnvelope;
    expect(env.total).toBeGreaterThanOrEqual(2);
    expect(env.referrals.length).toBeGreaterThanOrEqual(2);

    // Joined referred user info is present
    const names = env.referrals.map((r: ApiEnvelope) => r.referredName);
    expect(names).toContain("Referral Alpha");
    expect(names).toContain("Referral Beta");

    // Sort by status asc → converted sorts before pending
    expect(env.referrals[0].status).toBe("converted");
    expect(env.referrals[env.referrals.length - 1].status).toBe("pending");
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: LIST ALL AFFILIATES
// ═══════════════════════════════════════════════════════════════

describe("GET /api/affiliates/admin/all", () => {
  it("returns all affiliates as admin", async () => {
    const { status, body } = await authGet(app, "/api/affiliates/admin/all", adminCookie);
    expect(status).toBe(200);
    expect(Array.isArray((body as { affiliates?: unknown[] }).affiliates)).toBe(true);
    expect(((body as { affiliates?: unknown[] }).affiliates || []).length).toBeGreaterThanOrEqual(1);
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
