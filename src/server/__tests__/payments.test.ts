/**
 * Payments endpoint tests — flutterwave config, initiate, verify, webhook.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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
import { auditLogs, notifications, users } from "../schema";
import { eq, desc, and } from "drizzle-orm";

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

    // Saving payment gateway keys is the most sensitive admin action — it must
    // be audited, with secretKey/secretHash redacted from the trail.
    const db = getTestDb();
    const audit = db.select().from(auditLogs)
      .where(eq(auditLogs.entity, "setting"))
      .orderBy(desc(auditLogs.timestamp))
      .get();
    expect(audit).toBeTruthy();
    expect(audit?.entityId).toBe("flutterwave_config");
    // The secret key must never land in the audit trail in plaintext
    expect(audit?.details).not.toContain("FLWSECK_TEST-def456");
    // Masked form + non-secret fields remain visible for review
    expect(audit?.details).toContain("••••");
    expect(audit?.details).toContain("FLWPUBK_TEST-abc123");
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

  it("alerts other admins when payment keys are saved", async () => {
    // A second admin who should be alerted about the key change
    await signUp(app, { name: "Other Admin", email: "other-admin@test.com", password: "Admin@123" });
    const db = getTestDb();
    const other = db.select().from(users).where(eq(users.email, "other-admin@test.com")).get();
    if (!other) return;
    db.update(users)
      .set({ role: "finance_admin", onboardingComplete: true, updatedAt: Date.now() })
      .where(eq(users.id, other.id))
      .run();

    // Preserve secretHash — later tests in this suite rely on it being set
    await authPost(app, "/api/payments/admin/flutterwave-config", adminCookie, {
      publicKey: "FLWPUBK_TEST-alert",
      secretKey: "FLWSECK_TEST-alert-3333",
      secretHash: "test123",
      isEnabled: true,
    });

    const notif = db.select().from(notifications)
      .where(and(eq(notifications.userId, other.id), eq(notifications.type, "security")))
      .orderBy(desc(notifications.createdAt))
      .get();
    expect(notif).toBeTruthy();
    expect(notif?.title).toContain("Payment Config Changed");
    expect(notif?.metadata).toContain("flutterwave_config");
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

    // The redemption is recorded with the real discount (visible in My Coupons)
    const { body: myBody } = await authGet(app, "/api/coupons/my", userCookie);
    const redemptions = (myBody as ApiEnvelope).coupons;
    const redemption = redemptions.find((r: ApiEnvelope) => r.code === "TESTDISCOUNT");
    expect(redemption).toBeTruthy();
    expect(redemption.discountAmount).toBe(5000);
    expect(redemption.originalAmount).toBe(50000);
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

// ═══════════════════════════════════════════════════════════════
//  ADMIN: CLEAN UP STALE PAYMENTS
// ═══════════════════════════════════════════════════════════════

describe("POST /api/payments/admin/cleanup-stale", () => {
  it("marks stale pending payments as failed and voids their redemptions", async () => {
    const db = getTestDb();
    const { payments, couponRedemptions, coupons, users } = await import("../schema");
    const { eq } = await import("drizzle-orm");

    const trader = db.select().from(users).where(eq(users.email, TEST_USER.email)).get();
    expect(trader).toBeTruthy();

    // A coupon with an existing usage count
    const coupon = db.insert(coupons).values({
      code: "STALECLEAN",
      discountType: "fixed",
      discountValue: 5000,
      isActive: true,
      currentUses: 2,
      createdBy: trader!.id,
      createdAt: Date.now(),
    }).returning().get();

    // Stale pending payment (abandoned > 30 min ago) + redemption
    const stalePayment = db.insert(payments).values({
      userId: trader!.id,
      amount: 50000,
      currency: "NGN",
      provider: "flutterwave",
      status: "pending",
      reference: "STALE-REF-1",
      description: "Abandoned checkout",
      createdAt: Date.now() - 60 * 60 * 1000, // 1 hour ago
    }).returning().get();

    db.insert(couponRedemptions).values({
      couponId: coupon.id,
      userId: trader!.id,
      paymentId: stalePayment.id,
      discountAmount: 5000,
      originalAmount: 50000,
      redeemedAt: Date.now() - 60 * 60 * 1000,
    }).run();

    // Fresh pending payment (recent) + redemption — must NOT be touched
    const freshPayment = db.insert(payments).values({
      userId: trader!.id,
      amount: 50000,
      currency: "NGN",
      provider: "flutterwave",
      status: "pending",
      reference: "FRESH-REF-1",
      description: "Recent checkout",
      createdAt: Date.now(),
    }).returning().get();

    db.insert(couponRedemptions).values({
      couponId: coupon.id,
      userId: trader!.id,
      paymentId: freshPayment.id,
      discountAmount: 5000,
      originalAmount: 50000,
      redeemedAt: Date.now(),
    }).run();

    const { status, body } = await authPost(app, "/api/payments/admin/cleanup-stale", adminCookie, {});
    expect(status).toBe(200);
    const result = body as ApiEnvelope;
    expect(result.stale).toBeGreaterThanOrEqual(1);
    expect(result.voided).toBeGreaterThanOrEqual(1);

    // Stale payment failed + redemption voided
    const staleAfter = db.select().from(payments).where(eq(payments.reference, "STALE-REF-1")).get();
    expect(staleAfter!.status).toBe("failed");
    const staleRedemption = db.select().from(couponRedemptions).where(eq(couponRedemptions.paymentId, stalePayment.id)).get();
    expect(staleRedemption).toBeUndefined();

    // Fresh payment untouched + redemption intact
    const freshAfter = db.select().from(payments).where(eq(payments.reference, "FRESH-REF-1")).get();
    expect(freshAfter!.status).toBe("pending");
    const freshRedemption = db.select().from(couponRedemptions).where(eq(couponRedemptions.paymentId, freshPayment.id)).get();
    expect(freshRedemption).toBeTruthy();

    // currentUses decremented for the voided redemption
    const couponAfter = db.select().from(coupons).where(eq(coupons.id, coupon.id)).get();
    expect(couponAfter!.currentUses).toBe(1);
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authPost(app, "/api/payments/admin/cleanup-stale", userCookie, {});
    expect(status).toBe(403);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/payments/admin/cleanup-stale", { method: "POST" });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: TEST WEBHOOK
// ═══════════════════════════════════════════════════════════════

describe("POST /api/payments/admin/test-webhook", () => {
  it("fires a sample webhook and reports the endpoint response", async () => {
    const { status, body } = await authPost(app, "/api/payments/admin/test-webhook", adminCookie, {});

    expect(status).toBe(200);
    const result = body as ApiEnvelope;
    expect(result.success).toBe(true);
    // Fake tx_ref → no matching payment → the webhook safely reports "ignored"
    expect(result.webhookStatus).toBe("ignored");
    expect(result.txRef).toMatch(/^AFC-TEST-/);
    // The config saved earlier in this suite has a secretHash
    expect(result.secretHashConfigured).toBe(true);
    expect(result.payload?.event).toBe("charge.completed");
    expect(result.payload?.data?.status).toBe("successful");
  });

  it("can complete a specific pending payment end-to-end", async () => {
    const db = getTestDb();
    const { payments, users } = await import("../schema");
    const { eq } = await import("drizzle-orm");

    const trader = db.select().from(users).where(eq(users.email, TEST_USER.email)).get();
    expect(trader).toBeTruthy();

    const pay = db.insert(payments).values({
      userId: trader!.id,
      amount: 50000,
      currency: "NGN",
      provider: "flutterwave",
      status: "pending",
      reference: "TESTWEBHOOK-TARGET-1",
      description: "Test webhook target",
      createdAt: Date.now(),
    }).returning().get();

    const { status, body } = await authPost(app, "/api/payments/admin/test-webhook", adminCookie, {
      paymentId: pay.id,
    });

    expect(status).toBe(200);
    const result = body as ApiEnvelope;
    expect(result.usedPayment).toBe(true);
    expect(result.paymentId).toBe(pay.id);
    expect(result.webhookStatus).toBe("ok");

    // The webhook processed the payment through the real pipeline
    const after = db.select().from(payments).where(eq(payments.id, pay.id)).get();
    expect(after!.status).toBe("completed");
  });

  it("returns 403 for non-admin users", async () => {
    const { status } = await authPost(app, "/api/payments/admin/test-webhook", userCookie, {});
    expect(status).toBe(403);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/payments/admin/test-webhook", { method: "POST" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/payments/verify", () => {
  it("returns 404 for non-existent payment", async () => {
    const { status } = await authPost(app, "/api/payments/verify", userCookie, {
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

    const { status } = await authPost(app, "/api/payments/verify", otherSignIn.cookie, {
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

  it("re-ensures the coupon redemption when a late webhook arrives after the stale sweep voided it", async () => {
    const db = getTestDb();
    const { payments, coupons, couponRedemptions, users } = await import("../schema");
    const { eq } = await import("drizzle-orm");

    const trader = db.select().from(users).where(eq(users.email, TEST_USER.email)).get();
    expect(trader).toBeTruthy();

    // Coupon with an existing usage count
    const coupon = db.insert(coupons).values({
      code: "LATEWEBHOOK",
      discountType: "fixed",
      discountValue: 5000,
      isActive: true,
      currentUses: 2,
      createdBy: trader!.id,
      createdAt: Date.now(),
    }).returning().get();

    // Abandoned checkout: stale pending payment (1h old) with a coupon in metadata
    const payment = db.insert(payments).values({
      userId: trader!.id,
      amount: 45000,
      currency: "NGN",
      provider: "flutterwave",
      status: "pending",
      reference: "LATE-REF-1",
      description: "Late webhook checkout",
      metadata: JSON.stringify({ couponId: coupon.id, discount: 5000, originalAmount: 50000 }),
      createdAt: Date.now() - 60 * 60 * 1000,
    }).returning().get();

    db.insert(couponRedemptions).values({
      couponId: coupon.id,
      userId: trader!.id,
      paymentId: payment.id,
      discountAmount: 5000,
      originalAmount: 50000,
      redeemedAt: Date.now() - 60 * 60 * 1000,
    }).run();

    // Sweep marks the payment failed + voids the redemption
    await authPost(app, "/api/payments/admin/cleanup-stale", adminCookie, {});
    let redemption = db
      .select()
      .from(couponRedemptions)
      .where(eq(couponRedemptions.paymentId, payment.id))
      .get();
    expect(redemption).toBeUndefined();
    let couponAfterSweep = db.select().from(coupons).where(eq(coupons.id, coupon.id)).get();
    expect(couponAfterSweep!.currentUses).toBe(1);

    // Late successful webhook arrives
    const res = await app.request("/api/payments/webhook/flutterwave", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "verif-hash": "test123",
      },
      body: JSON.stringify({
        event: "charge.completed",
        data: {
          id: 777,
          tx_ref: "LATE-REF-1",
          status: "successful",
          amount: 45000,
          currency: "NGN",
        },
      }),
    });
    expect(res.status).toBe(200);

    // Payment completed
    const paymentAfter = db
      .select()
      .from(payments)
      .where(eq(payments.reference, "LATE-REF-1"))
      .get();
    expect(paymentAfter!.status).toBe("completed");

    // Redemption restored with the real discount from metadata
    redemption = db
      .select()
      .from(couponRedemptions)
      .where(eq(couponRedemptions.paymentId, payment.id))
      .get();
    expect(redemption).toBeTruthy();
    expect(redemption!.couponId).toBe(coupon.id);
    expect(redemption!.discountAmount).toBe(5000);
    expect(redemption!.originalAmount).toBe(50000);

    // Usage counter restored
    couponAfterSweep = db.select().from(coupons).where(eq(coupons.id, coupon.id)).get();
    expect(couponAfterSweep!.currentUses).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
//  MY PAYMENTS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/payments/my", () => {
  it("returns the user's payment history", async () => {
    const { status, body } = await authGet(app, "/api/payments/my", userCookie);

    expect(status).toBe(200);
    const env = body as ApiEnvelope;
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
    const env0 = first as ApiEnvelope;
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
      .body as ApiEnvelope;
    expect(page1.payments.length).toBe(10);
    expect(page1.pageSize).toBe(10);
    expect(page1.total).toBeGreaterThanOrEqual(13); // 1 existing + 12 seeded
    expect(page1.totalPages).toBeGreaterThanOrEqual(2);
    // Stats are unfiltered by pagination
    expect(page1.stats.total).toBe(page1.total);

    const page2 = (await authGet(app, "/api/payments/my?page=2&pageSize=10", userCookie))
      .body as ApiEnvelope;
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
  beforeAll(() => {
    // Stub Flutterwave's refund API — the full-flow tests complete payments via
    // a webhook with synthetic transaction ids, so the gateway call must be
    // mocked rather than hitting the real API.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: "success",
          message: "Refund initiated",
          data: { id: 4242, amount_refunded: 45000, status: "completed" },
        }),
      }),
    );
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("refunds a payment as admin", async () => {
    // Get the first payment
    const { body: payments } = await authGet(app, "/api/payments/my", userCookie);
    const env = payments as ApiEnvelope;
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

  it("skips the gateway refund when no Flutterwave transaction exists", async () => {
    // A payment created via /initiate without completing checkout has no
    // Flutterwave transaction on file, so the gateway call is skipped.
    const { body: initResult } = await authPost(app, "/api/payments/initiate", userCookie, {
      amount: 25000,
      currency: "NGN",
    });
    const paymentId = (initResult as Record<string, unknown>).paymentId as number;

    const { status, body } = await authPost(app, `/api/payments/admin/${paymentId}/refund`, adminCookie);
    expect(status).toBe(200);
    const refundBody = body as ApiEnvelope;
    expect(refundBody.success).toBe(true);
    expect(refundBody.refundGateway.status).toBe("skipped");
    expect(refundBody.refundGateway.error).toContain("No Flutterwave transaction");
  });

  it("returns 403 for non-admin users", async () => {
    const { status } = await authPost(app, "/api/payments/admin/1/refund", userCookie);
    expect(status).toBe(403);
  });

  it("returns 404 for a missing payment", async () => {
    const { status } = await authPost(app, "/api/payments/admin/999999/refund", adminCookie);
    expect(status).toBe(404);
  });

  it("deactivates the challenge, suspends the MT5 account, voids the redemption, and notifies the user when a completed payment is refunded", async () => {
    const db = getTestDb();
    const { users, payments, challengeTemplates, accountSizes, coupons, userChallenges, mt5Accounts, couponRedemptions, notifications, auditLogs } = await import("../schema");
    const { eq } = await import("drizzle-orm");

    const trader = db.select().from(users).where(eq(users.email, TEST_USER.email)).get();
    expect(trader).toBeTruthy();
    const now = Date.now();

    // Seed a catalog entry (template + size + coupon)
    const template = db.insert(challengeTemplates).values({
      name: "Refund Flow Challenge",
      description: "Refund flow test",
      type: "two_step",
      isActive: true,
      profitTarget: 10,
      dailyDrawdown: 5,
      maxDrawdown: 10,
      maxLeverage: 100,
      minTradingDays: 5,
      maxTradingDays: 30,
      allowWeekendHolding: false,
      allowNewsTrading: true,
      allowEATrading: true,
      allowCopyTrading: false,
      price: 50000,
      currency: "NGN",
      durationDays: 30,
      createdBy: trader!.id,
      createdAt: now,
      updatedAt: now,
    }).returning().get();

    const size = db.insert(accountSizes).values({
      label: "$10,000",
      size: 10000,
      currency: "NGN",
      templateId: template.id,
      price: 50000,
      isActive: true,
      sortOrder: 1,
    }).returning().get();

    const coupon = db.insert(coupons).values({
      code: "REFUND10",
      discountType: "fixed",
      discountValue: 5000,
      isActive: true,
      maxUses: 5,
      createdBy: trader!.id,
      createdAt: now,
    }).returning().get();

    // Initiate the purchase with the coupon
    const init = await authPost(app, "/api/payments/initiate", userCookie, {
      amount: 45000,
      originalAmount: 50000,
      currency: "NGN",
      templateId: String(template.id),
      accountSizeId: String(size.id),
      couponCode: "REFUND10",
      description: "Refund Flow Challenge",
    });
    expect(init.status).toBe(200);
    const initBody = init.body as ApiEnvelope;
    const paymentId = initBody.paymentId as number;

    // Complete it via the sandbox webhook (charge.completed)
    const payment = db.select().from(payments).where(eq(payments.id, paymentId)).get();
    const webRes = await app.request("/api/payments/webhook/flutterwave", {
      method: "POST",
      headers: { "Content-Type": "application/json", "verif-hash": "test123" },
      body: JSON.stringify({
        event: "charge.completed",
        data: {
          id: Math.floor(100000 + Math.random() * 900000),
          tx_ref: payment!.reference,
          status: "successful",
          amount: 45000,
          currency: "NGN",
          customer: { email: TEST_USER.email, name: TEST_USER.name },
          payment_type: "card",
        },
      }),
    });
    expect(webRes.status).toBe(200);

    // Pre-conditions: challenge active with a linked MT5 account + a redemption
    const challenge = db.select().from(userChallenges).where(eq(userChallenges.paymentId, paymentId)).get();
    expect(challenge).toBeTruthy();
    expect(challenge!.status).toBe("active");
    expect(challenge!.mt5AccountId).toBeTruthy();

    const mt5Before = db.select().from(mt5Accounts).where(eq(mt5Accounts.id, challenge!.mt5AccountId!)).get();
    expect(mt5Before!.isActive).toBe(true);
    expect(mt5Before!.isSuspended).toBe(false);

    const redemptionBefore = db.select().from(couponRedemptions).where(eq(couponRedemptions.paymentId, paymentId)).get();
    expect(redemptionBefore).toBeTruthy();

    // Refund as admin
    const refund = await authPost(app, `/api/payments/admin/${paymentId}/refund`, adminCookie);
    expect(refund.status).toBe(200);
    const refundBody = refund.body as ApiEnvelope;
    expect(refundBody.success).toBe(true);
    expect(refundBody.challengeDeactivated).toBe(1);
    expect(refundBody.mt5Suspended).toBe(1);
    expect(refundBody.redemptionVoided).toBe(true);
    expect(refundBody.refundGateway.status).toBe("success");
    expect(refundBody.refundGateway.amountRefunded).toBe(45000);
    expect(refundBody.userNotified).toBe(true);

    // Payment marked refunded
    const paymentAfter = db.select().from(payments).where(eq(payments.id, paymentId)).get();
    expect(paymentAfter!.status).toBe("refunded");

    // Challenge deactivated
    const challengeAfter = db.select().from(userChallenges).where(eq(userChallenges.paymentId, paymentId)).get();
    expect(challengeAfter!.status).toBe("refunded");

    // MT5 suspended
    const mt5After = db.select().from(mt5Accounts).where(eq(mt5Accounts.id, challenge!.mt5AccountId!)).get();
    expect(mt5After!.isActive).toBe(false);
    expect(mt5After!.isSuspended).toBe(true);

    // Redemption voided + coupon usage released
    const redemptionAfter = db.select().from(couponRedemptions).where(eq(couponRedemptions.paymentId, paymentId)).get();
    expect(redemptionAfter).toBeUndefined();
    const couponAfter = db.select().from(coupons).where(eq(coupons.id, coupon.id)).get();
    expect(couponAfter!.currentUses).toBe(0);

    // User notified
    const notifs = db.select().from(notifications).where(eq(notifications.userId, trader!.id)).all();
    expect(notifs.some((n) => n.title === "Payment Refunded")).toBe(true);

    // Audit log records the admin action + what changed
    const logs = db.select().from(auditLogs).where(eq(auditLogs.entityId, String(paymentId))).all();
    const refundLog = logs.find((l) => l.action === "payment.refunded");
    expect(refundLog).toBeTruthy();
    const refundDetails = JSON.parse(refundLog!.details || "{}");
    expect(refundDetails.reference).toBe(payment!.reference);
    expect(refundDetails.challengeDeactivated).toBe(1);
    expect(refundDetails.redemptionVoided).toBe(true);
    expect(refundDetails.refundGateway).toBe("success");
  });

  it("is idempotent — refunding an already-refunded payment stays successful without double-voiding", async () => {
    const db = getTestDb();
    const { payments } = await import("../schema");
    const { eq } = await import("drizzle-orm");

    const payment = db.select().from(payments).where(eq(payments.status, "refunded")).get();
    expect(payment).toBeTruthy();

    const res = await authPost(app, `/api/payments/admin/${payment!.id}/refund`, adminCookie);
    expect(res.status).toBe(200);
    const body = res.body as ApiEnvelope;
    expect(body.success).toBe(true);
    expect(body.challengeDeactivated).toBe(0);
    expect(body.redemptionVoided).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN RESUME
// ═══════════════════════════════════════════════════════════════

describe("POST /api/payments/admin/:id/resume", () => {
  it("reactivates the challenge, MT5 account, and funded account after a refund", async () => {
    const db = getTestDb();
    const { users, payments, challengeTemplates, accountSizes, coupons, userChallenges, mt5Accounts, couponRedemptions, notifications, auditLogs } = await import("../schema");
    const { eq } = await import("drizzle-orm");

    const trader = db.select().from(users).where(eq(users.email, TEST_USER.email)).get();
    expect(trader).toBeTruthy();
    const now = Date.now();

    // Seed a catalog entry (template + size + coupon)
    const template = db.insert(challengeTemplates).values({
      name: "Resume Flow Challenge",
      description: "Resume flow test",
      type: "two_step",
      isActive: true,
      profitTarget: 10,
      dailyDrawdown: 5,
      maxDrawdown: 10,
      maxLeverage: 100,
      minTradingDays: 5,
      maxTradingDays: 30,
      allowWeekendHolding: false,
      allowNewsTrading: true,
      allowEATrading: true,
      allowCopyTrading: false,
      price: 50000,
      currency: "NGN",
      durationDays: 30,
      createdBy: trader!.id,
      createdAt: now,
      updatedAt: now,
    }).returning().get();

    const size = db.insert(accountSizes).values({
      label: "$10,000",
      size: 10000,
      currency: "NGN",
      templateId: template.id,
      price: 50000,
      isActive: true,
      sortOrder: 1,
    }).returning().get();

    const coupon = db.insert(coupons).values({
      code: "RESUME10",
      discountType: "fixed",
      discountValue: 5000,
      isActive: true,
      maxUses: 5,
      createdBy: trader!.id,
      createdAt: now,
    }).returning().get();

    // Initiate the purchase with the coupon
    const init = await authPost(app, "/api/payments/initiate", userCookie, {
      amount: 45000,
      originalAmount: 50000,
      currency: "NGN",
      templateId: String(template.id),
      accountSizeId: String(size.id),
      couponCode: "RESUME10",
      description: "Resume Flow Challenge",
    });
    expect(init.status).toBe(200);
    const initBody = init.body as ApiEnvelope;
    const paymentId = initBody.paymentId as number;

    // Complete it via the sandbox webhook
    const payment = db.select().from(payments).where(eq(payments.id, paymentId)).get();
    const webRes = await app.request("/api/payments/webhook/flutterwave", {
      method: "POST",
      headers: { "Content-Type": "application/json", "verif-hash": "test123" },
      body: JSON.stringify({
        event: "charge.completed",
        data: {
          id: Math.floor(100000 + Math.random() * 900000),
          tx_ref: payment!.reference,
          status: "successful",
          amount: 45000,
          currency: "NGN",
          customer: { email: TEST_USER.email, name: TEST_USER.name },
          payment_type: "card",
        },
      }),
    });
    expect(webRes.status).toBe(200);

    // Refund first (deactivates challenge + suspends MT5)
    const refund = await authPost(app, `/api/payments/admin/${paymentId}/refund`, adminCookie);
    expect(refund.status).toBe(200);

    const challenge = db.select().from(userChallenges).where(eq(userChallenges.paymentId, paymentId)).get();
    expect(challenge).toBeTruthy();
    expect(challenge!.status).toBe("refunded");
    expect(challenge!.mt5AccountId).toBeTruthy();
    const originalExpiry = challenge!.expiresAt;

    // ── Resume ────────────────────────────────────────────────
    const resume = await authPost(app, `/api/payments/admin/${paymentId}/resume`, adminCookie);
    expect(resume.status).toBe(200);
    const resumeBody = resume.body as ApiEnvelope;
    expect(resumeBody.success).toBe(true);
    expect(resumeBody.challengeResumed).toBe(1);
    expect(resumeBody.mt5Reactivated).toBe(1);
    expect(resumeBody.redemptionRestored).toBe(true);
    expect(resumeBody.userNotified).toBe(true);

    // Challenge active again, expiry clock paused while refunded (never shrinks)
    const challengeAfter = db.select().from(userChallenges).where(eq(userChallenges.paymentId, paymentId)).get();
    expect(challengeAfter!.status).toBe("active");
    expect(challengeAfter!.expiresAt).toBeGreaterThanOrEqual(originalExpiry!);

    // MT5 account re-enabled
    const mt5After = db.select().from(mt5Accounts).where(eq(mt5Accounts.id, challenge!.mt5AccountId!)).get();
    expect(mt5After!.isActive).toBe(true);
    expect(mt5After!.isSuspended).toBe(false);

    // Coupon redemption restored — the coupon is still active and within limits
    const redemptionAfter = db.select().from(couponRedemptions).where(eq(couponRedemptions.paymentId, paymentId)).get();
    expect(redemptionAfter).toBeTruthy();
    expect(redemptionAfter!.couponId).toBe(coupon.id);
    expect(redemptionAfter!.discountAmount).toBe(5000);
    expect(redemptionAfter!.originalAmount).toBe(50000);
    const couponAfter = db.select().from(coupons).where(eq(coupons.id, coupon.id)).get();
    expect(couponAfter!.currentUses).toBe(1);

    // User notified
    const notifs = db.select().from(notifications).where(eq(notifications.userId, trader!.id)).all();
    expect(notifs.some((n) => n.title === "Challenge Resumed")).toBe(true);

    // Audit log records the resume action + what changed
    const logs = db.select().from(auditLogs).where(eq(auditLogs.entityId, String(paymentId))).all();
    const resumeLog = logs.find((l) => l.action === "payment.resumed");
    expect(resumeLog).toBeTruthy();
    const resumeDetails = JSON.parse(resumeLog!.details || "{}");
    expect(resumeDetails.reference).toBe(payment!.reference);
    expect(resumeDetails.challengeResumed).toBe(1);
    expect(resumeDetails.redemptionRestored).toBe(true);
  });

  it("returns 404 for a missing payment", async () => {
    const { status } = await authPost(app, "/api/payments/admin/999999/resume", adminCookie);
    expect(status).toBe(404);
  });

  it("returns 403 for non-admin users", async () => {
    const { status } = await authPost(app, "/api/payments/admin/1/resume", userCookie);
    expect(status).toBe(403);
  });

  it("does not restore the redemption when the coupon has expired", async () => {
    const db = getTestDb();
    const { users, payments, challengeTemplates, accountSizes, coupons, userChallenges, couponRedemptions } = await import("../schema");
    const { eq } = await import("drizzle-orm");

    const trader = db.select().from(users).where(eq(users.email, TEST_USER.email)).get();
    expect(trader).toBeTruthy();
    const now = Date.now();

    const template = db.insert(challengeTemplates).values({
      name: "Expired Coupon Resume",
      description: "Expired coupon resume test",
      type: "two_step",
      isActive: true,
      profitTarget: 10,
      dailyDrawdown: 5,
      maxDrawdown: 10,
      maxLeverage: 100,
      minTradingDays: 5,
      maxTradingDays: 30,
      allowWeekendHolding: false,
      allowNewsTrading: true,
      allowEATrading: true,
      allowCopyTrading: false,
      price: 50000,
      currency: "NGN",
      durationDays: 30,
      createdBy: trader!.id,
      createdAt: now,
      updatedAt: now,
    }).returning().get();

    const size = db.insert(accountSizes).values({
      label: "$10,000",
      size: 10000,
      currency: "NGN",
      templateId: template.id,
      price: 50000,
      isActive: true,
      sortOrder: 1,
    }).returning().get();

    // Valid at checkout time (expires in 1 hour), so initiate applies it
    const coupon = db.insert(coupons).values({
      code: "EXPIRED10",
      discountType: "fixed",
      discountValue: 5000,
      isActive: true,
      maxUses: 5,
      expiresAt: now + 60 * 60 * 1000,
      createdBy: trader!.id,
      createdAt: now,
    }).returning().get();

    const init = await authPost(app, "/api/payments/initiate", userCookie, {
      amount: 45000,
      originalAmount: 50000,
      currency: "NGN",
      templateId: String(template.id),
      accountSizeId: String(size.id),
      couponCode: "EXPIRED10",
      description: "Expired Coupon Resume",
    });
    expect(init.status).toBe(200);
    const paymentId = (init.body as ApiEnvelope).paymentId as number;

    // Complete via webhook
    const payment = db.select().from(payments).where(eq(payments.id, paymentId)).get();
    await app.request("/api/payments/webhook/flutterwave", {
      method: "POST",
      headers: { "Content-Type": "application/json", "verif-hash": "test123" },
      body: JSON.stringify({
        event: "charge.completed",
        data: {
          id: Math.floor(100000 + Math.random() * 900000),
          tx_ref: payment!.reference,
          status: "successful",
          amount: 45000,
          currency: "NGN",
        },
      }),
    });

    // Refund, then let the coupon expire before resuming
    await authPost(app, `/api/payments/admin/${paymentId}/refund`, adminCookie);
    db.update(coupons).set({ expiresAt: now - 1000 }).where(eq(coupons.id, coupon.id)).run();

    const resume = await authPost(app, `/api/payments/admin/${paymentId}/resume`, adminCookie);
    expect(resume.status).toBe(200);
    const body = resume.body as ApiEnvelope;
    expect(body.success).toBe(true);
    expect(body.redemptionRestored).toBe(false);
    expect(body.redemptionRestoreReason).toBe("expired");

    // Challenge still resumes, but no redemption and no usage consumed
    const challenge = db.select().from(userChallenges).where(eq(userChallenges.paymentId, paymentId)).get();
    expect(challenge!.status).toBe("active");
    const redemption = db.select().from(couponRedemptions).where(eq(couponRedemptions.paymentId, paymentId)).get();
    expect(redemption).toBeUndefined();
    const couponAfter = db.select().from(coupons).where(eq(coupons.id, coupon.id)).get();
    expect(couponAfter!.currentUses).toBe(0);

    // Audit log captures the reason the coupon wasn't restored
    const logs = db.select().from(auditLogs).where(eq(auditLogs.entityId, String(paymentId))).all();
    const resumeLog = logs.find((l) => l.action === "payment.resumed");
    expect(resumeLog).toBeTruthy();
    expect(JSON.parse(resumeLog!.details || "{}").redemptionRestoreReason).toBe("expired");
  });

  it("does not restore the redemption when the coupon is past its usage limit", async () => {
    const db = getTestDb();
    const { users, payments, challengeTemplates, accountSizes, coupons, userChallenges, couponRedemptions } = await import("../schema");
    const { eq } = await import("drizzle-orm");

    const trader = db.select().from(users).where(eq(users.email, TEST_USER.email)).get();
    expect(trader).toBeTruthy();
    const now = Date.now();

    const template = db.insert(challengeTemplates).values({
      name: "Limit Coupon Resume",
      description: "Usage-limit coupon resume test",
      type: "two_step",
      isActive: true,
      profitTarget: 10,
      dailyDrawdown: 5,
      maxDrawdown: 10,
      maxLeverage: 100,
      minTradingDays: 5,
      maxTradingDays: 30,
      allowWeekendHolding: false,
      allowNewsTrading: true,
      allowEATrading: true,
      allowCopyTrading: false,
      price: 50000,
      currency: "NGN",
      durationDays: 30,
      createdBy: trader!.id,
      createdAt: now,
      updatedAt: now,
    }).returning().get();

    const size = db.insert(accountSizes).values({
      label: "$10,000",
      size: 10000,
      currency: "NGN",
      templateId: template.id,
      price: 50000,
      isActive: true,
      sortOrder: 1,
    }).returning().get();

    const coupon = db.insert(coupons).values({
      code: "LIMIT10",
      discountType: "fixed",
      discountValue: 5000,
      isActive: true,
      maxUses: 1,
      createdBy: trader!.id,
      createdAt: now,
    }).returning().get();

    const init = await authPost(app, "/api/payments/initiate", userCookie, {
      amount: 45000,
      originalAmount: 50000,
      currency: "NGN",
      templateId: String(template.id),
      accountSizeId: String(size.id),
      couponCode: "LIMIT10",
      description: "Limit Coupon Resume",
    });
    expect(init.status).toBe(200);
    const paymentId = (init.body as ApiEnvelope).paymentId as number;

    // Complete via webhook
    const payment = db.select().from(payments).where(eq(payments.id, paymentId)).get();
    await app.request("/api/payments/webhook/flutterwave", {
      method: "POST",
      headers: { "Content-Type": "application/json", "verif-hash": "test123" },
      body: JSON.stringify({
        event: "charge.completed",
        data: {
          id: Math.floor(100000 + Math.random() * 900000),
          tx_ref: payment!.reference,
          status: "successful",
          amount: 45000,
          currency: "NGN",
        },
      }),
    });

    // Refund, then exhaust the coupon's remaining usage before resuming
    await authPost(app, `/api/payments/admin/${paymentId}/refund`, adminCookie);
    db.update(coupons).set({ currentUses: 1 }).where(eq(coupons.id, coupon.id)).run();

    const resume = await authPost(app, `/api/payments/admin/${paymentId}/resume`, adminCookie);
    expect(resume.status).toBe(200);
    const body = resume.body as ApiEnvelope;
    expect(body.success).toBe(true);
    expect(body.redemptionRestored).toBe(false);
    expect(body.redemptionRestoreReason).toBe("usage_limit");

    const challenge = db.select().from(userChallenges).where(eq(userChallenges.paymentId, paymentId)).get();
    expect(challenge!.status).toBe("active");
    const redemption = db.select().from(couponRedemptions).where(eq(couponRedemptions.paymentId, paymentId)).get();
    expect(redemption).toBeUndefined();
    const couponAfter = db.select().from(coupons).where(eq(coupons.id, coupon.id)).get();
    expect(couponAfter!.currentUses).toBe(1);
  });
});
