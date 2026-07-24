import { Hono } from "hono";
import { getDb } from "../db";
import { kycDocuments, users } from "../schema";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";
import { createNotification } from "../lib/notifications";

const app = new Hono();

// Get my KYC documents
app.get("/my", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();
  const docs = db.select().from(kycDocuments)
    .where(eq(kycDocuments.userId, userId))
    .orderBy(desc(kycDocuments.uploadedAt)).all();
  return c.json(docs);
});

// Upload KYC document
app.post("/upload", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const db = getDb();
  const result = db.insert(kycDocuments).values({
    userId,
    documentType: body.documentType,
    fileUrl: body.fileUrl || "/uploads/" + Date.now() + ".pdf",
    status: "pending",
    uploadedAt: Date.now(),
  }).returning().get();
  return c.json(result);
});

// Admin: List all KYC documents
app.get("/admin/all", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const docs = db.select().from(kycDocuments).orderBy(desc(kycDocuments.uploadedAt)).all();
  return c.json(docs);
});

// Admin: Approve KYC
app.post("/admin/:id/approve", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const doc = db.select().from(kycDocuments).where(eq(kycDocuments.id, id)).get();
  if (doc) {
    db.update(kycDocuments).set({ status: "approved", reviewedAt: Date.now() }).where(eq(kycDocuments.id, id)).run();
    db.update(users).set({ kycStatus: "approved", kycVerifiedAt: Date.now(), updatedAt: Date.now() }).where(eq(users.id, doc.userId)).run();
    createNotification(db, doc.userId, {
      type: "kyc",
      title: "KYC Approved",
      message: `Your ${doc.documentType.replace(/_/g, " ")} document has been approved. Your profile is now fully verified.`,
      link: "/dashboard/profile",
    });
  }
  return c.json({ success: true });
});

// Admin: Reject KYC
app.post("/admin/:id/reject", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const db = getDb();
  const doc = db.select().from(kycDocuments).where(eq(kycDocuments.id, id)).get();
  db.update(kycDocuments).set({ status: "rejected", rejectionReason: body.reason, reviewedAt: Date.now() }).where(eq(kycDocuments.id, id)).run();
  if (doc) {
    createNotification(db, doc.userId, {
      type: "kyc",
      title: "KYC Rejected",
      message: `Your ${doc.documentType.replace(/_/g, " ")} document was rejected. Reason: ${body.reason || "Not specified"}. Please re-upload with the correct documents.`,
      link: "/dashboard/profile",
    });
  }
  return c.json({ success: true });
});

export default app;
