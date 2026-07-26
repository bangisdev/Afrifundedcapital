/**
 * Wallets route tests — get wallet, transactions, withdrawals.
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
} from "./setup";

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
  it("returns empty array for new wallet", async () => {
    const { status, body } = await authGet(app, "/api/wallets/transactions", userCookie);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/wallets/transactions");
    expect(res.status).toBe(401);
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
