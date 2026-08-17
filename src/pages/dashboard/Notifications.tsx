/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState, useEffect } from "react";
import { useResetOnChange } from "@/hooks/use-reset-on-change";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
import {
  Loader2, Bell, Search, CheckCheck, DollarSign, ShieldCheck,
  ShieldX, AlertTriangle, Award, UserPlus, Ticket, Gift,
  Settings, BarChart3, ChevronDown, ChevronLeft, ChevronRight,
  ArrowUp, ArrowDown, ArrowUpDown,
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

interface NotificationsResponse {
  notifications: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: { total: number; unread: number; byType: Record<string, number> };
}

const PAGE_SIZES = [10, 25, 50];

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
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Sorting (whitelisted columns on the server: id, type, title, read, createdAt)
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const SORT_COLUMNS: Array<{ key: string; label: string }> = [
    { key: "title", label: "Title" },
    { key: "type", label: "Type" },
    { key: "read", label: "Read" },
    { key: "createdAt", label: "Date" },
  ];
  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder("desc");
    }
    setPage(1);
  };
  const sortHeader = (sortKey: string, label: string) => {
    const active = sortBy === sortKey;
    return (
      <button
        key={sortKey}
        type="button"
        onClick={() => handleSort(sortKey)}
        aria-label={`Sort by ${label}`}
        aria-pressed={active}
        className={`inline-flex items-center gap-1 font-medium transition-colors rounded px-1 py-0.5 -mx-1 ${
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
        {active ? (
          sortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </button>
    );
  };

  const markAllRead = useApiMutation<any, any>("put", "/api/notifications/read-all");

  // Debounce the search input so we don't hit the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to first page whenever filters, sort, or page size change
  useResetOnChange([debouncedSearch, filterType, pageSize, sortBy, sortOrder], () => {
    setPage(1);
  });

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  params.set("sortBy", sortBy);
  params.set("sortOrder", sortOrder);
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (filterType !== "all") params.set("type", filterType);
  const listQuery = `/api/notifications/my?${params.toString()}`;

  const { data, isLoading } = useApiQuery<NotificationsResponse>(["notifications", "my", listQuery], listQuery);

  const notifications = data?.notifications || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const stats = data?.stats || { total: 0, unread: 0, byType: {} };
  const hasUnread = stats.unread > 0;

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Notifications"
        subtitle="Stay updated on your challenges, payments, and account activity"
        actions={
          hasUnread ? (
            <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => markAllRead.mutateAsync({}).then(() => toast.success("All marked as read"))}>
              <CheckCheck className="h-3.5 w-3.5 mr-1.5" /> Mark all read
            </Button>
          ) : undefined
        }
      />

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input type="text" placeholder="Search notifications..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-8 pr-3 rounded-md border border-input bg-background text-xs placeholder:text-muted-foreground outline-none focus:border-foreground" />
        </div>
        <div className="relative">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 pr-8 text-xs appearance-none cursor-pointer"
          >
            <option value="all">All Types</option>
            {Object.keys(stats.byType || {}).map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {notifications.length > 0 && (
        <div className="card-subtle px-4 py-2 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-medium text-muted-foreground mr-1">Sort:</span>
          {SORT_COLUMNS.map((c) => sortHeader(c.key, c.label))}
          <span className="ml-auto text-[10px] text-muted-foreground">
            {total} notification{total !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      <div className="space-y-1">
        {notifications.length === 0 ? (
          <div className="card-subtle p-8 text-center">
            <Bell className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">No notifications</p>
          </div>
        ) : notifications.map((n: any) => (
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

      {/* Pagination Footer */}
      {total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div>Showing {notifications.length} of {total} notifications · Page {page} of {totalPages}</div>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs appearance-none cursor-pointer"
              aria-label="Rows per page"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n} / page</option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </Button>
              <span className="px-2 font-medium tabular-nums">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
