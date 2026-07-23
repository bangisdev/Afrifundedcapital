import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth, requireRole } from "./users";
import { KYC_STATUS, DOCUMENT_TYPES, ROLES } from "./schema";
import { internal } from "./_generated/api";

// ═══════════════════════════════════════════════
//  QUERIES
// ═══════════════════════════════════════════════

export const getMyKycStatus = query({
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    return {
      status: user?.kycStatus || KYC_STATUS.UNVERIFIED,
      verifiedAt: user?.kycVerifiedAt,
    };
  },
});

export const getMyKycDocuments = query({
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const docs = await ctx.db
      .query("kycDocuments")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    return docs.sort((a, b) => b.uploadedAt - a.uploadedAt);
  },
});

export const listKycDocuments = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [
      ROLES.COMPLIANCE_ADMIN,
      ROLES.SUPPORT_ADMIN,
      ROLES.SUPER_ADMIN,
      ROLES.CLIENT_MANAGER,
    ]);

    let docs = await ctx.db.query("kycDocuments").collect();
    if (args.status) {
      docs = docs.filter((d) => d.status === args.status);
    }
    docs.sort((a, b) => a.uploadedAt - b.uploadedAt);

    // Enrich with user data
    const enriched = await Promise.all(
      docs.slice(0, args.limit || 50).map(async (doc) => {
        const user = await ctx.db.get(doc.userId);
        return { ...doc, user: { name: user?.name, email: user?.email } };
      }),
    );

    return enriched;
  },
});

export const getKycDocumentById = query({
  args: { documentId: v.id("kycDocuments") },
  handler: async (ctx, args) => {
    await requireRole(ctx, [
      ROLES.COMPLIANCE_ADMIN,
      ROLES.SUPPORT_ADMIN,
      ROLES.SUPER_ADMIN,
    ]);
    return await ctx.db.get(args.documentId);
  },
});

// ═══════════════════════════════════════════════
//  MUTATIONS
// ═══════════════════════════════════════════════

export const uploadKycDocument = mutation({
  args: {
    documentType: v.union(
      v.literal(DOCUMENT_TYPES.PASSPORT),
      v.literal(DOCUMENT_TYPES.NATIONAL_ID),
      v.literal(DOCUMENT_TYPES.DRIVERS_LICENSE),
      v.literal(DOCUMENT_TYPES.PROOF_OF_ADDRESS),
      v.literal(DOCUMENT_TYPES.SELFIE),
    ),
    fileUrl: v.string(),
    fileHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // If already approved, prevent re-upload
    if (user.kycStatus === KYC_STATUS.APPROVED) {
      throw new Error("KYC already approved. Submit a support ticket for changes.");
    }

    // Check for existing pending document of same type
    const existingDocs = await ctx.db
      .query("kycDocuments")
      .withIndex("userId_status", (q) =>
        q.eq("userId", userId).eq("status", KYC_STATUS.PENDING),
      )
      .collect();

    const duplicateType = existingDocs.find((d) => d.documentType === args.documentType);
    if (duplicateType) {
      // Replace old document
      await ctx.db.delete(duplicateType._id);
    }

    const docId = await ctx.db.insert("kycDocuments", {
      userId,
      documentType: args.documentType,
      fileUrl: args.fileUrl,
      fileHash: args.fileHash,
      status: KYC_STATUS.PENDING,
      uploadedAt: Date.now(),
    });

    // Update user KYC status to pending
    await ctx.db.patch(userId, { kycStatus: KYC_STATUS.PENDING });

    // Create notification for admins
    const admins = await ctx.db.query("users").collect();
    for (const admin of admins) {
      if (admin.role && admin.role !== ROLES.USER) {
        await ctx.db.insert("notifications", {
          userId: admin._id,
          type: "kyc_pending",
          title: "New KYC Document",
          message: `${user.name || user.email} submitted a ${args.documentType} for verification.`,
          read: false,
          link: `/admin/kyc/${docId}`,
          createdAt: Date.now(),
        });
      }
    }

    return docId;
  },
});

