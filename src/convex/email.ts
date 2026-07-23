"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { vly } from "../lib/vly-integrations";

// ═══════════════════════════════════════════════
//  PAYMENT CONFIRMATION EMAIL
// ═══════════════════════════════════════════════

export const sendPaymentConfirmation = action({
  args: {
    email: v.string(),
    name: v.string(),
    amount: v.number(),
    currency: v.string(),
    reference: v.string(),
    challengeName: v.string(),
    accountSize: v.string(),
    provider: v.string(),
  },
  handler: async (_ctx, args) => {
    const { email, name, amount, currency, reference, challengeName, accountSize, provider } = args;

    const formattedAmount = new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currency || "NGN",
    }).format(amount);

    const providerLabel = provider === "flutterwave" ? "Flutterwave" : "Paystack";

    const subject = `Payment Confirmed — ${challengeName} Challenge | AfriFundedCapital`;
    const html = buildPaymentConfirmationHtml({
      name,
      formattedAmount,
      reference,
      challengeName,
      accountSize,
      providerLabel,
    });
    const text = `Dear ${name},\n\nYour payment of ${formattedAmount} for the ${challengeName} (${accountSize}) challenge has been confirmed.\n\nReference: ${reference}\nProvider: ${providerLabel}\n\nYour challenge is now active. Log in to your dashboard to view your trading metrics and progress.\n\nHappy trading,\nThe AfriFundedCapital Team`;

    return await sendEmail(email, subject, html, text);
  },
});

// ═══════════════════════════════════════════════
//  CHALLENGE VIOLATION EMAIL
// ═══════════════════════════════════════════════

export const sendChallengeViolation = action({
  args: {
    email: v.string(),
    name: v.string(),
    challengeName: v.string(),
    accountSize: v.string(),
    violationType: v.string(),
    description: v.string(),
    severity: v.string(),
  },
  handler: async (_ctx, args) => {
    const { email, name, challengeName, accountSize, violationType, description, severity } = args;

    const isCritical = severity === "critical";
    const subject = `${isCritical ? "⚠️" : "⚡"} Challenge ${isCritical ? "Violated" : "Warning"} — ${challengeName} | AfriFundedCapital`;

    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="padding:40px 40px 24px;text-align:center;border-bottom:1px solid #eaeaea;">
<h1 style="margin:0;font-size:20px;font-weight:600;letter-spacing:-0.02em;color:#111;text-transform:uppercase;">AfriFundedCapital</h1>
<p style="margin:8px 0 0;font-size:13px;color:#666;letter-spacing:0.04em;">Challenge Alert</p>
</td></tr>
<tr><td style="padding:40px 40px 0;text-align:center;">
<table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
<td style="width:56px;height:56px;border-radius:50%;background-color:${isCritical ? '#fce4e4' : '#fff3e0'};text-align:center;vertical-align:middle;">
<span style="font-size:26px;line-height:56px;">${isCritical ? '⚠' : '⚡'}</span>
</td></tr></table>
<h2 style="margin:20px 0 4px;font-size:18px;font-weight:500;color:#111;letter-spacing:-0.01em;">
${isCritical ? 'Challenge Violated' : 'Challenge Warning'}
</h2>
<p style="margin:0 0 4px;font-size:14px;color:#555;">${challengeName} — ${accountSize}</p>
</td></tr>
<tr><td style="padding:32px 40px;">
<table width="100%" cellpadding="0" cellspacing="0" style="border-radius:6px;background-color:#fafafa;border:1px solid #eee;">
<tr><td style="padding:20px;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding-bottom:12px;"><table width="100%"><tr>
<td style="font-size:12px;color:#888;">Violation Type</td>
<td style="font-size:13px;color:#333;text-align:right;font-weight:500;">${violationType}</td>
</tr></table></td></tr>
<tr><td style="padding-bottom:12px;"><table width="100%"><tr>
<td style="font-size:12px;color:#888;">Severity</td>
<td style="font-size:13px;color:#333;text-align:right;font-weight:500;">${isCritical ? 'Critical' : 'Warning'}</td>
</tr></table></td></tr>
<tr><td><table width="100%"><tr>
<td style="font-size:12px;color:#888;">Details</td>
<td style="font-size:13px;color:#555;text-align:right;">${description}</td>
</tr></table></td></tr>
</table>
</td></tr></table>
</td></tr>
<tr><td style="padding:0 40px 32px;text-align:center;">
<a href="https://afrifundedcapital.com/dashboard/challenges" style="display:inline-block;padding:12px 32px;background-color:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:500;">
View Challenge Details
</a>
</td></tr>
<tr><td style="padding:24px 40px;background-color:#fafafa;border-top:1px solid #eee;">
<p style="margin:0;font-size:12px;color:#888;line-height:1.6;">If you have questions, please contact our support team.</p>
<p style="margin:8px 0 0;font-size:11px;color:#aaa;">AfriFundedCapital &bull; African Prop Trading</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

    const text = `Dear ${name},\n\n${isCritical ? 'Your challenge has been violated.' : 'A warning was issued on your challenge.'}\n\nChallenge: ${challengeName} (${accountSize})\nViolation: ${violationType}\nDetails: ${description}\nSeverity: ${severity}\n\nLog in to your dashboard for more details.`;

    return await sendEmail(email, subject, html, text);
  },
});

