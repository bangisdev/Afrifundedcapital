import { Hono } from "hono";
import { getDb } from "../db";
import { kycDocuments, users, auditLogs } from "../schema";
import { eq, desc, asc, and, or, like, count, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";
import { notify } from "../lib/notifications";
import { writeAuditLog } from "../lib/audit";
import { kycApprovedEmail, kycRejectedEmail, kycDocumentUploadedEmail } from "../lib/email";

const app = new Hono();

// Allowed MIME types and max size (5MB)
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

// Get my KYC documents
app.get("/my", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();

  const qPage = Number(c.req.query("page") || 1);
  const qPageSize = Number(c.req.query("pageSize") || 10);
  const page = Math.max(1, qPage);
  const pageSize = Math.min(50, Math.max(1, qPageSize));

  // Sorting (whitelisted columns, asc/desc)
  const SORTABLE: Record<string, SQLWrapper> = {
    id: kycDocuments.id,
    documentType: kycDocuments.documentType,
    status: kycDocuments.status,
    uploadedAt: kycDocuments.uploadedAt,
    reviewedAt: kycDocuments.reviewedAt,
  };
  const qSortBy = String(c.req.query("sortBy") || "uploadedAt");
  const qSortOrder = String(c.req.query("sortOrder") || "desc");
  const sortCol = SORTABLE[qSortBy] || kycDocuments.uploadedAt;
  const sortOrder = qSortOrder.toLowerCase() === "asc" ? asc(sortCol) : desc(sortCol);

  const whereClause: SQL = eq(kycDocuments.userId, userId);

  // Total matching count
  const totalRow = db.select({ count: count() }).from(kycDocuments).where(whereClause).get();
  const total = totalRow?.count || 0;

  // Page of documents
  const docs = db
    .select()
    .from(kycDocuments)
    .where(whereClause)
    .orderBy(sortOrder)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  // Strip fileData from list responses for performance
  const stripped = docs.map(({ fileUrl, ...rest }) => ({
    ...rest,
    hasFile: !!fileUrl,
    filePreview: fileUrl ? fileUrl.substring(0, 30) + "..." : null,
  }));

  // User-wide stats (unfiltered)
  const all = db.select({ status: kycDocuments.status }).from(kycDocuments).where(whereClause).all();
  const byStatus = all.reduce<Record<string, number>>((acc, d) => {
    const key = d.status || "unverified";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return c.json({
    documents: stripped,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats: { total: all.length, byStatus },
  });
});

// Get single KYC document (with file data for preview)
app.get("/my/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const doc = db.select().from(kycDocuments)
    .where(and(eq(kycDocuments.id, id), eq(kycDocuments.userId, userId)))
    .get();
  if (!doc) return c.json({ error: "Document not found" }, 404);
  return c.json(doc);
});

// Upload KYC document (with real file data)
app.post("/upload", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const db = getDb();

  const { documentType, fileData, fileName, fileSize, mimeType } = body;

  // Validate document type
  const validTypes = ["passport", "national_id", "drivers_license", "proof_of_address", "selfie"];
  if (!validTypes.includes(documentType)) {
    return c.json({ error: "Invalid document type" }, 400);
  }

  // Validate file if provided
  if (fileData) {
    // Check MIME type
    if (mimeType && !ALLOWED_TYPES.includes(mimeType)) {
      return c.json({ error: `File type not allowed. Accepted: JPEG, PNG, WebP, PDF` }, 400);
    }

    // Check file size (if provided as base64, estimate decoded size)
    if (fileSize && fileSize > MAX_SIZE_BYTES) {
      return c.json({ error: "File size must be under 5MB" }, 400);
    }

    // For base64 data URLs, also check the data length
    if (fileData.startsWith("data:")) {
      const base64Part = fileData.split(",")[1] || "";
      const estimatedSize = Math.ceil(base64Part.length * 0.75);
      if (estimatedSize > MAX_SIZE_BYTES) {
        return c.json({ error: "File size must be under 5MB" }, 400);
      }
    }
  }

  // Check if user already has a pending/approved document of this type
  // If so, allow re-upload (creates a new record, old ones stay for audit)
  const existingDoc = db.select().from(kycDocuments)
    .where(and(
      eq(kycDocuments.userId, userId),
      eq(kycDocuments.documentType, documentType),
    ))
    .orderBy(desc(kycDocuments.uploadedAt))
    .get();

  // If there's an approved doc of this type, don't allow re-upload
  if (existingDoc && existingDoc.status === "approved") {
    return c.json({ error: "This document type is already approved" }, 400);
  }

  // Compute a simple hash of the file data for duplicate detection
  let fileHash: string | null = null;
  if (fileData) {
    // Simple hash: use filename + size + first 100 chars of data
    fileHash = `${fileName || "unknown"}-${fileSize || 0}-${(fileData || "").substring(0, 100)}`;
  }

  const result = db.insert(kycDocuments).values({
    userId,
    documentType,
    fileUrl: fileData || "/uploads/" + Date.now() + ".pdf",
    fileHash,
    status: "pending",
    uploadedAt: Date.now(),
  }).returning().get();

  // Update user's KYC status to pending if it was unverified
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (user && user.kycStatus === "unverified") {
    db.update(users).set({
      kycStatus: "pending",
      updatedAt: Date.now(),
    }).where(eq(users.id, userId)).run();
  }

  // Record the submission in the audit trail so users can view a full document
  // timeline (upload → review) from the profile page.
  try {
    writeAuditLog(db, {
      userId,
      action: "kyc.uploaded",
      entity: "kyc_document",
      entityId: result.id,
      details: { documentType, fileName: fileName || null },
      ipAddress: c.req.header("x-forwarded-for"),
    });
  } catch (e) {
    console.warn("[Audit] Failed to log KYC upload:", e);
  }

  return c.json({
    id: result.id,
    documentType: result.documentType,
    status: result.status,
    uploadedAt: result.uploadedAt,
  });
});

