import { Hono } from "hono";
import { getDb } from "../db";
import { certificates, certificateVerifications, userChallenges, users } from "../schema";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../middleware";

const app = new Hono();

// Get my certificates
app.get("/my", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();
  const certs = db.select().from(certificates)
    .where(eq(certificates.userId, userId))
    .orderBy(desc(certificates.issuedAt)).all();
  return c.json(certs);
});

// Public: Verify certificate
app.get("/verify/:code", (c) => {
  const code = c.req.param("code");
  const db = getDb();
  const cert = db.select().from(certificates)
    .where(eq(certificates.verificationCode, code)).get();

  if (!cert) return c.json({ valid: false });

  // Log verification
  db.insert(certificateVerifications).values({
    certificateId: cert.id,
    ipAddress: c.req.header("x-forwarded-for") || "unknown",
    verifiedAt: Date.now(),
  }).run();

  const challenge = db.select().from(userChallenges)
    .where(eq(userChallenges.id, cert.challengeId)).get();

  return c.json({
    valid: true,
    type: cert.type,
    certificateNumber: cert.certificateNumber,
    issuedAt: cert.issuedAt,
    accountSize: challenge?.accountSize,
  });
});

// Admin: List all certificates
app.get("/admin/all", requireAuth, (c) => {
  const db = getDb();
  const certs = db.select().from(certificates).orderBy(desc(certificates.issuedAt)).all();
  return c.json(certs);
});

export default app;
