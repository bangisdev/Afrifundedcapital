import { Hono } from "hono";
import { getDb } from "../db";
import { supportTickets, supportTicketMessages } from "../schema";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware";

const app = new Hono();

// Get my tickets
app.get("/my", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();
  const tickets = db.select().from(supportTickets)
    .where(eq(supportTickets.userId, userId))
    .orderBy(desc(supportTickets.createdAt)).all();
  return c.json(tickets);
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
  return c.json(msg);
});

// Admin: List all tickets
app.get("/admin/all", requireAuth, requireAdmin, (c) => {
  const db = getDb();
  const tickets = db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt)).all();
  return c.json(tickets);
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
