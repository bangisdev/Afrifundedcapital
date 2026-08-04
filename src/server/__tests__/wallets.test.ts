/**
 * Wallets route tests — get wallet, transactions, withdrawals.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Hono } from "hono";
import {
  ApiEnvelope,
  buildTestApp,
  cleanupTestDb,
  signUp,
  authGet,
  authPost,
  getTestDb,
} from "./setup";
import { walletTransactions } from "../schema";

let app: Hono;
let userCookie: string;

beforeAll(async () => {
  app = await buildTestApp();
  const { cookie } = await signUp(app, {
    name: "Wallet Trader",
    email: "wallet-trader@test.com",
    password: "Secure@123",
  });
  userCookie = cookie;
});

afterAll(() => {
  cleanupTestDb();
});

// ═══════════════════════════════════════════════════════════════
//  GET MY WALLET
// ═══════════════════════════════════════════════════════════════

describe("GET /api/wallets/my", () => {
  it("creates and returns a wallet for new user", async () => {
    const { status, body } = await authGet(app, "/api/wallets/my", userCookie);
    expect(status).toBe(200);
    const wallet = body as Record<string, unknown>;
    expect(wallet).toHaveProperty("id");
    expect(wallet.balance).toBe(0);
    expect(wallet.referralBalance).toBe(0);
    expect(wallet.bonusBalance).toBe(0);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/wallets/my");
    expect(res.status).toBe(401);
  });

  it("returns same wallet on second call (idempotent)", async () => {
    const { body: first } = await authGet(app, "/api/wallets/my", userCookie);
    const { body: second } = await authGet(app, "/api/wallets/my", userCookie);
    expect((first as Record<string, unknown>).id).toBe((second as Record<string, unknown>).id);
  });
});

// ═══════════════════════════════════════════════════════════════
//  WALLET TRANSACTIONS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/wallets/transactions", () => {
  it("returns empty envelope for new wallet", async () => {
    const { status, body } = await authGet(app, "/api/wallets/transactions", userCookie);
    expect(status).toBe(200);
    const env = body as ApiEnvelope;
    expect(Array.isArray(env.transactions)).toBe(true);
    expect(env.transactions.length).toBe(0);
    expect(env.total).toBe(0);
    expect(env.page).toBe(1);
    expect(env.pageSize).toBe(10);
    expect(env.totalPages).toBe(1);
    expect(env.stats.total).toBe(0);
    expect(env.stats.byType).toEqual({});
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/wallets/transactions");
    expect(res.status).toBe(401);
  });

  it("paginates transactions server-side", async () => {
    // Get the wallet + user id, then seed 15 transactions directly.
    const { body: walletBody } = await authGet(app, "/api/wallets/my", userCookie);
    const wallet = walletBody as ApiEnvelope;
    const db = getTestDb();
    const now = Date.now();
    for (let i = 1; i <= 15; i++) {
      db.insert(walletTransactions)
        .values({
          walletId: wallet.id,
          userId: wallet.userId,
          type: i % 2 === 0 ? "deposit" : "withdrawal",
          amount: 1000 * i,
          balanceBefore: 0,
          balanceAfter: 1000 * i,
          description: `Transaction ${i}`,
          createdAt: now - i * 1000,
        })
        .run();
    }

    const page1 = (await authGet(app, "/api/wallets/transactions?page=1&pageSize=10", userCookie))
      .body as ApiEnvelope;
    expect(page1.transactions.length).toBe(10);
    expect(page1.total).toBe(15);
    expect(page1.page).toBe(1);
    expect(page1.pageSize).toBe(10);
    expect(page1.totalPages).toBe(2);
    // Newest first (createdAt desc)
    expect(String(page1.transactions[0].description)).toBe("Transaction 1");

    const page2 = (await authGet(app, "/api/wallets/transactions?page=2&pageSize=10", userCookie))
      .body as ApiEnvelope;
    expect(page2.transactions.length).toBe(5);
    expect(page2.totalPages).toBe(2);
  });

  it("filters transactions by type", async () => {
    const { body } = await authGet(app, "/api/wallets/transactions?type=deposit&pageSize=50", userCookie);
    const env = body as ApiEnvelope;
    expect(env.transactions.length).toBeGreaterThan(0);
    expect(env.transactions.every((t: ApiEnvelope) => t.type === "deposit")).toBe(true);
    // Stats remain unfiltered
    expect(env.stats.total).toBe(15);
  });

  it("searches transactions by description", async () => {
    const { body } = await authGet(
      app,
      `/api/wallets/transactions?search=${encodeURIComponent("Transaction 1")}&pageSize=50`,
      userCookie,
    );
    const env = body as ApiEnvelope;
    expect(env.transactions.length).toBeGreaterThan(0);
    expect(env.transactions.every((t: ApiEnvelope) => String(t.description).includes("Transaction 1"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  WITHDRAWAL
// ═══════════════════════════════════════════════════════════════

describe("POST /api/wallets/withdraw", () => {
  it("returns 400 when balance is insufficient", async () => {
    const { status, body } = await authPost(app, "/api/wallets/withdraw", userCookie, {
      amount: 1000,
    });
    expect(status).toBe(400);
    expect((body as Record<string, unknown>).error).toMatch(/insufficient/i);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/wallets/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 100 }),
    });
    expect(res.status).toBe(401);
  });
});
