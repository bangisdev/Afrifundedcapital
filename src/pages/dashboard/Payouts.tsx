/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2,
  Wallet,
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Banknote,
  ArrowRight,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const PAYOUT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "flutterwave", label: "Flutterwave" },
  { value: "paypal", label: "PayPal" },
  { value: "crypto_usdt", label: "USDT (Crypto)" },
  { value: "crypto_btc", label: "Bitcoin" },
];

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    approved: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    paid: "bg-green-500/10 text-green-600 dark:text-green-400",
    rejected: "bg-red-500/10 text-red-600 dark:text-red-400",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] font-normal border-0 capitalize", styles[status] || "")}>
      {status}
    </Badge>
  );
}

export default function Payouts() {
  const { user } = useAuth();
  const payouts = useQuery(api.payouts.getMyPayouts);
  const payoutStats = useQuery(api.payouts.getMyPayoutStats);
  const fundedAccounts = useQuery(api.payouts.getMyFundedAccounts);
  const requestPayout = useMutation(api.payouts.requestPayout);

  const [requestOpen, setRequestOpen] = useState(false);
  const [selectedFunded, setSelectedFunded] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentDetails, setPaymentDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isLoading = !payouts || !payoutStats || !fundedAccounts;

  const selectedAccount = fundedAccounts?.find((f) => f._id === selectedFunded);
  const maxPayoutAmount = selectedAccount
    ? Math.max(0, (selectedAccount.totalProfit || 0) * ((selectedAccount.profitSharePercent || 90) / 100))
    : 0;

  const handleRequest = async () => {
    if (!selectedFunded) { toast.error("Please select a funded account"); return; }
    if (!amount || parseFloat(amount) <= 0) { toast.error("Please enter a valid amount"); return; }
    if (!paymentDetails) { toast.error("Please enter payment details"); return; }

    setSubmitting(true);
    try {
      await requestPayout({
        fundedAccountId: selectedFunded as any,
        amount: parseFloat(amount),
        paymentMethod,
        paymentDetails,
      });
      toast.success("Payout request submitted");
      setRequestOpen(false);
      setAmount("");
      setPaymentDetails("");
      setSelectedFunded("");
    } catch (error: any) {
      toast.error(error.message);
    }
    setSubmitting(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Payouts</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Request profit withdrawals from your funded trading accounts
          </p>
        </div>
        {fundedAccounts.length > 0 && (
          <Button size="sm" className="text-xs h-8" onClick={() => setRequestOpen(true)}>
            <DollarSign className="h-3.5 w-3.5 mr-1.5" />
            Request Payout
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-subtle p-4 space-y-1">
          <div className="stat-label">Total Payouts</div>
          <div className="stat-value">{payoutStats.total}</div>
          <p className="text-[10px] text-muted-foreground">{payoutStats.paid} paid</p>
        </div>
        <div className="card-subtle p-4 space-y-1">
          <div className="stat-label">Total Paid</div>
          <div className="stat-value">${payoutStats.totalPaid.toLocaleString()}</div>
          <p className="text-[10px] text-muted-foreground">Lifetime earnings</p>
        </div>
        <div className="card-subtle p-4 space-y-1">
          <div className="stat-label">Pending</div>
          <div className="stat-value text-yellow-600 dark:text-yellow-400">{payoutStats.pending}</div>
          <p className="text-[10px] text-muted-foreground">
            ${payoutStats.totalPending.toLocaleString()} awaiting
          </p>
        </div>
        <div className="card-subtle p-4 space-y-1">
          <div className="stat-label">Funded Accounts</div>
          <div className="stat-value">{fundedAccounts.length}</div>
          <p className="text-[10px] text-muted-foreground">Active to withdraw from</p>
        </div>
      </div>

      {/* Funded Accounts */}
      {fundedAccounts.length === 0 ? (
        <div className="card-subtle p-8 text-center space-y-3">
          <Wallet className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium">No funded accounts yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Complete a challenge to get funded and start requesting payouts.
            </p>
          </div>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => window.location.href = "/dashboard/challenges"}>
            View Challenges
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-sm font-medium">Funded Accounts</h2>
          <div className="grid gap-3">
            {fundedAccounts.map((acc) => {
              const profitShare = acc.profitSharePercent || 90;
              const available = Math.max(0, (acc.totalProfit || 0) * (profitShare / 100));
              return (
                <Card key={acc._id} className="gap-0">
                  <CardHeader className="pb-3 flex-row items-center justify-between gap-0">
                    <div>
                      <CardTitle className="text-sm font-medium">
                        ${acc.accountSize.toLocaleString()} Funded Account
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {acc.templateName || "Funded"} · {profitShare}% Profit Share
                      </p>
                    </div>
                    <Badge variant="default" className="text-[10px] bg-green-600/10 text-green-600 dark:text-green-400 border-0">
                      Active
                    </Badge>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <div className="text-muted-foreground mb-0.5">Balance</div>
                        <div className="font-medium">${(acc.currentBalance || 0).toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-0.5">Total Profit</div>
                        <div className="font-medium">${(acc.totalProfit || 0).toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-0.5">Available</div>
                        <div className="font-medium">${available.toLocaleString()}</div>
                      </div>
                    </div>
                    {acc.totalPayouts !== undefined && acc.totalPayouts > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        Total paid out: ${acc.totalPayouts.toLocaleString()}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Payout History */}
      {payouts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium">Payout History</h2>
          <div className="space-y-1">
            {payouts.map((p) => (
              <div key={p._id} className="card-subtle p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs">
                    <StatusBadge status={p.status} />
                    <span className="font-medium font-mono">
                      {p.currency} {p.amount.toLocaleString()}
                    </span>
                    <span className="text-muted-foreground capitalize">{p.paymentMethod.replace(/_/g, " ")}</span>
                    {p.accountSize && (
                      <span className="text-muted-foreground">
                        ${p.accountSize.toLocaleString()} account
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{new Date(p.requestedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                {p.rejectionReason && p.status === "rejected" && (
                  <p className="mt-1.5 text-[10px] text-destructive">{p.rejectionReason}</p>
                )}
                {p.processedAt && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Processed: {new Date(p.processedAt).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state for no payouts yet */}
      {payouts.length === 0 && fundedAccounts.length > 0 && (
        <div className="card-subtle p-8 text-center space-y-2">
          <History className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No payout requests yet. Click "Request Payout" to withdraw your profits.
          </p>
        </div>
      )}

      {/* Request Payout Dialog */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">Request Payout</DialogTitle>
            <DialogDescription className="text-xs">
              Withdraw profits from your funded trading account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Select funded account */}
            <div className="space-y-1.5">
              <Label className="text-xs">Funded Account</Label>
              <Select value={selectedFunded} onValueChange={(v) => { setSelectedFunded(v); setAmount(""); }}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {fundedAccounts.map((f) => (
                    <SelectItem key={f._id} value={f._id} className="text-xs">
                      ${f.accountSize.toLocaleString()} — {f.templateName || "Funded"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Available profit info */}
            {selectedAccount && (
              <div className="p-3 rounded bg-secondary/30 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Profit</span>
                  <span className="font-medium">${(selectedAccount.totalProfit || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Your Share ({selectedAccount.profitSharePercent || 90}%)</span>
                  <span className="font-medium">${maxPayoutAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Minimum Payout</span>
                  <span className="font-medium">$50</span>
                </div>
              </div>
            )}

            {/* Amount */}
            <div className="space-y-1.5">
              <Label className="text-xs">Payout Amount (USD)</Label>
              <Input
                className="text-xs h-9"
                type="number"
                placeholder="e.g. 500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min={50}
                max={maxPayoutAmount}
              />
              {selectedAccount && parseFloat(amount) > maxPayoutAmount && (
                <p className="text-[10px] text-destructive mt-0.5">
                  Amount exceeds your available payout of ${maxPayoutAmount.toLocaleString()}
                </p>
              )}
            </div>

            {/* Payment method */}
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYOUT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="text-xs">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payment details */}
            <div className="space-y-1.5">
              <Label className="text-xs">
                {paymentMethod === "bank_transfer"
                  ? "Account Details (Bank Name, Account Number, Sort Code)"
                  : paymentMethod.startsWith("crypto")
                    ? "Wallet Address"
                    : "Email or Account Details"}
              </Label>
              <Input
                className="text-xs h-9"
                placeholder="Enter your payment details"
                value={paymentDetails}
                onChange={(e) => setPaymentDetails(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setRequestOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" className="text-xs h-8" onClick={handleRequest} disabled={submitting}>
                {submitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ArrowRight className="h-3 w-3 mr-1" />}
                Submit Request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
