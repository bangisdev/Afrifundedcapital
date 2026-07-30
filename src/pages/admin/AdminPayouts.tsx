/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, CheckCircle, XCircle, CheckCheck, Trash2, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { useState, useMemo } from "react";

const REJECTION_PRESETS = [
  "Incomplete documentation",
  "Bank details mismatch",
  "Suspicious activity detected",
  "Account verification failed",
  "Insufficient trading history",
  "Duplicate account detected",
  "Terms of service violation",
  "Insufficient profit evidence",
];

export default function AdminPayouts() {
  const { data: payouts, isLoading, refetch } = useApiQuery<any[]>(["admin", "payouts"], "/api/payouts/admin/all");
  const { data: stats } = useApiQuery<any>(["admin", "payout-stats"], "/api/payouts/admin/stats");
  const approvePayout = useApiMutation<any, any>("post", "/api/payouts/admin/${id}/approve");
  const rejectPayout = useApiMutation<any, any>("post", "/api/payouts/admin/${id}/reject");
  const bulkApprove = useApiMutation<any, any>("post", "/api/payouts/admin/bulk-approve");
  const markPaid = useApiMutation<any, any>("post", "/api/payouts/admin/${id}/mark-paid");
  const bulkMarkPaid = useApiMutation<any, any>("post", "/api/payouts/admin/bulk-mark-paid");

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [confirmMarkPaid, setConfirmMarkPaid] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [reasonPreset, setReasonPreset] = useState("");
  const [individualRejectId, setIndividualRejectId] = useState<number | null>(null);

  const allPending = useMemo(() => (payouts || []).filter((p: any) => p.status === "pending"), [payouts]);
  const allApproved = useMemo(() => (payouts || []).filter((p: any) => p.status === "approved"), [payouts]);
  const allPendingSelected = allPending.length > 0 && allPending.every((p: any) => selected.has(p.id));
  const allApprovedSelected = allApproved.length > 0 && allApproved.every((p: any) => selected.has(p.id));

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllPending = () => {
    if (allPendingSelected) {
      setSelected((prev) => { const next = new Set(prev); allPending.forEach((p: any) => next.delete(p.id)); return next; });
    } else {
      setSelected((prev) => { const next = new Set(prev); allPending.forEach((p: any) => next.add(p.id)); return next; });
    }
  };

  const toggleAllApproved = () => {
    if (allApprovedSelected) {
      setSelected((prev) => { const next = new Set(prev); allApproved.forEach((p: any) => next.delete(p.id)); return next; });
    } else {
      setSelected((prev) => { const next = new Set(prev); allApproved.forEach((p: any) => next.add(p.id)); return next; });
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

  const handleBulkReject = async (reason: string) => {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      let rejected = 0;
      for (const id of selected) {
        try {
          await rejectPayout.mutateAsync({ id, reason: reason || "Bulk rejection by admin" });
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
      {stats && (          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="card-subtle p-3">
            <div className="text-[10px] text-muted-foreground">Pending</div>
            <div className="text-lg font-medium text-amber-600">{stats.pending}</div>
          </div>
          <div className="card-subtle p-3">
            <div className="text-[10px] text-muted-foreground">Awaiting Payment</div>
            <div className="text-lg font-medium text-blue-600">₦{(stats.approvedAmount || 0).toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground">{stats.approved || 0} approved</div>
          </div>
          <div className="card-subtle p-3">
            <div className="text-[10px] text-muted-foreground">Paid This Month</div>
            <div className="text-lg font-medium text-emerald-600">₦{(stats.paidThisMonth || 0).toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground">{stats.paidThisMonthCount || 0} payouts</div>
          </div>
          <div className="card-subtle p-3">
            <div className="text-[10px] text-muted-foreground">Total Paid (All Time)</div>
            <div className="text-lg font-medium text-emerald-600">₦{(stats.totalPaid || 0).toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground">{stats.total || 0} total</div>
          </div>
        </div>
      )}

      {/* Bulk Actions — Pending */}
      {allPending.length > 0 && (
        <div className="flex items-center gap-3 p-3 card-subtle">
          <Checkbox
            checked={allPendingSelected}
            onCheckedChange={toggleAllPending}
          />
          <span className="text-xs text-muted-foreground">
            {selected.size > 0 ? `${selected.size} selected` : `Select all ${allPending.length} pending`}
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
                onClick={() => { setRejectReason(""); setReasonPreset(""); setConfirmReject(true); }}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Reject {selected.size}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Bulk Actions — Approved */}
      {allApproved.length > 0 && (
        <div className="flex items-center gap-3 p-3 card-subtle">
          <Checkbox
            checked={allApprovedSelected}
            onCheckedChange={toggleAllApproved}
          />
          <span className="text-xs text-muted-foreground">
            {allApprovedSelected ? `All ${allApproved.length} approved selected` : `Select all ${allApproved.length} approved`}
          </span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[10px] text-emerald-600"
            disabled={bulkLoading || !allApprovedSelected}
            onClick={() => setConfirmMarkPaid(true)}
          >
            {bulkLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <DollarSign className="h-3 w-3 mr-1" />}
            Mark Paid
          </Button>
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
              {(p.status === "pending" || p.status === "approved") && (
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
                {p.status === "rejected" && p.rejectionReason && (
                  <div className="text-[10px] text-destructive mt-1">
                    Reason: {p.rejectionReason}
                  </div>
                )}
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
                    onClick={() => { setRejectReason(""); setReasonPreset(""); setIndividualRejectId(p.id); }}
                  >
                    <XCircle className="h-3 w-3 mr-1" /> Reject
                  </Button>
                </>
              )}
              {p.status === "approved" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px] text-emerald-600"
                  onClick={async () => {
                    await markPaid.mutateAsync({ id: p.id });
                    toast.success("Marked as paid — user notified");
                    refetch();
                  }}
                >
                  <DollarSign className="h-3 w-3 mr-1" /> Mark Paid
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Approve Confirmation Dialog */}
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

      {/* Bulk Reject Confirmation Dialog with Reason */}
      <AlertDialog open={confirmReject} onOpenChange={(open) => { setConfirmReject(open); if (!open) { setRejectReason(""); setReasonPreset(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject {selected.size} Payout{selected.size !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reject {selected.size} pending payout request{selected.size !== 1 ? 's' : ''}. Users will be notified with the reason below. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2 space-y-2">
            <label className="text-xs font-medium text-muted-foreground block">Rejection Reason</label>
            <select
              value={reasonPreset}
              onChange={(e) => {
                setReasonPreset(e.target.value);
                if (e.target.value !== "custom") {
                  setRejectReason(e.target.value);
                } else {
                  setRejectReason("");
                }
              }}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
            >
              <option value="">Select a reason...</option>
              {REJECTION_PRESETS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
              <option value="custom">Custom reason...</option>
            </select>
            {(reasonPreset === "custom" || reasonPreset === "") && (
              <div>
                <Textarea
                  placeholder="Enter rejection reason..."
                  value={reasonPreset === "custom" ? rejectReason : ""}
                  onChange={(e) => setRejectReason(e.target.value)}
                  maxLength={500}
                  rows={3}
                  className="text-sm resize-none"
                />
                <div className="text-[10px] text-muted-foreground text-right mt-1">
                  {rejectReason.length}/500
                </div>
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkLoading} onClick={() => { setRejectReason(""); setReasonPreset(""); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkLoading || (!rejectReason && reasonPreset !== "custom")}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const finalReason = reasonPreset === "custom" ? rejectReason : reasonPreset;
                setBulkLoading(true);
                try {
                  let rejected = 0;
                  for (const id of selected) {
                    try {
                      await rejectPayout.mutateAsync({ id, reason: finalReason || "Rejected by admin" });
                      rejected++;
                    } catch { /* skip */ }
                  }
                  toast.success(`Rejected ${rejected} payouts`);
                  setSelected(new Set());
                  setRejectReason("");
                  setReasonPreset("");
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

      {/* Bulk Mark Paid Confirmation Dialog */}
      <AlertDialog open={confirmMarkPaid} onOpenChange={setConfirmMarkPaid}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {selected.size} Payout{selected.size !== 1 ? 's' : ''} as Paid?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark {selected.size} approved payout request{selected.size !== 1 ? 's' : ''} as paid. Users will be notified via email and dashboard. This action cannot be undone.
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
                  const result = await bulkMarkPaid.mutateAsync({ ids: Array.from(selected) });
                  toast.success(`Marked ${result?.marked || selected.size} payouts as paid`);
                  setSelected(new Set());
                  refetch();
                } catch {
                  toast.error("Bulk mark paid failed");
                } finally {
                  setBulkLoading(false);
                  setConfirmMarkPaid(false);
                }
              }}
            >
              {bulkLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Confirm Mark Paid
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Individual Reject Dialog with Reason */}
      <AlertDialog open={individualRejectId !== null} onOpenChange={(open) => { if (!open) { setIndividualRejectId(null); setRejectReason(""); setReasonPreset(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject This Payout?</AlertDialogTitle>
            <AlertDialogDescription>
              The user will be notified with the reason below. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2 space-y-2">
            <label className="text-xs font-medium text-muted-foreground block">Rejection Reason</label>
            <select
              value={reasonPreset}
              onChange={(e) => {
                setReasonPreset(e.target.value);
                if (e.target.value !== "custom") {
                  setRejectReason(e.target.value);
                } else {
                  setRejectReason("");
                }
              }}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
            >
              <option value="">Select a reason...</option>
              {REJECTION_PRESETS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
              <option value="custom">Custom reason...</option>
            </select>
            {(reasonPreset === "custom" || reasonPreset === "") && (
              <div>
                <Textarea
                  placeholder="Enter rejection reason..."
                  value={reasonPreset === "custom" ? rejectReason : ""}
                  onChange={(e) => setRejectReason(e.target.value)}
                  maxLength={500}
                  rows={3}
                  className="text-sm resize-none"
                />
                <div className="text-[10px] text-muted-foreground text-right mt-1">
                  {rejectReason.length}/500
                </div>
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setIndividualRejectId(null); setRejectReason(""); setReasonPreset(""); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={reasonPreset === "" || (reasonPreset === "custom" && !rejectReason)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (individualRejectId === null) return;
                const finalReason = reasonPreset === "custom" ? rejectReason : reasonPreset;
                try {
                  await rejectPayout.mutateAsync({ id: individualRejectId, reason: finalReason || "Rejected by admin" });
                  toast.success("Rejected");
                  setSelected((prev) => { const n = new Set(prev); n.delete(individualRejectId); return n; });
                  refetch();
                } catch {
                  toast.error("Reject failed");
                } finally {
                  setIndividualRejectId(null);
                  setRejectReason("");
                  setReasonPreset("");
                }
              }}
            >
              Confirm Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