export const approveKycDocument = mutation({
  args: {
    documentId: v.id("kycDocuments"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId: adminId } = await requireRole(ctx, [
      ROLES.COMPLIANCE_ADMIN,
      ROLES.SUPPORT_ADMIN,
      ROLES.SUPER_ADMIN,
    ]);

    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");

    await ctx.db.patch(args.documentId, {
      status: KYC_STATUS.APPROVED,
      reviewedBy: adminId,
      reviewedAt: Date.now(),
      notes: args.notes,
    });

    // Check if all required docs are approved
    const userDocs = await ctx.db
      .query("kycDocuments")
      .withIndex("userId_status", (q) =>
        q.eq("userId", doc.userId).eq("status", KYC_STATUS.APPROVED),
      )
      .collect();

    // Required: at least one ID (passport, national_id, or drivers_license) + proof_of_address + selfie
    const hasId = userDocs.some(
      (d) =>
        d.documentType === DOCUMENT_TYPES.PASSPORT ||
        d.documentType === DOCUMENT_TYPES.NATIONAL_ID ||
        d.documentType === DOCUMENT_TYPES.DRIVERS_LICENSE,
    );
    const hasAddress = userDocs.some((d) => d.documentType === DOCUMENT_TYPES.PROOF_OF_ADDRESS);
    const hasSelfie = userDocs.some((d) => d.documentType === DOCUMENT_TYPES.SELFIE);

    if (hasId && hasAddress && hasSelfie) {
      await ctx.db.patch(doc.userId, {
        kycStatus: KYC_STATUS.APPROVED,
        kycVerifiedAt: Date.now(),
      });

      // Notify user
      await ctx.db.insert("notifications", {
        userId: doc.userId,
        type: "kyc_approved",
        title: "KYC Approved",
        message: "Your identity verification has been approved. You can now purchase challenges.",
        read: false,
        link: "/dashboard/profile",
        createdAt: Date.now(),
      });

      // Send KYC approved email
      try {
        const user = await ctx.db.get(doc.userId);
        if (user?.email) {
          await (ctx.scheduler as any).runAfter(0, (internal as any).email.sendKycNotification, {
            email: user.email,
            name: user.name || "Trader",
            status: "approved",
          });
        }
      } catch (e: any) {
        console.error("Failed to send KYC approval email:", e.message);
      }
    }

    // Audit
    await ctx.db.insert("auditLogs", {
      userId: adminId,
      action: "kyc_document_approved",
      entity: "kycDocuments",
      entityId: args.documentId,
      timestamp: Date.now(),
    });
  },
});

export const rejectKycDocument = mutation({
  args: {
    documentId: v.id("kycDocuments"),
    rejectionReason: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId: adminId } = await requireRole(ctx, [
      ROLES.COMPLIANCE_ADMIN,
      ROLES.SUPPORT_ADMIN,
      ROLES.SUPER_ADMIN,
    ]);

    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");

    await ctx.db.patch(args.documentId, {
      status: KYC_STATUS.REJECTED,
      reviewedBy: adminId,
      reviewedAt: Date.now(),
      rejectionReason: args.rejectionReason,
      notes: args.notes,
    });

    // Reset user status to unverified so they can re-upload
    await ctx.db.patch(doc.userId, { kycStatus: KYC_STATUS.UNVERIFIED });

    // Notify user
    await ctx.db.insert("notifications", {
      userId: doc.userId,
      type: "kyc_rejected",
      title: "KYC Document Rejected",
      message: `Your ${doc.documentType} was rejected. Reason: ${args.rejectionReason}`,
      read: false,
      link: "/dashboard/kyc",
      createdAt: Date.now(),
    });

    // Send KYC rejection email
    try {
      const user = await ctx.db.get(doc.userId);
      if (user?.email) {
        await (ctx.scheduler as any).runAfter(0, (internal as any).email.sendKycNotification, {
          email: user.email,
          name: user.name || "Trader",
          status: "rejected",
          rejectionReason: args.rejectionReason,
        });
      }
    } catch (e: any) {
      console.error("Failed to send KYC rejection email:", e.message);
    }

    // Audit
    await ctx.db.insert("auditLogs", {
      userId: adminId,
      action: "kyc_document_rejected",
      entity: "kycDocuments",
      entityId: args.documentId,
      details: args.rejectionReason,
      timestamp: Date.now(),
    });
  },
});

export const deleteKycDocument = mutation({
  args: { documentId: v.id("kycDocuments") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(args.documentId);
  },
});
