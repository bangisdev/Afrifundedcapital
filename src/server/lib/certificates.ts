import { getDb } from "../db";
import { certificates, userChallenges } from "../schema";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";

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
  db: any,
  challengeId: number,
  newStatus: string,
): any | null {
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

  const result = db
    .insert(certificates)
    .values({
      userId: challenge.userId,
      challengeId,
      type: certType,
      certificateNumber: certNumber,
      verificationCode,
      issuedAt: Date.now(),
    })
    .returning()
    .get();

  return result;
}
