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
  handler: async (ctx, args) => {
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

    try {
      const result = await vly.email.send({
        to: email,
        subject,
        html,
        text,
      });

      console.log(`Payment confirmation email sent to ${email}:`, JSON.stringify(result));
      return { success: true };
    } catch (error: any) {
      console.error(`Failed to send payment confirmation email to ${email}:`, error.message);
      // Don't throw — email failures shouldn't block the payment flow
      return { success: false, error: error.message };
    }
  },
});

// ═══════════════════════════════════════════════
//  HTML TEMPLATE
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
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 24px; text-align: center; border-bottom: 1px solid #eaeaea;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.02em; color: #111; text-transform: uppercase;">
                AfriFundedCapital
              </h1>
              <p style="margin: 8px 0 0; font-size: 13px; color: #666; letter-spacing: 0.04em;">Payment Confirmed</p>
            </td>
          </tr>

          <!-- Success Badge -->
          <tr>
            <td style="padding: 40px 40px 0; text-align: center;">
              <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="width: 56px; height: 56px; border-radius: 50%; background-color: #e8f5e9; text-align: center; vertical-align: middle;">
                    <span style="font-size: 26px; line-height: 56px;">✓</span>
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

          <!-- Amount -->
          <tr>
            <td style="padding: 24px 40px 0; text-align: center;">
              <div style="font-size: 32px; font-weight: 300; color: #111; letter-spacing: -0.02em;">
                ${formattedAmount}
              </div>
            </td>
          </tr>

          <!-- Details -->
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

          <!-- CTA -->
          <tr>
            <td style="padding: 0 40px 32px; text-align: center;">
              <a href="https://afrifundedcapital.com/dashboard/challenges"
                 style="display: inline-block; padding: 12px 32px; background-color: #111; color: #fff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500; letter-spacing: 0.01em;">
                View Your Challenge
              </a>
            </td>
          </tr>

          <!-- Footer -->
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
