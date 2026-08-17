/**
 * Prometheus metrics tests — GET /api/metrics text exposition: format, DB-derived
 * gauges (MT5 queue, challenges, accounts, payments) and in-process counters
 * (HTTP requests, sync runs, payment webhooks). Also asserts no sensitive data
 * (emails, secret values) ever appears in the exposition.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Hono } from "hono";
import {
  buildTestApp,
  cleanupTestDb,
  signUp,
  signIn,
  authPost,
  getTestDb,
} from "./setup";
import {
  users,
  payments,
  userChallenges,
  mt5Accounts,
  challengeTemplates,
  accountSizes,
} from "../schema";
import { eq } from "drizzle-orm";
import { enqueueSyncJob } from "../lib/mt5/retry-queue";

let app: Hono;
let userCookie: string;
let userId: number;
// The metrics module instance the app chain uses — buildTestApp resets the
// module registry, so this dynamic import resolves to the same instance as
// the mounted /api/metrics route (in-process counters must be shared).
let metrics: typeof import("../lib/metrics");

const TEST_USER = { name: "Metrics Trader", email: "metrics-trader@test.com", password: "Secure@123" };

function metricValue(body: string, name: string, labels?: Record<string, string>): number | null {
  const labelStr = labels
    ? `{${Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(",")}}`
    : "";
  const prefix = `${name}${labelStr} `;
  for (const line of body.split("\n")) {
    if (line.startsWith(prefix)) {
      const v = parseFloat(line.slice(prefix.length));
      return Number.isFinite(v) ? v : null;
    }
  }
  return null;
}

async function scrape(): Promise<string> {
  const res = await app.request("/api/metrics");
  expect(res.status).toBe(200);
  return res.text();
}

beforeAll(async () => {
  process.env.FLW_SECRET_HASH = "metrics-test-hash";
  app = await buildTestApp();
  metrics = await import("../lib/metrics");

  const { cookie } = await signUp(app, TEST_USER);
  userCookie = cookie;
  const db = getTestDb();
  const user = db.select().from(users).where(eq(users.email, TEST_USER.email)).get();
  userId = user!.id;
});

afterAll(() => {
  delete process.env.FLW_SECRET_HASH;
  cleanupTestDb();
});

beforeEach(() => {
  metrics.resetMetrics();
});

describe("GET /api/metrics", () => {
  it("serves Prometheus text format with core families", async () => {
    const res = await app.request("/api/metrics");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");

    // The scrape response reflects requests that completed BEFORE it — fire one
    // so the HTTP counter family is non-empty.
    await app.request("/api/health");
    const body = await scrape();
    expect(body).toContain("# TYPE afc_up gauge");
    expect(body).toMatch(/^afc_up 1$/m);
    expect(body).toContain("afc_process_uptime_seconds");
    expect(body).toContain("afc_process_memory_bytes");
    expect(body).toContain("afc_mt5_queue_depth{status=\"pending\"}");
    expect(body).toContain("afc_mt5_sync_runs_total");
    expect(body).toContain("afc_http_requests_total");
    expect(body).toContain("afc_users_total");
  });

  it("reflects MT5 queue, challenge, and account gauges from the DB", async () => {
    const db = getTestDb();
    const now = Date.now();

    const tpl = db.insert(challengeTemplates).values({
      name: "Metrics Template",
      type: "one_step",
      profitTarget: 10,
      dailyDrawdown: 5,
      maxDrawdown: 10,
      maxLeverage: 100,
      minTradingDays: 1,
      price: 1000,
      durationDays: 30,
      currency: "NGN",
      isActive: true,
      createdBy: 0,
      createdAt: now,
      updatedAt: now,
    }).returning().get();

    const size = db.insert(accountSizes).values({
      label: "$10,000",
      size: 10000,
      templateId: tpl.id,
      price: 1000,
      sortOrder: 0,
      isActive: true,
    }).returning().get();

    const acct = db.insert(mt5Accounts).values({
      userId,
      login: "AFC777111",
      password: "x",
      investorPassword: "x",
      balance: 10000,
      equity: 10000,
      createdAt: now,
    }).returning().get();
    db.insert(mt5Accounts).values({
      userId,
      login: "AFC777222",
      password: "x",
      investorPassword: "x",
      balance: 0,
      equity: 0,
      isSuspended: true,
      createdAt: now,
    }).run();

    db.insert(userChallenges).values({
      userId,
      templateId: tpl.id,
      accountSizeId: size.id,
      status: "active",
      accountSize: 10000,
      currency: "NGN",
      profitTarget: 10,
      dailyDrawdown: 5,
      maxDrawdown: 10,
      maxLeverage: 100,
      minTradingDays: 1,
      amountPaid: 1000,
      currentPhase: 1,
      mt5AccountId: acct.id,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    }).run();
    enqueueSyncJob(db, { mt5AccountId: acct.id, action: "sync" });

    const body = await scrape();
    expect(metricValue(body, "afc_mt5_queue_depth", { status: "pending" })).toBe(1);
    expect(metricValue(body, "afc_mt5_queue_total")).toBe(1);
    expect(metricValue(body, "afc_challenges_active")).toBe(1);
    expect(metricValue(body, "afc_mt5_accounts", { status: "active" })).toBe(1);
    expect(metricValue(body, "afc_mt5_accounts", { status: "suspended" })).toBe(1);
    expect(metricValue(body, "afc_mt5_gateway_configured")).toBe(0);
    expect(metricValue(body, "afc_mt5_provider_mode", { mode: "simulated" })).toBe(1);
    // The active account has never synced → stale.
    expect(metricValue(body, "afc_mt5_stale_accounts")).toBe(1);
  });

  it("reflects payment counts and sums by status", async () => {
    const db = getTestDb();
    const now = Date.now();
    db.insert(payments).values({
      userId,
      amount: 5000,
      currency: "NGN",
      provider: "flutterwave",
      status: "completed",
      reference: "metrics-ref-completed",
      createdAt: now,
    }).run();
    db.insert(payments).values({
      userId,
      amount: 3000,
      currency: "NGN",
      provider: "paystack",
      status: "pending",
      reference: "metrics-ref-pending",
      createdAt: now,
    }).run();

    const body = await scrape();
    expect(metricValue(body, "afc_payments_total", { status: "completed" })).toBe(1);
    expect(metricValue(body, "afc_payments_total", { status: "pending" })).toBe(1);
    expect(metricValue(body, "afc_payments_amount_total", { status: "completed" })).toBe(5000);
    expect(metricValue(body, "afc_payments_amount_total", { status: "pending" })).toBe(3000);
  });

  it("counts HTTP requests with method, route, and status labels", async () => {
    await app.request("/api/health");
    await app.request("/api/health");

    const body = await scrape();
    const count = metricValue(body, "afc_http_requests_total", {
      method: "GET",
      route: "/api/health",
      status: "200",
    });
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("counts payment webhooks received by provider and event", async () => {
    const db = getTestDb();
    const now = Date.now();
    db.insert(payments).values({
      userId,
      amount: 5000,
      currency: "NGN",
      provider: "flutterwave",
      status: "pending",
      reference: "metrics-ref-webhook",
      createdAt: now,
    }).run();

    const res = await app.request("/api/payments/webhook/flutterwave", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "verif-hash": "metrics-test-hash",
      },
      body: JSON.stringify({
        event: "charge.completed",
        data: { id: 123456, tx_ref: "metrics-ref-webhook", status: "successful", amount: 5000, currency: "NGN" },
      }),
    });
    expect(res.status).toBe(200);

    const body = await scrape();
    expect(
      metricValue(body, "afc_payment_webhooks_total", { provider: "flutterwave", event: "charge.completed" }),
    ).toBe(1);
  });

  it("records MT5 sync runs through the real sync endpoint", async () => {
    const db = getTestDb();
    const now = Date.now();
    const tpl = db.insert(challengeTemplates).values({
      name: "Sync Metrics Template",
      type: "one_step",
      profitTarget: 10,
      dailyDrawdown: 5,
      maxDrawdown: 10,
      maxLeverage: 100,
      minTradingDays: 1,
      price: 1000,
      durationDays: 30,
      currency: "NGN",
      isActive: true,
      createdBy: 0,
      createdAt: now,
      updatedAt: now,
    }).returning().get();
    const size = db.insert(accountSizes).values({
      label: "$10,000",
      size: 10000,
      templateId: tpl.id,
      price: 1000,
      sortOrder: 0,
      isActive: true,
    }).returning().get();
    const acct = db.insert(mt5Accounts).values({
      userId,
      login: "AFC777333",
      password: "x",
      investorPassword: "x",
      balance: 10000,
      equity: 10000,
      createdAt: now,
    }).returning().get();
    db.insert(userChallenges).values({
      userId,
      templateId: tpl.id,
      accountSizeId: size.id,
      status: "active",
      accountSize: 10000,
      currency: "NGN",
      profitTarget: 10,
      dailyDrawdown: 5,
      maxDrawdown: 10,
      maxLeverage: 100,
      minTradingDays: 1,
      amountPaid: 1000,
      currentPhase: 1,
      mt5AccountId: acct.id,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    }).run();

    const res = await authPost(app, "/api/trading/sync", userCookie, {});
    const payload = res.body as { synced?: number };
    expect(payload.synced).toBeGreaterThanOrEqual(1);

    const body = await scrape();
    expect(metricValue(body, "afc_mt5_sync_runs_total", { outcome: "synced" })).toBeGreaterThanOrEqual(1);
    // The last-duration gauge is populated by the real sync above.
    expect(metricValue(body, "afc_mt5_sync_last_duration_seconds")).not.toBeNull();
  });

  it("never exposes sensitive data (emails, secrets, passwords)", async () => {
    const body = await scrape();
    expect(body).not.toContain(TEST_USER.email);
    expect(body).not.toMatch(/re_[A-Za-z0-9]{20,}/);
    expect(body).not.toMatch(/FLWSECK/);
    expect(body).not.toMatch(/sk_live_|sk_test_/);
  });
});
