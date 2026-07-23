import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useNavigate } from "react-router";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Bell,
  Search,
  CheckCheck,
  Trash2,
  Check,
  DollarSign,
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  TrendingUp,
  Award,
  UserPlus,
  Ticket,
  Gift,
  AlertTriangle,
  Settings,
  BarChart3,
  Clock,
  ExternalLink,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type NotificationType =
  | "payment_received" | "payment_failed"
  | "kyc_approved" | "kyc_rejected" | "kyc_pending"
  | "challenge_started" | "challenge_phase_1" | "challenge_phase_2"
  | "challenge_funded" | "challenge_violated" | "challenge_expired"
  | "mt5_account_created" | "certificate_issued"
  | "referral_commission" | "support_reply"
  | "coupon_applied" | "payout_processed"
  | "violation_warning" | "system";

const NOTIFICATION_ICONS: Record<string, React.ReactNode> = {
  payment_received: <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />,
  payment_failed: <DollarSign className="h-4 w-4 text-red-600 dark:text-red-400" />,
  kyc_approved: <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
  kyc_rejected: <ShieldX className="h-4 w-4 text-orange-600 dark:text-orange-400" />,
  kyc_pending: <ShieldAlert className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />,
  challenge_started: <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400" />,
  challenge_phase_1: <TrendingUp className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />,
  challenge_phase_2: <TrendingUp className="h-4 w-4 text-sky-600 dark:text-sky-400" />,
  challenge_funded: <Award className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
  challenge_violated: <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />,
  challenge_expired: <Clock className="h-4 w-4 text-muted-foreground" />,
  mt5_account_created: <TrendingUp className="h-4 w-4 text-violet-600 dark:text-violet-400" />,
  certificate_issued: <Award className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />,
  referral_commission: <UserPlus className="h-4 w-4 text-purple-600 dark:text-purple-400" />,
  support_reply: <Ticket className="h-4 w-4 text-blue-600 dark:text-blue-400" />,
  coupon_applied: <Gift className="h-4 w-4 text-pink-600 dark:text-pink-400" />,
  payout_processed: <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
  violation_warning: <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
  system: <Settings className="h-4 w-4 text-muted-foreground" />,
};

const NOTIFICATION_ICON_BG: Record<string, string> = {
  payment_received: "bg-green-500/10",
  payment_failed: "bg-red-500/10",
  kyc_approved: "bg-emerald-500/10",
  kyc_rejected: "bg-orange-500/10",
  kyc_pending: "bg-yellow-500/10",
  challenge_started: "bg-blue-500/10",
  challenge_phase_1: "bg-cyan-500/10",
  challenge_phase_2: "bg-sky-500/10",
  challenge_funded: "bg-amber-500/10",
  challenge_violated: "bg-red-500/10",
  challenge_expired: "bg-secondary",
  mt5_account_created: "bg-violet-500/10",
  certificate_issued: "bg-indigo-500/10",
  referral_commission: "bg-purple-500/10",
  support_reply: "bg-blue-500/10",
  coupon_applied: "bg-pink-500/10",
  payout_processed: "bg-emerald-500/10",
  violation_warning: "bg-amber-500/10",
  system: "bg-secondary",
};

