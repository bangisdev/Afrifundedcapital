/* eslint-disable @typescript-eslint/no-explicit-any */
import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { requireAuth, requireRole } from "./users";
import { ROLES } from "./schema";
import { internal } from "./_generated/api";

// ═══════════════════════════════════════════════
//  QUERIES
// ═══════════════════════════════════════════════

export const getMyCertificates = query({
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const certificates = await ctx.db
      .query("certificates")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    return certificates;
  },
});

export const listAllCertificates = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.CLIENT_MANAGER]);

    const certs = await ctx.db.query("certificates").order("desc").collect();
    const enriched = await Promise.all(
      certs.slice(0, args.limit || 50).map(async (c) => {
        const user = await ctx.db.get(c.userId);
        return { ...c, userName: user?.name, userEmail: user?.email };
      }),
    );

    return enriched;
  },
});

export const verifyCertificate = query({
  args: { verificationCode: v.string() },
  handler: async (ctx, args) => {
    const cert = await ctx.db
      .query("certificates")
      .withIndex("verificationCode", (q) => q.eq("verificationCode", args.verificationCode))
      .first();

    if (!cert) return { valid: false, message: "Certificate not found" };

    const user = await ctx.db.get(cert.userId);
    const challenge = await ctx.db.get(cert.challengeId);

    const typeLabel =
      (
        {
          phase_1: "Phase 1 Passed",
          phase_2: "Phase 2 Passed",
          funded: "Funded Trader",
        } as Record<string, string>
      )[cert.type] || cert.type;

    return {
      valid: true,
      certificate: {
        certificateNumber: cert.certificateNumber,
        type: cert.type,
        typeLabel,
        issuedAt: cert.issuedAt,
      },
      trader: {
        name: user?.name,
      },
      challenge: {
        accountSize: challenge?.accountSize,
      },
    };
  },
});

export const getCertificateById = query({
  args: { certificateId: v.id("certificates") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.certificateId);
  },
});

// ═══════════════════════════════════════════════
//  MUTATIONS
// ═══════════════════════════════════════════════

function generateCertificateNumber(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let num = "AFC-CERT-";
  for (let i = 0; i < 8; i++) {
    num += chars[Math.floor(Math.random() * chars.length)];
  }
  return num;
}

function generateVerificationCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 16; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
    if (i === 3 || i === 7 || i === 11) code += "-";
  }
  return code;
}

export const getCertificateByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    // Try verification code first, then certificate number
    let cert = await ctx.db
      .query("certificates")
      .withIndex("verificationCode", (q) => q.eq("verificationCode", args.code))
      .first();

    if (!cert) {
      cert = await ctx.db
        .query("certificates")
        .withIndex("certificateNumber", (q) => q.eq("certificateNumber", args.code))
        .first();
    }

    if (!cert) return null;

    const user = await ctx.db.get(cert.userId);
    const challenge = await ctx.db.get(cert.challengeId);

    const typeLabel =
      (
        {
          phase_1: "Phase 1 Passed",
          phase_2: "Phase 2 Passed",
          funded: "Funded Trader",
        } as Record<string, string>
      )[cert.type] || cert.type;

    return {
      certificateId: cert._id,
      certificateNumber: cert.certificateNumber,
      type: cert.type,
      typeLabel,
      issuedAt: cert.issuedAt,
      traderName: user?.name || "Verified Trader",
      accountSize: challenge?.accountSize || null,
    };
  },
});

export const publicVerifyCertificate = action({
  args: { code: v.string() },
  handler: async (ctx, args): Promise<{
    valid: boolean;
    message?: string;
    certificate?: {
      certificateNumber: string;
      type: string;
      typeLabel: string;
      issuedAt: number;
    };
    trader?: { name: string };
    challenge?: { accountSize: string | null };
  }> => {
    const data: any = await ctx.runQuery((internal as any).certificates.getCertificateByCode, {
      code: args.code,
    });

    if (!data) {
      return { valid: false, message: "Certificate not found." };
    }

    // Record the verification
    await ctx.runMutation((internal as any).certificates.recordVerification, {
      certificateId: data.certificateId,
      ipAddress: "",
    });

    return {
      valid: true,
      certificate: {
        certificateNumber: data.certificateNumber,
        type: data.type,
        typeLabel: data.typeLabel,
        issuedAt: data.issuedAt,
      },
      trader: {
        name: data.traderName,
      },
      challenge: {
        accountSize: data.accountSize
          ? `$${data.accountSize.toLocaleString()}`
          : null,
      },
    };
  },
});

export const issueCertificate = mutation({
  args: {
    challengeId: v.id("userChallenges"),
    type: v.union(v.literal("phase_1"), v.literal("phase_2"), v.literal("funded")),
  },
  handler: async (ctx, args) => {
    const { userId: adminId } = await requireRole(ctx, [
      ROLES.SUPER_ADMIN,
      ROLES.CLIENT_MANAGER,
    ]);

    const challenge = await ctx.db.get(args.challengeId);
    if (!challenge) throw new Error("Challenge not found");

    // Check if certificate already exists
    const existing = await ctx.db
      .query("certificates")
      .withIndex("challengeId", (q) => q.eq("challengeId", args.challengeId))
      .collect();

    if (existing.some((c) => c.type === args.type)) {
      throw new Error(`Certificate of type ${args.type} already exists for this challenge`);
    }

    const certificateNumber = generateCertificateNumber();
    const verificationCode = generateVerificationCode();

    const certId = await ctx.db.insert("certificates", {
      userId: challenge.userId,
      challengeId: args.challengeId,
      type: args.type,
      certificateNumber,
      verificationCode,
      issuedAt: Date.now(),
      issuedBy: adminId,
    });

    // Notify user
    await ctx.db.insert("notifications", {
      userId: challenge.userId,
      type: "certificate_issued",
      title: "Certificate Issued",
      message: `Your ${args.type.replace("_", " ")} certificate is ready!`,
      read: false,
      link: `/dashboard/certificates/${certId}`,
      createdAt: Date.now(),
    });

    return certId;
  },
});

export const recordVerification = mutation({
  args: {
    certificateId: v.id("certificates"),
    ipAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("certificateVerifications", {
      certificateId: args.certificateId,
      ipAddress: args.ipAddress,
      verifiedAt: Date.now(),
    });
  },
});