// ═══════════════════════════════════════════════
//  FUNDED ACCOUNT EMAIL
// ═══════════════════════════════════════════════

export const sendFundedConfirmation = action({
  args: {
    email: v.string(),
    name: v.string(),
    accountSize: v.string(),
    profitSharePercent: v.number(),
    verificationCode: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const { email, name, accountSize, profitSharePercent, verificationCode } = args;

    const verifySection = verificationCode
      ? `
<tr><td style="padding:0 40px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" style="border-radius:6px;background-color:#fafafa;border:1px solid #eee;">
<tr><td style="padding:16px 20px;text-align:center;">
<p style="margin:0 0 8px;font-size:11px;color:#666;">Share your achievement — get your funded certificate:</p>
<a href="https://afrifundedcapital.com/verify/${verificationCode}" style="display:inline-block;font-size:12px;color:#111;font-weight:500;text-decoration:none;border-bottom:1px solid #111;">
afrifundedcapital.com/verify/${verificationCode.slice(0, 4)}…${verificationCode.slice(-4)}
</a>
</td></tr></table>
</td></tr>`
      : "";

    const subject = `🎉 You're Funded! — ${accountSize} Account | AfriFundedCapital`;
    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="padding:40px 40px 24px;text-align:center;border-bottom:1px solid #eaeaea;">
<h1 style="margin:0;font-size:20px;font-weight:600;letter-spacing:-0.02em;color:#111;text-transform:uppercase;">AfriFundedCapital</h1>
<p style="margin:8px 0 0;font-size:13px;color:#666;letter-spacing:0.04em;">Congratulations!</p>
</td></tr>
<tr><td style="padding:40px 40px 0;text-align:center;">
<table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
<td style="width:56px;height:56px;border-radius:50%;background-color:#e8f5e9;text-align:center;vertical-align:middle;">
<span style="font-size:26px;line-height:56px;">🎉</span>
</td></tr></table>
<h2 style="margin:20px 0 4px;font-size:20px;font-weight:500;color:#111;">Congratulations — You're Funded!</h2>
<p style="margin:0;font-size:14px;color:#555;">${accountSize} Live Trading Account</p>
</td></tr>
<tr><td style="padding:32px 40px;">
<table width="100%" cellpadding="0" cellspacing="0" style="border-radius:6px;background-color:#fafafa;border:1px solid #eee;">
<tr><td style="padding:20px;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding-bottom:12px;"><table width="100%"><tr>
<td style="font-size:12px;color:#888;">Account Size</td>
<td style="font-size:14px;color:#111;text-align:right;font-weight:500;">${accountSize}</td>
</tr></table></td></tr>
<tr><td><table width="100%"><tr>
<td style="font-size:12px;color:#888;">Profit Share</td>
<td style="font-size:14px;color:#111;text-align:right;font-weight:500;">You keep ${profitSharePercent}%</td>
</tr></table></td></tr>
</table>
</td></tr></table>
</td></tr>
${verifySection}
<tr><td style="padding:24px 40px 0;font-size:14px;color:#555;line-height:1.7;">
<p style="margin:0;">You have passed all evaluation phases and now have a funded trading account. Trade responsibly and keep up to ${profitSharePercent}% of the profits you generate.</p>
</td></tr>
<tr><td style="padding:20px 40px 32px;text-align:center;">
<a href="https://afrifundedcapital.com/dashboard/certificates" style="display:inline-block;padding:12px 32px;background-color:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:500;">
View Your Certificate
</a>
</td></tr>
<tr><td style="padding:24px 40px;background-color:#fafafa;border-top:1px solid #eee;">
<p style="margin:0;font-size:11px;color:#aaa;">AfriFundedCapital &bull; African Prop Trading</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

    const text = `Dear ${name},\n\nCONGRATULATIONS! You're now funded with a ${accountSize} live trading account.\n\nYou keep ${profitSharePercent}% of the profits.${verificationCode ? `\n\nShare your certificate: https://afrifundedcapital.com/verify/${verificationCode}` : ''}\n\nLog in to your dashboard to start trading.`;

    return await sendEmail(email, subject, html, text);
  },
});