function getRelativeDate(timestamp: number) {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getGroupLabel(timestamp: number) {
  const now = new Date();
  const date = new Date(timestamp);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekStart = new Date(today.getTime() - today.getDay() * 86400000);

  if (date >= today) return "Today";
  if (date >= yesterday) return "Yesterday";
  if (date >= weekStart) return "This Week";
  return "Earlier";
}

export default function Notifications() {
  const navigate = useNavigate();
  const notifications = useQuery(api.notifications.getMyNotifications, {});
  const markAsRead = useMutation(api.notifications.markAsRead);
  const markAllAsRead = useMutation(api.notifications.markAllAsRead);
  const deleteNotification = useMutation(api.notifications.deleteNotification);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!notifications) return [];
    return notifications.filter((n) => {
      if (filterType && n.type !== filterType) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          n.title.toLowerCase().includes(q) ||
          n.message.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [notifications, filterType, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof filtered> = {};
    for (const n of filtered) {
      const label = getGroupLabel(n.createdAt);
      if (!groups[label]) groups[label] = [];
      groups[label].push(n);
    }
    const order = ["Today", "Yesterday", "This Week", "Earlier"];
    return order.filter((g) => groups[g]?.length).map((g) => ({ label: g, items: groups[g] }));
  }, [filtered]);

  const typeCounts = useMemo(() => {
    if (!notifications) return {};
    const counts: Record<string, number> = {};
    for (const n of notifications) {
      counts[n.type] = (counts[n.type] || 0) + 1;
    }
    return counts;
  }, [notifications]);

  const unreadCount = notifications?.filter((n) => !n.read).length || 0;

  const handleMarkAsRead = async (id: string) => {
    try {
      await markAsRead({ notificationId: id as any });
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
      toast.success("All notifications marked as read");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await deleteNotification({ notificationId: id as any });
    } catch (error: any) {
      toast.error(error.message);
    }
    setDeleting(null);
  };

  const handleNotificationClick = (n: any) => {
    if (!n.read) {
      handleMarkAsRead(n._id);
    }
    if (n.link) {
      navigate(n.link);
    }
  };

  const uniqueTypes = notifications ? [...new Set(notifications.map((n) => n.type))].sort() : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Notifications</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Stay updated on your challenges, payments, and account activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8"
              onClick={handleMarkAllAsRead}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
              Mark all read
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8"
            onClick={() => navigate("/dashboard/notifications/preferences")}
          >
            <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
            Preferences
          </Button>
          <Badge variant="outline" className="text-xs font-normal">
            {unreadCount > 0 ? `${unreadCount} unread` : "All clear"}
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 text-xs h-9"
            placeholder="Search notifications…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-9 rounded-md border border-border bg-transparent px-3 text-xs text-muted-foreground"
          value={filterType || ""}
          onChange={(e) => setFilterType(e.target.value || null)}
        >
          <option value="">All types</option>
          {uniqueTypes.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")} ({typeCounts[t] || 0})
            </option>
          ))}
        </select>
      </div>

      {/* Notifications list */}
      {!notifications ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="card-subtle p-10 text-center">
          <Bell className="h-10 w-10 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-sm font-medium">No notifications yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            You'll see updates here when something happens with your account.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-subtle p-10 text-center">
          <Search className="h-10 w-10 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-sm font-medium">No matching notifications</p>
          <p className="text-xs text-muted-foreground mt-1">
            Try adjusting your filters or search query.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.label} className="space-y-1">
              <div className="flex items-center gap-2 px-1 mb-2">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </span>
                <Separator className="flex-1" />
                <span className="text-[10px] text-muted-foreground font-mono">
                  {group.items.length}
                </span>
              </div>

              {group.items.map((n) => (
                <div
                  key={n._id}
                  className={cn(
                    "card-subtle p-3 flex items-start gap-3 transition-all duration-150",
                    !n.read && "border-l-2 border-l-foreground",
                    n.link && "cursor-pointer hover:bg-secondary/30",
                  )}
                  onClick={() => handleNotificationClick(n)}
                >
                  {/* Icon */}
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                      NOTIFICATION_ICON_BG[n.type] || "bg-secondary",
                    )}
                  >
                    {NOTIFICATION_ICONS[n.type] || <Bell className="h-4 w-4 text-muted-foreground" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className={cn("text-xs", !n.read && "font-medium")}>
                          {n.title}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                          {n.message}
                        </p>
                      </div>
                      <div className="shrink-0 text-[10px] text-muted-foreground font-mono whitespace-nowrap pt-0.5">
                        {getRelativeDate(n.createdAt)}
                      </div>
                    </div>

                    {/* Type badge + actions */}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-[9px] font-normal border-0 bg-secondary/50">
                        {n.type.replace(/_/g, " ")}
                      </Badge>
                      {n.link && (
                        <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                          <ExternalLink className="h-2.5 w-2.5" />
                          View
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0 pt-1">
                    {!n.read && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkAsRead(n._id);
                        }}
                        className="h-6 w-6 rounded-md hover:bg-secondary flex items-center justify-center transition-colors"
                        title="Mark as read"
                      >
                        <Check className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(n._id);
                      }}
                      disabled={deleting === n._id}
                      className="h-6 w-6 rounded-md hover:bg-destructive/10 flex items-center justify-center transition-colors"
                      title="Delete"
                    >
                      {deleting === n._id ? (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      ) : (
                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
