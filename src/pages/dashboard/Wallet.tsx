import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, ArrowUpRight, ArrowDownLeft, RefreshCw, Gift } from "lucide-react";
import { toast } from "sonner";

export default function Wallet() {
  const wallet = useQuery(api.wallets.getMyWallet);
  const transactions = useQuery(api.wallets.getMyWalletTransactions, {});
  const payments = useQuery(api.payments.getMyPayments);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMethod, setWithdrawMethod] = useState("bank_transfer");
  const [withdrawDetails, setWithdrawDetails] = useState("");
  const requestWithdrawal = useMutation(api.wallets.requestWithdrawal);

  if (!wallet || !transactions || !payments) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

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

  const transactionIcon = (type: string) => {
    switch (type) {
      case "deposit":
      case "credit":
      case "referral_bonus":
      case "commission":
        return <ArrowDownLeft className="h-3 w-3" />;
      case "withdrawal":
      case "challenge_purchase":
        return <ArrowUpRight className="h-3 w-3" />;
      default:
        return <RefreshCw className="h-3 w-3" />;
    }
  };

  const transactionColor = (type: string) => {
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Wallet</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Manage your funds, view transactions, and request withdrawals
        </p>
      </div>

      {/* Balance cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card-subtle p-6">
          <div className="stat-label">Main Balance</div>
          <div className="text-3xl font-light tracking-tight mt-2">
            ₦{wallet.balance.toLocaleString()}
          </div>
        </div>
        <div className="card-subtle p-6">
          <div className="stat-label">Referral Balance</div>
          <div className="text-3xl font-light tracking-tight mt-2">
            ₦{wallet.referralBalance.toLocaleString()}
          </div>
        </div>
        <div className="card-subtle p-6">
          <div className="stat-label">Bonus Balance</div>
          <div className="text-3xl font-light tracking-tight mt-2">
            ₦{wallet.bonusBalance.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button size="sm" variant="outline" className="text-xs" onClick={() => setShowWithdraw(true)}>
          Withdraw
        </Button>
      </div>

      {/* Transactions */}
      <div>
        <h2 className="text-sm font-medium mb-4">Recent Transactions</h2>
        <div className="space-y-1">
          {transactions.length === 0 ? (
            <div className="card-subtle p-6 text-center">
              <p className="text-xs text-muted-foreground">No transactions yet</p>
            </div>
          ) : (
            transactions.map((tx) => (
              <div key={tx._id} className="card-subtle p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-full border border-border flex items-center justify-center">
                    {transactionIcon(tx.type)}
                  </div>
                  <div>
                    <div className="text-xs font-medium">{tx.description}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(tx.createdAt).toLocaleDateString()} · {tx.type.replace(/_/g, " ")}
                    </div>
                  </div>
                </div>
                <div className={`text-sm font-light ${transactionColor(tx.type)}`}>
                  {tx.type === "withdrawal" || tx.type === "challenge_purchase" ? "-" : "+"}₦
                  {tx.amount.toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Payment History */}
      <div>
        <h2 className="text-sm font-medium mb-4">Payment History</h2>
        <div className="space-y-1">
          {payments.length === 0 ? (
            <div className="card-subtle p-6 text-center">
              <p className="text-xs text-muted-foreground">No payments yet</p>
            </div>
          ) : (
            payments.slice(0, 10).map((p) => (
              <div key={p._id} className="card-subtle p-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium">
                    {p.description || "Challenge Purchase"} — {p.reference.slice(0, 12)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(p.createdAt).toLocaleDateString()} · {p.provider}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${p.status === "completed" ? "text-foreground" : p.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
                    {p.status}
                  </span>
                  <span className="text-sm font-light">₦{p.amount.toLocaleString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Withdraw Dialog */}
      <Dialog open={showWithdraw} onOpenChange={setShowWithdraw}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">Request Withdrawal</DialogTitle>
            <DialogDescription className="text-xs">
              Available balance: ₦{wallet.balance.toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
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
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                value={withdrawMethod}
                onChange={(e) => setWithdrawMethod(e.target.value)}
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="flutterwave">Flutterwave</option>
                <option value="paystack">Paystack</option>
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