// ═══════════════════════════════════════════════
//  KYC APPROVED/REJECTED EMAIL
// ═══════════════════════════════════════════════

export const sendKycNotification = action({
  args: {
    email: v.string(),
    name: v.string(),
    status: v.string(),
    rejectionReason: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const { email, name, status, rejectionReason } = args;
    const isApproved = status === "approved";

    const subject = isApproved
      ? "KYC Approved — Start Your Journey | AfriFundedCapital"
      : "KYC Document Update — AfriFundedCapital";

    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="padding:40px 40px 24px;text-align:center;border-bottom:1px solid #eaeaea;">
<h1 style="margin:0;font-size:20px;font-weight:600;letter-spacing:-0.02em;color:#111;text-transform:uppercase;">AfriFundedCapital</h1>
<p style="margin:8px 0 0;font-size:13px;color:#666;letter-spacing:0.04em;">KYC Update</p>
</td></tr>
<tr><td style="padding:40px 40px 0;text-align:center;">
<table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
<td style="width:56px;height:56px;border-radius:50%;background-color:${isApproved ? '#e8f5e9' : '#fce4e4'};text-align:center;vertical-align:middle;">
<span style="font-size:26px;line-height:56px;">${isApproved ? '✓' : '✕'}</span>
</td></tr></table>
<h2 style="margin:20px 0 4px;font-size:18px;font-weight:500;color:#111;">
${isApproved ? 'Identity Verified' : 'Document Update'}
</h2>
<p style="margin:0;font-size:14px;color:#555;">
${isApproved ? 'Your identity has been verified successfully.' : rejectionReason || 'There was an issue with your document.'}
</p>
</td></tr>
${isApproved ? `
<tr><td style="padding:24px 40px 0;font-size:14px;color:#555;line-height:1.7;">
<p style="margin:0;">You can now purchase challenges and start your funding journey with AfriFundedCapital.</p>
</td></tr>
<tr><td style="padding:20px 40px 32px;text-align:center;">
<a href="https://afrifundedcapital.com/dashboard/challenges" style="display:inline-block;padding:12px 32px;background-color:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:500;">
Browse Challenges
</a>
</td></tr>` : `
<tr><td style="padding:24px 40px 0;font-size:14px;color:#555;line-height:1.7;">
<p style="margin:0;">Please re-upload your document with the necessary corrections. Our support team is available to help.</p>
</td></tr>
<tr><td style="padding:20px 40px 32px;text-align:center;">
<a href="https://afrifundedcapital.com/dashboard/profile" style="display:inline-block;padding:12px 32px;background-color:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:500;">
Upload Again
</a>
</td></tr>`}
<tr><td style="padding:24px 40px;background-color:#fafafa;border-top:1px solid #eee;">
<p style="margin:0;font-size:11px;color:#aaa;">AfriFundedCapital &bull; African Prop Trading</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

    const text = `Dear ${name},\n\n${isApproved ? 'Your identity has been verified. You can now purchase challenges.' : `Your KYC document requires attention.${rejectionReason ? `\nReason: ${rejectionReason}` : ''}\n\nPlease log in to re-upload.`}`;

    return await sendEmail(email, subject, html, text);
  },
});

// ═══════════════════════════════════════════════
//  SUPPORT REPLY EMAIL
// ═══════════════════════════════════════════════

