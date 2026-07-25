import { Hono } from "hono";
import { getDb } from "../db";
import {
  certificates,
  certificateVerifications,
  userChallenges,
  users,
  challengeTemplates,
  accountSizes,
  mt5Accounts,
} from "../schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";
import { randomBytes } from "crypto";
import QRCode from "qrcode";

const app = new Hono();

// Helper: generate a random hex string
function generateCode(length: number): string {
  return randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length)
    .toUpperCase();
}

// Helper: generate certificate number
function generateCertNumber(type: string): string {
  const prefix =
    type === "phase_1"
      ? "P1"
      : type === "phase_2"
        ? "P2"
        : type === "funded"
          ? "FD"
          : "CT";
  const ts = Date.now().toString(36).toUpperCase();
  const rand = generateCode(4);
  return `AFC-${prefix}-${ts}-${rand}`;
}

// ─── Generate a certificate ────────────────────────────────
app.post("/generate", requireAuth, async (c) => {
  const userId = c.get("userId");
  const db = getDb();
  let body: any = {};
  try { body = await c.req.json(); } catch {}

  const challengeId = body?.challengeId as number;
  const certType = (body?.type as string) || "phase_1";

  if (!challengeId) {
    return c.json({ error: "challengeId is required" }, 400);
  }

  // Verify the challenge belongs to the user
  const challenge = db
    .select()
    .from(userChallenges)
    .where(
      and(
        eq(userChallenges.id, challengeId),
        eq(userChallenges.userId, userId)
      )
    )
    .get();

  if (!challenge) {
    return c.json({ error: "Challenge not found" }, 404);
  }

  // Check if certificate already exists for this challenge+type
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

  if (existing) {
    return c.json(existing);
  }

  const certNumber = generateCertNumber(certType);
  const verificationCode = generateCode(12);

  const result = db
    .insert(certificates)
    .values({
      userId,
      challengeId,
      type: certType,
      certificateNumber: certNumber,
      verificationCode,
      issuedAt: Date.now(),
    })
    .returning()
    .get();

  // Log audit (using raw SQL for audit_logs table)
  try {
    db.run(
      sql`INSERT INTO audit_logs (user_id, action, entity, entity_id, details, timestamp) VALUES (${userId}, ${"certificate_generated"}, ${"certificate"}, ${String(result.id)}, ${JSON.stringify({ certType, certNumber })}, ${Date.now()})`
    );
  } catch (e) {
    // Audit log is non-critical
  }

  return c.json(result, 201);
});

// ─── Generate certificate on challenge phase completion ────
app.post("/generate-on-completion", requireAuth, async (c) => {
  const userId = c.get("userId");
  const db = getDb();
  let body: any = {};
  try { body = await c.req.json(); } catch {}

  const challengeId = body?.challengeId as number;
  if (!challengeId) {
    return c.json({ error: "challengeId is required" }, 400);
  }

  const challenge = db
    .select()
    .from(userChallenges)
    .where(
      and(
        eq(userChallenges.id, challengeId),
        eq(userChallenges.userId, userId)
      )
    )
    .get();

  if (!challenge) {
    return c.json({ error: "Challenge not found" }, 404);
  }

  // Determine certificate type based on challenge status
  let certType: string | null = null;
  if (challenge.status === "phase_1_passed") certType = "phase_1";
  else if (challenge.status === "phase_2_passed") certType = "phase_2";
  else if (challenge.status === "funded") certType = "funded";

  if (!certType) {
    return c.json({ error: "Challenge not in a completable state" }, 400);
  }

  // Check if already exists
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

  if (existing) {
    return c.json(existing);
  }

  const certNumber = generateCertNumber(certType);
  const verificationCode = generateCode(12);

  const result = db
    .insert(certificates)
    .values({
      userId,
      challengeId,
      type: certType,
      certificateNumber: certNumber,
      verificationCode,
      issuedAt: Date.now(),
    })
    .returning()
    .get();

  return c.json(result, 201);
});

// ─── Get my certificates ───────────────────────────────────
app.get("/my", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();
  const certs = db
    .select()
    .from(certificates)
    .where(eq(certificates.userId, userId))
    .orderBy(desc(certificates.issuedAt))
    .all();
  return c.json(certs);
});

