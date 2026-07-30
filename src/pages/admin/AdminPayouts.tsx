/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, CheckCircle, XCircle, CheckCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState, useMemo } from "react";

export default function AdminPayouts() {
  const { data: payouts, isLoading, refetch } = useApiQuery<any[]>(["admin", "payouts"], "/api/payouts/admin/all");
  const { data: stats } = useApiQuery<any>(["admin", "payout-stats"], "/api/payouts/admin/stats");
  const approvePayout = useApiMutation<any, any>("post", "/api/payouts/admin/${id}/approve");
  const rejectPayout = useApiMutation<any, any>("post", "/api/payouts/admin/${id}/reject");
  const bulkApprove = useApiMutation<any, any>("post", "/api/payouts/admin/bulk-approve");

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);

  const allPending = useMemo(() => (payouts || []).filter((p: any) => p.status === "pending"), [payouts]);
  const allSelected = allPending.length > 0 && allPending.every((p: any) => selected.has(p.id));

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allPending.map((p: any) => p.id)));
    }
  };

  const handleBulkApprove = async () => {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      const result = await bulkApprove.mutateAsync({ ids: Array.from(selected) });
      toast.success(`Approved ${result?.approved || selected.size} payouts`);
      setSelected(new Set());
      refetch();
    } catch {
      toast.error("Bulk approve failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkReject = async () => {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      let rejected = 0;
      for (const id of selected) {
        try {
          await rejectPayout.mutateAsync({ id, reason: "Bulk rejection by admin" });
          rejected++;
        } catch { /* skip */ }
      }
      toast.success(`Rejected ${rejected} payouts`);
      setSelected(new Set());
      refetch();
    } finally {
      setBulkLoading(false);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-medium tracking-tight">Payouts</h1>
        <p className="text-xs text-muted-foreground mt-1">
          {(payouts || []).length} total · {allPending.length} pending
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card-subtle p-3">
            <div className="text-[10px] text-muted-foreground">Total Requests</div>
            <div className="text-lg font-medium">{stats.total}</div>
          </div>
          <div className="card-subtle p-3">
            <div className="text-[10px] text-muted-foreground">Pending</div>
            <div className="text-lg font-medium text-amber-600">{stats.pending}</div>
          </div>
          <div className="card-subtle p-3">
            <div className="text-[10px] text-muted-foreground">Total Paid</div>
            <div className="text-lg font-medium text-emerald-600">₦{(stats.totalPaid || 0).toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Bulk Actions */}
      {allPending.length > 0 && (
        <div className="flex items-center gap-3 p-3 card-subtle">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
          />
          <span className="text-xs text-muted-foreground">
            {selected.size > 0 ? `${selected.size} selected` : "Select all pending"}
          </span>
          <div className="flex-1" />
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] text-emerald-600"
                disabled={bulkLoading}
                onClick={() => setConfirmApprove(true)}
              >
                {bulkLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCheck className="h-3 w-3 mr-1" />}
                Approve {selected.size}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] text-destructive"
                disabled={bulkLoading}
                onClick={() => setConfirmReject(true)}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Reject {selected.size}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Payout List */}
      <div className="space-y-1">
        {(!payouts || payouts.length === 0) ? (
          <div className="card-subtle p-8 text-center">
            <p className="text-xs text-muted-foreground">No payout requests</p>
          </div>
        ) : payouts.map((p: any) => (
          <div
            key={p.id}
            className={`card-subtle p-4 flex items-center justify-between transition-colors ${
              selected.has(p.id) ? "bg-muted/50" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              {p.status === "pending" && (
                <Checkbox
                  checked={selected.has(p.id)}
                  onCheckedChange={() => toggleSelect(p.id)}
                />
              )}
              <div>
                <div className="text-sm font-medium">₦{(p.amount || 0).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">
                  User {p.userId} · {p.paymentMethod || "bank"} · {p.requestedAt ? new Date(p.requestedAt).toLocaleDateString() : ""}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={p.status === "paid" || p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "secondary"}
                className="text-[10px]"
              >
                {p.status}
              </Badge>
              {p.status === "pending" && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[10px] text-emerald-600"
                    onClick={async () => {
                      await approvePayout.mutateAsync({ id: p.id });
                      toast.success("Approved");
                      setSelected((prev) => { const n = new Set(prev); n.delete(p.id); return n; });
                      refetch();
                    }}
                  >
                    <CheckCircle className="h-3 w-3 mr-1" /> Approve
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[10px] text-destructive"
                    onClick={async () => {
                      await rejectPayout.mutateAsync({ id: p.id, reason: "Insufficient documentation" });
                      toast.success("Rejected");
                      setSelected((prev) => { const n = new Set(prev); n.delete(p.id); return n; });
                      refetch();
                    }}
                  >
                    <XCircle className="h-3 w-3 mr-1" /> Reject
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Confirmation Dialogs */}
      <AlertDialog open={confirmApprove} onOpenChange={setConfirmApprove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve {selected.size} Payout{selected.size !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will approve {selected.size} pending payout request{selected.size !== 1 ? 's' : ''} and credit the funds to the users' wallets. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkLoading}
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={async () => {
                setBulkLoading(true);
                try {
                  const result = await bulkApprove.mutateAsync({ ids: Array.from(selected) });
                  toast.success(`Approved ${result?.approved || selected.size} payouts`);
                  setSelected(new Set());
                  refetch();
                } catch {
                  toast.error("Bulk approve failed");
                } finally {
                  setBulkLoading(false);
                  setConfirmApprove(false);
                }
              }}
            >
              {bulkLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Confirm Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReject} onOpenChange={setConfirmReject}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject {selected.size} Payout{selected.size !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reject {selected.size} pending payout request{selected.size !== 1 ? 's' : ''}. Users will be notified. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                setBulkLoading(true);
                try {
                  let rejected = 0;
                  for (const id of selected) {
                    try {
                      await rejectPayout.mutateAsync({ id, reason: "Bulk rejection by admin" });
                      rejected++;
                    } catch { /* skip */ }
                  }
                  toast.success(`Rejected ${rejected} payouts`);
                  setSelected(new Set());
                  refetch();
                } finally {
                  setBulkLoading(false);
                  setConfirmReject(false);
                }
              }}
            >
              {bulkLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Confirm Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
