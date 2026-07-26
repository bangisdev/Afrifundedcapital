/**
 * Email sending utility for AfriFundedCapital.
 *
 * Uses Resend SDK for transactional emails.
 * Falls back gracefully if the API key is not configured.
 */

import { Resend } from "resend";

import { getDb } from "../db";
import { settings } from "../schema";
import { eq } from "drizzle-orm";

const FROM_EMAIL_FALLBACK = "AfriFundedCapital <onboarding@resend.dev>";
const APP_URL = process.env.APP_URL || "https://beige-crews-rescue.freebuff.dev";

// Lazy-init Resend client — reads from DB settings first, falls back to env
let _resend: Resend | null = null;
let _resendKey: string = "";

function getResendClient(): Resend | null {
  // Try DB settings first
  try {
    const db = getDb();
    const setting = db.select().from(settings).where(eq(settings.key, "resend_config")).get();
    if (setting?.value) {
      const config = JSON.parse(setting.value);
      if (config.apiKey && config.apiKey !== _resendKey) {
        _resendKey = config.apiKey;
        _resend = new Resend(_resendKey);
        console.log("[Email] Resend client initialized from DB settings");
      }
      if (config.fromEmail) {
        // Update from email if configured
        return _resend;
      }
    }
  } catch {}

  // Fall back to environment variable
  const envKey = process.env.RESEND_API_KEY || "";
  if (envKey && envKey !== _resendKey) {
    _resendKey = envKey;
    _resend = new Resend(_resendKey);
    console.log("[Email] Resend client initialized from env");
  }

  return _resend;
}

function getFromEmail(): string {
  try {
    const db = getDb();
    const setting = db.select().from(settings).where(eq(settings.key, "resend_config")).get();
    if (setting?.value) {
      const config = JSON.parse(setting.value);
      if (config.fromEmail) return config.fromEmail;
    }
  } catch {}
  return process.env.RESEND_EMAIL_FROM || FROM_EMAIL_FALLBACK;
}

// Reset the Resend client when settings change
export function resetResendClient(): void {
  _resend = null;
  _resendKey = "";
  console.log("[Email] Resend client reset — will re-initialize on next send");
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send a transactional email via Resend.
 * Silently logs and returns false if not configured or on failure.
 */
export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const resendClient = getResendClient();
  if (!resendClient) {
    console.warn("[Email] RESEND_API_KEY not configured — skipping email send to", params.to);
    return false;
  }

  try {
    const { data, error } = await resendClient.emails.send({
      from: getFromEmail(),
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text || params.subject,
    });

    if (error) {
      console.error("[Email] Resend error:", error);
      return false;
    }

    console.log("[Email] Sent to", params.to, "—", params.subject, "— ID:", data?.id);
    return true;
  } catch (err) {
    console.error("[Email] Error sending to", params.to, ":", err);
    return false;
  }
}

// ═══════════════════════════════════════════════════════
//  HTML Email Templates
// ═══════════════════════════════════════════════════════

const BASE_STYLE = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #1a1a1a;
  line-height: 1.6;
  max-width: 600px;
  margin: 0 auto;
`;

function wrapLayout(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="${BASE_STYLE}">
  <div style="padding: 40px 20px;">
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="font-size: 20px; font-weight: 600; letter-spacing: -0.02em; margin: 0;">AfriFundedCapital</h1>
    </div>
    ${content}
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; text-align: center;">
      <p style="font-size: 12px; color: #999; margin: 0;">
        AfriFundedCapital — The premier African prop trading firm<br>
        <a href="${APP_URL}" style="color: #666;">${APP_URL}</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `
    <a href="${href}" style="
      display: inline-block;
      background: #1a1a1a;
      color: #fff;
      padding: 10px 24px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      margin: 16px 0;
    ">${label}</a>`;
}

// ─── KYC Emails ────────────────────────────────────

export function kycApprovedEmail(userName: string): SendEmailParams & { subject: string; html: string } {
  return {
    to: "", // filled by caller
    subject: "Identity Verified — AfriFundedCapital",
    html: wrapLayout(`
      <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 12px;">Identity Verified ✓</h2>
      <p style="font-size: 14px; color: #444;">Hi ${userName},</p>
      <p style="font-size: 14px; color: #444;">
        Your identity documents have been approved. Your profile is now fully verified and profile fields are locked.
      </p>
      <p style="font-size: 14px; color: #444;">
        You can now fully access all platform features, including funded account withdrawals.
      </p>
      ${button(`${APP_URL}/dashboard/profile`, "View Profile")}
    `),
  };
}

export function kycRejectedEmail(userName: string, docType: string, reason: string): SendEmailParams & { subject: string; html: string } {
  return {
    to: "",
    subject: "Document Rejected — Action Required",
    html: wrapLayout(`
      <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 12px;">Document Rejected</h2>
      <p style="font-size: 14px; color: #444;">Hi ${userName},</p>
      <p style="font-size: 14px; color: #444;">
        Your <strong>${docType.replace(/_/g, " ")}</strong> document was rejected.
      </p>
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 12px 16px; margin: 16px 0;">
        <p style="font-size: 13px; color: #dc2626; margin: 0;"><strong>Reason:</strong> ${reason}</p>
      </div>
      <p style="font-size: 14px; color: #444;">
        Please re-upload a clear, valid document that meets our verification requirements.
      </p>
      ${button(`${APP_URL}/dashboard/profile`, "Re-upload Document")}
    `),
  };
}

