/**
 * Certificates route tests — generate, list, verify, admin issue, PDF download.
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
import { users } from "../schema";
import { eq } from "drizzle-orm";

let app: Hono;
let userCookie: string;
let adminCookie: string;

beforeAll(async () => {
  app = await buildTestApp();

  const { cookie: uc } = await signUp(app, {
    name: "Cert Trader",
    email: "cert-trader@test.com",
    password: "Secure@123",
  });
  userCookie = uc;

  await signUp(app, {
    name: "Cert Admin",
    email: "cert-admin@test.com",
    password: "Secure@123",
  });

  // Promote admin using the SAME DB instance the app uses
  const db = getTestDb();
  const adminUser = db.select().from(users).where(eq(users.email, "cert-admin@test.com")).get();
  if (adminUser) {
    await authPost(app, "/api/auth/promote-admin", "", { userId: adminUser.id });
  }

  const { cookie: reLogin } = await signIn(app, {
    email: "cert-admin@test.com",
    password: "Secure@123",
  });
  adminCookie = reLogin;

  // Create a demo challenge so we have a challengeId to work with
  const { body: templates } = await authGet(app, "/api/challenges/templates", adminCookie);
  const template = (templates as Record<string, unknown>[])[0];
  const { body: sizes } = await authGet(app, `/api/challenges/templates/${template.id}/sizes`, adminCookie);
  const size = (sizes as Record<string, unknown>[])[0];

  await authPost(app, "/api/challenges/demo-purchase", adminCookie, {
    templateId: template.id,
    accountSizeId: size.id,
  });

  // Update challenge status to phase_1_passed to allow certificate generation
  const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
  const challenge = (challenges as Record<string, unknown>[])[0];
  if (challenge) {
    await authPost(app, `/api/challenges/admin/${challenge.id}/status`, adminCookie, {
      status: "phase_1_passed",
    });
  }
});

afterAll(() => {
  cleanupTestDb();
});

// ═══════════════════════════════════════════════════════════════
//  MY CERTIFICATES
// ═══════════════════════════════════════════════════════════════

describe("GET /api/certificates/my", () => {
  it("returns certificates for user", async () => {
    const { status, body } = await authGet(app, "/api/certificates/my", userCookie);
    expect(status).toBe(200);
    expect(Array.isArray(body.certificates)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect(typeof body.totalPages).toBe("number");
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/certificates/my");
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  GENERATE CERTIFICATE
// ═══════════════════════════════════════════════════════════════

describe("POST /api/certificates/generate", () => {
  it("generates a certificate for a user's challenge", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = (challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status, body } = await authPost(app, "/api/certificates/generate", userCookie, {
      challengeId: challenge.id,
      type: "phase_1",
    });
    expect(status).toBe(200);
    const cert = body as Record<string, unknown>;
    expect(cert).toHaveProperty("certificateNumber");
    expect(cert).toHaveProperty("verificationCode");
  });

  it("returns existing certificate instead of duplicate", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = (challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { body: first } = await authPost(app, "/api/certificates/generate", userCookie, {
      challengeId: challenge.id,
      type: "phase_1",
    });
    const { body: second } = await authPost(app, "/api/certificates/generate", userCookie, {
      challengeId: challenge.id,
      type: "phase_1",
    });
    expect((first as Record<string, unknown>).certificateNumber).toBe(
      (second as Record<string, unknown>).certificateNumber,
    );
  });

  it("returns 400 without challengeId", async () => {
    const { status } = await authPost(app, "/api/certificates/generate", userCookie, {});
    expect(status).toBe(400);
  });

  it("returns 404 for non-existent challenge", async () => {
    const { status } = await authPost(app, "/api/certificates/generate", userCookie, {
      challengeId: 99999,
    });
    expect(status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════
//  GET CERTIFICATE BY ID
// ═══════════════════════════════════════════════════════════════

describe("GET /api/certificates/:id", () => {
  it("returns a certificate with challenge info", async () => {
    const { body: certs } = await authGet(app, "/api/certificates/my", userCookie);
    const cert = ((certs as Record<string, unknown>).certificates as Record<string, unknown>[])[0];
    if (!cert) return;

    const { status, body } = await authGet(app, `/api/certificates/${cert.id}`, userCookie);
    expect(status).toBe(200);
    const result = body as Record<string, unknown>;
    expect(result).toHaveProperty("certificateNumber");
    expect(result).toHaveProperty("challenge");
  });

  it("returns 404 for non-existent certificate", async () => {
    const { status } = await authGet(app, "/api/certificates/99999", userCookie);
    expect(status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════
//  PUBLIC VERIFY
// ═══════════════════════════════════════════════════════════════

describe("GET /api/certificates/verify/:code", () => {
  it("verifies a valid certificate code", async () => {
    const { body: certs } = await authGet(app, "/api/certificates/my", userCookie);
    const cert = ((certs as Record<string, unknown>).certificates as Record<string, unknown>[])[0];
    if (!cert) return;

    const { status, body } = await authGet(
      app,
      `/api/certificates/verify/${cert.verificationCode}`,
      "",
    );
    expect(status).toBe(200);
    const result = body as Record<string, unknown>;
    expect(result.valid).toBe(true);
    expect(result.traderName).toBe("Cert Trader");
    expect(result.certificateNumber).toBe(cert.certificateNumber);
  });

  it("returns invalid for non-existent code", async () => {
    const { status, body } = await authGet(app, "/api/certificates/verify/NONEXISTENT123", "");
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).valid).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
//  PDF DOWNLOAD
// ═══════════════════════════════════════════════════════════════

describe("GET /api/certificates/:id/pdf", () => {
  it("returns a PDF document", async () => {
    const { body: certs } = await authGet(app, "/api/certificates/my", userCookie);
    const cert = ((certs as Record<string, unknown>).certificates as Record<string, unknown>[])[0];
    if (!cert) return;

    const res = await app.request(`/api/certificates/${cert.id}/pdf`, {
      headers: { Cookie: userCookie },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("attachment");
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/certificates/1/pdf");
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: ISSUE CERTIFICATE
// ═══════════════════════════════════════════════════════════════

describe("POST /api/certificates/admin/issue", () => {
  it("issues a certificate as admin", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = (challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status, body } = await authPost(app, "/api/certificates/admin/issue", adminCookie, {
      challengeId: challenge.id,
      type: "phase_2",
    });
    expect(status).toBe(201);
    const cert = body as Record<string, unknown>;
    expect(cert).toHaveProperty("certificateNumber");
    expect(cert.type).toBe("phase_2");
  });

  it("returns 409 for duplicate admin-issued certificate", async () => {
    const { body: challenges } = await authGet(app, "/api/challenges/my", userCookie);
    const challenge = (challenges as Record<string, unknown>[])[0];
    if (!challenge) return;

    const { status } = await authPost(app, "/api/certificates/admin/issue", adminCookie, {
      challengeId: challenge.id,
      type: "phase_2",
    });
    expect(status).toBe(409);
  });

  it("returns 404 for non-existent challenge", async () => {
    const { status } = await authPost(app, "/api/certificates/admin/issue", adminCookie, {
      challengeId: 99999,
      type: "funded",
    });
    expect(status).toBe(404);
  });

  it("returns 400 without required fields", async () => {
    const { status } = await authPost(app, "/api/certificates/admin/issue", adminCookie, {
      type: "funded",
    });
    expect(status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: LIST ALL
// ═══════════════════════════════════════════════════════════════

describe("GET /api/certificates/admin/all", () => {
  it("returns all certificates as admin", async () => {
    const { status, body } = await authGet(app, "/api/certificates/admin/all", adminCookie);
    expect(status).toBe(200);
    expect(Array.isArray(body.certificates)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect(typeof body.stats).toBe("object");
  });

  it("returns 403 for non-admin", async () => {
    const { status } = await authGet(app, "/api/certificates/admin/all", userCookie);
    expect(status).toBe(403);
  });
});
