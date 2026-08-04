import { certificates, userChallenges, notifications, users } from "../schema";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import type { Db } from "../db";

/**
 * Maps challenge status to certificate type.
 * Returns null if the status doesn't warrant a certificate.
 */
function certTypeForStatus(status: string): string | null {
  switch (status) {
    case "phase_1_passed": return "phase_1";
    case "phase_2_passed": return "phase_2";
    case "funded": return "funded";
    default: return null;
  }
}

function generateCode(length: number): string {
  return randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length)
    .toUpperCase();
}

function generateCertNumber(type: string): string {
  const prefix =
    type === "phase_1" ? "P1" :
    type === "phase_2" ? "P2" :
    type === "funded" ? "FD" : "CT";
  const ts = Date.now().toString(36).toUpperCase();
  const rand = generateCode(4);
  return `AFC-${prefix}-${ts}-${rand}`;
}

/**
 * Auto-generate a certificate if the challenge has transitioned
 * to a completable status (phase_1_passed, phase_2_passed, funded).
 *
 * Returns the certificate record if one was created, or null if
 * no certificate was needed or one already existed.
 */
export function maybeGenerateCertificate(
  db: Db,
  challengeId: number,
  newStatus: string,
): typeof certificates.$inferSelect | null {
  const certType = certTypeForStatus(newStatus);
  if (!certType) return null;

  const challenge = db
    .select()
    .from(userChallenges)
    .where(eq(userChallenges.id, challengeId))
    .get();

  if (!challenge) return null;

  // Check if certificate already exists for this challenge + type
  const existing = db
    .select()
    .from(certificates)
    .where(
      and(
        eq(certificates.challengeId, challengeId),
        eq(certificates.type, certType)
      )
    )
    .get();

  if (existing) return existing;

  const certNumber = generateCertNumber(certType);
  const verificationCode = generateCode(12);

  const now = Date.now();
  const result = db
    .insert(certificates)
    .values({
      userId: challenge.userId,
      challengeId,
      type: certType,
      certificateNumber: certNumber,
      verificationCode,
      issuedAt: now,
    })
    .returning()
    .get();

  // ─── Dashboard notification ─────────────────────────────
  const typeLabel = certType === "phase_1" ? "Phase 1" : certType === "phase_2" ? "Phase 2" : "Funded Trader";
  try {
    db.insert(notifications).values({
      userId: challenge.userId,
      type: "certificate",
      title: `Certificate Earned: ${typeLabel}`,
      message: `Congratulations! You have earned a ${typeLabel} certificate (#${certNumber}). Download your PDF from the Certificates page.`,
      link: "/dashboard/certificates",
      createdAt: now,
    }).run();
  } catch {
    // Non-critical — don't fail cert generation if notification insert fails
  }

  // ─── Email notification (when email service is connected) ──
  // Check user email notification preferences
  try {
    const user = db.select().from(users).where(eq(users.id, challenge.userId)).get();
    if (user?.email && user.emailNotifications !== false) {
      console.log(`[EMAIL] Certificate earned notification for ${user.email}: ${typeLabel} cert #${certNumber}`);
      // When email service is integrated, send here:
      // await sendEmail({ to: user.email, subject: `Certificate Earned: ${typeLabel}`, template: 'certificate-earned', data: { certNumber, typeLabel, verificationCode } });
    }
  } catch {
    // Non-critical
  }

  return result;
}
