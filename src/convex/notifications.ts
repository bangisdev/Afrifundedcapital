import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth, requireRole, getCurrentUser } from "./users";
import { ROLES } from "./schema";

// ═══════════════════════════════════════════════
//  QUERIES
// ═══════════════════════════════════════════════

export const getMyNotifications = query({
  args: {
    limit: v.optional(v.number()),
    unreadOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("userId_createdAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    let filtered = notifications;
    if (args.unreadOnly) {
      filtered = filtered.filter((n) => !n.read);
    }

    return filtered.slice(0, args.limit || 20);
  },
});

export const getUnreadCount = query({
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return 0;

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("userId", (q) => q.eq("userId", user._id).eq("read", false))
      .collect();

    return notifications.length;
  },
});

// ═══════════════════════════════════════════════
//  MUTATIONS
// ═══════════════════════════════════════════════

export const markAsRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== userId) throw new Error("Not found");

    await ctx.db.patch(args.notificationId, { read: true });
  },
});

export const markAllAsRead = mutation({
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("userId", (q) => q.eq("userId", userId).eq("read", false))
      .collect();

    for (const n of notifications) {
      await ctx.db.patch(n._id, { read: true });
    }
  },
});

export const deleteNotification = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== userId) throw new Error("Not found");

    await ctx.db.delete(args.notificationId);
  },
});

// ═══════════════════════════════════════════════
//  ADMIN BROADCAST
// ═══════════════════════════════════════════════

export const sendBroadcast = mutation({
  args: {
    title: v.string(),
    message: v.string(),
    link: v.optional(v.string()),
    targetRole: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId: adminId } = await requireRole(ctx, [
      ROLES.SUPER_ADMIN,
      ROLES.MARKETING_ADMIN,
      ROLES.SUPPORT_ADMIN,
    ]);

    const allUsers = await ctx.db.query("users").collect();
    let targetUsers = allUsers;

    // Filter by target role if specified
    if (args.targetRole) {
      targetUsers = allUsers.filter((u) => u.role === args.targetRole);
    }

    let successCount = 0;
    for (const user of targetUsers) {
      try {
        await ctx.db.insert("notifications", {
          userId: user._id,
          type: "system",
          title: args.title,
          message: args.message,
          read: false,
          link: args.link,
          metadata: {
            broadcast: true,
            sentBy: adminId,
            sentAt: Date.now(),
          },
          createdAt: Date.now(),
        });
        successCount++;
      } catch (e) {
        console.error(`Failed to send notification to user ${user._id}:`, e);
      }
    }

    // Audit log
    await ctx.db.insert("auditLogs", {
      userId: adminId,
      action: "broadcast_sent",
      entity: "notifications",
      details: JSON.stringify({
        title: args.title,
        targetCount: targetUsers.length,
        successCount,
        targetRole: args.targetRole || "all",
      }),
      timestamp: Date.now(),
    });

    return { sent: successCount, total: targetUsers.length };
  },
});

export const listAllNotifications = query({
  args: {
    limit: v.optional(v.number()),
    broadcastOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.SUPER_ADMIN, ROLES.MARKETING_ADMIN, ROLES.SUPPORT_ADMIN]);

    let notifications = await ctx.db.query("notifications").order("desc").take(args.limit || 100);

    if (args.broadcastOnly) {
      notifications = notifications.filter((n) => n.metadata?.broadcast === true);
    }

    // Enrich with user info
    const enriched = await Promise.all(
      notifications.slice(0, args.limit || 50).map(async (n) => {
        const user = await ctx.db.get(n.userId);
        return {
          ...n,
          userName: user?.name || user?.email || "Unknown",
        };
      }),
    );

    return enriched;
  },
});
