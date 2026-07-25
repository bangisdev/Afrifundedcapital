import { Hono } from "hono";
import { getDb } from "../db";
import { notifications, users } from "../schema";
import { eq, desc, count, and, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";

const app = new Hono();

// Get unread count
app.get("/unread-count", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();
  const result = db
    .select({ count: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
    .get();
  return c.json(result?.count || 0);
});

// Get my notifications
app.get("/my", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();
  const items = db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(100)
    .all();
  return c.json(items);
});

// Mark as read
app.put("/:id/read", requireAuth, async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  db.update(notifications).set({ read: true }).where(eq(notifications.id, id)).run();
  return c.json({ success: true });
});

// Mark all as read
app.put("/read-all", requireAuth, async (c) => {
  const userId = c.get("userId");
  const db = getDb();
  db.update(notifications).set({ read: true }).where(eq(notifications.userId, userId)).run();
  return c.json({ success: true });
});

// Delete notification
app.delete("/:id", requireAuth, async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  db.delete(notifications).where(eq(notifications.id, id)).run();
  return c.json({ success: true });
});

// Admin: List all notifications (with user info)
app.get("/admin/all", requireAuth, requireAdmin, async (c) => {
  const db = getDb();
  const items = db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(200).all();
  return c.json(items);
});

// Admin: Notification stats
app.get("/admin/stats", requireAuth, requireAdmin, async (c) => {
  const db = getDb();
  const total = db.select({ count: count() }).from(notifications).get();
  const unread = db.select({ count: count() }).from(notifications).where(eq(notifications.read, false)).get();
  return c.json({ total: total?.count || 0, unread: unread?.count || 0 });
});

// Admin: Broadcast to all users
app.post("/broadcast", requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json();
  const db = getDb();
  const now = Date.now();

  const userRows = db.select({ id: users.id }).from(users).all();
  let sentCount = 0;
  for (const row of userRows) {
    db.insert(notifications).values({
      userId: row.id,
      type: body.type || "broadcast",
      title: body.title,
      message: body.message,
      link: body.link || null,
      createdAt: now,
    }).run();
    sentCount++;
  }

  return c.json({ success: true, sentTo: sentCount });
});

// Admin: Broadcast to specific users or segment
app.post("/broadcast/segmented", requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json();
  const db = getDb();
  const now = Date.now();

  let targetUserIds: number[] = [];

  if (body.userIds && body.userIds.length > 0) {
    // Specific users
    targetUserIds = body.userIds;
  } else if (body.segment) {
    // Segment-based targeting
    const segment = body.segment as string;
    let query = db.select({ id: users.id }).from(users);

    if (segment === "admins") {
      query = query.where(sql`${users.role} IS NOT NULL AND ${users.role} != 'user'`) as any;
    } else if (segment === "verified") {
      query = query.where(eq(users.emailVerified, true)) as any;
    } else if (segment === "kyc_approved") {
      query = query.where(eq(users.kycStatus, "approved")) as any;
    } else if (segment === "onboarded") {
      query = query.where(eq(users.onboardingComplete, true)) as any;
    } else if (segment === "new_users") {
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
      query = query.where(sql`${users.createdAt} > ${thirtyDaysAgo}`) as any;
    }

    const rows = query.all();
    targetUserIds = rows.map((r) => r.id);
  } else {
    return c.json({ error: "Provide userIds or segment" }, 400);
  }

  let sentCount = 0;
  for (const userId of targetUserIds) {
    db.insert(notifications).values({
      userId,
      type: body.type || "broadcast",
      title: body.title,
      message: body.message,
      link: body.link || null,
      createdAt: now,
    }).run();
    sentCount++;
  }

  return c.json({ success: true, sentTo: sentCount });
});

export default app;
