import { Hono } from "hono";
import { getDb } from "../db";
import { supportTickets, supportTicketMessages, users } from "../schema";
import { eq, desc, asc, and, or, like, count, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";
import { createNotification } from "../lib/notifications";

const app = new Hono();

// Get my tickets
app.get("/my", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();

  // Pagination params (clamped)
  const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") || "10") || 10));

  // Sorting (whitelisted columns, asc/desc)
  const SORTABLE: Record<string, SQLWrapper> = {
    id: supportTickets.id,
    subject: supportTickets.subject,
    category: supportTickets.category,
    priority: supportTickets.priority,
    status: supportTickets.status,
    createdAt: supportTickets.createdAt,
    updatedAt: supportTickets.updatedAt,
  };
  const qSortBy = String(c.req.query("sortBy") || "createdAt");
  const qSortOrder = String(c.req.query("sortOrder") || "desc");
  const sortCol = SORTABLE[qSortBy] || supportTickets.createdAt;
  const sortOrder = qSortOrder.toLowerCase() === "asc" ? asc(sortCol) : desc(sortCol);

  // Total count for this user
  const totalRow = db
    .select({ count: count() })
    .from(supportTickets)
    .where(eq(supportTickets.userId, userId))
    .get();
  const total = totalRow?.count || 0;

  // Page of tickets
  const tickets = db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.userId, userId))
    .orderBy(sortOrder)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  // User-wide stats (unfiltered)
  const allTickets = db
    .select({ status: supportTickets.status })
    .from(supportTickets)
    .where(eq(supportTickets.userId, userId))
    .all();
  const byStatus = allTickets.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  return c.json({
    tickets,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats: { total: allTickets.length, byStatus },
  });
});

// Public contact form submission (no auth required)
app.post("/contact", async (c) => {
  try {
    const body = await c.req.json();
    const { name, email, subject, message } = body;

    if (!name || !email || !subject || !message) {
      return c.json({ error: "Name, email, subject, and message are required" }, 400);
    }

    const db = getDb();
    const now = Date.now();

    // Try to find existing user by email
    let userId: number | null = null;
    const existingUser = db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .get();
    if (existingUser) {
      userId = existingUser.id;
    }

    const ticket = db
      .insert(supportTickets)
      .values({
        userId: userId || 0,
        subject: `[Contact Form] ${subject}`,
        category: "general",
        priority: "medium",
        status: "open",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    // Notify admins
    try {
      const admins = db.select().from(users).where(eq(users.role, "super_admin")).all();
      for (const admin of admins) {
        createNotification(db, admin.id, {
          type: "support",
          title: "New Contact Form Submission",
          message: `${name} (${email}) submitted: ${subject}`,
          link: "/admin/support",
        });
      }
    } catch (e) {
      console.warn("[Support] Failed to notify admin:", e);
    }

    return c.json({
      success: true,
      message: "Your message has been received. We will respond within 24 hours.",
      ticketId: ticket.id,
    });
  } catch (err) {
    console.error("[Support] Contact form error:", err);
    return c.json({ error: "Failed to submit message" }, 500);
  }
});

// Create ticket
app.post("/create", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const db = getDb();
  const now = Date.now();
  const ticket = db.insert(supportTickets).values({
    userId,
    subject: body.subject,
    category: body.category,
    priority: body.priority || "medium",
    status: "open",
    createdAt: now,
    updatedAt: now,
  }).returning().get();
  return c.json(ticket);
});

// Get ticket messages
app.get("/:id/messages", requireAuth, (c) => {
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  const messages = db.select().from(supportTicketMessages)
    .where(eq(supportTicketMessages.ticketId, id))
    .orderBy(supportTicketMessages.createdAt).all();
  return c.json(messages);
});

// Add message
app.post("/:id/messages", requireAuth, async (c) => {
  const ticketId = parseInt(c.req.param("id"));
  const userId = c.get("userId");
  const body = await c.req.json();
  const db = getDb();
  const msg = db.insert(supportTicketMessages).values({
    ticketId,
    userId,
    message: body.message,
    isInternal: body.isInternal || false,
    createdAt: Date.now(),
  }).returning().get();
  db.update(supportTickets).set({ updatedAt: Date.now() }).where(eq(supportTickets.id, ticketId)).run();

  // Notify the ticket owner if an admin/support replied
  const ticket = db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).get();
  if (ticket && ticket.userId !== userId && !body.isInternal) {
    createNotification(db, ticket.userId, {
      type: "support",
      title: "Support Reply",
      message: `New reply on your ticket "${ticket.subject}".`,
      link: "/dashboard/support",
    });
  }

  return c.json(msg);
});

