/**
 * KYC endpoint tests — upload, list, approve, reject, delete.
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
  authDelete,
  getTestDb,
  getTestSqlite,
} from "./setup";

let app: Hono;
let userCookie: string;
let adminCookie: string;

const TEST_USER = { name: "KYC User", email: "kyc@test.com", password: "Secure@123" };
const TEST_ADMIN = { name: "KYC Admin", email: "kyc-admin@test.com", password: "Admin@123" };

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

  // Promote admin to super_admin
  const db = getTestDb();
  const { users } = await import("../schema");
  const { eq } = await import("drizzle-orm");
  const adminUser = db.select().from(users).where(eq(users.email, TEST_ADMIN.email)).get();
  if (adminUser) {
    await authPost(app, "/api/auth/promote-admin", "", { userId: adminUser.id });
    // Re-sign in to get the updated session with admin role
    const newAdminSignIn = await signIn(app, TEST_ADMIN);
    adminCookie = newAdminSignIn.cookie;
  }
});

afterAll(() => {
  cleanupTestDb();
});

// ═══════════════════════════════════════════════════════════════
//  UPLOAD KYC DOCUMENT
// ═══════════════════════════════════════════════════════════════

describe("POST /api/kyc/upload", () => {
  it("uploads a passport document", async () => {
    const { status, body } = await authPost(app, "/api/kyc/upload", userCookie, {
      documentType: "passport",
      fileData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      fileName: "passport.png",
      fileSize: 68,
      mimeType: "image/png",
    });

    expect(status).toBe(200);
    expect((body as Record<string, unknown>).id).toBeDefined();
    expect((body as Record<string, unknown>).status).toBe("pending");
    expect((body as Record<string, unknown>).documentType).toBe("passport");
  });

  it("rejects invalid document type", async () => {
    const { status, body } = await authPost(app, "/api/kyc/upload", userCookie, {
      documentType: "invalid_type",
      fileData: "data:image/png;base64,abc",
    });

    expect(status).toBe(400);
    expect((body as Record<string, unknown>).error).toMatch(/invalid/i);
  });

  it("rejects oversized files", async () => {
    const { status, body } = await authPost(app, "/api/kyc/upload", userCookie, {
      documentType: "national_id",
      fileData: "data:image/png;base64," + "A".repeat(6 * 1024 * 1024),
      fileName: "huge.png",
      fileSize: 6 * 1024 * 1024,
      mimeType: "image/png",
    });

    expect(status).toBe(400);
    expect((body as Record<string, unknown>).error).toMatch(/5MB/i);
  });

  it("rejects upload without authentication", async () => {
    const res = await app.request("/api/kyc/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentType: "passport",
        fileData: "data:image/png;base64,abc",
      }),
    });

    expect(res.status).toBe(401);
  });

  it("uploads a proof of address document", async () => {
    const { status, body } = await authPost(app, "/api/kyc/upload", userCookie, {
      documentType: "proof_of_address",
      fileData: "data:application/pdf;base64,JVBERi0xLjQK",
      fileName: "proof.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
    });

    expect(status).toBe(200);
    expect((body as Record<string, unknown>).documentType).toBe("proof_of_address");
  });
});

// ═══════════════════════════════════════════════════════════════
//  LIST KYC DOCUMENTS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/kyc/my", () => {
  it("returns the user's KYC documents", async () => {
    const { status, body } = await authGet(app, "/api/kyc/my", userCookie);

    expect(status).toBe(200);
    const env = body as Record<string, any>;
    expect(Array.isArray(env.documents)).toBe(true);
    expect(env.documents.length).toBeGreaterThanOrEqual(2);
    expect(env.total).toBeGreaterThanOrEqual(2);
    expect(env.page).toBe(1);
    expect(env.pageSize).toBe(10);
    expect(env.totalPages).toBeGreaterThanOrEqual(1);
    expect(env.stats.total).toBeGreaterThanOrEqual(2);
    // Should strip file data for performance
    expect(env.documents[0]).not.toHaveProperty("fileUrl");
    expect(env.documents[0]).toHaveProperty("hasFile");
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/kyc/my");
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: LIST ALL KYC DOCUMENTS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/kyc/admin/all", () => {
  it("returns all KYC documents for admin", async () => {
    const { status, body } = await authGet(app, "/api/kyc/admin/all", adminCookie);

    expect(status).toBe(200);
    const docs = (body as Record<string, unknown>).documents as Array<Record<string, unknown>>;
    expect(Array.isArray(docs)).toBe(true);
    expect(docs.length).toBeGreaterThanOrEqual(2);
  });

  it("returns 403 for non-admin users", async () => {
    const { status, body } = await authGet(app, "/api/kyc/admin/all", userCookie);

    expect(status).toBe(403);
    expect((body as Record<string, unknown>).error).toMatch(/admin/i);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: APPROVE KYC DOCUMENT
// ═══════════════════════════════════════════════════════════════

describe("POST /api/kyc/admin/:id/approve", () => {
  it("approves a pending document", async () => {
    // Get the document ID
    const { body: docs } = await authGet(app, "/api/kyc/my", userCookie);
    const docList = (docs as Record<string, any>).documents as Array<Record<string, unknown>>;
    const passportDoc = docList.find((d) => d.documentType === "passport");
    expect(passportDoc).toBeTruthy();

    const { status, body } = await authPost(
      app,
      `/api/kyc/admin/${passportDoc!.id}/approve`,
      adminCookie,
    );

    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
  });

  it("returns 404 for non-existent document", async () => {
    const { status } = await authPost(app, "/api/kyc/admin/99999/approve", adminCookie);
    expect(status).toBe(404);
  });

  it("returns 403 for non-admin users", async () => {
    const { status } = await authPost(app, "/api/kyc/admin/1/approve", userCookie);
    expect(status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN: REJECT KYC DOCUMENT
// ═══════════════════════════════════════════════════════════════

describe("POST /api/kyc/admin/:id/reject", () => {
  it("rejects a document with a reason", async () => {
    const { body: docs } = await authGet(app, "/api/kyc/my", userCookie);
    const docList = (docs as Record<string, any>).documents as Array<Record<string, unknown>>;
    const proofDoc = docList.find((d) => d.documentType === "proof_of_address");
    expect(proofDoc).toBeTruthy();

    const { status, body } = await authPost(
      app,
      `/api/kyc/admin/${proofDoc!.id}/reject`,
      adminCookie,
      { reason: "Image is blurry, please re-upload" },
    );

    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
  });

  it("returns 404 for non-existent document", async () => {
    const { status } = await authPost(
      app,
      "/api/kyc/admin/99999/reject",
      adminCookie,
      { reason: "Invalid" },
    );
    expect(status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════
//  DELETE KYC DOCUMENT
// ═══════════════════════════════════════════════════════════════

describe("DELETE /api/kyc/my/:id", () => {
  it("deletes a pending document", async () => {
    // Upload a new doc to delete
    const { body: uploadResult } = await authPost(app, "/api/kyc/upload", userCookie, {
      documentType: "selfie",
      fileData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      fileName: "selfie.png",
      fileSize: 68,
      mimeType: "image/png",
    });
    const docId = (uploadResult as Record<string, unknown>).id;

    const { status, body } = await authDelete(app, `/api/kyc/my/${docId}`, userCookie);

    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
  });

  it("cannot delete an approved document", async () => {
    const { body: docs } = await authGet(app, "/api/kyc/my", userCookie);
    const docList = (docs as Record<string, any>).documents as Array<Record<string, unknown>>;
    const approvedDoc = docList.find((d) => d.status === "approved");

    if (approvedDoc) {
      const { status, body } = await authDelete(
        app,
        `/api/kyc/my/${approvedDoc.id}`,
        userCookie,
      );
      expect(status).toBe(400);
      expect((body as Record<string, unknown>).error).toMatch(/approved/i);
    }
  });

  it("returns 404 for non-existent document", async () => {
    const { status } = await authDelete(app, "/api/kyc/my/99999", userCookie);
    expect(status).toBe(404);
  });
});