// Get the audit timeline for one of the user's own KYC documents. Users can't
// see the admin audit log, so this exposes only the entries for their document:
// submission, approval/rejection (with the admin who reviewed it).
app.get("/my/:id/history", requireAuth, (c) => {
  const userId = c.get("userId");
  const id = parseInt(c.req.param("id"));
  const db = getDb();

  const doc = db.select().from(kycDocuments)
    .where(and(eq(kycDocuments.id, id), eq(kycDocuments.userId, userId)))
    .get();
  if (!doc) return c.json({ error: "Document not found" }, 404);

  const rows = db
    .select({ log: auditLogs, userName: users.name, userEmail: users.email })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(and(eq(auditLogs.entity, "kyc_document"), eq(auditLogs.entityId, String(id))))
    .orderBy(asc(auditLogs.timestamp))
    .all();

  const parseDetails = (raw: string | null): Record<string, unknown> | null => {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const events = rows.map(({ log, userName, userEmail }) => ({
    action: log.action,
    timestamp: log.timestamp,
    actorName: userName || null,
    actorEmail: userEmail || null,
    details: parseDetails(log.details),
  }));

  // Documents uploaded before submission auditing existed have no baseline
  // entry — synthesize one from the record so every doc has a full timeline.
  if (!events.some((e) => e.action === "kyc.uploaded")) {
    const owner = db.select().from(users).where(eq(users.id, doc.userId)).get();
    events.unshift({
      action: "kyc.uploaded",
      timestamp: doc.uploadedAt,
      actorName: owner?.name || null,
      actorEmail: owner?.email || null,
      details: { documentType: doc.documentType },
    });
  }

  return c.json({
    events,
    doc: {
      id: doc.id,
      documentType: doc.documentType,
      status: doc.status,
      uploadedAt: doc.uploadedAt,
      reviewedAt: doc.reviewedAt,
      rejectionReason: doc.rejectionReason,
    },
  });
});

// Delete a KYC document (before it's reviewed)
app.delete("/my/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const doc = db.select().from(kycDocuments)
    .where(and(eq(kycDocuments.id, id), eq(kycDocuments.userId, userId)))
    .get();
  if (!doc) return c.json({ error: "Document not found" }, 404);
  if (doc.status === "approved") {
    return c.json({ error: "Cannot delete an approved document" }, 400);
  }
  db.delete(kycDocuments).where(eq(kycDocuments.id, id)).run();
  return c.json({ success: true });
});

