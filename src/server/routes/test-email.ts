import { Hono } from "hono";
import { sendEmail, resetResendClient } from "../lib/email";
import { getDb } from "../db";
import { settings } from "../schema";
import { eq } from "drizzle-orm";

const app = new Hono();

// POST /api/test-email/send-test — persist only non-secret config (fromEmail),
// use any supplied API key transiently for the send, and send a test email.
// API keys are never stored in the database — they must come from the
// RESEND_API_KEY environment variable.
app.post("/send-test", async (c) => {
  const body = await c.req.json();
  const { to, apiKey, fromEmail } = body;

  // Persist only the sender address + enabled flag — never the API key.
  if (fromEmail || apiKey) {
    try {
      const db = getDb();
      const existing = db.select().from(settings).where(eq(settings.key, "resend_config")).get();
      let config: Record<string, unknown> = {
        fromEmail: "AfriFundedCapital <onboarding@resend.dev>",
        enabled: true,
      };
      if (existing) {
        try {
          config = { ...(JSON.parse(existing.value) as Record<string, unknown>) };
        } catch { /* non-critical */ }
      }
      if (fromEmail) config.fromEmail = fromEmail;
      config.enabled = true;
      // Never persist apiKey/secret material even if the client sent it.
      delete config.apiKey;

      const value = JSON.stringify(config);
      if (existing) {
        db.update(settings).set({ value }).where(eq(settings.key, "resend_config")).run();
      } else {
        db.insert(settings).values({ key: "resend_config", value, group: "email", description: "Resend email configuration" }).run();
      }
      resetResendClient();
      console.log("[TestEmail] Resend sender config saved (API key intentionally not stored)");
    } catch (err) {
      console.error("[TestEmail] Failed to save Resend config:", err);
      return c.json({ error: "Failed to save email configuration" }, 500);
    }
  }

  if (!to) {
    return c.json({ error: "Email address is required" }, 400);
  }

  const result = await sendEmail({
    to,
    subject: "Test Email — AfriFundedCapital",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; line-height: 1.6; max-width: 600px; margin: 0 auto;">
  <div style="padding: 40px 20px;">
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="font-size: 20px; font-weight: 600; letter-spacing: -0.02em; margin: 0;">AfriFundedCapital</h1>
    </div>
    <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 12px;">Email Test Successful ✓</h2>
    <p style="font-size: 14px; color: #444;">Hello!</p>
    <p style="font-size: 14px; color: #444;">
      This is a test email from AfriFundedCapital. If you're receiving this, the Resend email integration is working correctly.
    </p>
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px 16px; margin: 16px 0;">
      <p style="font-size: 13px; color: #166534; margin: 0;"><strong>Status:</strong> Email service is operational</p>
      <p style="font-size: 13px; color: #166534; margin: 4px 0 0;"><strong>Provider:</strong> Resend</p>
      <p style="font-size: 13px; color: #166534; margin: 4px 0 0;"><strong>Sender:</strong> onboarding@resend.dev</p>
    </div>
    <p style="font-size: 14px; color: #444;">
      Transactional emails will be sent for:
    </p>
    <ul style="font-size: 14px; color: #444; padding-left: 20px;">
      <li>KYC approval/rejection notifications</li>
      <li>Payment confirmations</li>
      <li>Support ticket replies</li>
      <li>Payout approvals/rejections</li>
      <li>Welcome emails</li>
    </ul>
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; text-align: center;">
      <p style="font-size: 12px; color: #999; margin: 0;">
        AfriFundedCapital — The premier African prop trading firm
      </p>
    </div>
  </div>
</body>
</html>
    `,
    text: "Test Email — AfriFundedCapital - Email service is operational",
  }, apiKey ? { apiKey } : undefined);

  if (result) {
    return c.json({
      success: true,
      message: apiKey
        ? "Test email sent using the provided key (not stored). Set RESEND_API_KEY in the environment for production sending."
        : "Test email sent successfully",
    });
  } else {
    return c.json({ error: "Failed to send email. Check your Resend API key configuration (set RESEND_API_KEY)." }, 500);
  }
});

export default app;
