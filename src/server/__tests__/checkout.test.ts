/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Full checkout-flow integration test.
 *
 * Simulates the complete purchase journey end-to-end (server side):
 *  1. Seed a challenge template + account size + coupon
 *  2. User signs up and initiates a payment with the coupon
 *  3. Flutterwave's sandbox webhook (charge.completed) fires — exactly what
 *     happens after a successful test-card payment in the sandbox
 *  4. Assert: payment completed, challenge created + linked MT5 account,
 *     My Coupons shows the real discount, coupon usage counter incremented
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
let userId: number;

const TEST_USER = { name: "Checkout Trader", email: "checkout@test.com", password: "Secure@123" };

beforeAll(async () => {
  app = await buildTestApp();

  // Sign up the buyer
  await signUp(app, TEST_USER);
  const signInResult = await signIn(app, TEST_USER);
  userCookie = signInResult.cookie;

  const db = getTestDb();
  const { users } = await import("../schema");
  const { eq } = await import("drizzle-orm");
  const user = db.select().from(users).where(eq(users.email, TEST_USER.email)).get();
  expect(user).toBeTruthy();
  userId = user!.id;
});

afterAll(() => {
  cleanupTestDb();
});

/** Seed the catalog (template + size + coupon + flutterwave config). */
async function seedCatalog(couponCode = "SAVE10K") {
  const db = getTestDb();
  const { challengeTemplates, accountSizes, coupons, settings } = await import("../schema");
  const { eq } = await import("drizzle-orm");

  const now = Date.now();

  const template = db.insert(challengeTemplates).values({
    name: "Two Step Challenge",
    description: "Classic two-step evaluation",
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
    createdBy: userId,
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
    code: couponCode,
    discountType: "fixed",
    discountValue: 5000,
    isActive: true,
    maxUses: 5,
    maxUsesPerUser: 1,
    createdBy: userId,
    createdAt: now,
  }).returning().get();

  // Configure Flutterwave test-mode keys + secret hash (as done via admin UI)
  const existingSetting = db.select().from(settings).where(eq(settings.key, "flutterwave_config")).get();
  if (!existingSetting) {
    db.insert(settings).values({
      key: "flutterwave_config",
      value: JSON.stringify({
        publicKey: "FLWPUBK_TEST-demo",
        secretKey: "FLWSECK_TEST-demo",
        secretHash: "test123",
        isEnabled: true,
      }),
      group: "payments",
      description: "Flutterwave payment gateway configuration",
    }).run();
  }

  return { template, size, coupon };
}

