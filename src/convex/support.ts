import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth, requireRole, checkEmailPref } from "./users";
import { ROLES, TICKET_STATUS } from "./schema";
import { internal } from "./_generated/api";

// ═══════════════════════════════════════════════
//  QUERIES
// ═══════════════════════════════════════════════

export const getMyTickets = query({
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const tickets = await ctx.db
      .query("supportTickets")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    return tickets;
  },
});

export const getTicketById = query({
  args: { ticketId: v.id("supportTickets") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    const ticket = await ctx.db.get(args.ticketId);

    if (!ticket) throw new Error("Ticket not found");

    // User can only see their own tickets, admins can see all
    if (ticket.userId !== userId && (!user?.role || user.role === ROLES.USER)) {
      throw new Error("Not authorized");
    }

    return ticket;
  },
});

export const getTicketMessages = query({
  args: { ticketId: v.id("supportTickets") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    const ticket = await ctx.db.get(args.ticketId);

    if (!ticket) throw new Error("Ticket not found");
    if (ticket.userId !== userId && (!user?.role || user.role === ROLES.USER)) {
      throw new Error("Not authorized");
    }

    const messages = await ctx.db
      .query("supportTicketMessages")
      .withIndex("ticketId", (q) => q.eq("ticketId", args.ticketId))
      .collect();

    // Filter internal notes for non-admin users
    if (user?.role === ROLES.USER) {
      return messages.filter((m) => !m.isInternal);
    }

    return messages;
  },
});

export const listAllTickets = query({
  args: {
    status: v.optional(v.string()),
    priority: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN]);

    let tickets = await ctx.db.query("supportTickets").order("desc").collect();

    if (args.status) tickets = tickets.filter((t) => t.status === args.status);
    if (args.priority) tickets = tickets.filter((t) => t.priority === args.priority);

    const enriched = await Promise.all(
      tickets.slice(0, args.limit || 50).map(async (t) => {
        const user = await ctx.db.get(t.userId);
        return { ...t, userName: user?.name, userEmail: user?.email };
      }),
    );

    return enriched;
  },
});

// ═══════════════════════════════════════════════
//  MUTATIONS
// ═══════════════════════════════════════════════

export const createTicket = mutation({
  args: {
    subject: v.string(),
    category: v.string(),
    priority: v.optional(v.string()),
    message: v.string(),
    attachments: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const ticketId = await ctx.db.insert("supportTickets", {
      userId,
      subject: args.subject,
      category: args.category as any,
      priority: (args.priority as any) || "medium",
      status: TICKET_STATUS.OPEN as any,
      attachments: args.attachments,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Add initial message
    await ctx.db.insert("supportTicketMessages", {
      ticketId,
      userId,
      message: args.message,
      attachments: args.attachments,
      createdAt: Date.now(),
    });

    // Notify admins
    const admins = await ctx.db.query("users").collect();
    for (const admin of admins) {
      if (admin.role && admin.role !== ROLES.USER) {
        await ctx.db.insert("notifications", {
          userId: admin._id,
          type: "support_reply",
          title: "New Support Ticket",
          message: args.subject,
          read: false,
          link: `/admin/support/${ticketId}`,
          createdAt: Date.now(),
        });
      }
    }

    return ticketId;
  },
});

export const addTicketMessage = mutation({
  args: {
    ticketId: v.id("supportTickets"),
    message: v.string(),
    isInternal: v.optional(v.boolean()),
    attachments: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    const ticket = await ctx.db.get(args.ticketId);

    if (!ticket) throw new Error("Ticket not found");
    if (ticket.userId !== userId && (!user?.role || user.role === ROLES.USER)) {
      throw new Error("Not authorized");
    }

    await ctx.db.insert("supportTicketMessages", {
      ticketId: args.ticketId,
      userId,
      message: args.message,
      isInternal: args.isInternal,
      attachments: args.attachments,
      createdAt: Date.now(),
    });

    // Update ticket status
    const isAdmin = user?.role && user.role !== ROLES.USER;
    await ctx.db.patch(args.ticketId, {
      status: isAdmin ? TICKET_STATUS.WAITING_ON_CUSTOMER : TICKET_STATUS.PENDING,
      updatedAt: Date.now(),
    });

    // Notify the other party
    const notifyUserId = isAdmin ? ticket.userId : (ticket.assignedTo || ticket.userId);
    await ctx.db.insert("notifications", {
      userId: notifyUserId,
      type: "support_reply",
      title: isAdmin ? "Support Team Replied" : "New Reply on Your Ticket",
      message: `Re: ${ticket.subject}`,
      read: false,
      link: `/dashboard/support/${args.ticketId}`,
      createdAt: Date.now(),
    });

    // Send email when admin replies
    if (isAdmin) {
      try {
        const customer = await ctx.db.get(ticket.userId);
        const shouldEmail = await checkEmailPref(ctx, ticket.userId, "support_reply");
        if (customer?.email && shouldEmail) {
          await (ctx.scheduler as any).runAfter(0, (internal as any).email.sendSupportReply, {
            email: customer.email,
            name: customer.name || "Trader",
            ticketSubject: ticket.subject,
            messagePreview: args.message,
            ticketId: args.ticketId,
            isAdminReply: true,
          });
        }
      } catch (e: unknown) {
        console.error("Failed to send support reply email:", e instanceof Error ? e.message : String(e));
      }
    }
  },
});

export const updateTicketStatus = mutation({
  args: {
    ticketId: v.id("supportTickets"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN]);

    await ctx.db.patch(args.ticketId, {
      status: args.status as any,
      updatedAt: Date.now(),
      resolvedAt: args.status === TICKET_STATUS.RESOLVED || args.status === TICKET_STATUS.CLOSED
        ? Date.now()
        : undefined,
    });
  },
});

export const assignTicket = mutation({
  args: {
    ticketId: v.id("supportTickets"),
    assigneeId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN]);

    await ctx.db.patch(args.ticketId, {
      assignedTo: args.assigneeId,
      updatedAt: Date.now(),
    });
  },
});
