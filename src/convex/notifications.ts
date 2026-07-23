import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth, getCurrentUser } from "./users";

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
