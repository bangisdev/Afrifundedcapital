/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  Search,
  CheckCircle2,
  XCircle,
  DollarSign,
  ExternalLink,
  Clock,
  AlertCircle,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-0",
    approved: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-0",
    paid: "bg-green-500/10 text-green-600 dark:text-green-400 border-0",
    rejected: "bg-red-500/10 text-red-600 dark:text-red-400 border-0",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] font-normal capitalize", styles[status] || "")}>
      {status}
    </Badge>
  );
}

function PaymentMethodLabel({ method }: { method: string }) {
  const labels: Record<string, string> = {
    bank_transfer: "Bank Transfer",
    flutterwave: "Flutterwave",
    paypal: "PayPal",
    crypto_usdt: "USDT",
    crypto_btc: "Bitcoin",
  };
  return <span>{labels[method] || method}</span>;
}

export default function AdminPayouts() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const allPayouts = useQuery(api.payouts.listAllPayouts, {
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 100,
  });
  const stats = useQuery(api.payouts.getPayoutStats);
  const processPayout = useMutation(api.payouts.processPayout);

  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<{
    payout: any;
    action: "approve" | "pay" | "reject";
  } | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const isLoading = !allPayouts || !stats;

  const filtered = (search
    ? allPayouts?.filter(
        (p) =>
          p.userName?.toLowerCase().includes(search.toLowerCase()) ||
          p.userEmail?.toLowerCase().includes(search.toLowerCase()) ||
          p.amount.toString().includes(search.toString()),
      )
    : allPayouts) || [];

  // Map UI action names to API status values
  const actionToStatus: Record<string, "approved" | "paid" | "rejected"> = {
    approve: "approved",
    pay: "paid",
    reject: "rejected",
  };

  const handleProcess = async () => {
    if (!actionDialog) return;

    const { payout, action } = actionDialog;
    setProcessingId(payout._id);

    try {
      await processPayout({
        payoutId: payout._id,
        status: actionToStatus[action],
        processedBy: user?._id as Id<"users">,
        notes: notes || undefined,
        rejectionReason: action === "reject" ? reason || undefined : undefined,
      });
      toast.success(
        action === "approve"
          ? "Payout approved"
          : action === "pay"
            ? "Payout marked as paid"
            : "Payout rejected",
      );
      setActionDialog(null);
      setReason("");
      setNotes("");
    } catch (error: any) {
      toast.error(error.message);
    }
    setProcessingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-medium tracking-tight">Payout Management</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Review and process funded trader payout requests
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card-subtle p-4 space-y-1">
          <div className="stat-label">Total Requests</div>
          <div className="stat-value">{stats?.total || 0}</div>
        </div>
        <div className="card-subtle p-4 space-y-1">
          <div className="stat-label">Pending</div>
          <div className="stat-value text-yellow-600 dark:text-yellow-400">{stats?.pending || 0}</div>
          <p className="text-[10px] text-muted-foreground">${(stats?.totalPending || 0).toLocaleString()}</p>
        </div>
        <div className="card-subtle p-4 space-y-1">
          <div className="stat-label">Approved</div>
          <div className="stat-value text-blue-600 dark:text-blue-400">{stats?.approved || 0}</div>
        </div>
        <div className="card-subtle p-4 space-y-1">
          <div className="stat-label">Paid</div>
          <div className="stat-value text-green-600 dark:text-green-400">{stats?.paid || 0}</div>
          <p className="text-[10px] text-muted-foreground">${(stats?.totalPaid || 0).toLocaleString()}</p>
        </div>
        <div className="card-subtle p-4 space-y-1">
          <div className="stat-label">Rejected</div>
          <div className="stat-value text-destructive">{stats?.rejected || 0}</div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 text-xs h-9"
            placeholder="Search by user or amount…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Status Tabs */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter} className="space-y-4">
        <TabsList className="h-9">
          {["pending", "approved", "paid", "rejected", "all"].map((s) => (
            <TabsTrigger key={s} value={s} className="text-xs capitalize px-3">
              {s}
              <span className="ml-1.5 text-[10px] text-muted-foreground">
                ({s === "all" ? allPayouts?.length || 0 : stats?.[s as keyof typeof stats] || 0})
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={statusFilter} className="space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card-subtle p-8 text-center space-y-2">
              <DollarSign className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No {statusFilter !== "all" ? statusFilter : ""} payout requests.
              </p>
            </div>
          ) : (
            filtered.map((payout) => {
              const isProcessing = processingId === payout._id;
              return (
                <div key={payout._id} className="card-subtle p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      {/* Top row */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <StatusBadge status={payout.status} />
                        <span className="text-sm font-medium font-mono">
                          {payout.currency} {payout.amount.toLocaleString()}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          <PaymentMethodLabel method={payout.paymentMethod} />
                        </span>
                      </div>

                      {/* User & details */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">User</span>
                          <p className="font-medium truncate">
                            {payout.userName || payout.userEmail || "—"}
                          </p>
                          {payout.userEmail && payout.userName && (
                            <p className="text-[10px] text-muted-foreground truncate">{payout.userEmail}</p>
                          )}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Account</span>
                          <p className="font-medium">${payout.accountSize?.toLocaleString() || "—"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Payment Details</span>
                          <p className="font-medium text-[11px] break-all">{payout.paymentDetails}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Requested</span>
                          <p className="font-medium">{new Date(payout.requestedAt).toLocaleDateString()}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(payout.requestedAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>

                      {payout.processedAt && (
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          Processed: {new Date(payout.processedAt).toLocaleString()}
                        </p>
                      )}

                      {payout.rejectionReason && (
                        <div className="mt-2 flex items-start gap-1.5 p-2 rounded bg-destructive/5 text-[10px] text-destructive">
                          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{payout.rejectionReason}</span>
                        </div>
                      )}

                      {payout.notes && !payout.rejectionReason && (
                        <p className="mt-1.5 text-[10px] text-muted-foreground italic">
                          Note: {payout.notes}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    {(payout.status === "pending" || payout.status === "approved") && (
                      <div className="flex items-center gap-1 ml-4 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-[10px] h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                          onClick={() => {
                            if (payout.status === "pending") {
                              setActionDialog({ payout, action: "approve" });
                            } else {
                              setActionDialog({ payout, action: "pay" });
                            }
                          }}
                          disabled={isProcessing}
                        >
                          {isProcessing ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : payout.status === "pending" ? (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          ) : (
                            <ArrowUpRight className="h-3 w-3 mr-1" />
                          )}
                          {payout.status === "pending" ? "Approve" : "Pay"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-[10px] h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/5"
                          onClick={() => setActionDialog({ payout, action: "reject" })}
                          disabled={isProcessing}
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}

                    {payout.status === "paid" && (
                      <div className="ml-4 shrink-0 flex items-center">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </TabsContent>
      </Tabs>

      {/* Action Dialog */}
      <Dialog
        open={!!actionDialog}
        onOpenChange={(o) => {
          if (!o) {
            setActionDialog(null);
            setReason("");
            setNotes("");
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium capitalize">
              {actionDialog?.action === "approve"
                ? "Approve Payout"
                : actionDialog?.action === "pay"
                  ? "Mark as Paid"
                  : "Reject Payout"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {actionDialog?.payout && (
                <>
                  {actionDialog.payout.currency} {actionDialog.payout.amount.toLocaleString()} —{" "}
                  {actionDialog.payout.userName || actionDialog.payout.userEmail}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {actionDialog?.action === "reject" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Rejection Reason *</Label>
                <Textarea
                  className="text-xs min-h-[80px]"
                  placeholder="Explain why the payout is being rejected…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Internal Notes</Label>
              <Textarea
                className="text-xs min-h-[60px]"
                placeholder="Optional notes for admin reference…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8"
              onClick={() => {
                setActionDialog(null);
                setReason("");
                setNotes("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className={cn(
                "text-xs h-8",
                actionDialog?.action === "reject" && "bg-destructive hover:bg-destructive/90",
                actionDialog?.action === "approve" && "bg-blue-600 hover:bg-blue-700",
                actionDialog?.action === "pay" && "bg-green-600 hover:bg-green-700",
              )}
              onClick={handleProcess}
              disabled={
                processingId !== null ||
                (actionDialog?.action === "reject" && !reason.trim())
              }
            >
              {processingId ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : actionDialog?.action === "approve" ? (
                <CheckCircle2 className="h-3 w-3 mr-1" />
              ) : actionDialog?.action === "pay" ? (
                <ArrowUpRight className="h-3 w-3 mr-1" />
              ) : (
                <XCircle className="h-3 w-3 mr-1" />
              )}
              {actionDialog?.action === "approve"
                ? "Approve"
                : actionDialog?.action === "pay"
                  ? "Confirm Paid"
                  : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
