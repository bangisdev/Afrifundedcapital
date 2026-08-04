/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState, useEffect } from "react";
import { useResetOnChange } from "@/hooks/use-reset-on-change";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import {
  Loader2,
  CheckCircle,
  XCircle,
  DollarSign,
  Users,
  TrendingUp,
  Search,
  Eye,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Wallet,
  Clock,
  Banknote,
  Copy,
  ExternalLink,
  X,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ───────────────────────────────────────────
function formatTime(ts: number | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(ts: number | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Types ─────────────────────────────────────────────
interface AffiliateRow {
  id: number;
  userId: number;
  referralCode: string;
  totalReferrals: number;
  activeReferrals: number;
  totalCommissions: number;
  pendingCommissions: number;
  paidCommissions: number;
  commissionRate: number;
  isActive: boolean;
  joinedAt: number;
  userName?: string;
  userEmail?: string;
}

interface PayoutRow {
  id: number;
  userId: number;
  affiliateId: number;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  paymentDetails: string;
  processedBy: number | null;
  notes: string | null;
  requestedAt: number;
  processedAt: number | null;
  userName?: string;
  userEmail?: string;
}

// ─── Main Component ────────────────────────────────────
export default function AdminAffiliates() {
  const [activeTab, setActiveTab] = useState("payouts");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Affiliate Management</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Manage affiliates, commissions, and payout requests
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9">
          <TabsTrigger value="payouts" className="text-xs">
            <DollarSign className="h-3 w-3 mr-1.5" />
            Payout Requests
          </TabsTrigger>
          <TabsTrigger value="affiliates" className="text-xs">
            <Users className="h-3 w-3 mr-1.5" />
            All Affiliates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payouts">
          <AffiliatePayoutsTab />
        </TabsContent>

        <TabsContent value="affiliates">
          <AffiliatesListTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  PAYOUTS TAB
// ═══════════════════════════════════════════════════════
const PAGE_SIZES = [10, 25, 50];
const EMPTY_PAYOUT_STATS = {
  total: 0,
  pending: 0,
  approved: 0,
  paid: 0,
  rejected: 0,
  totalAmount: 0,
  pendingAmount: 0,
  paidAmount: 0,
};

interface PayoutsResponse {
  payouts: PayoutRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: typeof EMPTY_PAYOUT_STATS;
}

function AffiliatePayoutsTab() {
  const approvePayout = useApiMutation<any, any>(
    "post",
    "/api/affiliates/admin/payouts/${id}/approve"
  );
  const rejectPayout = useApiMutation<any, any>(
    "post",
    "/api/affiliates/admin/payouts/${id}/reject"
  );
  const markPaid = useApiMutation<any, any>(
    "post",
    "/api/affiliates/admin/payouts/${id}/pay"
  );

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("requestedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [rejectTarget, setRejectTarget] = useState<PayoutRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [processingId, setProcessingId] = useState<number | null>(null);

  // Sortable columns matching the server whitelist for /api/affiliates/admin/payouts
  const SORT_COLUMNS: Array<{ key: string; label: string }> = [
    { key: "amount", label: "Amount" },
    { key: "status", label: "Status" },
    { key: "requestedAt", label: "Requested" },
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
        className={`inline-flex items-center gap-1 text-[11px] font-medium transition-colors rounded px-1.5 py-0.5 ${
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

  // Debounce the search input so we don't hit the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to first page whenever filters, page size, or sort change
  useResetOnChange([debouncedSearch, statusFilter, pageSize, sortBy, sortOrder], () => {
    setPage(1);
  });

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  params.set("sortBy", sortBy);
  params.set("sortOrder", sortOrder);
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const listQuery = `/api/affiliates/admin/payouts?${params.toString()}`;

  const {
    data,
    isLoading,
    refetch,
  } = useApiQuery<PayoutsResponse>(["admin", "affiliate-payouts", listQuery], listQuery);

  const payouts = data?.payouts || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const stats = data?.stats || EMPTY_PAYOUT_STATS;
  const hasActiveFilters = debouncedSearch || statusFilter !== "all";

  const handleApprove = async (payout: PayoutRow) => {
    setProcessingId(payout.id);
    try {
      await approvePayout.mutateAsync({ id: payout.id });
      toast.success(`Payout of ₦${payout.amount.toLocaleString()} approved`);
      refetch();
    } catch {
      toast.error("Failed to approve payout");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setProcessingId(rejectTarget.id);
    try {
      await rejectPayout.mutateAsync({ id: rejectTarget.id, reason: rejectReason });
      toast.success(`Payout of ₦${rejectTarget.amount.toLocaleString()} rejected`);
      setRejectTarget(null);
      setRejectReason("");
      refetch();
    } catch {
      toast.error("Failed to reject payout");
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkPaid = async (payout: PayoutRow) => {
    setProcessingId(payout.id);
    try {
      await markPaid.mutateAsync({ id: payout.id });
      toast.success(`Payout of ₦${payout.amount.toLocaleString()} marked as paid`);
      refetch();
    } catch {
      toast.error("Failed to mark as paid");
    } finally {
      setProcessingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Requests", value: stats.total, icon: DollarSign, color: "text-foreground" },
          { label: "Pending", value: `${stats.pending} (${stats.pending.toLocaleString("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0 })})`, icon: Clock, color: "text-amber-600" },
          { label: "Approved", value: stats.approved, icon: CheckCircle, color: "text-emerald-600" },
          { label: "Total Paid", value: stats.paid.toLocaleString("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0 }), icon: Banknote, color: "text-blue-600" },
        ].map((s) => (
          <div key={s.label} className="card-subtle p-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center">
              <s.icon className={`h-4 w-4 ${s.color}`} />
            </div>
            <div>
              <div className="text-sm font-medium">{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or payment method..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 text-xs pl-9"
          />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 pr-8 text-xs appearance-none cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="paid">Paid</option>
            <option value="rejected">Rejected</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Sort toolbar */}
      <div className="flex items-center gap-0.5" aria-label="Sort affiliate payouts">
        <span className="text-[10px] text-muted-foreground mr-1">Sort:</span>
        {SORT_COLUMNS.map((col) => sortHeader(col.key, col.label))}
      </div>

      {/* Payout List */}
      <div className="space-y-1">
        {payouts.length === 0 ? (
          <div className="card-subtle p-8 text-center text-xs text-muted-foreground">
            {total === 0
              ? "No affiliate payout requests yet"
              : "No payouts match your filters"}
          </div>
        ) : (
          payouts.map((payout) => (
            <PayoutRowItem
              key={payout.id}
              payout={payout}
              processingId={processingId}
              onApprove={handleApprove}
              onReject={(p) => {
                setRejectTarget(p);
                setRejectReason("");
              }}
              onMarkPaid={handleMarkPaid}
            />
          ))
        )}
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        <div>
          Showing {payouts.length} of {total} payout requests
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

      {/* Reject Dialog */}
      <AlertDialog
        open={!!rejectTarget}
        onOpenChange={(open) => !open && setRejectTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Payout</AlertDialogTitle>
            <AlertDialogDescription>
              Provide a reason for rejecting the ₦
              {rejectTarget?.amount.toLocaleString()} payout request from{" "}
              {rejectTarget?.userName || `User ${rejectTarget?.userId}`}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              placeholder="Rejection reason (e.g. insufficient documentation, suspicious activity...)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="text-xs"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setRejectTarget(null);
                setRejectReason("");
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleReject}
            >
              Reject Payout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Payout Row Component ──────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  approved: { label: "Approved", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  paid: { label: "Paid", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  rejected: { label: "Rejected", color: "bg-red-500/10 text-red-600 border-red-500/20" },
};

function PayoutRowItem({
  payout,
  processingId,
  onApprove,
  onReject,
  onMarkPaid,
}: {
  payout: PayoutRow;
  processingId: number | null;
  onApprove: (p: PayoutRow) => void;
  onReject: (p: PayoutRow) => void;
  onMarkPaid: (p: PayoutRow) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusCfg = STATUS_CONFIG[payout.status] || STATUS_CONFIG.pending;
  const isProcessing = processingId === payout.id;

  return (
    <div className="card-subtle overflow-hidden">
      {/* Main Row */}
      <div
        className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-secondary/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                ₦{payout.amount.toLocaleString()}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${statusCfg.color}`}
              >
                {statusCfg.label}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
              <span>{payout.userName || `User ${payout.userId}`}</span>
              <span>·</span>
              <span className="capitalize">{payout.paymentMethod}</span>
              <span>·</span>
              <span>{formatDateTime(payout.requestedAt)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {payout.status === "pending" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] text-emerald-600 hover:bg-emerald-500/10"
                disabled={isProcessing}
                onClick={(e) => {
                  e.stopPropagation();
                  onApprove(payout);
                }}
              >
                {isProcessing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle className="h-3 w-3 mr-1" />
                )}
                Approve
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] text-destructive hover:bg-destructive/5"
                disabled={isProcessing}
                onClick={(e) => {
                  e.stopPropagation();
                  onReject(payout);
                }}
              >
                <XCircle className="h-3 w-3 mr-1" />
                Reject
              </Button>
            </>
          )}
          {payout.status === "approved" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] text-blue-600 hover:bg-blue-500/10"
              disabled={isProcessing}
              onClick={(e) => {
                e.stopPropagation();
                onMarkPaid(payout);
              }}
            >
              {isProcessing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Wallet className="h-3 w-3 mr-1" />
              )}
              Mark Paid
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div className="border-t p-4 bg-muted/20">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <div className="text-muted-foreground mb-1">User</div>
              <div className="font-medium">{payout.userName || `User ${payout.userId}`}</div>
              <div className="text-muted-foreground">{payout.userEmail || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Payment Method</div>
              <div className="font-medium capitalize">{payout.paymentMethod || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Payment Details</div>
              <div className="font-medium break-all">{payout.paymentDetails || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Requested</div>
              <div className="font-medium">{formatDateTime(payout.requestedAt)}</div>
              {payout.processedAt && (
                <div className="text-muted-foreground mt-0.5">
                  Processed: {formatDateTime(payout.processedAt)}
                </div>
              )}
            </div>
          </div>

          {payout.notes && (
            <div className="mt-3 pt-3 border-t">
              <div className="text-[10px] text-muted-foreground mb-1">Notes</div>
              <div className="text-xs bg-red-500/5 border border-red-500/20 rounded p-2 text-red-600">
                {payout.notes}
              </div>
            </div>
          )}

          {/* Action Buttons (bottom) */}
          {payout.status === "pending" && (
            <div className="flex gap-2 mt-4 pt-3 border-t">
              <Button
                className="flex-1 text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={isProcessing}
                onClick={() => onApprove(payout)}
              >
                <CheckCircle className="h-3 w-3 mr-1" /> Approve
              </Button>
              <Button
                variant="outline"
                className="flex-1 text-xs h-9 text-destructive border-destructive/30 hover:bg-destructive/5"
                disabled={isProcessing}
                onClick={() => onReject(payout)}
              >
                <XCircle className="h-3 w-3 mr-1" /> Reject
              </Button>
            </div>
          )}
          {payout.status === "approved" && (
            <div className="flex gap-2 mt-4 pt-3 border-t">
              <Button
                className="flex-1 text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white"
                disabled={isProcessing}
                onClick={() => onMarkPaid(payout)}
              >
                <Wallet className="h-3 w-3 mr-1" /> Mark as Paid
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  AFFILIATES LIST TAB
// ═══════════════════════════════════════════════════════
const EMPTY_AFFILIATE_STATS = {
  total: 0,
  active: 0,
  totalReferrals: 0,
  totalCommissions: 0,
  pendingCommissions: 0,
  paidCommissions: 0,
};

interface AffiliatesResponse {
  affiliates: AffiliateRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: typeof EMPTY_AFFILIATE_STATS;
}

function AffiliatesListTab() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("joinedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Sortable columns matching the server whitelist for /api/affiliates/admin/all
  const SORT_COLUMNS: Array<{ key: string; label: string }> = [
    { key: "referralCode", label: "Code" },
    { key: "totalReferrals", label: "Referrals" },
    { key: "totalCommissions", label: "Commissions" },
    { key: "joinedAt", label: "Joined" },
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
        className={`inline-flex items-center gap-1 text-[11px] font-medium transition-colors rounded px-1.5 py-0.5 ${
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

  // Debounce the search input so we don't hit the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to first page whenever filters, page size, or sort change
  useResetOnChange([debouncedSearch, statusFilter, pageSize, sortBy, sortOrder], () => {
    setPage(1);
  });

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  params.set("sortBy", sortBy);
  params.set("sortOrder", sortOrder);
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const listQuery = `/api/affiliates/admin/all?${params.toString()}`;

  const {
    data,
    isLoading,
    refetch,
  } = useApiQuery<AffiliatesResponse>(["admin", "affiliates", listQuery], listQuery);

  const affiliates = data?.affiliates || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const stats = data?.stats || EMPTY_AFFILIATE_STATS;
  const hasActiveFilters = debouncedSearch || statusFilter !== "all";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Affiliates", value: stats.total, icon: Users },
          { label: "Active", value: stats.active, icon: CheckCircle },
          { label: "Total Referrals", value: stats.totalReferrals, icon: TrendingUp },
          {
            label: "Total Commissions",
            value: stats.totalCommissions.toLocaleString("en-NG", {
              style: "currency",
              currency: "NGN",
              minimumFractionDigits: 0,
            }),
            icon: DollarSign,
          },
        ].map((s) => (
          <div key={s.label} className="card-subtle p-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center">
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="text-sm font-medium">{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by referral code, name, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 text-xs pl-9"
          />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 pr-8 text-xs appearance-none cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Sort toolbar */}
      <div className="flex items-center gap-0.5" aria-label="Sort affiliates">
        <span className="text-[10px] text-muted-foreground mr-1">Sort:</span>
        {SORT_COLUMNS.map((col) => sortHeader(col.key, col.label))}
      </div>

      {/* Affiliates List */}
      <div className="space-y-1">
        {affiliates.length === 0 ? (
          <div className="card-subtle p-8 text-center text-xs text-muted-foreground">
            {total === 0
              ? "No affiliates registered yet"
              : "No affiliates match your filters"}
          </div>
        ) : (
          affiliates.map((affiliate) => (
            <div key={affiliate.id} className="card-subtle overflow-hidden">
              {/* Main Row */}
              <div
                className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-secondary/20 transition-colors"
                onClick={() => setExpandedId(expandedId === affiliate.id ? null : affiliate.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-medium">
                        {affiliate.referralCode}
                      </span>
                      <Badge
                        variant={affiliate.isActive ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {affiliate.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span>{affiliate.userName || `User ${affiliate.userId}`}</span>
                      <span>·</span>
                      <span>{affiliate.totalReferrals} referrals</span>
                      <span>·</span>
                      <span>
                        {(affiliate.commissionRate * 100).toFixed(0)}% commission
                      </span>
                      <span>·</span>
                      <span>Joined {formatTime(affiliate.joinedAt)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0 text-right">
                  <div>
                    <div className="text-sm font-medium">
                      {affiliate.pendingCommissions.toLocaleString("en-NG", {
                        style: "currency",
                        currency: "NGN",
                        minimumFractionDigits: 0,
                      })}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Pending</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-emerald-600">
                      {affiliate.paidCommissions.toLocaleString("en-NG", {
                        style: "currency",
                        currency: "NGN",
                        minimumFractionDigits: 0,
                      })}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Paid</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">
                      {affiliate.totalCommissions.toLocaleString("en-NG", {
                        style: "currency",
                        currency: "NGN",
                        minimumFractionDigits: 0,
                      })}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Total</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedId(expandedId === affiliate.id ? null : affiliate.id);
                    }}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Expanded Detail */}
              {expandedId === affiliate.id && (
                <div className="border-t p-4 bg-muted/20">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div>
                      <div className="text-muted-foreground mb-1">Affiliate ID</div>
                      <div className="font-medium">#{affiliate.id}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1">User</div>
                      <div className="font-medium">{affiliate.userName || "—"}</div>
                      <div className="text-muted-foreground">{affiliate.userEmail || "—"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1">Referral Code</div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">{affiliate.referralCode}</span>
                        <button
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `${window.location.origin}/auth?ref=${affiliate.referralCode}`
                            );
                            toast.success("Referral link copied");
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1">Referral Link</div>
                      <div className="flex items-center gap-1 text-primary break-all">
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          /auth?ref={affiliate.referralCode}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mt-3 pt-3 border-t">
                    <div>
                      <div className="text-muted-foreground mb-1">Total Referrals</div>
                      <div className="font-medium">{affiliate.totalReferrals}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1">Active Referrals</div>
                      <div className="font-medium">{affiliate.activeReferrals}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1">Commission Rate</div>
                      <div className="font-medium">
                        {(affiliate.commissionRate * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1">Joined</div>
                      <div className="font-medium">{formatTime(affiliate.joinedAt)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        <div>
          Showing {affiliates.length} of {total} affiliates
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
  );
}
