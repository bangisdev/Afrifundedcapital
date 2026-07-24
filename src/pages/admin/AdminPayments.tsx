/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function AdminPayments() {
  const { data: payments, isLoading, refetch } = useApiQuery<any[]>(["admin", "payments"], "/api/payments/admin/all");
  const refundPayment = useApiMutation<any, any>("post", "/api/payments/admin/${id}/refund");

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-medium tracking-tight">Payments</h1><p className="text-xs text-muted-foreground mt-1">{(payments || []).length} total payments</p></div>
        <Button variant="outline" size="sm" className="text-xs" onClick={() => refetch()}><RefreshCw className="h-3 w-3 mr-1" /> Refresh</Button>
      </div>
      <div className="space-y-1">
        {(payments || []).map((p: any) => (
          <div key={p.id} className="card-subtle p-4 flex items-center justify-between">
            <div><div className="text-sm font-medium">₦{(p.amount || 0).toLocaleString()}</div><div className="text-xs text-muted-foreground">{p.reference} · {p.provider} · {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ""}</div></div>
            <div className="flex items-center gap-2">
              <Badge variant={p.status === "completed" ? "default" : p.status === "refunded" ? "destructive" : "secondary"} className="text-[10px]">{p.status}</Badge>
              {p.status === "completed" && <Button variant="ghost" size="sm" className="text-[10px] h-7" onClick={async () => { await refundPayment.mutateAsync({ id: p.id }); toast.success("Refunded"); refetch(); }}>Refund</Button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