export const sendSupportReply = action({
  args: {
    email: v.string(),
    name: v.string(),
    ticketSubject: v.string(),
    messagePreview: v.string(),
    ticketId: v.string(),
    isAdminReply: v.boolean(),
  },
  handler: async (_ctx, args) => {
    const { email, name, ticketSubject, messagePreview, ticketId, isAdminReply } = args;

    const subject = isAdminReply
      ? `Support Team Replied — ${ticketSubject} | AfriFundedCapital`
      : `New Reply — ${ticketSubject} | AfriFundedCapital`;

    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="padding:40px 40px 24px;text-align:center;border-bottom:1px solid #eaeaea;">
<h1 style="margin:0;font-size:20px;font-weight:600;letter-spacing:-0.02em;color:#111;text-transform:uppercase;">AfriFundedCapital</h1>
<p style="margin:8px 0 0;font-size:13px;color:#666;letter-spacing:0.04em;">Support Update</p>
</td></tr>
<tr><td style="padding:40px 40px 0;text-align:center;">
<h2 style="margin:0;font-size:18px;font-weight:500;color:#111;">
${isAdminReply ? 'Support Team Replied' : 'New Reply on Ticket'}
</h2>
<p style="margin:8px 0 0;font-size:14px;color:#555;">${ticketSubject}</p>
</td></tr>
<tr><td style="padding:24px 40px;">
<div style="background-color:#fafafa;border:1px solid #eee;border-radius:6px;padding:16px;font-size:13px;color:#555;line-height:1.6;">
${messagePreview.length > 200 ? messagePreview.slice(0, 200) + '...' : messagePreview}
</div>
</td></tr>
<tr><td style="padding:0 40px 32px;text-align:center;">
<a href="https://afrifundedcapital.com/dashboard/support/${ticketId}" style="display:inline-block;padding:12px 32px;background-color:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:500;">
View Ticket
</a>
</td></tr>
<tr><td style="padding:24px 40px;background-color:#fafafa;border-top:1px solid #eee;">
<p style="margin:0;font-size:11px;color:#aaa;">AfriFundedCapital &bull; African Prop Trading</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

    const text = `${isAdminReply ? 'Support team replied' : 'New reply on ticket'}: ${ticketSubject}\n\n${messagePreview}\n\nView: https://afrifundedcapital.com/dashboard/support/${ticketId}`;

    return await sendEmail(email, subject, html, text);
  },
});

// ═══════════════════════════════════════════════
//  SHARED SEND FUNCTION
// ═══════════════════════════════════════════════

async function sendEmail(to: string, subject: string, html: string, text: string) {
  try {
    const result = await vly.email.send({ to, subject, html, text });
    console.log(`Email sent to ${to}: ${subject}`, JSON.stringify(result));
    return { success: true };
  } catch (error: any) {
    console.error(`Failed to send email to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════
//  HTML TEMPLATE — Payment Confirmation
// ═══════════════════════════════════════════════

function buildPaymentConfirmationHtml(params: {
  name: string;
  formattedAmount: string;
  reference: string;
  challengeName: string;
  accountSize: string;
  providerLabel: string;
}): string {
  const { name, formattedAmount, reference, challengeName, accountSize, providerLabel } = params;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Confirmed</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="padding: 40px 40px 24px; text-align: center; border-bottom: 1px solid #eaeaea;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.02em; color: #111; text-transform: uppercase;">
                AfriFundedCapital
              </h1>
              <p style="margin: 8px 0 0; font-size: 13px; color: #666; letter-spacing: 0.04em;">Payment Confirmed</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 40px 0; text-align: center;">
              <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="width: 56px; height: 56px; border-radius: 50%; background-color: #e8f5e9; text-align: center; vertical-align: middle;">
                    <span style="font-size: 26px; line-height: 56px;">&#10003;</span>
                  </td>
                </tr>
              </table>
              <h2 style="margin: 20px 0 4px; font-size: 18px; font-weight: 500; color: #111; letter-spacing: -0.01em;">
                Payment Successful
              </h2>
              <p style="margin: 0 0 4px; font-size: 14px; color: #555;">
                Your ${challengeName} Challenge is now active
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px 0; text-align: center;">
              <div style="font-size: 32px; font-weight: 300; color: #111; letter-spacing: -0.02em;">
                ${formattedAmount}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-radius: 6px; background-color: #fafafa; border: 1px solid #eee;">
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-bottom: 12px;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="font-size: 12px; color: #888;">Challenge</td>
                              <td style="font-size: 13px; color: #333; text-align: right; font-weight: 500;">${challengeName}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 12px;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="font-size: 12px; color: #888;">Account Size</td>
                              <td style="font-size: 13px; color: #333; text-align: right; font-weight: 500;">${accountSize}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 12px;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="font-size: 12px; color: #888;">Payment Method</td>
                              <td style="font-size: 13px; color: #333; text-align: right; font-weight: 500;">${providerLabel}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="font-size: 12px; color: #888;">Reference</td>
                              <td style="font-size: 12px; color: #666; text-align: right; font-family: 'SFMono-Regular', Consolas, monospace;">${reference.slice(0, 20)}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 32px; text-align: center;">
              <a href="https://afrifundedcapital.com/dashboard/challenges"
                 style="display: inline-block; padding: 12px 32px; background-color: #111; color: #fff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500; letter-spacing: 0.01em;">
                View Your Challenge
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #eee;">
              <p style="margin: 0 0 8px; font-size: 12px; color: #888; line-height: 1.6;">
                If you have any questions about your challenge, please contact our support team.
              </p>
              <p style="margin: 0; font-size: 11px; color: #aaa;">
                AfriFundedCapital &bull; African Prop Trading
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
