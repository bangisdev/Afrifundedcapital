/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState } from "react";
import { useResetOnChange } from "@/hooks/use-reset-on-change";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, DollarSign, ArrowUpRight, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

interface PayoutsResponse {
  payouts: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: { total: number; totalPaid: number; totalPending: number; byStatus: Record<string, number> };
}

const PAGE_SIZES = [5, 10, 25];

const FUNDED_SORT_COLUMNS: Array<{ key: string; label: string }> = [
  { key: "accountSize", label: "Size" },
  { key: "isActive", label: "Status" },
  { key: "activatedAt", label: "Activated" },
  { key: "totalPayouts", label: "Paid Out" },
];

export default function Payouts() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  const listQuery = `/api/payouts/my?${params.toString()}`;

  const { data, isLoading: pLoading } = useApiQuery<PayoutsResponse>(["payouts", "my", listQuery], listQuery);
  const { data: stats } = useApiQuery<any>(["payouts", "stats"], "/api/payouts/my/stats");
  // Server-driven pagination + sorting — request a generous page size so the account selector shows all
  const [fundedSortBy, setFundedSortBy] = useState("activatedAt");
  const [fundedSortOrder, setFundedSortOrder] = useState<"asc" | "desc">("desc");
  const fundedParams = new URLSearchParams();
  fundedParams.set("page", "1");
  fundedParams.set("pageSize", "50");
  fundedParams.set("sortBy", fundedSortBy);
  fundedParams.set("sortOrder", fundedSortOrder);
  const fundedQuery = `/api/payouts/my/funded?${fundedParams.toString()}`;
  const { data: fundedData } = useApiQuery<any>(["funded", "my", fundedQuery], fundedQuery);
  const fundedAccounts = fundedData?.accounts || [];

  const handleFundedSort = (key: string) => {
    if (fundedSortBy === key) {
      setFundedSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setFundedSortBy(key);
      setFundedSortOrder("desc");
    }
  };

  const fundedSortHeader = (sortKey: string, label: string) => {
    const active = fundedSortBy === sortKey;
    return (
      <button
        key={sortKey}
        type="button"
        onClick={() => handleFundedSort(sortKey)}
        aria-label={`Sort by ${label}`}
        aria-pressed={active}
        className={`inline-flex items-center gap-1 text-[11px] font-medium transition-colors rounded px-1.5 py-0.5 ${
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
        {active ? (
          fundedSortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </button>
    );
  };
  const requestPayout = useApiMutation<any, any>("post", "/api/payouts/request");
  const [showRequest, setShowRequest] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [details, setDetails] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<any>(null);

  const payouts = data?.payouts || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const listStats = data?.stats || { total: 0, totalPaid: 0, totalPending: 0, byStatus: {} };

  // Clamp page if the current page exceeds total pages (e.g. after data changes)
  useResetOnChange([totalPages, page], () => setPage(1), page > totalPages);

  if (pLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const handleRequest = async () => {
    if (!amount || !selectedAccount) { toast.error("Select account and enter amount"); return; }
    try {
      await requestPayout.mutateAsync({ fundedAccountId: selectedAccount.id, challengeId: selectedAccount.challengeId, amount: parseFloat(amount), paymentMethod: method, paymentDetails: details });
      toast.success("Payout request submitted"); setShowRequest(false); setAmount("");
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-medium tracking-tight">Payouts</h1><p className="text-xs text-muted-foreground mt-1">Request profit withdrawals from your funded accounts</p></div>
        <Button size="sm" className="text-xs" onClick={() => setShowRequest(true)} disabled={!(fundedAccounts?.length)}><ArrowUpRight className="h-3 w-3 mr-1" /> Request Payout</Button>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card-subtle p-5"><div className="stat-label">Total Paid</div><div className="stat-value mt-1">₦{(stats?.totalPaid ?? listStats.totalPaid).toLocaleString()}</div></div>
        <div className="card-subtle p-5"><div className="stat-label">Pending</div><div className="stat-value mt-1">₦{(stats?.totalPending ?? listStats.totalPending).toLocaleString()}</div></div>
        <div className="card-subtle p-5"><div className="stat-label">Total Payouts</div><div className="stat-value mt-1">{stats?.totalPayouts ?? listStats.total}</div></div>
      </div>
      {payouts.length === 0 ? (
        <div className="card-subtle p-8 text-center"><DollarSign className="h-8 w-8 mx-auto mb-3 text-muted-foreground" /><p className="text-xs text-muted-foreground">No payout requests yet</p></div>
      ) : (
        <>
          <div className="space-y-2">
            {payouts.map((p: any) => (
              <div key={p.id} className="card-subtle p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">₦{(p.amount || 0).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">{p.paymentMethod} · {p.requestedAt ? new Date(p.requestedAt).toLocaleDateString() : ""}</div>
                  {p.status === "rejected" && p.rejectionReason && (
                    <div className="text-[10px] text-destructive mt-1">
                      Reason: {p.rejectionReason}
                    </div>
                  )}
                </div>
                <Badge variant={p.status === "paid" ? "default" : p.status === "rejected" ? "destructive" : "secondary"} className="text-[10px]">{p.status}</Badge>
              </div>
            ))}
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <div>Showing {payouts.length} of {total} payouts · Page {page} of {totalPages}</div>
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
        </>
      )}
      {fundedAccounts.length > 0 && (
        <div className="card-subtle p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs text-muted-foreground font-medium">Funded Accounts ({fundedAccounts.length})</div>
            <div className="flex items-center gap-0.5" aria-label="Sort funded accounts">
              <span className="text-[10px] text-muted-foreground mr-1 hidden sm:inline">Sort:</span>
              {FUNDED_SORT_COLUMNS.map((col) => fundedSortHeader(col.key, col.label))}
            </div>
          </div>
          <div className="border-t border-border">
            {fundedAccounts.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-2 border-b border-border/60 last:border-b-0 text-xs">
                <div className="font-medium">${(a.accountSize || 0).toLocaleString()}</div>
                <div className="flex items-center gap-3">
                  <Badge variant={a.isActive ? "default" : "secondary"} className="text-[10px]">{a.isActive ? "Active" : "Inactive"}</Badge>
                  <span className="text-muted-foreground tabular-nums">
                    {a.activatedAt ? new Date(a.activatedAt).toLocaleDateString() : "—"}
                  </span>
                  <span className="text-muted-foreground tabular-nums">₦{(a.totalPayouts || 0).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={showRequest} onOpenChange={setShowRequest}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-base font-medium">Request Payout</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs text-muted-foreground block mb-1">Funded Account</label>
              <select value={selectedAccount?.id || ""} onChange={(e) => setSelectedAccount(fundedAccounts?.find((a: any) => String(a.id) === e.target.value))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs">
                <option value="">Select account</option>{(fundedAccounts || []).map((a: any) => <option key={a.id} value={a.id}>${(a.accountSize || 0).toLocaleString()} Account</option>)}
              </select>
            </div>
            <div><label className="text-xs text-muted-foreground block mb-1">Amount (NGN)</label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-xs h-9" /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Payment Details</label><Input value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Bank name, account number" className="text-xs h-9" /></div>
            <Button className="w-full text-xs" size="sm" onClick={handleRequest}>Submit Request</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