// ─── Admin Endpoints ──────────────────────────────────

// Admin: List all KYC documents (paginated + searchable)
app.get("/admin/all", requireAuth, requireAdmin, (c) => {
  const db = getDb();

  // Pagination params (clamped)
  const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") || "20") || 20));

  // Sorting (whitelisted columns, asc/desc)
  const SORTABLE: Record<string, SQLWrapper> = {
    id: kycDocuments.id,
    documentType: kycDocuments.documentType,
    status: kycDocuments.status,
    uploadedAt: kycDocuments.uploadedAt,
    reviewedAt: kycDocuments.reviewedAt,
  };
  const qSortBy = String(c.req.query("sortBy") || "uploadedAt");
  const qSortOrder = String(c.req.query("sortOrder") || "desc");
  const sortCol = SORTABLE[qSortBy] || kycDocuments.uploadedAt;
  const sortOrder = qSortOrder.toLowerCase() === "asc" ? asc(sortCol) : desc(sortCol);

  // Filters
  const search = (c.req.query("search") || "").trim();
  const status = c.req.query("status") || "";
  const type = c.req.query("type") || "";

  const conditions: SQL[] = [];
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        like(kycDocuments.documentType, pattern),
        like(users.name, pattern),
        like(users.email, pattern),
      )!,
    );
  }
  if (status && status !== "all") conditions.push(eq(kycDocuments.status, status));
  if (type && type !== "all") conditions.push(eq(kycDocuments.documentType, type));
  const whereClause: SQL = conditions.length > 0 ? and(...conditions)! : sql`1 = 1`;

  // Total matching count
  const totalRow = db
    .select({ count: count() })
    .from(kycDocuments)
    .leftJoin(users, eq(users.id, kycDocuments.userId))
    .where(whereClause)
    .get();
  const total = totalRow?.count || 0;

  // Page of documents with user info joined
  const rows = db
    .select({ doc: kycDocuments, userName: users.name, userEmail: users.email })
    .from(kycDocuments)
    .leftJoin(users, eq(users.id, kycDocuments.userId))
    .where(whereClause)
    .orderBy(sortOrder)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  const items = rows.map(({ doc, userName, userEmail }) => ({
    ...doc,
    userName: userName || null,
    userEmail: userEmail || null,
    hasFile: !!doc.fileUrl,
  }));

  // Platform-wide stats (unfiltered) so the stat cards stay accurate when filtered/paginated
  const all = db.select({ count: count() }).from(kycDocuments).get();
  const pending = db.select({ count: count() }).from(kycDocuments).where(eq(kycDocuments.status, "pending")).get();
  const approved = db.select({ count: count() }).from(kycDocuments).where(eq(kycDocuments.status, "approved")).get();
  const rejected = db.select({ count: count() }).from(kycDocuments).where(eq(kycDocuments.status, "rejected")).get();

  return c.json({
    documents: items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats: {
      total: all?.count || 0,
      pending: pending?.count || 0,
      approved: approved?.count || 0,
      rejected: rejected?.count || 0,
    },
  });
});

// Admin: Get single document with file data for preview
app.get("/admin/:id", requireAuth, requireAdmin, (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const doc = db.select().from(kycDocuments).where(eq(kycDocuments.id, id)).get();
  if (!doc) return c.json({ error: "Document not found" }, 404);
  // Get user info
  const user = db.select().from(users).where(eq(users.id, doc.userId)).get();
  return c.json({
    ...doc,
    userName: user?.name || "Unknown",
    userEmail: user?.email || "Unknown",
  });
});

