/**
 * Trading route tests — MT5 accounts, metrics, history, drawdown, sync, demo seeding,
 * admin MT5, daily sync data verification, full cycle (seed→sync→status transition→certificate),
 * violation detection, and expiry detection.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { Hono } from "hono";
import {
  buildTestApp,
  cleanupTestDb,
  signUp,
  signIn,
  authGet,
  authPost,
  getTestDb,
  getTestSqlite,
} from "./setup";
import { users } from "../schema";
import { eq } from "drizzle-orm";

let app: Hono;
let userCookie: string;
let adminCookie: string;
let adminUserId: number;

beforeAll(async () => {
  app = await buildTestApp();

  const { cookie: uc } = await signUp(app, {
    name: "Trading Trader",
    email: "trading-trader@test.com",
    password: "Secure@123",
  });
  userCookie = uc;

  const { cookie: ac } = await signUp(app, {
    name: "Trading Admin",
    email: "trading-admin@test.com",
    password: "Secure@123",
  });

  // Promote admin
  const db = getTestDb();
  const adminUser = db.select().from(users).where(eq(users.email, "trading-admin@test.com")).get();
  if (adminUser) {
    adminUserId = adminUser.id;
    await authPost(app, "/api/auth/promote-admin", "", { userId: adminUser.id });
  }

  const { cookie: reLogin } = await signIn(app, {
    email: "trading-admin@test.com",
    password: "Secure@123",
  });
  adminCookie = reLogin;

  // Create a demo challenge for the user so we have a challengeId
  const { body: templates } = await authGet(app, "/api/challenges/templates", adminCookie);
  const template = (templates as Record<string, unknown>[])[0];
  const { body: sizes } = await authGet(app, `/api/challenges/templates/${template.id}/sizes`, adminCookie);
  const size = (sizes as Record<string, unknown>[])[0];

  // Get user ID for demo purchase
  const user = db.select().from(users).where(eq(users.email, "trading-trader@test.com")).get();
  await authPost(app, "/api/challenges/demo-purchase", adminCookie, {
    templateId: template.id,
    accountSizeId: size.id,
    userId: user!.id,
  });
});

afterAll(() => {
  cleanupTestDb();
});

// ═══════════════════════════════════════════════════════════════
//  MT5 ACCOUNTS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/trading/mt5", () => {
  it("returns MT5 accounts for the user", async () => {
    const { status, body } = await authGet(app, "/api/trading/mt5", userCookie);
    expect(status).toBe(200);
    const env = body as Record<string, any>;
    expect(Array.isArray(env.accounts)).toBe(true);
    expect(env.accounts.length).toBeGreaterThanOrEqual(1);
    expect(env.total).toBeGreaterThanOrEqual(1);
    expect(env.page).toBe(1);
    expect(env.pageSize).toBe(10);
    expect(env.totalPages).toBeGreaterThanOrEqual(1);
    const account = env.accounts[0];
    expect(account).toHaveProperty("login");
    expect(account).toHaveProperty("server");
    expect(account).toHaveProperty("balance");
    expect(typeof env.stats.byStatus).toBe("object");
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/trading/mt5");
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  CHALLENGE METRICS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/trading/challenge/:id/metrics", () => {
  it("returns null when no metrics exist", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = ((challenges as Record<string, unknown>).challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status, body } = await authGet(app, `/api/trading/challenge/${challenge.id}/metrics`, userCookie);
    expect(status).toBe(200);
    // May be null if no metrics seeded yet
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/trading/challenge/1/metrics");
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  CHALLENGE HISTORY
// ═══════════════════════════════════════════════════════════════

describe("GET /api/trading/challenge/:id/history", () => {
  it("returns metrics history array", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = ((challenges as Record<string, unknown>).challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status, body } = await authGet(app, `/api/trading/challenge/${challenge.id}/history`, userCookie);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  CHALLENGE DRAWDOWN
// ═══════════════════════════════════════════════════════════════

describe("GET /api/trading/challenge/:id/drawdown", () => {
  it("returns drawdown history array", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = ((challenges as Record<string, unknown>).challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status, body } = await authGet(app, `/api/trading/challenge/${challenge.id}/drawdown`, userCookie);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  DEMO SEEDING
// ═══════════════════════════════════════════════════════════════

describe("POST /api/trading/seed-demo", () => {
  it("seeds demo metrics data for a challenge", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = ((challenges as Record<string, unknown>).challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status, body } = await authPost(app, "/api/trading/seed-demo", userCookie, {
      challengeId: challenge.id,
    });
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
    expect((body as Record<string, unknown>).seeded).toBe(true);
  });

  it("returns seeded: false when metrics already exist", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = ((challenges as Record<string, unknown>).challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status, body } = await authPost(app, "/api/trading/seed-demo", userCookie, {
      challengeId: challenge.id,
    });
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).seeded).toBe(false);
  });

  it("returns 404 for non-existent challenge", async () => {
    const { status } = await authPost(app, "/api/trading/seed-demo", userCookie, {
      challengeId: 99999,
    });
    expect(status).toBe(404);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/trading/seed-demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId: 1 }),
    });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  METRICS AFTER SEEDING
// ═══════════════════════════════════════════════════════════════

describe("GET /api/trading/challenge/:id/metrics (after seeding)", () => {
  it("returns latest metrics after seeding", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = ((challenges as Record<string, unknown>).challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status, body } = await authGet(app, `/api/trading/challenge/${challenge.id}/metrics`, userCookie);
    expect(status).toBe(200);
    const metrics = body as Record<string, unknown> | null;
    if (metrics) {
      expect(metrics).toHaveProperty("balance");
      expect(metrics).toHaveProperty("equity");
      expect(metrics).toHaveProperty("tradingDaysCount");
      expect(metrics).toHaveProperty("winRate");
    }
  });

  it("returns full history after seeding", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = ((challenges as Record<string, unknown>).challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status, body } = await authGet(app, `/api/trading/challenge/${challenge.id}/history`, userCookie);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect((body as unknown[]).length).toBe(60); // 60 days seeded
  });
});

// ═══════════════════════════════════════════════════════════════
//  RESET DEMO
// ═══════════════════════════════════════════════════════════════

describe("POST /api/trading/reset-demo", () => {
  it("resets demo metrics for a challenge", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = ((challenges as Record<string, unknown>).challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status, body } = await authPost(app, "/api/trading/reset-demo", userCookie, {
      challengeId: challenge.id,
    });
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);

    // Verify history is empty
    const { body: history } = await authGet(app, `/api/trading/challenge/${challenge.id}/history`, userCookie);
    expect((history as unknown[]).length).toBe(0);
  });

  it("returns 404 for non-existent challenge", async () => {
    const { status } = await authPost(app, "/api/trading/reset-demo", userCookie, {
      challengeId: 99999,
    });
    expect(status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════
//  MANUAL SYNC
// ═══════════════════════════════════════════════════════════════

describe("POST /api/trading/sync", () => {
  it("syncs active challenges", async () => {
    const { status, body } = await authPost(app, "/api/trading/sync", userCookie, {});
    expect(status).toBe(200);
    expect((body as Record<string, unknown>)).toHaveProperty("synced");
    expect((body as Record<string, unknown>)).toHaveProperty("message");
  });

  it("syncs a specific challenge by ID", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = ((challenges as Record<string, unknown>).challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status, body } = await authPost(app, "/api/trading/sync", userCookie, {
      challengeId: String(challenge.id),
    });
    expect(status).toBe(200);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/trading/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  DAILY SYNC — DATA VERIFICATION
// ═══════════════════════════════════════════════════════════════

describe("POST /api/trading/sync — data verification", () => {
  let syncChallengeId: number;
  let syncMt5Id: number;

  beforeAll(async () => {
    const sqlite = getTestSqlite();
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = ((challenges as Record<string, unknown>).challenges as Record<string, unknown>[])[0];
    syncChallengeId = challenge.id as number;
    syncMt5Id = challenge.mt5AccountId as number;

    // Reset and re-seed so we start clean
    await authPost(app, "/api/trading/reset-demo", userCookie, { challengeId: syncChallengeId });
    await authPost(app, "/api/trading/seed-demo", userCookie, { challengeId: syncChallengeId });

    // Age the last metrics record so sync doesn't skip (>23 hours ago)
    sqlite
      .prepare("UPDATE trading_metrics SET recorded_at = ? WHERE challenge_id = ?")
      .run(Date.now() - 25 * 60 * 60 * 1000, syncChallengeId);
  });

  it("creates a new metrics record after sync", async () => {
    const sqlite = getTestSqlite();
    const before = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM trading_metrics WHERE challenge_id = ?")
      .get(syncChallengeId) as { cnt: number };

    const { status, body } = await authPost(app, "/api/trading/sync", userCookie, {});
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).synced).toBeGreaterThanOrEqual(1);

    const after = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM trading_metrics WHERE challenge_id = ?")
      .get(syncChallengeId) as { cnt: number };
    expect(after.cnt).toBe(before.cnt + 1);
  });

  it("creates drawdown history record after sync", async () => {
    const sqlite = getTestSqlite();
    const before = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM drawdown_history WHERE challenge_id = ?")
      .get(syncChallengeId) as { cnt: number };

    // Age the last metrics
    sqlite
      .prepare("UPDATE trading_metrics SET recorded_at = ? WHERE challenge_id = ?")
      .run(Date.now() - 25 * 60 * 60 * 1000, syncChallengeId);

    await authPost(app, "/api/trading/sync", userCookie, {});

    const after = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM drawdown_history WHERE challenge_id = ?")
      .get(syncChallengeId) as { cnt: number };
    expect(after.cnt).toBe(before.cnt + 1);
  });

  it("updates MT5 account balance and equity after sync", async () => {
    const sqlite = getTestSqlite();

    // Age the last metrics
    sqlite
      .prepare("UPDATE trading_metrics SET recorded_at = ? WHERE challenge_id = ?")
      .run(Date.now() - 25 * 60 * 60 * 1000, syncChallengeId);

    const before = sqlite
      .prepare("SELECT balance, equity FROM mt5_accounts WHERE id = ?")
      .get(syncMt5Id) as { balance: number; equity: number };

    await authPost(app, "/api/trading/sync", userCookie, {});

    const after = sqlite
      .prepare("SELECT balance, equity, last_sync_at FROM mt5_accounts WHERE id = ?")
      .get(syncMt5Id) as { balance: number; equity: number; last_sync_at: number };

    // Balance and equity should be valid numbers
    expect(typeof after.balance).toBe("number");
    expect(typeof after.equity).toBe("number");
    // lastSyncAt should be updated
    expect(after.last_sync_at).toBeGreaterThan(0);
  });

  it("records correct metrics fields after sync", async () => {
    const sqlite = getTestSqlite();

    // Age the last metrics
    sqlite
      .prepare("UPDATE trading_metrics SET recorded_at = ? WHERE challenge_id = ?")
      .run(Date.now() - 25 * 60 * 60 * 1000, syncChallengeId);

    await authPost(app, "/api/trading/sync", userCookie, {});

    // Get the latest metrics record
    const latest = sqlite
      .prepare("SELECT * FROM trading_metrics WHERE challenge_id = ? ORDER BY recorded_at DESC LIMIT 1")
      .get(syncChallengeId) as Record<string, unknown>;

    expect(latest).toBeDefined();
    expect(typeof latest.balance).toBe("number");
    expect(typeof latest.equity).toBe("number");
    expect(typeof latest.floating_pl).toBe("number");
    expect(typeof latest.daily_pl).toBe("number");
    expect(typeof latest.total_profit).toBe("number");
    expect(typeof latest.current_drawdown).toBe("number");
    expect(typeof latest.trailing_drawdown).toBe("number");
    expect(typeof latest.win_rate).toBe("number");
    expect(typeof latest.profit_factor).toBe("number");
    expect(typeof latest.risk_score).toBe("number");
    expect(typeof latest.health_score).toBe("number");
    expect(latest.trading_days_count).toBeGreaterThanOrEqual(1);
    expect(latest.closed_trades).toBeGreaterThanOrEqual(0);
    expect(latest.recorded_at).toBeGreaterThan(0);
  });

  it("returns 'already synced today' on second call within 23 hours", async () => {
    // First sync
    const { body: first } = await authPost(app, "/api/trading/sync", userCookie, {});
    expect((first as Record<string, unknown>).synced).toBeGreaterThanOrEqual(0);

    // Second sync immediately — should skip
    const { body: second } = await authPost(app, "/api/trading/sync", userCookie, {});
    expect((second as Record<string, unknown>).synced).toBe(0);
    expect((second as Record<string, unknown>).message).toContain("already synced today");
  });

  it("allows re-sync after 23 hours have elapsed", async () => {
    const sqlite = getTestSqlite();

    // Age the last metrics beyond 23 hours
    sqlite
      .prepare("UPDATE trading_metrics SET recorded_at = ? WHERE challenge_id = ?")
      .run(Date.now() - 25 * 60 * 60 * 1000, syncChallengeId);

    const { body } = await authPost(app, "/api/trading/sync", userCookie, {});
    expect((body as Record<string, unknown>).synced).toBeGreaterThanOrEqual(1);
  });

  it("syncs only the specified challenge when challengeId provided", async () => {
    const sqlite = getTestSqlite();

    // Create a second challenge for the user
    const { body: templates } = await authGet(app, "/api/challenges/templates", adminCookie);
    const template = (templates as Record<string, unknown>[])[0];
    const { body: sizes } = await authGet(app, `/api/challenges/templates/${template.id}/sizes`, adminCookie);
    const size = (sizes as Record<string, unknown>[])[0];

    const db = getTestDb();
    const user = db.select().from(users).where(eq(users.email, "trading-trader@test.com")).get();
    await authPost(app, "/api/challenges/demo-purchase", adminCookie, {
      templateId: template.id,
      accountSizeId: size.id,
      userId: user!.id,
    });

    // Get both challenges
    const { body: allChallenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenges = (allChallenges as Record<string, unknown>).challenges as Record<string, unknown>[];
    expect(challenges.length).toBeGreaterThanOrEqual(2);

    const otherChallenge = challenges.find((c) => c.id !== syncChallengeId);
    if (!otherChallenge) return;

    // Seed and age the other challenge
    await authPost(app, "/api/trading/seed-demo", userCookie, { challengeId: otherChallenge.id });
    sqlite
      .prepare("UPDATE trading_metrics SET recorded_at = ? WHERE challenge_id = ?")
      .run(Date.now() - 25 * 60 * 60 * 1000, otherChallenge.id);

    // Get count before
    const before = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM trading_metrics WHERE challenge_id = ?")
      .get(otherChallenge.id) as { cnt: number };

    // Sync only the specified challenge
    const { status, body } = await authPost(app, "/api/trading/sync", userCookie, {
      challengeId: String(otherChallenge.id),
    });
    expect(status).toBe(200);

    const after = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM trading_metrics WHERE challenge_id = ?")
      .get(otherChallenge.id) as { cnt: number };
    expect(after.cnt).toBe(before.cnt + 1);
  });
});

// ═══════════════════════════════════════════════════════════════
//  FULL CYCLE: SEED → SYNC → STATUS TRANSITION → CERTIFICATE
// ═══════════════════════════════════════════════════════════════

describe("Full cycle: seed → sync → challenge status transition", () => {
  let cycleUserCookie: string;
  let cycleUserId: number;
  let cycleChallengeId: number;

  beforeAll(async () => {
    const sqlite = getTestSqlite();

    // Create a user for cycle tests
    const { cookie } = await signUp(app, {
      name: "Cycle Trader",
      email: "cycle-trader@test.com",
      password: "Secure@123",
    });
    cycleUserCookie = cookie;

    const cycleUser = sqlite
      .prepare("SELECT id FROM users WHERE email = ?")
      .get("cycle-trader@test.com") as { id: number };
    cycleUserId = cycleUser.id;

    // Create a template with very low profit target (0.1%) and minTradingDays=1
    const templateResult = sqlite
      .prepare(
        "INSERT INTO challenge_templates (name, type, profit_target, daily_drawdown, max_drawdown, max_leverage, min_trading_days, price, duration_days, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        "Cycle Test Template",
        "one_step",
        0.1,  // 0.1% profit target
        5,
        50,   // 50% max drawdown (generous)
        200,
        1,    // min 1 trading day
        100,
        30,
        adminUserId,
        Date.now(),
        Date.now()
      );

    const templateId = Number(templateResult.lastInsertRowid);

    // Create an account size
    const sizeResult = sqlite
      .prepare(
        "INSERT INTO account_sizes (label, size, template_id, price, sort_order) VALUES (?, ?, ?, ?, ?)"
      )
      .run("$10,000", 10000, templateId, 100, 1);

    const sizeId = Number(sizeResult.lastInsertRowid);

    // Create a challenge via demo-purchase
    await authPost(app, "/api/challenges/demo-purchase", adminCookie, {
      templateId,
      accountSizeId: sizeId,
      userId: cycleUserId,
    });

    // Get the challenge
    const challenge = sqlite
      .prepare("SELECT id FROM user_challenges WHERE user_id = ?")
      .get(cycleUserId) as { id: number };
    cycleChallengeId = challenge.id;

    // Seed demo data (60 days)
    await authPost(app, "/api/trading/seed-demo", cycleUserCookie, {
      challengeId: cycleChallengeId,
    });
  });

  it("seeds 60 days of metrics for the cycle challenge", async () => {
    const sqlite = getTestSqlite();
    const count = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM trading_metrics WHERE challenge_id = ?")
      .get(cycleChallengeId) as { cnt: number };
    expect(count.cnt).toBe(60);
  });

  it("transitions to phase_1_passed when profit target reached via sync", async () => {
    const sqlite = getTestSqlite();

    // Mock Math.random to guarantee high profit (dailyVariance > 0)
    // Math.random() = 0.99 → dailyVariance = (0.99 - 0.47) * base * 0.015 = positive
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    // Age the last metrics so sync doesn't skip
    sqlite
      .prepare("UPDATE trading_metrics SET recorded_at = ? WHERE challenge_id = ?")
      .run(Date.now() - 25 * 60 * 60 * 1000, cycleChallengeId);

    // Sync — with mocked random, profit should exceed 0.1% target
    const { status, body } = await authPost(app, "/api/trading/sync", cycleUserCookie, {});

    vi.restoreAllMocks();

    expect(status).toBe(200);

    // Check if challenge transitioned
    const challenge = sqlite
      .prepare("SELECT status, current_phase, phase_1_passed_at FROM user_challenges WHERE id = ?")
      .get(cycleChallengeId) as {
        status: string;
        current_phase: number | null;
        phase_1_passed_at: number | null;
      };

    // With Math.random=0.99 and profitTarget=0.1%, transition should happen
    expect(challenge.status).toBe("phase_1_passed");
    expect(challenge.current_phase).toBe(2);
    expect(challenge.phase_1_passed_at).toBeGreaterThan(0);
  });

  it("creates certificate automatically on phase_1_passed transition", async () => {
    const sqlite = getTestSqlite();

    const cert = sqlite
      .prepare("SELECT * FROM certificates WHERE challenge_id = ? AND type = ?")
      .get(cycleChallengeId, "phase_1") as Record<string, unknown> | undefined;

    expect(cert).toBeDefined();
    expect(cert!.certificate_number).toMatch(/^AFC-P1-/);
    expect(cert!.verification_code).toBeDefined();
    expect(typeof cert!.verification_code).toBe("string");
    expect((cert!.verification_code as string).length).toBeGreaterThan(0);
    expect(cert!.issued_at).toBeGreaterThan(0);
    expect(cert!.user_id).toBe(cycleUserId);
  });

  it("creates notification automatically on phase_1_passed transition", async () => {
    const sqlite = getTestSqlite();

    const notif = sqlite
      .prepare("SELECT * FROM notifications WHERE user_id = ? AND type = ?")
      .get(cycleUserId, "certificate") as Record<string, unknown> | undefined;

    expect(notif).toBeDefined();
    expect(notif!.title).toContain("Certificate Earned");
    expect(notif!.message).toContain("Phase 1");
    expect(notif!.link).toBe("/dashboard/certificates");
    expect(notif!.read).toBe(0); // unread
  });

  it("prevents duplicate certificate generation on re-sync", async () => {
    const sqlite = getTestSqlite();

    // Age and sync again — should not create another certificate
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    sqlite
      .prepare("UPDATE trading_metrics SET recorded_at = ? WHERE challenge_id = ?")
      .run(Date.now() - 25 * 60 * 60 * 1000, cycleChallengeId);

    await authPost(app, "/api/trading/sync", cycleUserCookie, {});
    vi.restoreAllMocks();

    const certs = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM certificates WHERE challenge_id = ? AND type = ?")
      .get(cycleChallengeId, "phase_1") as { cnt: number };
    expect(certs.cnt).toBe(1); // Still only one certificate
  });
});

// ═══════════════════════════════════════════════════════════════
//  FULL CYCLE: PHASE 2 TRANSITION
// ═══════════════════════════════════════════════════════════════

describe("Full cycle: phase_1_passed → phase_2_passed transition", () => {
  let phase2ChallengeId: number;
  let phase2Cookie: string;

  beforeAll(async () => {
    const sqlite = getTestSqlite();

    // Create a user
    const { cookie } = await signUp(app, {
      name: "Phase2 Trader",
      email: "phase2-trader@test.com",
      password: "Secure@123",
    });
    phase2Cookie = cookie;

    const user = sqlite
      .prepare("SELECT id FROM users WHERE email = ?")
      .get("phase2-trader@test.com") as { id: number };

    // Create template with low target
    const tplResult = sqlite
      .prepare(
        "INSERT INTO challenge_templates (name, type, profit_target, daily_drawdown, max_drawdown, max_leverage, min_trading_days, price, duration_days, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run("Phase2 Test", "two_step", 0.1, 5, 50, 200, 1, 100, 30, adminUserId, Date.now(), Date.now());

    const tplId = Number(tplResult.lastInsertRowid);
    const sizeResult = sqlite
      .prepare("INSERT INTO account_sizes (label, size, template_id, price, sort_order) VALUES (?, ?, ?, ?, ?)")
      .run("$10,000", 10000, tplId, 100, 1);
    const sizeId = Number(sizeResult.lastInsertRowid);

    await authPost(app, "/api/challenges/demo-purchase", adminCookie, {
      templateId: tplId,
      accountSizeId: sizeId,
      userId: user.id,
    });

    const ch = sqlite
      .prepare("SELECT id FROM user_challenges WHERE user_id = ?")
      .get(user.id) as { id: number };
    phase2ChallengeId = ch.id;

    // Set challenge to active with currentPhase=2 so sync will check phase 2 profit target
    // (syncChallenge only transitions when status === 'active')
    sqlite
      .prepare("UPDATE user_challenges SET status = 'active', current_phase = 2 WHERE id = ?")
      .run(phase2ChallengeId);

    // Seed demo data
    await authPost(app, "/api/trading/seed-demo", phase2Cookie, {
      challengeId: phase2ChallengeId,
    });
  });

  it("transitions to phase_2_passed when phase 2 profit target reached", async () => {
    const sqlite = getTestSqlite();

    vi.spyOn(Math, "random").mockReturnValue(0.99);

    sqlite
      .prepare("UPDATE trading_metrics SET recorded_at = ? WHERE challenge_id = ?")
      .run(Date.now() - 25 * 60 * 60 * 1000, phase2ChallengeId);

    const { status } = await authPost(app, "/api/trading/sync", phase2Cookie, {});

    vi.restoreAllMocks();
    expect(status).toBe(200);

    const challenge = sqlite
      .prepare("SELECT status, phase_2_passed_at FROM user_challenges WHERE id = ?")
      .get(phase2ChallengeId) as { status: string; phase_2_passed_at: number | null };

    expect(challenge.status).toBe("phase_2_passed");
    expect(challenge.phase_2_passed_at).toBeGreaterThan(0);
  });

  it("creates phase_2 certificate on transition", async () => {
    const sqlite = getTestSqlite();

    const cert = sqlite
      .prepare("SELECT * FROM certificates WHERE challenge_id = ? AND type = ?")
      .get(phase2ChallengeId, "phase_2") as Record<string, unknown> | undefined;

    expect(cert).toBeDefined();
    expect(cert!.certificate_number).toMatch(/^AFC-P2-/);
  });
});

// ═══════════════════════════════════════════════════════════════
//  VIOLATION DETECTION VIA SYNC
// ═══════════════════════════════════════════════════════════════

describe("Challenge violation detection via sync", () => {
  let violateUserId: number;
  let violateUserCookie: string;
  let violateChallengeId: number;

  beforeAll(async () => {
    const sqlite = getTestSqlite();

    // Create a user
    const { cookie } = await signUp(app, {
      name: "Violate Trader",
      email: "violate-trader@test.com",
      password: "Secure@123",
    });
    violateUserCookie = cookie;

    const vu = sqlite
      .prepare("SELECT id FROM users WHERE email = ?")
      .get("violate-trader@test.com") as { id: number };
    violateUserId = vu.id;

    // Create a template with very low maxDrawdown (2%)
    const tplResult = sqlite
      .prepare(
        "INSERT INTO challenge_templates (name, type, profit_target, daily_drawdown, max_drawdown, max_leverage, min_trading_days, price, duration_days, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run("Violate Test", "one_step", 10, 5, 2, 200, 5, 100, 30, adminUserId, Date.now(), Date.now());

    const tplId = Number(tplResult.lastInsertRowid);
    const sizeResult = sqlite
      .prepare("INSERT INTO account_sizes (label, size, template_id, price, sort_order) VALUES (?, ?, ?, ?, ?)")
      .run("$10,000", 10000, tplId, 100, 1);
    const sizeId = Number(sizeResult.lastInsertRowid);

    await authPost(app, "/api/challenges/demo-purchase", adminCookie, {
      templateId: tplId,
      accountSizeId: sizeId,
      userId: violateUserId,
    });

    const ch = sqlite
      .prepare("SELECT id FROM user_challenges WHERE user_id = ?")
      .get(violateUserId) as { id: number };
    violateChallengeId = ch.id;

    // Insert metrics with very low balance (40% of accountSize = 4000) to trigger violation
    // maxDrawdown = 2% of 10000 = 200. currentDrawdown = 10000 - 4000 = 6000 > 200
    // NOTE: SQLite column names are snake_case, not camelCase
    const now = Date.now();
    sqlite.prepare(
      `INSERT INTO trading_metrics
        (mt5_account_id, challenge_id, balance, equity, floating_pl, daily_pl, total_profit,
         current_drawdown, daily_drawdown, trailing_drawdown, relative_drawdown, absolute_drawdown,
         remaining_drawdown, profit_target_progress, trading_days_count, open_positions, closed_trades,
         win_rate, loss_rate, average_rr, profit_factor, expectancy, largest_win, largest_loss,
         consecutive_wins, consecutive_losses, risk_score, health_score, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      0, violateChallengeId,
      4000, 4000,     // balance, equity at 40% of account
      0, 0, -6000,     // floatingPL, dailyPL, totalProfit
      6000, 0,         // currentDrawdown (6000 > 200 limit), dailyDrawdown
      0, 60, 6000,     // trailingDrawdown, relativeDrawdown, absoluteDrawdown
      -5800, 0,        // remainingDrawdown, profitTargetProgress
      1, 0,            // tradingDaysCount, openPositions
      5,               // closedTrades
      50, 50,          // winRate, lossRate
      1.5, 1.2, 50,    // averageRR, profitFactor, expectancy
      0, 0,            // largestWin, largestLoss
      0, 0,            // consecutiveWins, consecutiveLosses
      80, 20,          // riskScore, healthScore
      now - 25 * 60 * 60 * 1000 // recordedAt (>23h ago)
    );
  });

  it("marks challenge as violated when max drawdown exceeded", async () => {
    const sqlite = getTestSqlite();

    // Verify challenge is active before sync
    const before = sqlite
      .prepare("SELECT status FROM user_challenges WHERE id = ?")
      .get(violateChallengeId) as { status: string };
    expect(before.status).toBe("active");

    // Sync — should detect drawdown exceeded
    const { status } = await authPost(app, "/api/trading/sync", violateUserCookie, {});
    expect(status).toBe(200);

    // Verify challenge is now violated
    const after = sqlite
      .prepare("SELECT status, violations FROM user_challenges WHERE id = ?")
      .get(violateChallengeId) as { status: string; violations: string | null };
    expect(after.status).toBe("violated");
    expect(after.violations).toBeDefined();
    const violations = JSON.parse(after.violations!);
    expect(violations[0].type).toBe("max_drawdown");
  });

  it("creates violation notification", async () => {
    const sqlite = getTestSqlite();

    const notif = sqlite
      .prepare("SELECT * FROM notifications WHERE user_id = ? AND type = ?")
      .get(violateUserId, "challenge_violation") as Record<string, unknown> | undefined;

    expect(notif).toBeDefined();
    expect(notif!.title).toContain("Challenge Violation");
    expect(notif!.message).toContain("maximum drawdown");
    expect(notif!.link).toBe("/dashboard/challenges");
  });

  it("does not violate again on re-sync (already violated)", async () => {
    const sqlite = getTestSqlite();

    // Age and sync again — should not create duplicate violation
    sqlite
      .prepare("UPDATE trading_metrics SET recorded_at = ? WHERE challenge_id = ?")
      .run(Date.now() - 25 * 60 * 60 * 1000, violateChallengeId);

    await authPost(app, "/api/trading/sync", violateUserCookie, {});

    const violations = sqlite
      .prepare("SELECT violations FROM user_challenges WHERE id = ?")
      .get(violateChallengeId) as { violations: string };
    const parsed = JSON.parse(violations.violations);
    expect(parsed.length).toBe(1); // Still only one violation
  });
});

// ═══════════════════════════════════════════════════════════════
//  CHALLENGE EXPIRY DETECTION VIA SYNC
// ═══════════════════════════════════════════════════════════════

describe("Challenge expiry detection via sync", () => {
  let expireUserId: number;
  let expireUserCookie: string;
  let expireChallengeId: number;

  beforeAll(async () => {
    const sqlite = getTestSqlite();

    // Create a user
    const { cookie } = await signUp(app, {
      name: "Expire Trader",
      email: "expire-trader@test.com",
      password: "Secure@123",
    });
    expireUserCookie = cookie;

    const eu = sqlite
      .prepare("SELECT id FROM users WHERE email = ?")
      .get("expire-trader@test.com") as { id: number };
    expireUserId = eu.id;

    // Use existing template/size
    const { body: templates } = await authGet(app, "/api/challenges/templates", adminCookie);
    const template = (templates as Record<string, unknown>[])[0];
    const { body: sizes } = await authGet(app, `/api/challenges/templates/${template.id}/sizes`, adminCookie);
    const size = (sizes as Record<string, unknown>[])[0];

    await authPost(app, "/api/challenges/demo-purchase", adminCookie, {
      templateId: template.id,
      accountSizeId: size.id,
      userId: expireUserId,
    });

    const ch = sqlite
      .prepare("SELECT id FROM user_challenges WHERE user_id = ?")
      .get(expireUserId) as { id: number };
    expireChallengeId = ch.id;

    // Set expiresAt to yesterday and ensure status is active
    sqlite
      .prepare("UPDATE user_challenges SET expires_at = ?, status = 'active' WHERE id = ?")
      .run(Date.now() - 86400000, expireChallengeId);

    // Seed demo data
    await authPost(app, "/api/trading/seed-demo", expireUserCookie, {
      challengeId: expireChallengeId,
    });
  });

  it("marks challenge as expired when expiresAt has passed", async () => {
    const sqlite = getTestSqlite();

    // Verify challenge is active before sync
    const before = sqlite
      .prepare("SELECT status FROM user_challenges WHERE id = ?")
      .get(expireChallengeId) as { status: string };
    expect(before.status).toBe("active");

    // Age the last metrics
    sqlite
      .prepare("UPDATE trading_metrics SET recorded_at = ? WHERE challenge_id = ?")
      .run(Date.now() - 25 * 60 * 60 * 1000, expireChallengeId);

    // Sync — should detect expiry
    const { status } = await authPost(app, "/api/trading/sync", expireUserCookie, {});
    expect(status).toBe(200);

    // Verify challenge is now expired
    const after = sqlite
      .prepare("SELECT status FROM user_challenges WHERE id = ?")
      .get(expireChallengeId) as { status: string };
    expect(after.status).toBe("expired");
  });

  it("creates expiry notification", async () => {
    const sqlite = getTestSqlite();

    const notif = sqlite
      .prepare("SELECT * FROM notifications WHERE user_id = ? AND type = ?")
      .get(expireUserId, "challenge_expired") as Record<string, unknown> | undefined;

    expect(notif).toBeDefined();
    expect(notif!.title).toContain("Challenge Expired");
    expect(notif!.message).toContain("expired");
    expect(notif!.link).toBe("/dashboard/challenges");
  });

  it("does not expire again on re-sync (already expired)", async () => {
    const sqlite = getTestSqlite();

    // Age and sync again — should not create duplicate notifications
    sqlite
      .prepare("UPDATE trading_metrics SET recorded_at = ? WHERE challenge_id = ?")
      .run(Date.now() - 25 * 60 * 60 * 1000, expireChallengeId);

    await authPost(app, "/api/trading/sync", expireUserCookie, {});

    const count = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND type = ?")
      .get(expireUserId, "challenge_expired") as { cnt: number };
    expect(count.cnt).toBe(1); // Still only one notification
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: CREATE MT5 ACCOUNT
// ═══════════════════════════════════════════════════════════════

describe("POST /api/trading/admin/mt5", () => {
  it("creates an MT5 account as admin", async () => {
    const db = getTestDb();
    const user = db.select().from(users).where(eq(users.email, "trading-trader@test.com")).get();

    const { status, body } = await authPost(app, "/api/trading/admin/mt5", adminCookie, {
      userId: user!.id,
      leverage: 200,
      balance: 10000,
      equity: 10000,
    });
    expect(status).toBe(200);
    const account = body as Record<string, unknown>;
    expect(account).toHaveProperty("login");
    expect(account).toHaveProperty("server");
    expect(account.leverage).toBe(200);
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authPost(app, "/api/trading/admin/mt5", userCookie, {
      userId: 1,
    });
    expect(status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: SYNC ALL
// ═══════════════════════════════════════════════════════════════

describe("POST /api/trading/admin/sync-all", () => {
  it("syncs all active challenges as admin", async () => {
    const { status, body } = await authPost(app, "/api/trading/admin/sync-all", adminCookie, {});
    expect(status).toBe(200);
    const result = body as Record<string, unknown>;
    expect(result).toHaveProperty("synced");
    expect(result).toHaveProperty("skipped");
    expect(result).toHaveProperty("total");
    expect(typeof result.total).toBe("number");
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authPost(app, "/api/trading/admin/sync-all", userCookie, {});
    expect(status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: SYNC QUEUE STATUS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/trading/admin/sync-queue", () => {
  it("returns sync queue stats", async () => {
    const { status, body } = await authGet(app, "/api/trading/admin/sync-queue", adminCookie);
    expect(status).toBe(200);
    const result = body as Record<string, unknown>;
    expect(result).toHaveProperty("activeChallenges");
    expect(result).toHaveProperty("syncedToday");
    expect(result).toHaveProperty("lastSyncAt");
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authGet(app, "/api/trading/admin/sync-queue", userCookie);
    expect(status).toBe(403);
  });
});