// ─── Get certificate by ID ─────────────────────────────────
app.get("/:id", requireAuth, (c) => {
  const userId = c.get("userId");
  const certId = Number(c.req.param("id"));
  const db = getDb();

  const cert = db
    .select()
    .from(certificates)
    .where(
      and(eq(certificates.id, certId), eq(certificates.userId, userId))
    )
    .get();

  if (!cert) return c.json({ error: "Certificate not found" }, 404);

  const challenge = db
    .select()
    .from(userChallenges)
    .where(eq(userChallenges.id, cert.challengeId))
    .get();

  return c.json({ ...cert, challenge });
});

// ─── Download certificate PDF ──────────────────────────────
app.get("/:id/pdf", requireAuth, async (c) => {
  const userId = c.get("userId");
  const certId = Number(c.req.param("id"));
  const db = getDb();

  const cert = db
    .select()
    .from(certificates)
    .where(
      and(eq(certificates.id, certId), eq(certificates.userId, userId))
    )
    .get();

  if (!cert) return c.json({ error: "Certificate not found" }, 404);

  const challenge = db
    .select()
    .from(userChallenges)
    .where(eq(userChallenges.id, cert.challengeId))
    .get();

  const user = db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .get();

  const template = challenge
    ? db
        .select()
        .from(challengeTemplates)
        .where(eq(challengeTemplates.id, challenge.templateId))
        .get()
    : null;

  // Build PDF with jsPDF
  const jsPDF = (await import("jspdf")).default;
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();

  // Background
  doc.setFillColor(250, 250, 250);
  doc.rect(0, 0, width, height, "F");

  // Border
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.5);
  doc.rect(8, 8, width - 16, height - 16);
  doc.setLineWidth(0.2);
  doc.rect(10, 10, width - 20, height - 20);

  // Header line
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(30, 35, width - 30, 35);

  // Company name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(20, 20, 20);
  doc.text("AfriFundedCapital", width / 2, 25, { align: "center" });

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(120, 120, 120);
  doc.text("Certificate of Achievement", width / 2, 32, { align: "center" });

  // Certificate type
  const typeLabel =
    cert.type === "phase_1"
      ? "Phase 1 Evaluation Passed"
      : cert.type === "phase_2"
        ? "Phase 2 Evaluation Passed"
        : "Funded Trader Status Achieved";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(40, 40, 40);
  doc.text(typeLabel, width / 2, 52, { align: "center" });

  // "This certifies that"
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.text("This is to certify that", width / 2, 68, { align: "center" });

  // Trader name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(20, 20, 20);
  doc.text(user?.name || "Trader", width / 2, 82, { align: "center" });

  // Underline for name
  const nameWidth =
    (doc.getStringUnitWidth(user?.name || "Trader") * 22) / doc.internal.scaleFactor;
  doc.setDrawColor(200, 200, 200);
  doc.line(width / 2 - nameWidth / 2 - 5, 85, width / 2 + nameWidth / 2 + 5, 85);

  // Description
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);

  const accountSizeStr = challenge?.accountSize
    ? `$${challenge.accountSize.toLocaleString()}`
    : "";
  const descText = `has successfully completed the ${typeLabel.replace("Passed", "").replace("Achieved", "").trim()} challenge${accountSizeStr ? ` with an account size of ${accountSizeStr}` : ""}.`;

  doc.text(descText, width / 2, 95, {
    align: "center",
    maxWidth: width - 80,
  });

  // Details grid
  const detailsY = 108;
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);

  // Left column
  doc.text(`Certificate Number:`, 50, detailsY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text(cert.certificateNumber, 50, detailsY + 5);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Issue Date:`, 50, detailsY + 12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text(
    new Date(cert.issuedAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    50,
    detailsY + 17
  );

  // Right column
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Challenge Type:`, width - 90, detailsY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text(template?.name || cert.type, width - 90, detailsY + 5);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Account Size:`, width - 90, detailsY + 12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text(accountSizeStr || "N/A", width - 90, detailsY + 17);

  // ── QR Code ──
  const verifyOrigin = c.req.header("x-forwarded-for")
    ? (c.req.header("x-forwarded-proto") || "https") + "://" + (c.req.header("host") || "afrifundedcapital.com")
    : "https://afrifundedcapital.com";
  const verifyUrl = `${verifyOrigin}/verify/${cert.verificationCode}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 300,
      margin: 1,
      color: { dark: "#1a1a1a", light: "#ffffff" },
    });

    // Extract base64 data from data URL
    const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, "");

    // Place QR code in bottom-right area of the certificate
    const qrSize = 25; // mm
    const qrX = width - 45;
    const qrY = height - 62;
    doc.addImage(base64Data, "PNG", qrX, qrY, qrSize, qrSize);

    // QR code label
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(140, 140, 140);
    doc.text("Scan to verify", qrX + qrSize / 2, qrY + qrSize + 3, { align: "center" });
  } catch (e) {
    // QR generation is non-critical — continue without it
    console.warn("[Certificate PDF] QR code generation failed:", e);
  }

  // Bottom line
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(30, height - 35, width - 30, height - 35);

  // Verification info
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(
    `Verification Code: ${cert.verificationCode}`,
    50,
    height - 28
  );
  doc.text(
    `Verify at: ${verifyUrl}`,
    50,
    height - 23
  );

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(170, 170, 170);
  doc.text("AfriFundedCapital © " + new Date().getFullYear(), width / 2, height - 14, {
    align: "center",
  });

  // Return PDF as buffer
  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

  c.header("Content-Type", "application/pdf");
  c.header(
    "Content-Disposition",
    `attachment; filename="certificate-${cert.certificateNumber}.pdf"`
  );
  return c.body(pdfBuffer);
});

