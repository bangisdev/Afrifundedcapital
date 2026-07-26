/**
 * Challenges route tests — templates, sizes, admin CRUD, demo purchase, status updates.
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
import { users } from "../schema";
import { eq } from "drizzle-orm";

let app: Hono;
let userCookie: string;
let adminCookie: string;

beforeAll(async () => {
  app = await buildTestApp();

  // Create a regular user
  const { cookie: uc } = await signUp(app, {
    name: "Challenge Trader",
    email: "challenge-trader@test.com",
    password: "Secure@123",
  });
  userCookie = uc;

  // Create an admin user
  const { cookie: ac } = await signUp(app, {
    name: "Admin User",
    email: "challenge-admin@test.com",
    password: "Secure@123",
  });

  // Promote admin using the SAME DB instance the app uses
  const db = getTestDb();
  const adminUser = db.select().from(users).where(eq(users.email, "challenge-admin@test.com")).get();
  if (adminUser) {
    await authPost(app, "/api/auth/promote-admin", "", { userId: adminUser.id });
  }

  // Re-login as admin after promotion to get fresh session with correct role
  const { cookie: reLoginCookie } = await signIn(app, {
    email: "challenge-admin@test.com",
    password: "Secure@123",
  });
  adminCookie = reLoginCookie;
});

afterAll(() => {
  cleanupTestDb();
});

// ═══════════════════════════════════════════════════════════════
//  TEMPLATES (PUBLIC)
// ═══════════════════════════════════════════════════════════════

describe("GET /api/challenges/templates", () => {
  it("returns seeded challenge templates", async () => {
    const { status, body } = await authGet(app, "/api/challenges/templates", userCookie);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(3);
    const first = body[0] as Record<string, unknown>;
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("type");
    expect(first).toHaveProperty("profitTarget");
  });
});

describe("GET /api/challenges/templates/:id", () => {
  it("returns a single template", async () => {
    const { body: templates } = await authGet(app, "/api/challenges/templates", userCookie);
    const template = (templates as Record<string, unknown>[])[0];
    const { status, body } = await authGet(app, `/api/challenges/templates/${template.id}`, userCookie);
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).name).toBe(template.name);
  });

  it("returns null for non-existent template", async () => {
    const { status, body } = await authGet(app, "/api/challenges/templates/99999", userCookie);
    expect(status).toBe(200);
    expect(body).toBeNull();
  });
});

describe("GET /api/challenges/templates/:id/sizes", () => {
  it("returns account sizes for a template", async () => {
    const { body: templates } = await authGet(app, "/api/challenges/templates", userCookie);
    const template = (templates as Record<string, unknown>[])[0];
    const { status, body } = await authGet(app, `/api/challenges/templates/${template.id}/sizes`, userCookie);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    const size = (body as Record<string, unknown>[])[0];
    expect(size).toHaveProperty("label");
    expect(size).toHaveProperty("size");
    expect(size).toHaveProperty("price");
  });
});

// ═══════════════════════════════════════════════════════════════
//  MY CHALLENGES
// ═══════════════════════════════════════════════════════════════

describe("GET /api/challenges/my", () => {
  it("returns empty array for new user", async () => {
    const { status, body } = await authGet(app, "/api/challenges/my", userCookie);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/challenges/my");
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  METRICS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/challenges/metrics", () => {
  it("returns zero metrics for new user", async () => {
    const { status, body } = await authGet(app, "/api/challenges/metrics", userCookie);
    expect(status).toBe(200);
    const metrics = body as Record<string, unknown>;
    expect(metrics.activeChallenges).toBe(0);
    expect(metrics.totalChallenges).toBe(0);
    expect(metrics.fundedAccounts).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: CREATE TEMPLATE
// ═══════════════════════════════════════════════════════════════

describe("POST /api/challenges/admin/templates", () => {
  it("creates a new template as admin", async () => {
    const { status, body } = await authPost(app, "/api/challenges/admin/templates", adminCookie, {
      name: "Custom Challenge",
      type: "one_step",
      profitTarget: 12,
      dailyDrawdown: 4,
      maxDrawdown: 8,
      maxLeverage: 50,
      minTradingDays: 3,
      price: 30000,
      durationDays: 30,
    });
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).name).toBe("Custom Challenge");
    expect((body as Record<string, unknown>).type).toBe("one_step");
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authPost(app, "/api/challenges/admin/templates", userCookie, {
      name: "Should Fail",
      type: "one_step",
      profitTarget: 10,
      dailyDrawdown: 5,
      maxDrawdown: 10,
      maxLeverage: 100,
      minTradingDays: 5,
      price: 40000,
      durationDays: 30,
    });
    expect(status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: UPDATE TEMPLATE (uses PUT)
// ═══════════════════════════════════════════════════════════════

describe("PUT /api/challenges/admin/templates/:id", () => {
  it("updates a template as admin", async () => {
    const { body: createResult } = await authPost(app, "/api/challenges/admin/templates", adminCookie, {
      name: "Update Me",
      type: "one_step",
      profitTarget: 10,
      dailyDrawdown: 5,
      maxDrawdown: 10,
      maxLeverage: 100,
      minTradingDays: 5,
      price: 20000,
      durationDays: 30,
    });
    const templateId = (createResult as Record<string, unknown>).id;

    const { status, body } = await authPut(
      app,
      `/api/challenges/admin/templates/${templateId}`,
      adminCookie,
      { name: "Updated Name", profitTarget: 15 },
    );
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: CREATE ACCOUNT SIZE
// ═══════════════════════════════════════════════════════════════

describe("POST /api/challenges/admin/sizes", () => {
  it("creates an account size for a template", async () => {
    const { body: templates } = await authGet(app, "/api/challenges/templates", adminCookie);
    const template = (templates as Record<string, unknown>[])[0];

    const { status, body } = await authPost(app, "/api/challenges/admin/sizes", adminCookie, {
      label: "$75,000",
      size: 75000,
      templateId: template.id,
      price: 150000,
      sortOrder: 0,
    });
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).label).toBe("$75,000");
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: DEMO PURCHASE
// ═══════════════════════════════════════════════════════════════

describe("POST /api/challenges/demo-purchase", () => {
  it("creates a demo challenge as admin", async () => {
    const { body: templates } = await authGet(app, "/api/challenges/templates", adminCookie);
    const template = (templates as Record<string, unknown>[])[0];

    const { body: sizes } = await authGet(app, `/api/challenges/templates/${template.id}/sizes`, adminCookie);
    const size = (sizes as Record<string, unknown>[])[0];

    const { status, body } = await authPost(app, "/api/challenges/demo-purchase", adminCookie, {
      templateId: template.id,
      accountSizeId: size.id,
    });
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
    expect((body as Record<string, unknown>).mt5Login).toBeDefined();
  });

  it("returns 400 without required fields", async () => {
    const { status } = await authPost(app, "/api/challenges/demo-purchase", adminCookie, {});
    expect(status).toBe(400);
  });

  it("returns 403 for non-admin", async () => {
    const { body: templates } = await authGet(app, "/api/challenges/templates", adminCookie);
    const template = (templates as Record<string, unknown>[])[0];
    const { body: sizes } = await authGet(app, `/api/challenges/templates/${template.id}/sizes`, adminCookie);
    const size = (sizes as Record<string, unknown>[])[0];

    const { status } = await authPost(app, "/api/challenges/demo-purchase", userCookie, {
      templateId: template.id,
      accountSizeId: size.id,
    });
    expect(status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: CHALLENGE STATUS UPDATE (uses PUT)
// ═══════════════════════════════════════════════════════════════

describe("PUT /api/challenges/admin/:id/status", () => {
  it("updates challenge status to phase_1_passed", async () => {
    // Get the user ID for the regular user so we can create a challenge for them
    const db = getTestDb();
    const user = db.select().from(users).where(eq(users.email, "challenge-trader@test.com")).get();

    // Create a demo challenge specifically for the user
    const { body: templates } = await authGet(app, "/api/challenges/templates", adminCookie);
    const template = (templates as Record<string, unknown>[])[0];
    const { body: sizes } = await authGet(app, `/api/challenges/templates/${template.id}/sizes`, adminCookie);
    const size = (sizes as Record<string, unknown>[])[0];
    await authPost(app, "/api/challenges/demo-purchase", adminCookie, {
      templateId: template.id,
      accountSizeId: size.id,
      userId: user!.id,
    });

    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = (challenges as Record<string, unknown>[])[0];
    expect(challenge).toBeDefined();

    const { status, body } = await authPut(
      app,
      `/api/challenges/admin/${challenge.id}/status`,
      adminCookie,
      { status: "phase_1_passed" },
    );
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).newStatus).toBe("phase_1_passed");
  });

  it("rejects invalid status", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = (challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status } = await authPut(
      app,
      `/api/challenges/admin/${challenge.id}/status`,
      adminCookie,
      { status: "totally_invalid" },
    );
    expect(status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: CHALLENGE STATS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/challenges/admin/stats", () => {
  it("returns challenge statistics", async () => {
    const { status, body } = await authGet(app, "/api/challenges/admin/stats", adminCookie);
    expect(status).toBe(200);
    const stats = body as Record<string, unknown>;
    expect(stats).toHaveProperty("total");
    expect(stats).toHaveProperty("active");
    expect(stats).toHaveProperty("funded");
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: DELETE ACCOUNT SIZE
// ═══════════════════════════════════════════════════════════════

describe("DELETE /api/challenges/admin/sizes/:id", () => {
  it("deletes an account size", async () => {
    const { body: templates } = await authGet(app, "/api/challenges/templates", adminCookie);
    const template = (templates as Record<string, unknown>[])[0];
    const { body: sizes } = await authGet(app, `/api/challenges/templates/${template.id}/sizes`, adminCookie);
    const size = (sizes as Record<string, unknown>[])[0];
    if (!size) return;

    const { status, body } = await authDelete(app, `/api/challenges/admin/sizes/${size.id}`, adminCookie);
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: DELETE TEMPLATE
// ═══════════════════════════════════════════════════════════════

describe("DELETE /api/challenges/admin/templates/:id", () => {
  it("deletes a template with no user challenges", async () => {
    const { body: newTemplate } = await authPost(app, "/api/challenges/admin/templates", adminCookie, {
      name: "Delete Me",
      type: "one_step",
      profitTarget: 10,
      dailyDrawdown: 5,
      maxDrawdown: 10,
      maxLeverage: 100,
      minTradingDays: 3,
      price: 10000,
      durationDays: 30,
    });
    const templateId = (newTemplate as Record<string, unknown>).id;

    const { status, body } = await authDelete(app, `/api/challenges/admin/templates/${templateId}`, adminCookie);
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
  });
});
