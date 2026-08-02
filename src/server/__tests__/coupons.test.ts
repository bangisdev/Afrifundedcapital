/**
 * Coupons route tests — validate, redeem, admin CRUD with redemption counts.
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
  authDelete,
  getTestDb,
} from "./setup";
import { users, coupons, couponRedemptions } from "../schema";
import { eq } from "drizzle-orm";

let app: Hono;
let userCookie: string;
let adminCookie: string;

beforeAll(async () => {
  app = await buildTestApp();

  const { cookie: uc } = await signUp(app, {
    name: "Coupon Trader",
    email: "coupon-trader@test.com",
    password: "Secure@123",
  });
  userCookie = uc;

  const { cookie: ac } = await signUp(app, {
    name: "Coupon Admin",
    email: "coupon-admin@test.com",
    password: "Secure@123",
  });

  // Promote admin using the SAME DB instance the app uses
  const db = getTestDb();
  const adminUser = db.select().from(users).where(eq(users.email, "coupon-admin@test.com")).get();
  if (adminUser) {
    await authPost(app, "/api/auth/promote-admin", "", { userId: adminUser.id });
  }

  const { cookie: reLogin } = await signIn(app, {
    email: "coupon-admin@test.com",
    password: "Secure@123",
  });
  adminCookie = reLogin;
});

afterAll(() => {
  cleanupTestDb();
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: CREATE COUPON
// ═══════════════════════════════════════════════════════════════

describe("POST /api/coupons/admin/create", () => {
  it("creates a percentage coupon", async () => {
    const { status, body } = await authPost(app, "/api/coupons/admin/create", adminCookie, {
      code: "SAVE20",
      discountType: "percentage",
      discountValue: 20,
      description: "20% off",
    });
    expect(status).toBe(200);
    const coupon = body as Record<string, unknown>;
    expect(coupon.code).toBe("SAVE20");
    expect(coupon.discountType).toBe("percentage");
    expect(coupon.discountValue).toBe(20);
  });

  it("creates a fixed coupon", async () => {
    const { status, body } = await authPost(app, "/api/coupons/admin/create", adminCookie, {
      code: "FLAT5000",
      discountType: "fixed",
      discountValue: 5000,
      maxUses: 10,
    });
    expect(status).toBe(200);
    const coupon = body as Record<string, unknown>;
    expect(coupon.code).toBe("FLAT5000");
    expect(coupon.discountType).toBe("fixed");
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authPost(app, "/api/coupons/admin/create", userCookie, {
      code: "FAIL",
      discountType: "percentage",
      discountValue: 10,
    });
    expect(status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: LIST COUPONS WITH REDEMPTION COUNTS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/coupons/admin/all", () => {
  it("returns coupons with redemption stats", async () => {
    const { status, body } = await authGet(app, "/api/coupons/admin/all", adminCookie);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(2);

    const coupon = (body as Record<string, unknown>[])[0];
    expect(coupon).toHaveProperty("redemptionCount");
    expect(coupon).toHaveProperty("totalDiscountGiven");
  });
});

// ═══════════════════════════════════════════════════════════════
//  VALIDATE COUPON
// ═══════════════════════════════════════════════════════════════

describe("POST /api/coupons/validate", () => {
  it("validates a valid percentage coupon", async () => {
    const { status, body } = await authPost(app, "/api/coupons/validate", userCookie, {
      code: "SAVE20",
      amount: 50000,
    });
    expect(status).toBe(200);
    const result = body as Record<string, unknown>;
    expect(result.valid).toBe(true);
    expect(result.discountType).toBe("percentage");
    expect(result.discount).toBe(10000);
    expect(result.finalAmount).toBe(40000);
  });

  it("validates a valid fixed coupon", async () => {
    const { status, body } = await authPost(app, "/api/coupons/validate", userCookie, {
      code: "FLAT5000",
      amount: 50000,
    });
    expect(status).toBe(200);
    const result = body as Record<string, unknown>;
    expect(result.valid).toBe(true);
    expect(result.discountType).toBe("fixed");
    expect(result.discount).toBe(5000);
    expect(result.finalAmount).toBe(45000);
  });

  it("returns invalid for non-existent coupon", async () => {
    const { status, body } = await authPost(app, "/api/coupons/validate", userCookie, {
      code: "NOPE",
      amount: 50000,
    });
    expect(status).toBe(404);
    expect((body as Record<string, unknown>).valid).toBe(false);
  });

  it("returns 400 when code is missing", async () => {
    const { status } = await authPost(app, "/api/coupons/validate", userCookie, {
      amount: 50000,
    });
    expect(status).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "SAVE20", amount: 50000 }),
    });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  REDEEM COUPON
// ═══════════════════════════════════════════════════════════════

describe("POST /api/coupons/redeem", () => {
  it("records a coupon redemption", async () => {
    const { body: coupons } = await authGet(app, "/api/coupons/admin/all", adminCookie);
    const coupon = (coupons as Record<string, unknown>[])[0];

    const { status, body } = await authPost(app, "/api/coupons/redeem", userCookie, {
      couponId: coupon.id,
      paymentId: 99999,
    });
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
  });

  it("returns already redeemed for duplicate", async () => {
    const { body: coupons } = await authGet(app, "/api/coupons/admin/all", adminCookie);
    const coupon = (coupons as Record<string, unknown>[])[0];

    const { body } = await authPost(app, "/api/coupons/redeem", userCookie, {
      couponId: coupon.id,
      paymentId: 99999,
    });
    expect((body as Record<string, unknown>).success).toBe(true);
    expect((body as Record<string, unknown>).message).toMatch(/already/i);
  });

  it("returns 400 without required fields", async () => {
    const { status } = await authPost(app, "/api/coupons/redeem", userCookie, {});
    expect(status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
//  MY REDEEMED COUPONS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/coupons/my", () => {
  it("returns an empty envelope for a user without redemptions", async () => {
    const { cookie: freshCookie } = await signUp(app, {
      name: "Coupon Fresh",
      email: "coupon-fresh@test.com",
      password: "Secure@123",
    });
    const { status, body } = await authGet(app, "/api/coupons/my", freshCookie);
    expect(status).toBe(200);
    const env = body as Record<string, any>;
    expect(Array.isArray(env.coupons)).toBe(true);
    expect(env.coupons.length).toBe(0);
    expect(env.total).toBe(0);
    expect(env.page).toBe(1);
    expect(env.pageSize).toBe(10);
    expect(env.totalPages).toBe(1);
    expect(env.stats.total).toBe(0);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/coupons/my");
    expect(res.status).toBe(401);
  });

  it("lists my redeemed coupons with coupon info and supports sorting", async () => {
    const db = getTestDb();
    const coupon = db.select().from(coupons).where(eq(coupons.code, "SAVE20")).get();
    expect(coupon).toBeTruthy();
    const trader = db.select().from(users).where(eq(users.email, "coupon-trader@test.com")).get();
    expect(trader).toBeTruthy();

    // Seed two redemptions with staggered amounts + timestamps
    db.insert(couponRedemptions).values({
      couponId: coupon!.id,
      userId: trader!.id,
      paymentId: 11111,
      discountAmount: 10000,
      originalAmount: 50000,
      redeemedAt: Date.now() - 2000,
    }).run();
    db.insert(couponRedemptions).values({
      couponId: coupon!.id,
      userId: trader!.id,
      paymentId: 22222,
      discountAmount: 5000,
      originalAmount: 40000,
      redeemedAt: Date.now() - 1000,
    }).run();

    const { status, body } = await authGet(app, "/api/coupons/my?sortBy=discountAmount&sortOrder=desc", userCookie);
    expect(status).toBe(200);
    const env = body as Record<string, any>;
    expect(env.total).toBeGreaterThanOrEqual(2);
    expect(env.coupons.length).toBeGreaterThanOrEqual(2);

    // Joined coupon code is present on each redemption
    expect(env.coupons[0].code).toBe("SAVE20");

    // Sort by discountAmount desc → highest discount first
    expect(env.coupons[0].discountAmount).toBe(10000);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: UPDATE COUPON (uses PUT)
// ═══════════════════════════════════════════════════════════════

describe("PUT /api/coupons/admin/:id", () => {
  it("updates a coupon", async () => {
    const { body: coupons } = await authGet(app, "/api/coupons/admin/all", adminCookie);
    const coupon = (coupons as Record<string, unknown>[])[0];

    const { status, body } = await authPut(app, `/api/coupons/admin/${coupon.id}`, adminCookie, {
      description: "Updated coupon description",
    });
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: DELETE COUPON
// ═══════════════════════════════════════════════════════════════

describe("DELETE /api/coupons/admin/:id", () => {
  it("deletes a coupon", async () => {
    const { body: coupons } = await authGet(app, "/api/coupons/admin/all", adminCookie);
    const coupon = (coupons as Record<string, unknown>[])[0];

    const { status, body } = await authDelete(app, `/api/coupons/admin/${coupon.id}`, adminCookie);
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
  });
});
