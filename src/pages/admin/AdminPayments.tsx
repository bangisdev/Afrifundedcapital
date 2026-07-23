import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, DollarSign } from "lucide-react";
import { toast } from "sonner";

export default function AdminPayments() {
  const payments = useQuery(api.payments.listAllPayments, {});
  const refundPayment = useMutation(api.payments.refundPayment);

  if (!payments) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleRefund = async (paymentId: any) => {
    try {
      await refundPayment({ paymentId });
      toast.success("Payment refunded");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      completed: "bg-foreground text-background",
      pending: "bg-secondary text-secondary-foreground",
      failed: "bg-destructive/10 text-destructive",
      refunded: "bg-secondary text-secondary-foreground",
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${variants[status] || ""}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Payments</h1>
        <p className="text-xs text-muted-foreground mt-1">
          View and manage all platform payments
        </p>
      </div>

      {payments.length === 0 ? (
        <div className="card-subtle p-8 text-center">
          <DollarSign className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">No payments yet</p>
        </div>
      ) : (
        <div className="space-y-1">
          {payments.map((p) => (
            <div key={p._id} className="card-subtle p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">
                  {p.userName || p.userEmail || "Unknown"}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {statusBadge(p.status)}
                  <span className="text-xs text-muted-foreground">{p.provider}</span>
                  <span className="text-xs text-muted-foreground">{p.reference.slice(0, 12)}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-light">
                  ₦{p.amount.toLocaleString()}
                </span>
                {p.status === "completed" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => handleRefund(p._id)}
                  >
                    Refund
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
