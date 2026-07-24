import { Hono } from "hono";
import { getDb } from "./db";
import { notifications } from "./schema";
import { eq, desc, count, and } from "drizzle-orm";
import { requireAuth } from "./middleware";

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

// Admin: Broadcast notification
app.post("/broadcast", requireAuth, async (c) => {
  const body = await c.req.json();
  const db = getDb();
  const now = Date.now();

  // Get all users
  const allUsers = db.select({ id: { value: "id" } }).from(notifications as any).all();

  // Insert a notification for every user - use raw sqlite for this
  const sqlite = getDb();
  const userRows = (sqlite as any).select("id").from("users").all();
  for (const row of userRows) {
    db.insert(notifications).values({
      userId: row.id,
      type: body.type || "broadcast",
      title: body.title,
      message: body.message,
      link: body.link || null,
      createdAt: now,
    }).run();
  }

  return c.json({ success: true });
});

export default app;
