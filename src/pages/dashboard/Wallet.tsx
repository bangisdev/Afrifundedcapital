import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Gift,
  Search,
  Filter,
  FileText,
  ExternalLink,
  ChevronDown,
  CheckCircle,
  XCircle,
  Clock,
  WalletIcon,
  TrendingUp,
  Copy,
} from "lucide-react";
import { toast } from "sonner";

type TabView = "transactions" | "payments";
type TxFilter = "all" | "deposit" | "withdrawal" | "challenge_purchase" | "referral_bonus" | "commission" | "refund" | "credit";

const TX_FILTERS: { value: TxFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "deposit", label: "Deposits" },
  { value: "withdrawal", label: "Withdrawals" },
  { value: "challenge_purchase", label: "Purchases" },
  { value: "referral_bonus", label: "Referrals" },
  { value: "commission", label: "Commissions" },
  { value: "refund", label: "Refunds" },
];

const STATUS_BADGE_VARIANTS: Record<string, string> = {
  completed: "bg-foreground text-background",
  pending: "bg-secondary text-secondary-foreground",
  failed: "bg-destructive/10 text-destructive",
  refunded: "bg-secondary text-secondary-foreground",
};

export default function Wallet() {
  const wallet = useQuery(api.wallets.getMyWallet);
  const allTransactions = useQuery(api.wallets.getMyWalletTransactions, {});
  const payments = useQuery(api.payments.getMyPayments);
  const requestWithdrawal = useMutation(api.wallets.requestWithdrawal);

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMethod, setWithdrawMethod] = useState("bank_transfer");
  const [withdrawDetails, setWithdrawDetails] = useState("");
  const [activeTab, setActiveTab] = useState<TabView>("transactions");
  const [txFilter, setTxFilter] = useState<TxFilter>("all");
  const [txSearch, setTxSearch] = useState("");
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  if (!wallet || !allTransactions || !payments) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Filtering ──────────────────────────────────

  const filteredTransactions = allTransactions.filter((tx) => {
    if (txFilter !== "all" && tx.type !== txFilter) return false;
    if (txSearch) {
      const q = txSearch.toLowerCase();
      return (
        tx.description?.toLowerCase().includes(q) ||
        tx.type?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // ── Withdraw ───────────────────────────────────

  const handleWithdraw = async () => {
    const amount = parseInt(withdrawAmount);
    if (!amount || amount <= 0) {
      toast.error("Invalid amount");
      return;
    }
    if (amount > wallet.balance) {
      toast.error("Insufficient balance");
      return;
    }
    try {
      await requestWithdrawal({
        amount,
        paymentMethod: withdrawMethod,
        paymentDetails: withdrawDetails,
      });
      toast.success("Withdrawal request submitted");
      setShowWithdraw(false);
      setWithdrawAmount("");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // ── Helpers ────────────────────────────────────

  const txIcon = (type: string) => {
    switch (type) {
      case "deposit":
      case "credit":
      case "referral_bonus":
      case "commission":
      case "refund":
        return <ArrowDownLeft className="h-3.5 w-3.5" />;
      case "withdrawal":
      case "challenge_purchase":
        return <ArrowUpRight className="h-3.5 w-3.5" />;
      default:
        return <RefreshCw className="h-3.5 w-3.5" />;
    }
  };

  const txColor = (type: string) => {
    switch (type) {
      case "deposit":
      case "credit":
      case "referral_bonus":
      case "commission":
      case "refund":
        return "text-foreground";
      case "withdrawal":
      case "challenge_purchase":
        return "text-destructive";
      default:
        return "text-muted-foreground";
    }
  };

  const txTypeLabel = (type: string) => {
    switch (type) {
      case "challenge_purchase": return "Challenge Purchase";
      case "referral_bonus": return "Referral Bonus";
      default: return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  const renderStatusBadge = (status: string) => {
    const variant = STATUS_BADGE_VARIANTS[status] || "bg-muted text-muted-foreground";
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded ${variant}`}>
        {status === "completed" && <CheckCircle className="h-2.5 w-2.5" />}
        {status === "failed" && <XCircle className="h-2.5 w-2.5" />}
        {status === "pending" && <Clock className="h-2.5 w-2.5" />}
        {status}
      </span>
    );
  };

  // ── Render ─────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-lg font-medium tracking-tight">Wallet</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Manage your funds, view transactions, and request withdrawals
        </p>
      </div>

      {/* Balance cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card-subtle p-6">
          <div className="flex items-center gap-2 mb-2">
            <WalletIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="stat-label">Main Balance</span>
          </div>
          <div className="text-3xl font-light tracking-tight mt-1">
            ₦{wallet.balance.toLocaleString()}
          </div>
          {wallet.referralBalance > 0 && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Referral</span>
                <span className="font-medium">₦{wallet.referralBalance.toLocaleString()}</span>
              </div>
            </div>
          )}
          {wallet.bonusBalance > 0 && (
            <div className="mt-1 pt-1 flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Bonus</span>
              <span className="font-medium">₦{wallet.bonusBalance.toLocaleString()}</span>
            </div>
          )}
        </div>

        <div className="card-subtle p-6 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="stat-label">This Month</span>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">Deposits</span>
              <span className="text-sm font-light">
                ₦
                {payments
                  .filter(
                    (p) =>
                      p.status === "completed" &&
                      new Date(p.createdAt).getMonth() === new Date().getMonth(),
                  )
                  .reduce((s, p) => s + p.amount, 0)
                  .toLocaleString()}
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xs text-muted-foreground">Transactions</span>
              <span className="text-sm font-light">
                {
                  payments.filter(
                    (p) =>
                      p.status === "completed" &&
                      new Date(p.createdAt).getMonth() === new Date().getMonth(),
                  ).length
                }
              </span>
            </div>
          </div>
        </div>

        <div className="card-subtle p-6 flex flex-col items-start justify-center gap-3">
          <Button
            size="sm"
            variant="outline"
            className="text-xs w-full"
            onClick={() => setShowWithdraw(true)}
          >
            <ArrowUpRight className="h-3 w-3 mr-1.5" />
            Withdraw Funds
          </Button>
          <p className="text-[10px] text-muted-foreground text-center w-full">
            Available: ₦{wallet.balance.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-border/50">
        <button
          onClick={() => setActiveTab("transactions")}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === "transactions"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Transactions
        </button>
        <button
          onClick={() => setActiveTab("payments")}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === "payments"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Payment History
        </button>
      </div>

      {/* ── Transactions Tab ── */}
      {activeTab === "transactions" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search transactions..."
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                className="w-full h-9 pl-8 pr-3 rounded-md border border-input bg-background text-xs placeholder:text-muted-foreground outline-none focus:border-foreground transition-colors"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <select
                value={txFilter}
                onChange={(e) => setTxFilter(e.target.value as TxFilter)}
                className="h-9 pl-8 pr-8 rounded-md border border-input bg-background text-xs appearance-none cursor-pointer outline-none focus:border-foreground transition-colors"
              >
                {TX_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Transaction list */}
          <div className="space-y-1">
            {filteredTransactions.length === 0 ? (
              <div className="card-subtle p-8 text-center">
                <FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">No transactions found</p>
              </div>
            ) : (
              filteredTransactions.map((tx) => (
                <div key={tx._id} className="card-subtle p-3.5 flex items-center justify-between hover:bg-secondary/20 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full border border-border flex items-center justify-center shrink-0">
                      {txIcon(tx.type)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{tx.description}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleDateString("en-NG", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-[10px] text-muted-foreground">
                          {txTypeLabel(tx.type)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={`text-sm font-light tabular-nums shrink-0 ml-4 ${txColor(tx.type)}`}>
                    {tx.type === "withdrawal" || tx.type === "challenge_purchase" ? "-" : "+"}₦
                    {tx.amount.toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Payments Tab ── */}
      {activeTab === "payments" && (
        <div className="space-y-1">
          {payments.length === 0 ? (
            <div className="card-subtle p-8 text-center">
              <FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">No payments yet</p>
            </div>
          ) : (
            payments.map((p) => (
              <button
                key={p._id}
                onClick={() => {
                  setSelectedPayment(p);
                  setShowPaymentDialog(true);
                }}
                className="w-full card-subtle p-3.5 flex items-center justify-between text-left hover:bg-secondary/20 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-full border border-border flex items-center justify-center shrink-0">
                    {p.status === "completed" ? (
                      <CheckCircle className="h-3.5 w-3.5 text-foreground" />
                    ) : p.status === "failed" ? (
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">
                      {p.description || "Challenge Purchase"}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {renderStatusBadge(p.status)}
                      <span className="text-[10px] text-muted-foreground">{p.reference.slice(0, 12)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(p.createdAt).toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className="text-[10px] text-muted-foreground capitalize">{p.provider}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <span className="text-sm font-light tabular-nums">
                    ₦{p.amount.toLocaleString()}
                  </span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground -rotate-90" />
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* ── Payment Invoice Dialog ── */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <DialogTitle className="text-base font-medium">Payment Details</DialogTitle>
            </div>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-4">
              {/* Status */}
              <div className="flex items-center justify-center py-3">
                {selectedPayment.status === "completed" ? (
                  <div className="text-center">
                    <div className="h-10 w-10 rounded-full bg-foreground/5 flex items-center justify-center mx-auto mb-2">
                      <CheckCircle className="h-5 w-5 text-foreground" />
                    </div>
                    <p className="text-xs font-medium">Payment Completed</p>
                  </div>
                ) : selectedPayment.status === "failed" ? (
                  <div className="text-center">
                    <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-2">
                      <XCircle className="h-5 w-5 text-destructive" />
                    </div>
                    <p className="text-xs font-medium">Payment Failed</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center mx-auto mb-2">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-xs font-medium">Payment Pending</p>
                  </div>
                )}
              </div>

              {/* Amount */}
              <div className="text-center">
                <div className="text-3xl font-light tracking-tight">
                  ₦{selectedPayment.amount.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{selectedPayment.currency}</p>
              </div>

              {/* Detail rows */}
              <div className="border border-border/50 rounded-lg divide-y divide-border/50">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[11px] text-muted-foreground">Reference</span>
                  <span className="text-[11px] font-mono font-medium truncate ml-4 max-w-[180px]">
                    {selectedPayment.reference}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[11px] text-muted-foreground">Provider</span>
                  <span className="text-[11px] font-medium capitalize">{selectedPayment.provider}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[11px] text-muted-foreground">Status</span>
                  {renderStatusBadge(selectedPayment.status)}
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[11px] text-muted-foreground">Date</span>
                  <span className="text-[11px]">
                    {new Date(selectedPayment.createdAt).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {selectedPayment.description && (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-[11px] text-muted-foreground">Description</span>
                    <span className="text-[11px] text-right max-w-[200px] truncate">
                      {selectedPayment.description}
                    </span>
                  </div>
                )}
                {selectedPayment.completedAt && (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-[11px] text-muted-foreground">Completed</span>
                    <span className="text-[11px]">
                      {new Date(selectedPayment.completedAt).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                )}
              </div>

              {/* Copy ref */}
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(selectedPayment.reference);
                  toast.success("Reference copied");
                }}
              >
                <Copy className="h-3 w-3 mr-1.5" />
                Copy Reference
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Withdraw Dialog ── */}
      <Dialog open={showWithdraw} onOpenChange={setShowWithdraw}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">Request Withdrawal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="card-subtle p-3 text-center">
              <span className="text-xs text-muted-foreground">Available Balance</span>
              <div className="text-xl font-light mt-1">₦{wallet.balance.toLocaleString()}</div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Amount (NGN)</label>
              <Input
                type="number"
                placeholder="5000"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="text-xs h-9"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Payment Method</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs appearance-none cursor-pointer"
                value={withdrawMethod}
                onChange={(e) => setWithdrawMethod(e.target.value)}
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="flutterwave">Flutterwave</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Account Details</label>
              <Input
                placeholder="Bank name, account number, account name"
                value={withdrawDetails}
                onChange={(e) => setWithdrawDetails(e.target.value)}
                className="text-xs h-9"
              />
            </div>
            <Button className="w-full text-xs" size="sm" onClick={handleWithdraw}>
              Submit Withdrawal Request
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
