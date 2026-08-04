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
} from "./setup";
import { auditLogs, notifications } from "../schema";
import { eq, desc, and } from "drizzle-orm";

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

  it("writes a kyc.uploaded audit entry for the submission", async () => {
    const { status, body } = await authPost(app, "/api/kyc/upload", userCookie, {
      documentType: "national_id",
      fileData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      fileName: "nid.png",
      fileSize: 68,
      mimeType: "image/png",
    });
    expect(status).toBe(200);
    const docId = (body as Record<string, unknown>).id as number;

    const db = getTestDb();
    const audit = db.select().from(auditLogs)
      .where(and(eq(auditLogs.action, "kyc.uploaded"), eq(auditLogs.entityId, String(docId))))
      .get();
    expect(audit).toBeTruthy();
    expect(audit?.entity).toBe("kyc_document");
    expect(audit?.details).toContain("national_id");
    // The submitting user is the actor on their own upload
    expect(audit?.userId).toBeTruthy();
  });

  it("creates a dashboard notification for the submission", async () => {
    const { status } = await authPost(app, "/api/kyc/upload", userCookie, {
      documentType: "drivers_license",
      fileData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      fileName: "license.png",
      fileSize: 68,
      mimeType: "image/png",
    });
    expect(status).toBe(200);

    const db = getTestDb();
    const { users } = await import("../schema");
    const testUser = db.select().from(users).where(eq(users.email, TEST_USER.email)).get();
    expect(testUser).toBeTruthy();

    const notif = db.select().from(notifications)
      .where(and(
        eq(notifications.userId, testUser!.id),
        eq(notifications.type, "kyc"),
        eq(notifications.title, "Document Received"),
      ))
      .orderBy(desc(notifications.createdAt))
      .get();
    expect(notif).toBeTruthy();
    expect(notif?.message).toContain("drivers license");
    expect(notif?.link).toBe("/dashboard/profile");
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

  it("sorts documents by documentType asc", async () => {
    const { status, body } = await authGet(app, "/api/kyc/my?sortBy=documentType&sortOrder=asc", userCookie);
    expect(status).toBe(200);
    const env = body as Record<string, any>;
    const types = (env.documents as Array<Record<string, string>>).map((d) => d.documentType);
    const sorted = [...types].sort((a, b) => a.localeCompare(b));
    expect(types).toEqual(sorted);
    expect(env.documents.length).toBeGreaterThanOrEqual(2);
  });

  it("sorts documents by documentType desc", async () => {
    const { status, body } = await authGet(app, "/api/kyc/my?sortBy=documentType&sortOrder=desc", userCookie);
    expect(status).toBe(200);
    const env = body as Record<string, any>;
    const types = (env.documents as Array<Record<string, string>>).map((d) => d.documentType);
    const sortedDesc = [...types].sort((a, b) => b.localeCompare(a));
    expect(types).toEqual(sortedDesc);
  });

  it("falls back to the default sort column for an unknown sortBy", async () => {
    const { status, body } = await authGet(app, "/api/kyc/my?sortBy=notAColumn&sortOrder=asc", userCookie);
    expect(status).toBe(200);
    const env = body as Record<string, any>;
    // Fallback column is uploadedAt, and sortOrder=asc is respected
    const uploadedAts = (env.documents as Array<Record<string, number>>).map((d) => d.uploadedAt);
    const sortedAsc = [...uploadedAts].sort((a, b) => a - b);
    expect(uploadedAts).toEqual(sortedAsc);
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

    // Audit log entry written by the approving admin
    const db = getTestDb();
    const audit = db.select().from(auditLogs)
      .where(eq(auditLogs.action, "kyc.approved"))
      .orderBy(desc(auditLogs.timestamp))
      .get();
    expect(audit).toBeTruthy();
    expect(audit?.entity).toBe("kyc_document");
    expect(audit?.details).toContain("passport");
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

    // Audit log entry written by the rejecting admin, with the reason captured
    const db = getTestDb();
    const audit = db.select().from(auditLogs)
      .where(eq(auditLogs.action, "kyc.rejected"))
      .orderBy(desc(auditLogs.timestamp))
      .get();
    expect(audit).toBeTruthy();
    expect(audit?.entity).toBe("kyc_document");
    expect(audit?.details).toContain("Image is blurry");
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

// ═══════════════════════════════════════════════════════════════
//  USER: DOCUMENT HISTORY (audit timeline)
// ═══════════════════════════════════════════════════════════════

describe("GET /api/kyc/my/:id/history", () => {
  it("returns the full document timeline (uploaded + review events)", async () => {
    const { body: docs } = await authGet(app, "/api/kyc/my", userCookie);
    const docList = (docs as Record<string, any>).documents as Array<Record<string, any>>;
    const passportDoc = docList.find((d) => d.documentType === "passport");
    expect(passportDoc).toBeTruthy();

    // The passport doc was approved earlier in the suite
    const { status, body } = await authGet(app, `/api/kyc/my/${passportDoc!.id}/history`, userCookie);
    expect(status).toBe(200);
    const events = (body as Record<string, any>).events as Array<Record<string, any>>;
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.some((e) => e.action === "kyc.uploaded")).toBe(true);
    expect(events.some((e) => e.action === "kyc.approved")).toBe(true);
    // Chronological order — the submission is the first event
    expect(events[0].action).toBe("kyc.uploaded");
    // The review event carries the approving admin as actor
    const approved = events.find((e) => e.action === "kyc.approved");
    expect(approved?.actorName).toBe("KYC Admin");
    expect(approved?.details?.documentType).toBe("passport");
  });

  it("returns the rejection reason in the timeline", async () => {
    const { body: docs } = await authGet(app, "/api/kyc/my", userCookie);
    const docList = (docs as Record<string, any>).documents as Array<Record<string, any>>;
    const proofDoc = docList.find((d) => d.documentType === "proof_of_address");
    expect(proofDoc).toBeTruthy();

    const { status, body } = await authGet(app, `/api/kyc/my/${proofDoc!.id}/history`, userCookie);
    expect(status).toBe(200);
    const events = (body as Record<string, any>).events as Array<Record<string, any>>;
    const rejected = events.find((e) => e.action === "kyc.rejected");
    expect(rejected).toBeTruthy();
    expect(rejected?.details?.reason).toContain("blurry");
    expect(rejected?.actorName).toBe("KYC Admin");
  });

  it("returns 404 for another user's document", async () => {
    await signUp(app, { name: "Other KYC", email: "other-kyc@test.com", password: "Secure@123" });
    const other = await signIn(app, { email: "other-kyc@test.com", password: "Secure@123" });

    const { body: docs } = await authGet(app, "/api/kyc/my", userCookie);
    const docList = (docs as Record<string, any>).documents as Array<Record<string, any>>;
    const anyDoc = docList[0];
    expect(anyDoc).toBeTruthy();

    const { status } = await authGet(app, `/api/kyc/my/${anyDoc!.id}/history`, other.cookie);
    expect(status).toBe(404);
  });

  it("returns 401 without authentication", async () => {
    const { body: docs } = await authGet(app, "/api/kyc/my", userCookie);
    const docList = (docs as Record<string, any>).documents as Array<Record<string, any>>;
    const anyDoc = docList[0];
    expect(anyDoc).toBeTruthy();

    const res = await app.request(`/api/kyc/my/${anyDoc!.id}/history`);
    expect(res.status).toBe(401);
  });
});