// Admin: Approve KYC
app.post("/admin/:id/approve", requireAuth, requireAdmin, async (c) => {
  const adminId = c.get("userId");
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const doc = db.select().from(kycDocuments).where(eq(kycDocuments.id, id)).get();
  if (!doc) return c.json({ error: "Document not found" }, 404);

  db.update(kycDocuments).set({
    status: "approved",
    reviewedBy: adminId,
    reviewedAt: Date.now(),
  }).where(eq(kycDocuments.id, id)).run();

  // Check if all required document types are approved for this user
  const userDocs = db.select().from(kycDocuments)
    .where(and(
      eq(kycDocuments.userId, doc.userId),
      eq(kycDocuments.status, "approved"),
    ))
    .all();

  const approvedTypes = new Set(userDocs.map((d) => d.documentType));
  const requiredTypes = ["passport", "national_id"];
  const hasAllRequired = requiredTypes.some((t) => approvedTypes.has(t));

  // Also accept proof_of_address as alternative
  const hasAlternative = approvedTypes.has("proof_of_address") || approvedTypes.has("drivers_license");  // Get user name for email
  const userRecord = db.select().from(users).where(eq(users.id, doc.userId)).get();
  const userName = userRecord?.name || "Trader";

  try {
    writeAuditLog(db, {
      userId: adminId,
      action: "kyc.approved",
      entity: "kyc_document",
      entityId: doc.id,
      details: {
        targetUserId: doc.userId,
        documentType: doc.documentType,
        userFullyVerified: hasAllRequired || hasAlternative,
      },
      ipAddress: c.req.header("x-forwarded-for"),
    });
  } catch (e) {
    console.warn("[Audit] Failed to log KYC approval:", e);
  }

  if (hasAllRequired || hasAlternative) {
    db.update(users).set({
      kycStatus: "approved",
      kycVerifiedAt: Date.now(),
      updatedAt: Date.now(),
    }).where(eq(users.id, doc.userId)).run();

    notify(db, doc.userId, {
      type: "kyc",
      title: "Identity Verified",
      message: "Your identity has been verified. Your profile is now fully verified and profile fields are locked.",
      link: "/dashboard/profile",
      email: kycApprovedEmail(userName),
    });
  } else {
    notify(db, doc.userId, {
      type: "kyc",
      title: "Document Approved",
      message: `Your ${doc.documentType.replace(/_/g, " ")} document has been approved. ${hasAllRequired ? "" : "Please upload additional documents to complete verification."}`,
      link: "/dashboard/profile",
      email: kycApprovedEmail(userName),
    });
  }

  return c.json({ success: true, userFullyVerified: hasAllRequired || hasAlternative });
});

// Admin: Reject KYC
app.post("/admin/:id/reject", requireAuth, requireAdmin, async (c) => {
  const adminId = c.get("userId");
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const db = getDb();
  const doc = db.select().from(kycDocuments).where(eq(kycDocuments.id, id)).get();
  if (!doc) return c.json({ error: "Document not found" }, 404);

  db.update(kycDocuments).set({
    status: "rejected",
    rejectionReason: body.reason || "Document does not meet requirements",
    reviewedBy: adminId,
    reviewedAt: Date.now(),
  }).where(eq(kycDocuments.id, id)).run();

  try {
    writeAuditLog(db, {
      userId: adminId,
      action: "kyc.rejected",
      entity: "kyc_document",
      entityId: doc.id,
      details: {
        targetUserId: doc.userId,
        documentType: doc.documentType,
        reason: body.reason || "Document does not meet requirements",
      },
      ipAddress: c.req.header("x-forwarded-for"),
    });
  } catch (e) {
    console.warn("[Audit] Failed to log KYC rejection:", e);
  }

  // Get user name for email
  const userRecord = db.select().from(users).where(eq(users.id, doc.userId)).get();
  const userName = userRecord?.name || "Trader";

  notify(db, doc.userId, {
    type: "kyc",
    title: "Document Rejected",
    message: `Your ${doc.documentType.replace(/_/g, " ")} document was rejected. Reason: ${body.reason || "Not specified"}. Please re-upload with the correct documents.`,
    link: "/dashboard/profile",
    email: kycRejectedEmail(userName, doc.documentType, body.reason || "Document does not meet requirements"),
  });

  return c.json({ success: true });
});

export default app;
