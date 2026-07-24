/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useNavigate } from "react-router";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Bell, Search, CheckCheck, Trash2, DollarSign, ShieldCheck,
  ShieldX, ShieldAlert, TrendingUp, Award, UserPlus, Ticket, Gift,
  AlertTriangle, Settings, BarChart3, Clock, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

const NOTIFICATION_ICONS: Record<string, React.ReactNode> = {
  payment_received: <DollarSign className="h-4 w-4 text-green-600" />,
  payment_failed: <DollarSign className="h-4 w-4 text-red-600" />,
  kyc_approved: <ShieldCheck className="h-4 w-4 text-emerald-600" />,
  kyc_rejected: <ShieldX className="h-4 w-4 text-orange-600" />,
  challenge_started: <BarChart3 className="h-4 w-4 text-blue-600" />,
  challenge_funded: <Award className="h-4 w-4 text-amber-600" />,
  challenge_violated: <AlertTriangle className="h-4 w-4 text-red-600" />,
  certificate_issued: <Award className="h-4 w-4 text-indigo-600" />,
  referral_commission: <UserPlus className="h-4 w-4 text-purple-600" />,
  support_reply: <Ticket className="h-4 w-4 text-blue-600" />,
  coupon_applied: <Gift className="h-4 w-4 text-pink-600" />,
  payout_processed: <DollarSign className="h-4 w-4 text-emerald-600" />,
  violation_warning: <AlertTriangle className="h-4 w-4 text-amber-600" />,
  system: <Settings className="h-4 w-4 text-muted-foreground" />,
  broadcast: <Bell className="h-4 w-4 text-muted-foreground" />,
};

const NOTIFICATION_ICON_BG: Record<string, string> = {
  payment_received: "bg-green-500/10", payment_failed: "bg-red-500/10", kyc_approved: "bg-emerald-500/10",
  kyc_rejected: "bg-orange-500/10", challenge_started: "bg-blue-500/10", challenge_funded: "bg-amber-500/10",
  challenge_violated: "bg-red-500/10", certificate_issued: "bg-indigo-500/10", referral_commission: "bg-purple-500/10",
  support_reply: "bg-blue-500/10", coupon_applied: "bg-pink-500/10", payout_processed: "bg-emerald-500/10",
  violation_warning: "bg-amber-500/10", system: "bg-secondary", broadcast: "bg-secondary",
};

function getRelativeDate(timestamp: number) {
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function Notifications() {
  const navigate = useNavigate();
  const { data: notifications, isLoading } = useApiQuery<any[]>(["notifications", "my"], "/api/notifications/my");
  const markRead = useApiMutation<any, any>("put", "/api/notifications/${id}/read");
  const markAllRead = useApiMutation<any, any>("put", "/api/notifications/read-all");
  const deleteNotif = useApiMutation<any, any>("delete", "/api/notifications/${id}");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!notifications) return [];
    return notifications.filter((n: any) => {
      if (filterType && n.type !== filterType) return false;
      if (search) {
        const q = search.toLowerCase();
        return n.title?.toLowerCase().includes(q) || n.message?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [notifications, filterType, search]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Notifications</h1>
          <p className="text-xs text-muted-foreground mt-1">Stay updated on your challenges, payments, and account activity</p>
        </div>
        <div className="flex items-center gap-2">
          {notifications && notifications.some((n: any) => !n.read) && (
            <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => markAllRead.mutateAsync({}).then(() => toast.success("All marked as read"))}>
              <CheckCheck className="h-3.5 w-3.5 mr-1.5" /> Mark all read
            </Button>
          )}
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input type="text" placeholder="Search notifications..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full h-9 pl-8 pr-3 rounded-md border border-input bg-background text-xs placeholder:text-muted-foreground outline-none focus:border-foreground" />
      </div>

      <div className="space-y-1">
        {filtered.length === 0 ? (
          <div className="card-subtle p-8 text-center">
            <Bell className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">No notifications</p>
          </div>
        ) : filtered.map((n: any) => (
          <div key={n.id} className={`card-subtle p-4 flex items-start gap-3 transition-colors ${!n.read ? "bg-secondary/20" : ""}`}>
            <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${NOTIFICATION_ICON_BG[n.type] || "bg-secondary"}`}>
              {NOTIFICATION_ICONS[n.type] || <Bell className="h-4 w-4 text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{n.title}</span>
                {!n.read && <div className="h-1.5 w-1.5 rounded-full bg-foreground shrink-0" />}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
              <span className="text-[10px] text-muted-foreground mt-1 block">{getRelativeDate(n.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
