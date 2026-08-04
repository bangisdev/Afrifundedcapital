/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Bell, CheckCheck, Award, AlertTriangle, Shield, CreditCard, MessageSquare, Clock, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  read: boolean;
  link?: string;
  createdAt: number;
}

const typeIcons: Record<string, React.ReactNode> = {
  certificate: <Award className="h-3.5 w-3.5" />,
  payment: <CreditCard className="h-3.5 w-3.5" />,
  kyc: <Shield className="h-3.5 w-3.5" />,
  support: <MessageSquare className="h-3.5 w-3.5" />,
  security: <Shield className="h-3.5 w-3.5" />,
  challenge_violation: <AlertTriangle className="h-3.5 w-3.5" />,
  challenge_expired: <Clock className="h-3.5 w-3.5" />,
  payout: <CreditCard className="h-3.5 w-3.5" />,
  broadcast: <Bell className="h-3.5 w-3.5" />,
};

const typeColors: Record<string, string> = {
  certificate: "text-yellow-500",
  payment: "text-green-500",
  kyc: "text-blue-500",
  support: "text-purple-500",
  security: "text-red-500",
  challenge_violation: "text-red-500",
  challenge_expired: "text-orange-500",
  payout: "text-emerald-500",
  broadcast: "text-muted-foreground",
};

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function NotificationBell({ isAdmin = false }: { isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { data: unreadCount } = useApiQuery<number>(
    ["notifications", "unread-count"],
    "/api/notifications/unread-count"
  );

  const { data: notificationsData, refetch } = useApiQuery<any>(
    ["notifications", "my"],
    "/api/notifications/my"
  );

  const markRead = useApiMutation("put", "/api/notifications/read-all");

  // The endpoint returns a paginated envelope; the bell shows the latest few.
  const notifications = notificationsData?.notifications || [];
  const recentNotifications = (notifications as Notification[]).slice(0, 8);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleMarkAllRead = async () => {
    await markRead.mutate({});
    refetch();
  };

  const handleNotificationClick = (n: Notification) => {
    setOpen(false);
    if (n.link) {
      navigate(n.link);
    }
  };

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 relative"
        onClick={() => setOpen(!open)}
      >
        <Bell className="h-4 w-4" />
        {unreadCount != null && unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <span className="text-xs font-medium">Notifications</span>
            {unreadCount != null && unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications list */}
          <div className="max-h-80 overflow-y-auto">
            {recentNotifications.length === 0 ? (
              <div className="py-8 text-center">
                <Bell className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              recentNotifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={cn(
                    "w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-secondary/50 transition-colors border-b border-border/50 last:border-b-0",
                    !n.read && "bg-secondary/20"
                  )}
                >
                  <div className={cn("mt-0.5 shrink-0", typeColors[n.type] || "text-muted-foreground")}>
                    {typeIcons[n.type] || <Bell className="h-3.5 w-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-xs font-medium truncate", !n.read && "text-foreground")}>
                        {n.title}
                      </span>
                      {!n.read && (
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                      {n.message}
                    </p>
                    <span className="text-[10px] text-muted-foreground/60 mt-1 block">
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                  {n.link && (
                    <ChevronRight className="h-3 w-3 text-muted-foreground/40 mt-1 shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-border">
            <button
              onClick={() => {
                setOpen(false);
                navigate(isAdmin ? "/admin/notifications" : "/dashboard/notifications");
              }}
              className="w-full text-center text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
