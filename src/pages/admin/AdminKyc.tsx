/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  CheckCircle,
  XCircle,
  ArrowLeft,
  FileText,
  User,
  Clock,
  Shield,
  ChevronDown,
  Eye,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const DOC_TYPES: Record<string, string> = {
  passport: "Passport",
  national_id: "National ID",
  drivers_license: "Driver's License",
  proof_of_address: "Proof of Address",
  selfie: "Selfie Verification",
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending Review", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  approved: { label: "Approved", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  rejected: { label: "Rejected", color: "bg-red-500/10 text-red-600 border-red-500/20" },
  unverified: { label: "Unverified", color: "bg-secondary text-secondary-foreground" },
};

function formatTime(ts: number | null) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminKyc() {
  const { data: documents, isLoading, refetch } = useApiQuery<any[]>(["admin", "kyc"], "/api/kyc/admin/all");
  const { data: briefUsers } = useApiQuery<any[]>(["admin", "briefUsers"], "/api/users/brief");
  const approve = useApiMutation<any, any>("post", "/api/kyc/admin/${id}/approve");
  const reject = useApiMutation<any, any>("post", "/api/kyc/admin/${id}/reject");

  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!documents) return [];
    return documents.filter((d) => {
      const user = briefUsers?.find((u) => u.id === d.userId);
      const matchesSearch = !search ||
        user?.name?.toLowerCase().includes(search.toLowerCase()) ||
        user?.email?.toLowerCase().includes(search.toLowerCase()) ||
        DOC_TYPES[d.documentType]?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || d.status === statusFilter;
      const matchesType = typeFilter === "all" || d.documentType === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [documents, briefUsers, search, statusFilter, typeFilter]);

  const stats = useMemo(() => {
    if (!documents) return { total: 0, pending: 0, approved: 0, rejected: 0 };
    return {
      total: documents.length,
      pending: documents.filter((d) => d.status === "pending").length,
      approved: documents.filter((d) => d.status === "approved").length,
      rejected: documents.filter((d) => d.status === "rejected").length,
    };
  }, [documents]);

  const handleApprove = async (doc: any) => {
    try {
      await approve.mutateAsync({ id: doc.id });
      toast.success("Document approved");
      refetch();
      if (selectedDoc?.id === doc.id) {
        setSelectedDoc({ ...doc, status: "approved", reviewedAt: Date.now() });
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to approve");
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    try {
      await reject.mutateAsync({ id: rejectTarget.id, reason: rejectReason || "Does not meet requirements" });
      toast.success("Document rejected");
      setShowRejectDialog(false);
      setRejectTarget(null);
      setRejectReason("");
      refetch();
      if (selectedDoc?.id === rejectTarget.id) {
        setSelectedDoc({ ...rejectTarget, status: "rejected", rejectionReason: rejectReason });
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to reject");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Detail view
  if (showDetail && selectedDoc) {
    const statusCfg = STATUS_CONFIG[selectedDoc.status] || STATUS_CONFIG.pending;
    const user = briefUsers?.find((u) => u.id === selectedDoc.userId);

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => { setShowDetail(false); setSelectedDoc(null); }}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-sm font-medium">
              {DOC_TYPES[selectedDoc.documentType] || selectedDoc.documentType}
            </h1>
            <div className="text-xs text-muted-foreground mt-0.5">
              Document #{selectedDoc.id} · Uploaded {formatTime(selectedDoc.uploadedAt)}
            </div>
          </div>
        </div>

        {/* Document Info Card */}
        <div className="card-subtle p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
            {selectedDoc.reviewedAt && (
              <span className="text-[10px] text-muted-foreground">
                Reviewed {formatTime(selectedDoc.reviewedAt)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-muted-foreground mb-1">User</div>
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center text-[10px] font-medium">
                  {user?.name?.[0]?.toUpperCase() || "?"}
                </div>
                <div>
                  <div className="font-medium">{user?.name || "Unknown"}</div>
                  <div className="text-muted-foreground">{user?.email}</div>
                </div>
              </div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Document Type</div>
              <div className="font-medium">{DOC_TYPES[selectedDoc.documentType] || selectedDoc.documentType}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">File URL</div>
              <div className="font-medium truncate">{selectedDoc.fileUrl || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Uploaded</div>
              <div className="font-medium">{formatTime(selectedDoc.uploadedAt)}</div>
            </div>
          </div>

          {selectedDoc.rejectionReason && (
            <div className="border-t pt-3">
              <div className="text-xs text-muted-foreground mb-1">Rejection Reason</div>
              <div className="text-xs bg-red-500/5 border border-red-500/20 rounded p-2 text-red-600">
                {selectedDoc.rejectionReason}
              </div>
            </div>
          )}

          {selectedDoc.fileUrl && (
            <div className="border-t pt-3">
              <div className="text-xs text-muted-foreground mb-2">Document Preview</div>
              <div className="border rounded-lg overflow-hidden bg-muted/30 p-4 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Document file</p>
                <a
                  href={selectedDoc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline mt-1 inline-block"
                >
                  Open in new tab
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {selectedDoc.status === "pending" && (
          <div className="flex gap-2">
            <Button
              className="flex-1 text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => handleApprove(selectedDoc)}
              disabled={approve.isPending}
            >
              {approve.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
              Approve Document
            </Button>
            <Button
              variant="outline"
              className="flex-1 text-xs h-9 text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={() => { setRejectTarget(selectedDoc); setShowRejectDialog(true); }}
            >
              <XCircle className="h-3 w-3 mr-1" />
              Reject Document
            </Button>
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-medium tracking-tight">KYC Verification</h1>
        <p className="text-xs text-muted-foreground mt-1">Review and manage identity verification documents</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total", value: stats.total, icon: FileText },
          { label: "Pending", value: stats.pending, icon: Clock },
          { label: "Approved", value: stats.approved, icon: CheckCircle },
          { label: "Rejected", value: stats.rejected, icon: XCircle },
        ].map((s) => (
          <div key={s.label} className="card-subtle p-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center">
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="text-lg font-medium">{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search by name, email, or document type..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 text-xs flex-1"
        />
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 pr-8 text-xs appearance-none cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 pr-8 text-xs appearance-none cursor-pointer"
          >
            <option value="all">All Types</option>
            {Object.entries(DOC_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Document List */}
      <div className="space-y-1">
        {filtered.length === 0 ? (
          <div className="card-subtle p-8 text-center text-sm text-muted-foreground">
            No documents found
          </div>
        ) : (
          filtered.map((doc: any) => {
            const statusCfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pending;
            const user = briefUsers?.find((u) => u.id === doc.userId);
            return (
              <div
                key={doc.id}
                className="card-subtle p-4 cursor-pointer hover:bg-secondary/20 transition-colors"
                onClick={() => { setSelectedDoc(doc); setShowDetail(true); }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {DOC_TYPES[doc.documentType] || doc.documentType}
                        </span>
                        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${statusCfg.color}`}>
                          {statusCfg.label}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {user?.name || `User ${doc.userId}`}
                        </span>
                        <span>·</span>
                        <span>{formatTime(doc.uploadedAt)}</span>
                        {doc.rejectionReason && (
                          <>
                            <span>·</span>
                            <span className="text-red-500 flex items-center gap-0.5">
                              <AlertTriangle className="h-3 w-3" />
                              {doc.rejectionReason.slice(0, 40)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {doc.status === "pending" && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[10px] text-emerald-600"
                          onClick={(e) => { e.stopPropagation(); handleApprove(doc); }}
                          disabled={approve.isPending}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" /> Approve
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[10px] text-destructive"
                          onClick={(e) => { e.stopPropagation(); setRejectTarget(doc); setShowRejectDialog(true); }}
                        >
                          <XCircle className="h-3 w-3 mr-1" /> Reject
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); setSelectedDoc(doc); setShowDetail(true); }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="text-xs text-muted-foreground text-right">
        Showing {filtered.length} of {documents?.length || 0} documents
      </div>

      {/* Reject Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={(open) => !open && setShowRejectDialog(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Document</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide a reason for rejecting this {DOC_TYPES[rejectTarget?.documentType]?.toLowerCase() || "document"}.
              The user will be notified and can re-upload.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              placeholder="Rejection reason (e.g. blurry image, expired document...)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="text-xs"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setRejectTarget(null); setRejectReason(""); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleReject}
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