// ─── Public: Verify certificate ────────────────────────────
app.get("/verify/:code", (c) => {
  const code = c.req.param("code");
  const db = getDb();
  const cert = db
    .select()
    .from(certificates)
    .where(eq(certificates.verificationCode, code))
    .get();

  if (!cert) return c.json({ valid: false });

  // Log verification
  db.insert(certificateVerifications)
    .values({
      certificateId: cert.id,
      ipAddress: c.req.header("x-forwarded-for") || "unknown",
      verifiedAt: Date.now(),
    })
    .run();

  const challenge = db
    .select()
    .from(userChallenges)
    .where(eq(userChallenges.id, cert.challengeId))
    .get();

  const user = db
    .select()
    .from(users)
    .where(eq(users.id, cert.userId))
    .get();

  const template = challenge
    ? db
        .select()
        .from(challengeTemplates)
        .where(eq(challengeTemplates.id, challenge.templateId))
        .get()
    : null;

  return c.json({
    valid: true,
    type: cert.type,
    certificateNumber: cert.certificateNumber,
    issuedAt: cert.issuedAt,
    traderName: user?.name || "Trader",
    accountSize: challenge?.accountSize,
    challengeName: template?.name,
  });
});

// ─── Admin: List all certificates ──────────────────────────
app.get("/admin/all", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const certs = db
    .select()
    .from(certificates)
    .orderBy(desc(certificates.issuedAt))
    .all();
  return c.json(certs);
});

// ─── Admin: Issue certificate for a challenge ──────────────
app.post("/admin/issue", requireAuth, requireAdmin, async (c) => {
  const db = getDb();
  let body: any = {};
  try { body = await c.req.json(); } catch {}

  const { challengeId, type } = body as { challengeId: number; type: string };
  if (!challengeId || !type) {
    return c.json({ error: "challengeId and type are required" }, 400);
  }

  const challenge = db
    .select()
    .from(userChallenges)
    .where(eq(userChallenges.id, challengeId))
    .get();

  if (!challenge) {
    return c.json({ error: "Challenge not found" }, 404);
  }

  // Check duplicate
  const existing = db
    .select()
    .from(certificates)
    .where(
      and(
        eq(certificates.challengeId, challengeId),
        eq(certificates.type, type)
      )
    )
    .get();

  if (existing) {
    return c.json({ error: "Certificate already exists for this challenge and type" }, 409);
  }

  const certNumber = generateCertNumber(type);
  const verificationCode = generateCode(12);

  const result = db
    .insert(certificates)
    .values({
      userId: challenge.userId,
      challengeId,
      type,
      certificateNumber: certNumber,
      verificationCode,
      issuedAt: Date.now(),
      issuedBy: c.get("userId"),
    })
    .returning()
    .get();

  return c.json(result, 201);
});

export default app;
