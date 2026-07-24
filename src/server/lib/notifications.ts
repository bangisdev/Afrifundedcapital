import { getDb } from "../db";
import { notifications } from "../schema";

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