export function kycDocumentUploadedEmail(userName: string, docType: string): SendEmailParams & { subject: string; html: string } {
  return {
    to: "",
    subject: "Document Received — Under Review",
    html: wrapLayout(`
      <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 12px;">Document Received</h2>
      <p style="font-size: 14px; color: #444;">Hi ${userName},</p>
      <p style="font-size: 14px; color: #444;">
        We've received your <strong>${docType.replace(/_/g, " ")}</strong> document for verification.
      </p>
      <p style="font-size: 14px; color: #444;">
        Our team will review it within 1–24 hours. You'll receive an email once a decision is made.
      </p>
    `),
  };
}

// ─── Payment Emails ─────────────────────────────────

export function paymentConfirmationEmail(userName: string, amount: number, currency: string, description: string): SendEmailParams & { subject: string; html: string } {
  return {
    to: "",
    subject: "Payment Confirmed — AfriFundedCapital",
    html: wrapLayout(`
      <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 12px;">Payment Confirmed ✓</h2>
      <p style="font-size: 14px; color: #444;">Hi ${userName},</p>
      <p style="font-size: 14px; color: #444;">
        Your payment has been successfully processed.
      </p>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px 16px; margin: 16px 0;">
        <p style="font-size: 13px; color: #166534; margin: 0;"><strong>Amount:</strong> ${currency} ${amount.toLocaleString()}</p>
        <p style="font-size: 13px; color: #166534; margin: 4px 0 0;"><strong>Description:</strong> ${description}</p>
      </div>
      <p style="font-size: 14px; color: #444;">
        Your challenge is now active. Good luck with your trading journey!
      </p>
      ${button(`${APP_URL}/dashboard/challenges`, "View Challenges")}
    `),
  };
}

// ─── Support Emails ─────────────────────────────────

export function supportTicketReplyEmail(userName: string, ticketSubject: string, replyPreview: string): SendEmailParams & { subject: string; html: string } {
  return {
    to: "",
    subject: `New Reply on "${ticketSubject}" — AfriFundedCapital`,
    html: wrapLayout(`
      <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 12px;">Support Reply</h2>
      <p style="font-size: 14px; color: #444;">Hi ${userName},</p>
      <p style="font-size: 14px; color: #444;">
        Our support team has replied to your ticket <strong>"${ticketSubject}"</strong>.
      </p>
      <div style="background: #f5f5f5; border-radius: 6px; padding: 12px 16px; margin: 16px 0;">
        <p style="font-size: 13px; color: #666; margin: 0;">${replyPreview.slice(0, 200)}${replyPreview.length > 200 ? "..." : ""}</p>
      </div>
      ${button(`${APP_URL}/dashboard/support`, "View Ticket")}
    `),
  };
}

// ─── Welcome Email ──────────────────────────────────

export function welcomeEmail(userName: string): SendEmailParams & { subject: string; html: string } {
  return {
    to: "",
    subject: "Welcome to AfriFundedCapital!",
    html: wrapLayout(`
      <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 12px;">Welcome aboard! 🎉</h2>
      <p style="font-size: 14px; color: #444;">Hi ${userName},</p>
      <p style="font-size: 14px; color: #444;">
        Welcome to AfriFundedCapital — the premier African prop trading firm.
      </p>
      <p style="font-size: 14px; color: #444;">
        Here's what you can do to get started:
      </p>
      <ul style="font-size: 14px; color: #444; padding-left: 20px;">
        <li>Complete your profile and KYC verification</li>
        <li>Browse available challenge types</li>
        <li>Purchase a challenge and start trading</li>
        <li>Earn up to 90% profit share on funded accounts</li>
      </ul>
      ${button(`${APP_URL}/dashboard/overview`, "Go to Dashboard")}
    `),
  };
}

// ─── Payout Emails ──────────────────────────────────

export function payoutApprovedEmail(userName: string, amount: number, currency: string): SendEmailParams & { subject: string; html: string } {
  return {
    to: "",
    subject: "Payout Approved — AfriFundedCapital",
    html: wrapLayout(`
      <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 12px;">Payout Approved ✓</h2>
      <p style="font-size: 14px; color: #444;">Hi ${userName},</p>
      <p style="font-size: 14px; color: #444;">
        Your payout request of <strong>${currency} ${amount.toLocaleString()}</strong> has been approved and will be processed shortly.
      </p>
      ${button(`${APP_URL}/dashboard/payouts`, "View Payouts")}
    `),
  };
}

export function payoutRejectedEmail(userName: string, amount: number, currency: string, reason: string): SendEmailParams & { subject: string; html: string } {
  return {
    to: "",
    subject: "Payout Rejected — AfriFundedCapital",
    html: wrapLayout(`
      <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 12px;">Payout Rejected</h2>
      <p style="font-size: 14px; color: #444;">Hi ${userName},</p>
      <p style="font-size: 14px; color: #444;">
        Your payout request of <strong>${currency} ${amount.toLocaleString()}</strong> was rejected.
      </p>
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 12px 16px; margin: 16px 0;">
        <p style="font-size: 13px; color: #dc2626; margin: 0;"><strong>Reason:</strong> ${reason}</p>
      </div>
      ${button(`${APP_URL}/dashboard/payouts`, "View Payouts")}
    `),
  };
}
