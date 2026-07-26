import { Hono } from "hono";
import { sendEmail } from "../lib/email";

const app = new Hono();

// Test email endpoint - sends a test email via Resend
app.post("/send-test", async (c) => {
  const body = await c.req.json();
  const { to } = body;

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
  });

  if (result) {
    return c.json({ success: true, message: "Test email sent successfully" });
  } else {
    return c.json({ error: "Failed to send email. Check RESEND_API_KEY configuration." }, 500);
  }
});

export default app;
