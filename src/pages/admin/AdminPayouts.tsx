/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

export default function AdminPayouts() {
  const { data: payouts, isLoading, refetch } = useApiQuery<any[]>(["admin", "payouts"], "/api/payouts/admin/all");
  const approvePayout = useApiMutation<any, any>("post", "/api/payouts/admin/${id}/approve");
  const rejectPayout = useApiMutation<any, any>("post", "/api/payouts/admin/${id}/reject");

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-8">
      <div><h1 className="text-lg font-medium tracking-tight">Payouts</h1><p className="text-xs text-muted-foreground mt-1">{(payouts || []).length} payout requests</p></div>
      <div className="space-y-1">
        {(!payouts || payouts.length === 0) ? (
          <div className="card-subtle p-8 text-center"><p className="text-xs text-muted-foreground">No payout requests</p></div>
        ) : payouts.map((p: any) => (
          <div key={p.id} className="card-subtle p-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">₦{(p.amount || 0).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">User {p.userId} · {p.paymentMethod} · {p.requestedAt ? new Date(p.requestedAt).toLocaleDateString() : ""}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={p.status === "paid" ? "default" : p.status === "rejected" ? "destructive" : "secondary"} className="text-[10px]">{p.status}</Badge>
              {p.status === "pending" && (
                <>
                  <Button variant="ghost" size="sm" className="h-7 text-[10px] text-emerald-600" onClick={async () => { await approvePayout.mutateAsync({ id: p.id }); toast.success("Approved"); refetch(); }}><CheckCircle className="h-3 w-3 mr-1" /> Approve</Button>
                  <Button variant="ghost" size="sm" className="h-7 text-[10px] text-destructive" onClick={async () => { await rejectPayout.mutateAsync({ id: p.id, reason: "Insufficient documentation" }); toast.success("Rejected"); refetch(); }}><XCircle className="h-3 w-3 mr-1" /> Reject</Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
