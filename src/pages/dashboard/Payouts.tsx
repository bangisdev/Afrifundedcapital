/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, DollarSign, Clock, CheckCircle, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";

export default function Payouts() {
  const { data: payouts, isLoading: pLoading } = useApiQuery<any[]>(["payouts", "my"], "/api/payouts/my");
  const { data: stats } = useApiQuery<any>(["payouts", "stats"], "/api/payouts/my/stats");
  const { data: fundedAccounts } = useApiQuery<any[]>(["funded", "my"], "/api/payouts/my/funded");
  const requestPayout = useApiMutation<any, any>("post", "/api/payouts/request");
  const [showRequest, setShowRequest] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [details, setDetails] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<any>(null);

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
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-medium tracking-tight">Payouts</h1><p className="text-xs text-muted-foreground mt-1">Request profit withdrawals from your funded accounts</p></div>
        <Button size="sm" className="text-xs" onClick={() => setShowRequest(true)} disabled={!(fundedAccounts?.length)}><ArrowUpRight className="h-3 w-3 mr-1" /> Request Payout</Button>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card-subtle p-5"><div className="stat-label">Total Paid</div><div className="stat-value mt-1">₦{(stats?.totalPaid || 0).toLocaleString()}</div></div>
        <div className="card-subtle p-5"><div className="stat-label">Pending</div><div className="stat-value mt-1">₦{(stats?.totalPending || 0).toLocaleString()}</div></div>
        <div className="card-subtle p-5"><div className="stat-label">Total Payouts</div><div className="stat-value mt-1">{stats?.totalPayouts || 0}</div></div>
      </div>
      <div className="space-y-2">
        {(!payouts || payouts.length === 0) ? (
          <div className="card-subtle p-8 text-center"><DollarSign className="h-8 w-8 mx-auto mb-3 text-muted-foreground" /><p className="text-xs text-muted-foreground">No payout requests yet</p></div>
        ) : payouts.map((p: any) => (
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
