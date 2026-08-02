/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2, ArrowUpRight, ArrowDownLeft, RefreshCw, Search, Filter,
  FileText, ChevronDown, CheckCircle, XCircle, Clock, WalletIcon, TrendingUp, Copy,
} from "lucide-react";
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

export default function Wallet() {
  const { data: wallet, isLoading: wLoading } = useApiQuery<any>(["wallet", "my"], "/api/wallets/my");
  const { data: payments, isLoading: pLoading } = useApiQuery<any[]>(["payments", "my"], "/api/payments/my");
  const requestWithdrawal = useApiMutation<any, any>("post", "/api/wallets/withdraw");
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMethod, setWithdrawMethod] = useState("bank_transfer");
  const [withdrawDetails, setWithdrawDetails] = useState("");
  const [activeTab, setActiveTab] = useState<TabView>("transactions");
  const [txFilter, setTxFilter] = useState("all");
  const [txSearch, setTxSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  // Debounce the search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(txSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [txSearch]);

  // Reset to first page whenever filters or page size change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, txFilter, pageSize]);

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (txFilter !== "all") params.set("type", txFilter);
  const txQuery = `/api/wallets/transactions?${params.toString()}`;

  const { data: txnsData, isLoading: tLoading } = useApiQuery<TransactionsResponse>(["wallet", "txns", txQuery], txQuery);

  const transactions = txnsData?.transactions || [];
  const total = txnsData?.total || 0;
  const totalPages = txnsData?.totalPages || 1;

  // Clamp page if the current page exceeds total pages (e.g. after filter changes)
  useEffect(() => {
    if (page > totalPages && totalPages > 0) setPage(1);
  }, [totalPages, page]);

  if (wLoading || pLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const handleWithdraw = async () => {
    const amount = parseInt(withdrawAmount);
    if (!amount || amount <= 0) { toast.error("Invalid amount"); return; }
    if (amount > (wallet?.balance || 0)) { toast.error("Insufficient balance"); return; }
    try {
      await requestWithdrawal.mutateAsync({ amount, paymentMethod: withdrawMethod, paymentDetails: withdrawDetails });
      toast.success("Withdrawal request submitted");
      setShowWithdraw(false);
      setWithdrawAmount("");
    } catch (error: any) { toast.error(error.message); }
  };

  const txIcon = (type: string) => {
    switch (type) { case "deposit": case "credit": case "referral_bonus": case "commission": case "refund": return <ArrowDownLeft className="h-3.5 w-3.5" />; case "withdrawal": case "challenge_purchase": return <ArrowUpRight className="h-3.5 w-3.5" />; default: return <RefreshCw className="h-3.5 w-3.5" />; }
  };

  const txColor = (type: string) => {
    switch (type) { case "deposit": case "credit": case "referral_bonus": case "commission": case "refund": return "text-foreground"; case "withdrawal": case "challenge_purchase": return "text-destructive"; default: return "text-muted-foreground"; }
  };

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Wallet</h1>
        <p className="text-xs text-muted-foreground mt-1">Manage your funds, view transactions, and request withdrawals</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card-subtle p-6">
          <div className="flex items-center gap-2 mb-2"><WalletIcon className="h-3.5 w-3.5 text-muted-foreground" /><span className="stat-label">Main Balance</span></div>
          <div className="text-3xl font-light tracking-tight mt-1">₦{(wallet?.balance || 0).toLocaleString()}</div>
        </div>
        <div className="card-subtle p-6 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2"><TrendingUp className="h-3.5 w-3.5 text-muted-foreground" /><span className="stat-label">This Month</span></div>
          <div className="text-sm font-light">{(payments || []).filter((p: any) => p.status === "completed").length} completed payments</div>
        </div>
        <div className="card-subtle p-6 flex flex-col items-start justify-center gap-3">
          <Button size="sm" variant="outline" className="text-xs w-full" onClick={() => setShowWithdraw(true)}>
            <ArrowUpRight className="h-3 w-3 mr-1.5" /> Withdraw Funds
          </Button>
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
                <option value="deposit">Deposits</option>
                <option value="withdrawal">Withdrawals</option>
                <option value="challenge_purchase">Purchases</option>
              </select>
              <Filter className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {tLoading && transactions.length === 0 ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : transactions.length === 0 ? (
            <div className="card-subtle p-8 text-center"><FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground" /><p className="text-xs text-muted-foreground">No transactions found</p></div>
          ) : (
            <>
              <div className="space-y-1">
                {transactions.map((tx: any) => (
                  <div key={tx.id} className="card-subtle p-3.5 flex items-center justify-between hover:bg-secondary/20 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-full border border-border flex items-center justify-center shrink-0">{txIcon(tx.type)}</div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">{tx.description}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{tx.createdAt ? new Date(tx.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : ""}</div>
                      </div>
                    </div>
                    <div className={`text-sm font-light tabular-nums shrink-0 ml-4 ${txColor(tx.type)}`}>
                      {tx.type === "withdrawal" || tx.type === "challenge_purchase" ? "-" : "+"}₦{(tx.amount || 0).toLocaleString()}
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
        <div className="space-y-1">
          {(!payments || payments.length === 0) ? (
            <div className="card-subtle p-8 text-center"><FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground" /><p className="text-xs text-muted-foreground">No payments yet</p></div>
          ) : payments.map((p: any) => (
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
              <span className="text-sm font-light tabular-nums">₦{(p.amount || 0).toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}

      <Dialog open={showWithdraw} onOpenChange={setShowWithdraw}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-base font-medium">Request Withdrawal</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="card-subtle p-3 text-center"><span className="text-xs text-muted-foreground">Available Balance</span><div className="text-xl font-light mt-1">₦{(wallet?.balance || 0).toLocaleString()}</div></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Amount (NGN)</label><Input type="number" placeholder="5000" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} className="text-xs h-9" /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Account Details</label><Input placeholder="Bank name, account number" value={withdrawDetails} onChange={(e) => setWithdrawDetails(e.target.value)} className="text-xs h-9" /></div>
            <Button className="w-full text-xs" size="sm" onClick={handleWithdraw}>Submit Withdrawal Request</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-base font-medium">Payment Details</DialogTitle></DialogHeader>
          {selectedPayment && (
            <div className="space-y-4">
              <div className="text-center"><div className="text-3xl font-light tracking-tight">₦{(selectedPayment.amount || 0).toLocaleString()}</div></div>
              <div className="border border-border/50 rounded-lg divide-y divide-border/50">
                <div className="flex items-center justify-between px-4 py-2.5"><span className="text-[11px] text-muted-foreground">Reference</span><span className="text-[11px] font-mono">{selectedPayment.reference}</span></div>
                <div className="flex items-center justify-between px-4 py-2.5"><span className="text-[11px] text-muted-foreground">Status</span><span className="text-[11px] font-medium capitalize">{selectedPayment.status}</span></div>
                <div className="flex items-center justify-between px-4 py-2.5"><span className="text-[11px] text-muted-foreground">Date</span><span className="text-[11px]">{selectedPayment.createdAt ? new Date(selectedPayment.createdAt).toLocaleDateString() : ""}</span></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