// Admin: List all tickets (paginated + searchable)
app.get("/admin/all", requireAuth, requireAdmin, (c) => {
  const db = getDb();

  // Pagination params (clamped)
  const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") || "20") || 20));

  // Sorting (whitelisted columns, asc/desc)
  const SORTABLE: Record<string, SQLWrapper> = {
    id: supportTickets.id,
    subject: supportTickets.subject,
    category: supportTickets.category,
    priority: supportTickets.priority,
    status: supportTickets.status,
    createdAt: supportTickets.createdAt,
    updatedAt: supportTickets.updatedAt,
  };
  const qSortBy = String(c.req.query("sortBy") || "createdAt");
  const qSortOrder = String(c.req.query("sortOrder") || "desc");
  const sortCol = SORTABLE[qSortBy] || supportTickets.createdAt;
  const sortOrder = qSortOrder.toLowerCase() === "asc" ? asc(sortCol) : desc(sortCol);

  // Filters
  const search = (c.req.query("search") || "").trim();
  const status = c.req.query("status") || "";
  const priority = c.req.query("priority") || "";

  const conditions: SQL[] = [];
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        like(supportTickets.subject, pattern),
        like(supportTickets.category, pattern),
        like(users.name, pattern),
        like(users.email, pattern),
        sql`cast(${supportTickets.id} as text) like ${pattern}`,
      )!,
    );
  }
  if (status && status !== "all") conditions.push(eq(supportTickets.status, status));
  if (priority && priority !== "all") conditions.push(eq(supportTickets.priority, priority));
  const whereClause: SQL = conditions.length > 0 ? and(...conditions)! : sql`1 = 1`;

  // Total matching count
  const totalRow = db
    .select({ count: count() })
    .from(supportTickets)
    .leftJoin(users, eq(users.id, supportTickets.userId))
    .where(whereClause)
    .get();
  const total = totalRow?.count || 0;

  // Page of tickets with user info joined
  const rows = db
    .select({ ticket: supportTickets, userName: users.name, userEmail: users.email })
    .from(supportTickets)
    .leftJoin(users, eq(users.id, supportTickets.userId))
    .where(whereClause)
    .orderBy(sortOrder)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  const items = rows.map((r) => ({
    ...r.ticket,
    userName: r.userName || null,
    userEmail: r.userEmail || null,
  }));

  // Platform-wide stats (unfiltered) so the stat cards stay accurate when filtered/paginated
  const all = db.select().from(supportTickets).all();
  const stats = {
    total: all.length,
    open: all.filter((t) => t.status === "open").length,
    pending: all.filter((t) => t.status === "pending" || t.status === "waiting_on_customer").length,
    resolved: all.filter((t) => t.status === "resolved" || t.status === "closed").length,
  };

  return c.json({
    tickets: items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats,
  });
});

// Admin: Update ticket status
app.put("/admin/:id/status", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const db = getDb();
  db.update(supportTickets).set({ status: body.status, updatedAt: Date.now() }).where(eq(supportTickets.id, id)).run();
  return c.json({ success: true });
});

// Admin: Assign ticket
app.put("/admin/:id/assign", requireAuth, requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const db = getDb();
  db.update(supportTickets).set({ assignedTo: body.userId, updatedAt: Date.now() }).where(eq(supportTickets.id, id)).run();
  return c.json({ success: true });
});

export default app;
