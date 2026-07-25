import { getDb } from "../db";
import { notifications, users } from "../schema";
import { eq } from "drizzle-orm";
import { sendEmail, type SendEmailParams } from "./email";

/**
 * Create a dashboard notification for a user.
 * Non-critical — failures are silently logged so they never break the calling flow.
 */
export function createNotification(
  db: any,
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
  db: any,
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
      } catch {
        // Invalid JSON — proceed with email
      }
    }

    return sendEmail({ ...emailParams, to: user.email });
  } catch (e) {
    console.error("[Email] Failed to send email to user", userId, ":", e);
    return false;
  }
}

/**
 * Create a notification and optionally send an email.
 */
export async function notify(
  db: any,
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
