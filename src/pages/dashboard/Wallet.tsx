/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { useState, useEffect } from "react";
import { useResetOnChange } from "@/hooks/use-reset-on-change";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PageLoader } from "@/components/dashboard/PageLoader";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from "@/components/ui/empty";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2, ArrowUpRight, ArrowDownLeft, RefreshCw, Search, Filter,
  FileText, CheckCircle, XCircle, Clock, WalletIcon, TrendingUp,
  ArrowUp, ArrowDown, ArrowUpDown,
} from "lucide-react";
import { formatMoney, formatRelativeTime, formatShortDate } from "@/lib/utils";
import { toast } from "sonner";

type TabView = "transactions" | "payments";

interface TransactionsResponse {
  transactions: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: { total: number; byType: Record<string, number> };
}

interface PaymentsResponse {
  payments: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: { total: number; byStatus: Record<string, number> };
}

export default function Wallet() {
  const { data: wallet, isLoading: wLoading } = useApiQuery<any>(["wallet", "my"], "/api/wallets/my");

  const [activeTab, setActiveTab] = useState<TabView>("transactions");
  const [txFilter, setTxFilter] = useState("all");
  const [txSearch, setTxSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pPage, setPPage] = useState(1);
  const [pPageSize, setPPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [pSortBy, setPSortBy] = useState("createdAt");
  const [pSortOrder, setPSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  // Debounce the search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(txSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [txSearch]);

  // Reset to first page whenever filters, sort, or page size change
  useResetOnChange([debouncedSearch, txFilter, pageSize, sortBy, sortOrder], () => {
    setPage(1);
  });

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (txFilter !== "all") params.set("type", txFilter);
  params.set("sortBy", sortBy);
  params.set("sortOrder", sortOrder);
  const txQuery = `/api/wallets/transactions?${params.toString()}`;

  const { data: txnsData, isLoading: tLoading } = useApiQuery<TransactionsResponse>(["wallet", "txns", txQuery], txQuery);

  const transactions = txnsData?.transactions || [];
  const total = txnsData?.total || 0;
  const totalPages = txnsData?.totalPages || 1;

  // Clamp page if the current page exceeds total pages (e.g. after filter changes)
  useResetOnChange([totalPages, page], () => setPage(1), page > totalPages && totalPages > 0);

  // Payments list (server-driven pagination)
  const pParams = new URLSearchParams();
  pParams.set("page", String(pPage));
  pParams.set("pageSize", String(pPageSize));
  pParams.set("sortBy", pSortBy);
  pParams.set("sortOrder", pSortOrder);
  const pQuery = `/api/payments/my?${pParams.toString()}`;

  const { data: paymentsData, isLoading: pLoading } = useApiQuery<PaymentsResponse>(["payments", "my", pQuery], pQuery);

  const payments = paymentsData?.payments || [];
  const pTotal = paymentsData?.total || 0;
  const pTotalPages = paymentsData?.totalPages || 1;
  const completedPayments = paymentsData?.stats?.byStatus?.completed || 0;

  // Reset payments page when page size or sort changes
  useResetOnChange([pPageSize, pSortBy, pSortOrder], () => {
    setPPage(1);
  });

  // Clamp payments page if the current page exceeds total pages
  useResetOnChange([pTotalPages, pPage], () => setPPage(1), pPage > pTotalPages && pTotalPages > 0);

  if (wLoading) {
    return <PageLoader />;
  }

  const txIcon = (type: string) => {
    switch (type) { case "deposit": case "credit": case "referral_bonus": case "commission": case "refund": return <ArrowDownLeft className="h-3.5 w-3.5" />; case "withdrawal": case "challenge_purchase": return <ArrowUpRight className="h-3.5 w-3.5" />; default: return <RefreshCw className="h-3.5 w-3.5" />; }
  };

  const txColor = (type: string) => {
    switch (type) { case "deposit": case "credit": case "referral_bonus": case "commission": case "refund": return "text-foreground"; case "withdrawal": case "challenge_purchase": return "text-destructive"; default: return "text-muted-foreground"; }
  };

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const pFrom = pTotal === 0 ? 0 : (pPage - 1) * pPageSize + 1;
  const pTo = Math.min(pPage * pPageSize, pTotal);

  // Sorting (whitelisted columns on the server: id, type, amount, reference, createdAt)
  const TX_SORT_COLUMNS: Array<{ key: string; label: string }> = [
    { key: "type", label: "Type" },
    { key: "amount", label: "Amount" },
    { key: "createdAt", label: "Date" },
  ];
  const handleTxSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder("desc");
    }
    setPage(1);
  };
  const txSortHeader = (sortKey: string, label: string) => {
    const active = sortBy === sortKey;
    return (
      <button
        key={sortKey}
        type="button"
        onClick={() => handleTxSort(sortKey)}
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

  // Payment sorting (whitelisted on the server: id, reference, amount, provider, status, createdAt, completedAt)
  const PAY_SORT_COLUMNS: Array<{ key: string; label: string }> = [
    { key: "reference", label: "Reference" },
    { key: "amount", label: "Amount" },
    { key: "status", label: "Status" },
    { key: "createdAt", label: "Date" },
  ];
  const handlePaySort = (key: string) => {
    if (pSortBy === key) {
      setPSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setPSortBy(key);
      setPSortOrder("desc");
    }
    setPPage(1);
  };
  const paySortHeader = (sortKey: string, label: string) => {
    const active = pSortBy === sortKey;
    return (
      <button
        key={sortKey}
        type="button"
        onClick={() => handlePaySort(sortKey)}
        aria-label={`Sort by ${label}`}
        aria-pressed={active}
        className={`inline-flex items-center gap-1 font-medium transition-colors rounded px-1 py-0.5 -mx-1 ${
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
        {active ? (
          pSortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </button>
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Finance"
        title="Wallet"
        subtitle="View your transaction history and challenge purchase records"
      />

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card-subtle p-6">
          <div className="flex items-center gap-2 mb-2"><WalletIcon className="h-3.5 w-3.5 text-muted-foreground" /><span className="stat-label">Main Balance</span></div>
          <div className="text-3xl font-light tracking-tight tabular-nums mt-1">{formatMoney(wallet?.balance, wallet?.currency || "NGN")}</div>
        </div>
        <div className="card-subtle p-6 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2"><TrendingUp className="h-3.5 w-3.5 text-muted-foreground" /><span className="stat-label">This Month</span></div>
          <div className="text-sm font-light">{completedPayments} completed payments</div>
        </div>

      </div>

      <div className="flex items-center border-b border-border/50">
        <button onClick={() => setActiveTab("transactions")} className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${activeTab === "transactions" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Transactions</button>
        <button onClick={() => setActiveTab("payments")} className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${activeTab === "payments" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Payment History</button>
      </div>

      {activeTab === "transactions" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input type="text" placeholder="Search transactions..." value={txSearch} onChange={(e) => setTxSearch(e.target.value)} className="w-full h-9 pl-8 pr-3 rounded-md border border-input bg-background text-xs placeholder:text-muted-foreground outline-none focus:border-foreground" />
            </div>
            <div className="relative">
              <select value={txFilter} onChange={(e) => setTxFilter(e.target.value)} className="h-9 pl-3 pr-8 rounded-md border border-input bg-background text-xs cursor-pointer outline-none appearance-none">
                <option value="all">All</option>
                <option value="challenge_purchase">Challenge Purchases</option>
              </select>
              <Filter className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {transactions.length > 0 && (
            <div className="card-subtle px-4 py-2 flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-medium text-muted-foreground mr-1">Sort:</span>
              {TX_SORT_COLUMNS.map((c) => txSortHeader(c.key, c.label))}
            </div>
          )}

          {tLoading && transactions.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card-subtle p-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <div className="space-y-2 flex-1 min-w-0">
                      <Skeleton className="h-3 w-40" />
                      <Skeleton className="h-2.5 w-20" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-16 shrink-0" />
                </div>
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <Empty className="card-subtle p-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>No transactions found</EmptyTitle>
                <EmptyDescription>Your wallet activity will appear here once you purchase a challenge.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="space-y-1">
                {transactions.map((tx: any) => (
                  <div key={tx.id} className="card-subtle p-3.5 flex items-center justify-between hover:bg-secondary/20 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-full border border-border flex items-center justify-center shrink-0">{txIcon(tx.type)}</div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">{tx.description}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{formatRelativeTime(tx.createdAt)}</div>
                      </div>
                    </div>
                    <div className={`text-sm font-light tabular-nums shrink-0 ml-4 ${txColor(tx.type)}`}>
                      {tx.type === "withdrawal" || tx.type === "challenge_purchase" ? "-" : "+"}{formatMoney(tx.amount, tx.currency || "NGN")}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination footer */}
              <div className="flex items-center justify-between pt-1">
                <div className="text-[10px] text-muted-foreground">Showing {from}–{to} of {total} transactions</div>
                <div className="flex items-center gap-2">
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="h-7 px-2 rounded-md border border-input bg-background text-[11px] cursor-pointer outline-none"
                    aria-label="Rows per page"
                  >
                    {[10, 25, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
                  </select>
                  <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                  <span className="px-2 text-[11px] font-medium tabular-nums">{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === "payments" && (
        <div className="space-y-4">
          {pLoading && payments.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card-subtle p-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <div className="space-y-2 flex-1 min-w-0">
                      <Skeleton className="h-3 w-44" />
                      <Skeleton className="h-2.5 w-16" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-16 shrink-0" />
                </div>
              ))}
            </div>
          ) : payments.length === 0 ? (
            <Empty className="card-subtle p-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>No payments yet</EmptyTitle>
                <EmptyDescription>Payments for your challenge purchases will show up here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="card-subtle px-4 py-2 flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-medium text-muted-foreground mr-1">Sort:</span>
                {PAY_SORT_COLUMNS.map((c) => paySortHeader(c.key, c.label))}
              </div>
              <div className="space-y-1">
                {payments.map((p: any) => (
                  <button key={p.id} onClick={() => { setSelectedPayment(p); setShowPaymentDialog(true); }} className="w-full card-subtle p-3.5 flex items-center justify-between text-left hover:bg-secondary/20 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-full border border-border flex items-center justify-center shrink-0">
                        {p.status === "completed" ? <CheckCircle className="h-3.5 w-3.5 text-foreground" /> : p.status === "failed" ? <XCircle className="h-3.5 w-3.5 text-destructive" /> : <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">{p.description || "Challenge Purchase"}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{p.reference?.slice(0, 12)}</div>
                      </div>
                    </div>
                    <span className="text-sm font-light tabular-nums">{formatMoney(p.amount, p.currency || "NGN")}</span>
                  </button>
                ))}
              </div>

              {/* Pagination footer */}
              <div className="flex items-center justify-between pt-1">
                <div className="text-[10px] text-muted-foreground">Showing {pFrom}–{pTo} of {pTotal} payments</div>
                <div className="flex items-center gap-2">
                  <select
                    value={pPageSize}
                    onChange={(e) => setPPageSize(Number(e.target.value))}
                    className="h-7 px-2 rounded-md border border-input bg-background text-[11px] cursor-pointer outline-none"
                    aria-label="Rows per page"
                  >
                    {[10, 25, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
                  </select>
                  <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" disabled={pPage <= 1} onClick={() => setPPage((p) => p - 1)}>Prev</Button>
                  <span className="px-2 text-[11px] font-medium tabular-nums">{pPage} / {pTotalPages}</span>
                  <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" disabled={pPage >= pTotalPages} onClick={() => setPPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-base font-medium">Payment Details</DialogTitle></DialogHeader>
          {selectedPayment && (
            <div className="space-y-4">
              <div className="text-center"><div className="text-3xl font-light tracking-tight tabular-nums">{formatMoney(selectedPayment.amount, selectedPayment.currency || "NGN")}</div></div>
              <div className="border border-border/50 rounded-lg divide-y divide-border/50">
                <div className="flex items-center justify-between px-4 py-2.5"><span className="text-[11px] text-muted-foreground">Reference</span><span className="text-[11px] font-mono">{selectedPayment.reference}</span></div>
                <div className="flex items-center justify-between px-4 py-2.5"><span className="text-[11px] text-muted-foreground">Status</span><span className="text-[11px] font-medium capitalize">{selectedPayment.status}</span></div>
                <div className="flex items-center justify-between px-4 py-2.5"><span className="text-[11px] text-muted-foreground">Date</span><span className="text-[11px]">{formatShortDate(selectedPayment.createdAt)}</span></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