describe("Full checkout flow: initiate → sandbox webhook → challenge + My Coupons", () => {
  it("creates the challenge, MT5 account, and records the coupon discount after the webhook", async () => {
    const db = getTestDb();
    const { payments, userChallenges, mt5Accounts, couponRedemptions, coupons, notifications } = await import("../schema");
    const { eq } = await import("drizzle-orm");

    const { template, size, coupon } = await seedCatalog();

    // ── Step 1: initiate with coupon ──────────────────────────────
    const init = await authPost(app, "/api/payments/initiate", userCookie, {
      amount: 45000,
      originalAmount: 50000,
      currency: "NGN",
      templateId: String(template.id),
      accountSizeId: String(size.id),
      couponCode: "SAVE10K",
      description: "Two Step Challenge",
    });
    expect(init.status).toBe(200);
    const initBody = init.body as any;
    expect(initBody.discount).toBe(5000); // fixed ₦5,000 off
    expect(initBody.finalAmount).toBe(45000);
    const paymentId = initBody.paymentId as number;
    const reference = initBody.reference as string;
    expect(reference).toBeTruthy();

    // Payment is pending + redemption pre-created
    const prePayment = db.select().from(payments).where(eq(payments.id, paymentId)).get();
    expect(prePayment!.status).toBe("pending");
    const preRedemption = db.select().from(couponRedemptions).where(eq(couponRedemptions.paymentId, paymentId)).get();
    expect(preRedemption).toBeTruthy();

    // ── Step 2: Flutterwave sandbox webhook after successful payment ──
    const webhook = await app.request("/api/payments/webhook/flutterwave", {
      method: "POST",
      headers: { "Content-Type": "application/json", "verif-hash": "test123" },
      body: JSON.stringify({
        event: "charge.completed",
        data: {
          id: 4567,
          tx_ref: reference,
          status: "successful",
          amount: 45000,
          currency: "NGN",
          flw_ref: "FLW-MOCK-REF-1",
          customer: { email: TEST_USER.email, name: TEST_USER.name },
          payment_type: "card",
        },
      }),
    });
    expect(webhook.status).toBe(200);
    const webhookBody = await webhook.json();
    expect(webhookBody.status).toBe("ok");

    // ── Step 3: assert everything landed ───────────────────────────
    // Payment completed
    const pay = db.select().from(payments).where(eq(payments.id, paymentId)).get();
    expect(pay!.status).toBe("completed");

    // Challenge created with the template/size config
    const ch = db.select().from(userChallenges).where(eq(userChallenges.paymentId, paymentId)).get();
    expect(ch).toBeTruthy();
    expect(ch!.status).toBe("active");
    expect(ch!.accountSize).toBe(10000);
    expect(ch!.amountPaid).toBe(45000);
    expect(ch!.profitTarget).toBe(10);
    expect(ch!.dailyDrawdown).toBe(5);
    expect(ch!.maxDrawdown).toBe(10);
    expect(ch!.templateId).toBe(template.id);
    expect(ch!.accountSizeId).toBe(size.id);

    // MT5 account created + linked to the challenge
    const mt5 = db.select().from(mt5Accounts).where(eq(mt5Accounts.userId, userId)).get();
    expect(mt5).toBeTruthy();
    expect(mt5!.login).toMatch(/^AFC/);
    expect(mt5!.balance).toBe(10000);
    expect(ch!.mt5AccountId).toBe(mt5!.id);

    // The challenge shows up in the user's list as active
    const { body: myChallenges } = await authGet(app, "/api/challenges/my", userCookie);
    const listed = (myChallenges as any).challenges.find((c: any) => c.id === ch!.id);
    expect(listed).toBeTruthy();
    expect(listed.status).toBe("active");

    // My Coupons shows the real discount
    const { body: myCoupons } = await authGet(app, "/api/coupons/my", userCookie);
    const red = (myCoupons as any).coupons.find((r: any) => r.code === "SAVE10K");
    expect(red).toBeTruthy();
    expect(red.discountAmount).toBe(5000);
    expect(red.originalAmount).toBe(50000);

    // Coupon usage counter incremented
    const couponAfter = db.select().from(coupons).where(eq(coupons.id, coupon.id)).get();
    expect(couponAfter!.currentUses).toBe(1);

    // User got a dashboard notification
    const notif = db.select().from(notifications).where(eq(notifications.userId, userId)).get();
    expect(notif).toBeTruthy();
  });

  it("is idempotent — a duplicate webhook does not create a second challenge or redemption", async () => {
    const db = getTestDb();
    const { payments, userChallenges, couponRedemptions } = await import("../schema");
    const { eq } = await import("drizzle-orm");

    // Re-run a purchase with a coupon to get a fresh payment + redemption
    const { template, size, coupon } = await seedCatalog(`SAVE${String(Date.now()).slice(-6)}`);
    const init = await authPost(app, "/api/payments/initiate", userCookie, {
      amount: 45000,
      originalAmount: 50000,
      currency: "NGN",
      templateId: String(template.id),
      accountSizeId: String(size.id),
      couponCode: coupon.code,
      description: "Two Step Challenge",
    });
    const reference = (init.body as any).reference as string;
    const paymentId = (init.body as any).paymentId as number;

    const webhookPayload = {
      event: "charge.completed",
      data: { id: 8888, tx_ref: reference, status: "successful", amount: 50000, currency: "NGN" },
    };
    const post = () =>
      app.request("/api/payments/webhook/flutterwave", {
        method: "POST",
        headers: { "Content-Type": "application/json", "verif-hash": "test123" },
        body: JSON.stringify(webhookPayload),
      });

    const first = await post();
    expect(first.status).toBe(200);

    // Duplicate delivery
    const second = await post();
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.status).toBe("already_processed");

    // Still exactly one challenge for this payment
    const chs = db.select().from(userChallenges).where(eq(userChallenges.paymentId, paymentId)).all();
    expect(chs.length).toBe(1);

    // Redemption not duplicated either
    const reds = db.select().from(couponRedemptions).where(eq(couponRedemptions.paymentId, paymentId)).all();
    expect(reds.length).toBe(1);
  });

  it("rejects a webhook with the wrong verif-hash", async () => {
    const res = await app.request("/api/payments/webhook/flutterwave", {
      method: "POST",
      headers: { "Content-Type": "application/json", "verif-hash": "wrong-hash" },
      body: JSON.stringify({ event: "charge.completed", data: { id: 1, tx_ref: "ANY-REF", status: "successful" } }),
    });
    expect(res.status).toBe(401);
  });
});
