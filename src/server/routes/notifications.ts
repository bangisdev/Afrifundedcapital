import { Hono } from "hono";
import { getDb } from "../db";
import { notifications, users } from "../schema";
import { eq, desc, asc, count, and, or, like, sql, type SQL, type SQLWrapper } from "drizzle-orm";
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

  // Pagination params (clamped)
  const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") || "10") || 10));

  // Sorting (whitelisted columns, asc/desc)
  const SORTABLE: Record<string, SQLWrapper> = {
    id: notifications.id,
    type: notifications.type,
    title: notifications.title,
    read: notifications.read,
    createdAt: notifications.createdAt,
  };
  const qSortBy = String(c.req.query("sortBy") || "createdAt");
  const qSortOrder = String(c.req.query("sortOrder") || "desc");
  const sortCol = SORTABLE[qSortBy] || notifications.createdAt;
  const sortOrder = qSortOrder.toLowerCase() === "asc" ? asc(sortCol) : desc(sortCol);

  // Filters
  const search = (c.req.query("search") || "").trim();
  const type = c.req.query("type") || "";

  const conditions: SQL[] = [eq(notifications.userId, userId)];
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        like(notifications.title, pattern),
        like(notifications.message, pattern),
      )!,
    );
  }
  if (type && type !== "all") conditions.push(eq(notifications.type, type));
  const whereClause: SQL = and(...conditions)!;

  // Total matching count
  const totalRow = db
    .select({ count: count() })
    .from(notifications)
    .where(whereClause)
    .get();
  const total = totalRow?.count || 0;

  // Page of notifications
  const items = db
    .select()
    .from(notifications)
    .where(whereClause)
    .orderBy(sortOrder)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  // User-wide stats (unfiltered)
  const allNotifs = db
    .select({ type: notifications.type, read: notifications.read })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .all();
  const byType = allNotifs.reduce<Record<string, number>>((acc, n) => {
    acc[n.type] = (acc[n.type] || 0) + 1;
    return acc;
  }, {});
  const unread = allNotifs.filter((n) => !n.read).length;

  return c.json({
    notifications: items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats: { total: allNotifs.length, unread, byType },
  });
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
    const idQuery = db.select({ id: users.id }).from(users);

    const rows = idQuery
      .where(
        segment === "admins"
          ? sql`${users.role} IS NOT NULL AND ${users.role} != 'user'`
          : segment === "verified"
            ? eq(users.emailVerified, true)
            : segment === "kyc_approved"
              ? eq(users.kycStatus, "approved")
              : segment === "onboarded"
                ? eq(users.onboardingComplete, true)
                : segment === "new_users"
                  ? sql`${users.createdAt} > ${now - 30 * 24 * 60 * 60 * 1000}`
                  : sql`1 = 0`,
      )
      .all();
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
