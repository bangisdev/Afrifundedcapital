/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  RefreshCw,
  DollarSign,
  CreditCard,
  TrendingUp,
  ArrowDownRight,
  ArrowUpRight,
  Trash2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  RotateCcw,
  Play,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  completed: { label: "Completed", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  pending: { label: "Pending", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  failed: { label: "Failed", color: "bg-red-500/10 text-red-600 border-red-500/20" },
  refunded: { label: "Refunded", color: "bg-violet-500/10 text-violet-600 border-violet-500/20" },
};

const PAGE_SIZES = [10, 25, 50];

const EMPTY_STATS = { total: 0, completed: 0, pending: 0, failed: 0, refunded: 0, revenue: 0 };

function formatNgn(n: number) {
  return `₦${n.toLocaleString()}`;
}

function formatTime(ts: number | null) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface PaymentsResponse {
  payments: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: { total: number; completed: number; pending: number; failed: number; refunded: number; revenue: number };
}

export default function AdminPayments() {
  const { data: stats } = useApiQuery<any>(["admin", "paymentStats"], "/api/payments/admin/stats");
  const { data: revenueGrowth } = useApiQuery<any>(["admin", "revenueGrowth"], "/api/payments/admin/revenue-growth");
  const refundPayment = useApiMutation<any, any>("post", "/api/payments/admin/${id}/refund");
  const resumePayment = useApiMutation<any, any>("post", "/api/payments/admin/${id}/resume");
  const cleanupStale = useApiMutation<any, any>("post", "/api/payments/admin/cleanup-stale");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [refundTarget, setRefundTarget] = useState<any>(null);
  const [resumeTarget, setResumeTarget] = useState<any>(null);
  const [tab, setTab] = useState<"transactions" | "analytics">("transactions");

  // Debounce the search input so we don't hit the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to first page whenever filters, page size, or sort change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, providerFilter, pageSize, sortBy, sortOrder]);

  // Sortable columns matching the server whitelist for /api/payments/admin/all
  const SORT_COLUMNS: Array<{ key: string; label: string }> = [
    { key: "reference", label: "Reference" },
    { key: "amount", label: "Amount" },
    { key: "provider", label: "Provider" },
    { key: "status", label: "Status" },
    { key: "createdAt", label: "Date" },
  ];

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder("desc");
    }
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

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  params.set("sortBy", sortBy);
  params.set("sortOrder", sortOrder);
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (providerFilter !== "all") params.set("provider", providerFilter);
  const listQuery = `/api/payments/admin/all?${params.toString()}`;

  const { data, isLoading, refetch } = useApiQuery<PaymentsResponse>(["admin", "payments", listQuery], listQuery);

  const payments = data?.payments || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  // Platform-wide stats — prefer the paginated response's stats, fall back to /admin/stats
  const paymentStats = useMemo(
    () => data?.stats || stats || EMPTY_STATS,
    [data, stats],
  );

  const handleRefund = async () => {
    if (!refundTarget) return;
    try {
      await refundPayment.mutateAsync({ id: refundTarget.id });
      toast.success(`Payment ${refundTarget.reference} refunded`);
      setRefundTarget(null);
      refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed to refund");
    }
  };

  const handleResume = async () => {
    if (!resumeTarget) return;
    try {
      await resumePayment.mutateAsync({ id: resumeTarget.id });
      toast.success(`Challenge for ${resumeTarget.reference} resumed`);
      setResumeTarget(null);
      refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed to resume challenge");
    }
  };

  const hasActiveFilters = debouncedSearch || statusFilter !== "all" || providerFilter !== "all";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Payments</h1>
          <p className="text-xs text-muted-foreground mt-1">Manage transactions, refunds, and revenue</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            disabled={cleanupStale.isPending}
            onClick={async () => {
              try {
                const res = await cleanupStale.mutateAsync({});
                toast.success(res?.message || "Cleanup complete");
                refetch();
              } catch (e: any) {
                toast.error(e.message || "Cleanup failed");
              }
            }}
          >
            {cleanupStale.isPending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3 mr-1" />
            )}
            Clean Up Abandoned
          </Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Revenue", value: formatNgn(paymentStats.revenue), icon: DollarSign, accent: "text-emerald-600" },
          { label: "Total Transactions", value: paymentStats.total, icon: CreditCard },
          { label: "This Month", value: formatNgn(revenueGrowth?.thisMonth || 0), icon: TrendingUp, accent: "text-blue-600" },
          { label: "Last Month", value: formatNgn(revenueGrowth?.lastMonth || 0), icon: TrendingUp, accent: "text-muted-foreground" },
        ].map((s) => (
          <div key={s.label} className="card-subtle p-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center">
              <s.icon className={`h-4 w-4 ${s.accent || "text-muted-foreground"}`} />
            </div>
            <div>
              <div className="text-lg font-medium">{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["transactions", "analytics"] as const).map((t) => (
          <button
            key={t}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab(t)}
          >
            {t === "transactions" ? "Transactions" : "Analytics"}
          </button>
        ))}
      </div>

      {/* Transactions Tab */}
      {tab === "transactions" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by reference, amount, user, or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 pr-8 text-xs appearance-none cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
                <option value="refunded">Refunded</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
            <div className="relative">
              <select
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 pr-8 text-xs appearance-none cursor-pointer"
              >
                <option value="all">All Providers</option>
                <option value="flutterwave">Flutterwave</option>
                <option value="demo">Demo</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setSearch(""); setStatusFilter("all"); setProviderFilter("all"); }}>
                <X className="h-3 w-3 mr-1" /> Clear
              </Button>
            )}
          </div>

          {/* Summary row */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Showing {payments.length} of {total} transactions</span>
            <span>·</span>
            <span>Total (current page): {formatNgn(payments.reduce((s, p) => s + (p.amount || 0), 0))}</span>
          </div>

          {/* Transactions Table */}
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground">{sortHeader("reference", "Reference")}</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">User</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">{sortHeader("amount", "Amount")}</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">{sortHeader("provider", "Provider")}</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">{sortHeader("status", "Status")}</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden xl:table-cell">{sortHeader("createdAt", "Date")}</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        No transactions found
                      </td>
                    </tr>
                  ) : (
                    payments.map((p) => {
                      const statusCfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.pending;
                      return (
                        <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            <div className="font-medium font-mono text-[11px]">{p.reference}</div>
                            {p.description && (
                              <div className="text-muted-foreground mt-0.5 truncate max-w-[200px]">{p.description}</div>
                            )}
                          </td>
                          <td className="p-3 hidden md:table-cell text-muted-foreground">
                            {p.userName ? (
                              <span>
                                <span className="text-foreground">{p.userName}</span>
                                {p.userEmail && <span className="block text-[10px]">{p.userEmail}</span>}
                              </span>
                            ) : (
                              `User ${p.userId}`
                            )}
                          </td>
                          <td className="p-3 text-right font-medium">{formatNgn(p.amount || 0)}</td>
                          <td className="p-3 hidden lg:table-cell">
                            <Badge variant="outline" className="text-[10px] capitalize">{p.provider}</Badge>
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusCfg.color}`}>
                              {statusCfg.label}
                            </span>
                          </td>
                          <td className="p-3 hidden xl:table-cell text-muted-foreground">{formatTime(p.createdAt)}</td>
                          <td className="p-3 text-right">
                            {p.status === "completed" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-[10px] text-destructive"
                                onClick={() => setRefundTarget(p)}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" /> Refund
                              </Button>
                            )}
                            {p.status === "refunded" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-[10px] text-emerald-600"
                                onClick={() => setResumeTarget(p)}
                              >
                                <Play className="h-3 w-3 mr-1" /> Resume
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <div>
              Showing {payments.length} of {total} transactions
              {total > 0 && ` · Page ${page} of ${totalPages}`}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs appearance-none cursor-pointer"
                aria-label="Rows per page"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>{n} / page</option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </Button>
                <span className="px-2 font-medium tabular-nums">{page} / {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {tab === "analytics" && (
        <div className="space-y-6">
          {/* Revenue Summary */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="card-subtle p-4">
              <div className="text-xs text-muted-foreground mb-1">Total Revenue</div>
              <div className="text-2xl font-medium">{formatNgn(paymentStats.revenue)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">
                {paymentStats.completed} completed transactions
              </div>
            </div>
            <div className="card-subtle p-4">
              <div className="text-xs text-muted-foreground mb-1">This Month</div>
              <div className="text-2xl font-medium">{formatNgn(revenueGrowth?.thisMonth || 0)}</div>
              <div className="flex items-center gap-1 text-[10px] mt-1">
                {(revenueGrowth?.thisMonth || 0) > (revenueGrowth?.lastMonth || 0) ? (
                  <span className="text-emerald-600 flex items-center gap-0.5">
                    <ArrowUpRight className="h-3 w-3" />
                    {revenueGrowth?.lastMonth
                      ? `${Math.round(((revenueGrowth.thisMonth - revenueGrowth.lastMonth) / (revenueGrowth.lastMonth || 1)) * 100)}%`
                      : "New"} vs last month
                  </span>
                ) : (revenueGrowth?.thisMonth || 0) < (revenueGrowth?.lastMonth || 0) ? (
                  <span className="text-red-600 flex items-center gap-0.5">
                    <ArrowDownRight className="h-3 w-3" />
                    {revenueGrowth?.lastMonth
                      ? `${Math.round(((revenueGrowth.lastMonth - revenueGrowth.thisMonth) / (revenueGrowth.lastMonth || 1)) * 100)}%`
                      : ""} vs last month
                  </span>
                ) : (
                  <span className="text-muted-foreground">Same as last month</span>
                )}
              </div>
            </div>
            <div className="card-subtle p-4">
              <div className="text-xs text-muted-foreground mb-1">Last Month</div>
              <div className="text-2xl font-medium">{formatNgn(revenueGrowth?.lastMonth || 0)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Previous period</div>
            </div>
          </div>

          {/* Status Breakdown */}
          <div className="card-subtle p-4">
            <h3 className="text-xs font-medium text-muted-foreground mb-3">Payment Status Breakdown</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Completed", value: paymentStats.completed, color: "bg-emerald-500" },
                { label: "Pending", value: paymentStats.pending, color: "bg-amber-500" },
                { label: "Failed", value: paymentStats.failed, color: "bg-red-500" },
                { label: "Refunded", value: paymentStats.refunded, color: "bg-violet-500" },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <div className={`h-2 w-2 rounded-full ${s.color}`} />
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                  </div>
                  <div className="text-lg font-medium">{s.value}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {paymentStats.total ? Math.round((s.value / paymentStats.total) * 100) : 0}%
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Revenue Bar */}
          <div className="card-subtle p-4">
            <h3 className="text-xs font-medium text-muted-foreground mb-3">Monthly Comparison</h3>
            <div className="space-y-3">
              {[
                { label: "This Month", value: revenueGrowth?.thisMonth || 0, max: Math.max(revenueGrowth?.thisMonth || 0, revenueGrowth?.lastMonth || 0) || 1 },
                { label: "Last Month", value: revenueGrowth?.lastMonth || 0, max: Math.max(revenueGrowth?.thisMonth || 0, revenueGrowth?.lastMonth || 0) || 1 },
              ].map((bar) => (
                <div key={bar.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{bar.label}</span>
                    <span className="font-medium">{formatNgn(bar.value)}</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-foreground rounded-full transition-all"
                      style={{ width: `${(bar.value / bar.max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Refund Confirmation Dialog */}
      <AlertDialog open={!!refundTarget} onOpenChange={(open) => !open && setRefundTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refund Payment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to refund <strong>{formatNgn(refundTarget?.amount || 0)}</strong> for
              reference <strong className="font-mono">{refundTarget?.reference}</strong>?
              This will mark the payment as refunded, <strong>deactivate the linked challenge</strong>,
              suspend its MT5 account, void any coupon used, and notify the user.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleRefund}
            >
              Refund Payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Resume Challenge Confirmation Dialog */}
      <AlertDialog open={!!resumeTarget} onOpenChange={(open) => !open && setResumeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resume Challenge</AlertDialogTitle>
            <AlertDialogDescription>
              Reactivate the challenge linked to <strong className="font-mono">{resumeTarget?.reference}</strong>?
              This will set the challenge back to <strong>active</strong>, re-enable its MT5 account,
              give back the trading time lost while refunded, restore any coupon used
              (if still active), and notify the user.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={handleResume}
            >
              Resume Challenge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
