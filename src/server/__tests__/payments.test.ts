/**
 * Payments endpoint tests — flutterwave config, initiate, verify, webhook.
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
let userCookie: string;
let adminCookie: string;

const TEST_USER = { name: "Pay User", email: "pay@test.com", password: "Secure@123" };
const TEST_ADMIN = { name: "Pay Admin", email: "pay-admin@test.com", password: "Admin@123" };

beforeAll(async () => {
  app = await buildTestApp();

  // Create test user
  await signUp(app, TEST_USER);
  const signInResult = await signIn(app, TEST_USER);
  userCookie = signInResult.cookie;

  // Create admin user
  await signUp(app, TEST_ADMIN);
  const adminSignIn = await signIn(app, TEST_ADMIN);
  adminCookie = adminSignIn.cookie;

  // Promote admin
  const db = getTestDb();
  const { users } = await import("../schema");
  const { eq } = await import("drizzle-orm");
  const adminUser = db.select().from(users).where(eq(users.email, TEST_ADMIN.email)).get();
  if (adminUser) {
    await authPost(app, "/api/auth/promote-admin", "", { userId: adminUser.id });
    const newAdminSignIn = await signIn(app, TEST_ADMIN);
    adminCookie = newAdminSignIn.cookie;
  }
});

afterAll(() => {
  cleanupTestDb();
});

// ═══════════════════════════════════════════════════════════════
//  FLUTTERWAVE CONFIG
// ═══════════════════════════════════════════════════════════════

describe("GET /api/payments/flutterwave-config", () => {
  it("returns the public Flutterwave config", async () => {
    const { status, body } = await authGet(app, "/api/payments/flutterwave-config", userCookie);

    expect(status).toBe(200);
    expect(body).toHaveProperty("publicKey");
    expect(body).toHaveProperty("provider", "flutterwave");
    expect(body).toHaveProperty("isEnabled");
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/payments/flutterwave-config");
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: SAVE FLUTTERWAVE CONFIG
// ═══════════════════════════════════════════════════════════════

describe("POST /api/payments/admin/flutterwave-config", () => {
  it("saves Flutterwave config as admin", async () => {
    const { status, body } = await authPost(
      app,
      "/api/payments/admin/flutterwave-config",
      adminCookie,
      {
        publicKey: "FLWPUBK_TEST-abc123",
        secretKey: "FLWSECK_TEST-def456",
        secretHash: "test123",
        isEnabled: true,
      },
    );

    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
  });

  it("returns 403 for non-admin users", async () => {
    const { status } = await authPost(
      app,
      "/api/payments/admin/flutterwave-config",
      userCookie,
      { publicKey: "test" },
    );

    expect(status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
//  INITIATE PAYMENT
// ═══════════════════════════════════════════════════════════════

describe("POST /api/payments/initiate", () => {
  it("creates a pending payment record", async () => {
    const { status, body } = await authPost(app, "/api/payments/initiate", userCookie, {
      amount: 50000,
      currency: "NGN",
      description: "Challenge Purchase",
    });

    expect(status).toBe(200);
    expect((body as Record<string, unknown>).paymentId).toBeDefined();
    expect((body as Record<string, unknown>).reference).toBeDefined();
    expect((body as Record<string, unknown>).finalAmount).toBe(50000);
  });

  it("applies coupon discount when valid coupon code is provided", async () => {
    // First create a coupon via the DB
    const db = getTestDb();
    const { coupons } = await import("../schema");
    const { eq } = await import("drizzle-orm");

    const existingCoupon = db.select().from(coupons).where(eq(coupons.code, "TESTDISCOUNT")).get();
    if (!existingCoupon) {
      const adminUser = db.select().from((await import("../schema")).users)
        .where(eq((await import("../schema")).users.email, TEST_ADMIN.email)).get();
      db.insert(coupons).values({
        code: "TESTDISCOUNT",
        discountType: "percentage",
        discountValue: 10,
        isActive: true,
        createdBy: adminUser!.id,
        createdAt: Date.now(),
      }).run();
    }

    const { status, body } = await authPost(app, "/api/payments/initiate", userCookie, {
      amount: 50000,
      originalAmount: 50000,
      currency: "NGN",
      couponCode: "TESTDISCOUNT",
      description: "Challenge with coupon",
    });

    expect(status).toBe(200);
    expect((body as Record<string, unknown>).discount).toBe(5000); // 10% of 50000
    expect((body as Record<string, unknown>).finalAmount).toBe(45000);
  });

  it("rejects payment without auth", async () => {
    const res = await app.request("/api/payments/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 50000 }),
    });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  VERIFY PAYMENT
// ═══════════════════════════════════════════════════════════════

describe("POST /api/payments/verify", () => {
  it("returns 404 for non-existent payment", async () => {
    const { status, body } = await authPost(app, "/api/payments/verify", userCookie, {
      paymentId: 99999,
      transactionId: "12345",
      flwRef: "FLW-REF-TEST",
    });

    expect(status).toBe(404);
  });

  it("returns error for unauthorized payment access", async () => {
    // Create a payment as user, try to verify with different session
    const { body: initResult } = await authPost(app, "/api/payments/initiate", userCookie, {
      amount: 25000,
      currency: "NGN",
    });
    const paymentId = (initResult as Record<string, unknown>).paymentId;

    // Create a second user and try to verify
    await signUp(app, { name: "Other", email: "other@test.com", password: "Secure@123" });
    const otherSignIn = await signIn(app, { email: "other@test.com", password: "Secure@123" });

    const { status, body } = await authPost(app, "/api/payments/verify", otherSignIn.cookie, {
      paymentId,
      transactionId: "12345",
    });

    expect(status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
//  WEBHOOK
// ═══════════════════════════════════════════════════════════════

describe("POST /api/payments/webhook/flutterwave", () => {
  it("returns ignored for unknown tx_ref", async () => {
    const res = await app.request("/api/payments/webhook/flutterwave", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "verif-hash": "test123",
      },
      body: JSON.stringify({
        event: "charge.completed",
        data: {
          id: 999,
          tx_ref: "UNKNOWN-REF-123",
          status: "successful",
          amount: 50000,
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ignored");
  });

  it("returns invalid signature with wrong hash", async () => {
    const res = await app.request("/api/payments/webhook/flutterwave", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "verif-hash": "wrong-hash",
      },
      body: JSON.stringify({
        event: "charge.completed",
        data: { id: 1, tx_ref: "AFC-TEST" },
      }),
    });

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  MY PAYMENTS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/payments/my", () => {
  it("returns the user's payment history", async () => {
    const { status, body } = await authGet(app, "/api/payments/my", userCookie);

    expect(status).toBe(200);
    const env = body as Record<string, any>;
    expect(Array.isArray(env.payments)).toBe(true);
    // We initiated 2 payments in earlier tests
    expect(env.payments.length).toBeGreaterThanOrEqual(1);
    expect(env.total).toBeGreaterThanOrEqual(1);
    expect(env.page).toBe(1);
    expect(env.pageSize).toBe(10);
    expect(env.totalPages).toBeGreaterThanOrEqual(1);
    expect(env.stats.total).toBeGreaterThanOrEqual(1);
    expect(typeof env.stats.byStatus).toBe("object");
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/payments/my");
    expect(res.status).toBe(401);
  });

  it("paginates payments server-side", async () => {
    // Get the user id from an existing payment, then seed 12 more directly.
    const { body: first } = await authGet(app, "/api/payments/my", userCookie);
    const env0 = first as Record<string, any>;
    const userId = env0.payments[0].userId;

    const db = getTestDb();
    const { payments } = await import("../schema");
    const now = Date.now();
    for (let i = 1; i <= 12; i++) {
      db.insert(payments)
        .values({
          userId,
          amount: 5000 * i,
          provider: "flutterwave",
          status: i % 3 === 0 ? "pending" : "completed",
          reference: `PAG_${now}_${i}`,
          description: `Purchase ${i}`,
          createdAt: now - i * 1000,
        })
        .run();
    }

    const page1 = (await authGet(app, "/api/payments/my?page=1&pageSize=10", userCookie))
      .body as Record<string, any>;
    expect(page1.payments.length).toBe(10);
    expect(page1.pageSize).toBe(10);
    expect(page1.total).toBeGreaterThanOrEqual(13); // 1 existing + 12 seeded
    expect(page1.totalPages).toBeGreaterThanOrEqual(2);
    // Stats are unfiltered by pagination
    expect(page1.stats.total).toBe(page1.total);

    const page2 = (await authGet(app, "/api/payments/my?page=2&pageSize=10", userCookie))
      .body as Record<string, any>;
    expect(page2.payments.length).toBeGreaterThan(0);
    expect(page2.page).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN PAYMENT STATS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/payments/admin/stats", () => {
  it("returns payment statistics for admin", async () => {
    const { status, body } = await authGet(app, "/api/payments/admin/stats", adminCookie);

    expect(status).toBe(200);
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("completed");
    expect(body).toHaveProperty("revenue");
  });

  it("returns 403 for non-admin users", async () => {
    const { status } = await authGet(app, "/api/payments/admin/stats", userCookie);
    expect(status).toBe(403);
  });
});

describe("GET /api/payments/admin/all", () => {
  it("returns all payments for admin", async () => {
    const { status, body } = await authGet(app, "/api/payments/admin/all", adminCookie);

    expect(status).toBe(200);
    expect(Array.isArray((body as Record<string, unknown>).payments)).toBe(true);
    expect((body as Record<string, unknown>).total).toBeGreaterThanOrEqual(0);
  });

  it("returns 403 for non-admin users", async () => {
    const { status } = await authGet(app, "/api/payments/admin/all", userCookie);
    expect(status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN REFUND
// ═══════════════════════════════════════════════════════════════

describe("POST /api/payments/admin/:id/refund", () => {
  it("refunds a payment as admin", async () => {
    // Get the first payment
    const { body: payments } = await authGet(app, "/api/payments/my", userCookie);
    const env = payments as Record<string, any>;
    const payment = env.payments[0];
    expect(payment).toBeTruthy();

    const { status, body } = await authPost(
      app,
      `/api/payments/admin/${payment.id}/refund`,
      adminCookie,
    );

    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
  });

  it("returns 403 for non-admin users", async () => {
    const { status } = await authPost(app, "/api/payments/admin/1/refund", userCookie);
    expect(status).toBe(403);
  });
});
