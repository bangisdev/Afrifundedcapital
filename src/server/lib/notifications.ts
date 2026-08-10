import { notifications, users, ROLES } from "../schema";
import { eq, sql } from "drizzle-orm";
import { sendEmail, securityAlertEmail, type SendEmailParams } from "./email";
import type { Db } from "../db";

/**
 * Create a dashboard notification for a user.
 * Non-critical — failures are silently logged so they never break the calling flow.
 */
export function createNotification(
  db: Db,
  userId: number,
  opts: {
    type: string;
    title: string;
    message: string;
    link?: string;
    metadata?: Record<string, unknown>;
  },
): void {
  try {
    db.insert(notifications).values({
      userId,
      type: opts.type,
      title: opts.title,
      message: opts.message,
      link: opts.link || null,
      metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
      createdAt: Date.now(),
    }).run();
  } catch (e) {
    console.error("[Notification] Failed to create notification:", e);
  }
}

/**
 * Send an email notification to a user.
 * Looks up the user's email and email notification preference before sending.
 * Non-critical — failures are silently logged.
 */
export async function sendEmailToUser(
  db: Db,
  userId: number,
  emailParams: Omit<SendEmailParams, "to">,
): Promise<boolean> {
  try {
    const user = db.select().from(users).where(eq(users.id, userId)).get();
    if (!user || !user.email) {
      console.warn("[Email] User not found or no email:", userId);
      return false;
    }

    // Check email notification preference (default: true)
    if (user.emailNotifications === false) {
      console.log("[Email] User has email notifications disabled:", user.email);
      return false;
    }

    // Check notification-specific preferences
    if (user.notificationPreferences) {
      try {
        const prefs = JSON.parse(user.notificationPreferences);
        const emailPrefs = prefs.email || {};
        // Map emailParams.subject to preference keys
        const subjectLower = (emailParams.subject || "").toLowerCase();
        if (subjectLower.includes("kyc") && emailPrefs.kyc === false) return false;
        if (subjectLower.includes("payment") && emailPrefs.payments === false) return false;
        if (subjectLower.includes("support") && emailPrefs.support === false) return false;
        if (subjectLower.includes("payout") && emailPrefs.payouts === false) return false;
        // MT5 rule alerts — drawdown warnings and challenge violations. Gated by
        // the "challenges" email preference so users can opt out of lifecycle
        // email alerts while keeping in-app notifications.
        if ((subjectLower.includes("violat") || subjectLower.includes("warning")) && emailPrefs.challenges === false) return false;
      } catch {
        // Invalid JSON — proceed with email
      }
    }

    return (await sendEmail({ ...emailParams, to: user.email })).ok;
  } catch (e) {
    console.error("[Email] Failed to send email to user", userId, ":", e);
    return false;
  }
}

/**
 * Create a notification and optionally send an email.
 */
export async function notify(
  db: Db,
  userId: number,
  opts: {
    type: string;
    title: string;
    message: string;
    link?: string;
    email?: Omit<SendEmailParams, "to">;
  },
): Promise<void> {
  // Always create dashboard notification
  createNotification(db, userId, {
    type: opts.type,
    title: opts.title,
    message: opts.message,
    link: opts.link,
  });

  // Send email if provided
  if (opts.email) {
    // Don't await — fire and forget to avoid blocking the response
    sendEmailToUser(db, userId, opts.email).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════
//  ADMIN SECURITY ALERTS (config edits)
// ═══════════════════════════════════════════════════════

// Human-readable labels for the most sensitive platform settings.
const SETTING_LABELS: Record<string, string> = {
  flutterwave_config: "Flutterwave payment keys",
  paystack_config: "Paystack payment keys",
  resend_config: "Resend email credentials",
  affiliate_auto_approve_threshold: "affiliate payout threshold",
};

/** Resolve a human-readable label for a settings key. */
export function settingLabel(key: string): string {
  return SETTING_LABELS[key] || key;
}

// Settings keys that carry credentials — these also trigger a security email.
const SENSITIVE_CONFIG = /flutterwave|paystack|resend|secret|api[_ -]?key|credential/i;

/** Whether a settings key holds credentials (gateway keys, hashes, tokens). */
export function isSensitiveSettingKey(key: string): boolean {
  return SENSITIVE_CONFIG.test(key);
}

/**
 * Alert every OTHER admin when a sensitive platform setting changes
 * (payment gateway keys, webhook hashes, payout thresholds).
 *
 * - Creates a "security" dashboard notification for each admin except the actor.
 * - Emails them too when the setting carries credentials (Flutterwave/Paystack/
 *   Resend keys) — security alerts are sent directly, bypassing the regular
 *   email-preference gate so they always reach every admin.
 *
 * Never throws — alerting must never break the settings save.
 */
export function notifyAdminsOfSecurityEvent(
  db: Db,
  opts: {
    actorId: number;
    actorName: string;
    key: string;
    action?: "created" | "updated";
  },
): number {
  try {
    const admins = db
      .select()
      .from(users)
      .where(
        sql`${users.role} IS NOT NULL AND ${users.role} != ${ROLES.USER} AND ${users.id} != ${opts.actorId}`,
      )
      .all();

    const actionText = opts.action === "created" ? "configured" : "changed";
    const label = settingLabel(opts.key);
    const title = isSensitiveSettingKey(opts.key) ? "Payment Config Changed" : "Admin Config Changed";
    let notified = 0;

    for (const admin of admins) {
      createNotification(db, admin.id, {
        type: "security",
        title,
        message: `${opts.actorName} ${actionText} the ${label}. Review immediately if this wasn't you.`,
        link: "/admin/settings",
        metadata: { key: opts.key, actorId: opts.actorId, actorName: opts.actorName },
      });
      notified++;

      if (admin.email && isSensitiveSettingKey(opts.key)) {
        // Fire and forget — never block the response on email delivery.
        sendEmail(securityAlertEmail(admin.name || admin.email, opts.actorName, label)).catch(() => {});
      }
    }
    return notified;
  } catch (e) {
    console.warn("[Notification] Failed to alert admins of security event:", e);
    return 0;
  }
}
