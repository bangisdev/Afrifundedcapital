/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { readResponseBody } from "@/lib/api";
import { useState, useEffect, useCallback } from "react";
import { useResetOnChange } from "@/hooks/use-reset-on-change";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, CheckCircle, XCircle, ArrowLeft, FileText, User, Clock,
  ChevronDown, ChevronLeft, ChevronRight, Eye, AlertTriangle, Image as ImageIcon, X, Download,
  ArrowUp, ArrowDown, ArrowUpDown, History,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const DOC_TYPES: Record<string, string> = {
  passport: "Passport", national_id: "National ID", drivers_license: "Driver's License",
  proof_of_address: "Proof of Address", selfie: "Selfie Verification",
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending Review", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  approved: { label: "Approved", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  rejected: { label: "Rejected", color: "bg-red-500/10 text-red-600 border-red-500/20" },
  unverified: { label: "Unverified", color: "bg-secondary text-secondary-foreground" },
};

const PAGE_SIZES = [10, 25, 50];

const EMPTY_STATS = { total: 0, pending: 0, approved: 0, rejected: 0 };

interface KycResponse {
  documents: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: { total: number; pending: number; approved: number; rejected: number };
}

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
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [fullDoc, setFullDoc] = useState<any>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("uploadedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showImagePreview, setShowImagePreview] = useState<string | null>(null);

  // Debounce the search input so we don't hit the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to first page whenever filters, page size, or sort change
  useResetOnChange([debouncedSearch, statusFilter, typeFilter, pageSize, sortBy, sortOrder], () => {
    setPage(1);
  });

  // Sortable columns matching the server whitelist for /api/kyc/admin/all
  const SORT_COLUMNS: Array<{ key: string; label: string }> = [
    { key: "documentType", label: "Type" },
    { key: "status", label: "Status" },
    { key: "uploadedAt", label: "Uploaded" },
  ];

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder("desc");
    }
  };

  const sortHeader = (sortKey: string, label: string) => {
    const active = sortBy === sortKey;
    return (
      <button
        key={sortKey}
        type="button"
        onClick={() => handleSort(sortKey)}
        aria-label={`Sort by ${label}`}
        aria-pressed={active}
        className={`inline-flex items-center gap-1 text-[11px] font-medium transition-colors rounded px-1.5 py-0.5 ${
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
        {active ? (
          sortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </button>
    );
  };

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  params.set("sortBy", sortBy);
  params.set("sortOrder", sortOrder);
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (typeFilter !== "all") params.set("type", typeFilter);
  const listQuery = `/api/kyc/admin/all?${params.toString()}`;

  const { data, isLoading, refetch } = useApiQuery<KycResponse>(["admin", "kyc", listQuery], listQuery);

  const documents = data?.documents || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const stats = data?.stats || EMPTY_STATS;

  const handleApprove = useCallback(async (doc: any) => {
    try {
      await fetch(`/api/kyc/admin/${doc.id}/approve`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      });
      toast.success("Document approved");
      refetch();
      if (selectedDoc?.id === doc.id) setSelectedDoc({ ...doc, status: "approved", reviewedAt: Date.now() });
      if (fullDoc?.id === doc.id) setFullDoc({ ...fullDoc, status: "approved", reviewedAt: Date.now() });
    } catch (err: any) {
      toast.error(err?.message || "Failed to approve");
    }
  }, [refetch, selectedDoc, fullDoc]);

  const handleReject = async () => {
    if (!rejectTarget) return;
    try {
      await fetch(`/api/kyc/admin/${rejectTarget.id}/reject`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason || "Does not meet requirements" }),
      });
      toast.success("Document rejected");
      setShowRejectDialog(false);
      setRejectTarget(null);
      setRejectReason("");
      refetch();
      if (selectedDoc?.id === rejectTarget.id) setSelectedDoc({ ...rejectTarget, status: "rejected", rejectionReason: rejectReason });
      if (fullDoc?.id === rejectTarget.id) setFullDoc({ ...fullDoc, status: "rejected", rejectionReason: rejectReason });
    } catch (err: any) {
      toast.error(err?.message || "Failed to reject");
    }
  };

  const loadFullDocument = async (doc: any) => {
    setLoadingDoc(true);
    try {
      const res = await fetch(`/api/kyc/admin/${doc.id}`, { credentials: "include" });
      if (res.ok) {
        const data = await readResponseBody(res);
        setFullDoc(data);
      } else {
        setFullDoc(doc);
      }
    } catch {
      setFullDoc(doc);
    }
    setLoadingDoc(false);
  };

  const openDetail = async (doc: any) => {
    setSelectedDoc(doc);
    setShowDetail(true);
    setFullDoc(null);
    await loadFullDocument(doc);
  };

  const hasActiveFilters = debouncedSearch || statusFilter !== "all" || typeFilter !== "all";

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  // ─── Image Preview Overlay ───
  if (showImagePreview) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setShowImagePreview(null)}>
        <div className="relative max-w-4xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setShowImagePreview(null)} className="absolute -top-10 right-0 text-white/70 hover:text-white">
            <X className="h-6 w-6" />
          </button>
          <img src={showImagePreview} alt="Document" className="max-w-full max-h-[85vh] mx-auto rounded-lg shadow-lg" />
        </div>
      </div>
    );
  }

  // ─── Detail View ───
  if (showDetail && selectedDoc) {
    const doc = fullDoc || selectedDoc;
    const statusCfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pending;
    const isImage = doc.fileUrl?.startsWith("data:image");
    const isPdf = doc.fileUrl?.startsWith("data:application/pdf");

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => { setShowDetail(false); setSelectedDoc(null); setFullDoc(null); }}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-sm font-medium">{DOC_TYPES[doc.documentType] || doc.documentType}</h1>
            <div className="text-xs text-muted-foreground mt-0.5">
              Document #{doc.id} · Uploaded {formatTime(doc.uploadedAt)}
            </div>
          </div>
          {loadingDoc && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Document Info */}
          <div className="card-subtle p-4 space-y-4 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusCfg.color}`}>
                {statusCfg.label}
              </span>
              {doc.reviewedAt && (
                <span className="text-[10px] text-muted-foreground">Reviewed {formatTime(doc.reviewedAt)}</span>
              )}
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <div className="text-muted-foreground mb-1">User</div>
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center text-[10px] font-medium">
                    {(doc.userName || "?")[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium">{doc.userName || "Unknown"}</div>
                    <div className="text-muted-foreground">{doc.userEmail}</div>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Document Type</div>
                <div className="font-medium">{DOC_TYPES[doc.documentType] || doc.documentType}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Uploaded</div>
                <div className="font-medium">{formatTime(doc.uploadedAt)}</div>
              </div>
            </div>

            {doc.rejectionReason && (
              <div className="border-t pt-3">
                <div className="text-xs text-muted-foreground mb-1">Rejection Reason</div>
                <div className="text-xs bg-red-500/5 border border-red-500/20 rounded p-2 text-red-600">
                  {doc.rejectionReason}
                </div>
              </div>
            )}

            {/* Audit trail deep link — jumps to Admin → Audit Logs scoped to this document */}
            <Link
              to={`/admin/audit-logs?entity=kyc_document&entityId=${doc.id}`}
              className="inline-flex items-center justify-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors w-full"
              title={`View the full audit trail for document #${doc.id}`}
            >
              <History className="h-3 w-3" />
              View audit trail
            </Link>

            {/* Action Buttons */}
            {doc.status === "pending" && (
              <div className="border-t pt-3 space-y-2">
                <Button className="w-full text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleApprove(doc)}>
                  <CheckCircle className="h-3 w-3 mr-1" /> Approve
                </Button>
                <Button variant="outline" className="w-full text-xs h-9 text-destructive border-destructive/30 hover:bg-destructive/5"
                  onClick={() => { setRejectTarget(doc); setShowRejectDialog(true); }}>
                  <XCircle className="h-3 w-3 mr-1" /> Reject
                </Button>
              </div>
            )}
          </div>

          {/* Document Preview */}
          <div className="lg:col-span-2">
            <div className="card-subtle overflow-hidden">
              <div className="p-3 border-b flex items-center justify-between">
                <span className="text-xs font-medium">Document Preview</span>
                {doc.fileUrl && (
                  <a href={doc.fileUrl} download={`${doc.documentType}-${doc.id}`}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <Download className="h-3 w-3" /> Download
                  </a>
                )}
              </div>
              <div className="bg-muted/30 min-h-[400px] flex items-center justify-center">
                {loadingDoc ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Loading document...</p>
                  </div>
                ) : isImage ? (
                  <img src={doc.fileUrl} alt="Document" className="max-w-full max-h-[600px] cursor-pointer"
                    onClick={() => setShowImagePreview(doc.fileUrl)} />
                ) : isPdf ? (
                  <iframe src={doc.fileUrl} className="w-full h-[600px]" />
                ) : doc.fileUrl ? (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Document available</p>
                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline mt-1 inline-block">
                      Open in new tab
                    </a>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No file uploaded</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {doc.status === "pending" && (
            <>
              <Button className="flex-1 text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => handleApprove(doc)}>
                <CheckCircle className="h-3 w-3 mr-1" /> Approve
              </Button>
              <Button variant="outline" className="flex-1 text-xs h-9 text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={() => { setRejectTarget(doc); setShowRejectDialog(true); }}>
                <XCircle className="h-3 w-3 mr-1" /> Reject
              </Button>
            </>
          )}
        </div>

        <AlertDialog open={showRejectDialog} onOpenChange={(open) => !open && setShowRejectDialog(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reject Document</AlertDialogTitle>
              <AlertDialogDescription>
                Provide a reason for rejecting this {DOC_TYPES[rejectTarget?.documentType]?.toLowerCase() || "document"}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-2">
              <Input placeholder="Rejection reason (e.g. blurry image, expired document...)"
                value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="text-xs" />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setRejectTarget(null); setRejectReason(""); }}>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={handleReject}>Reject</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ─── List View ───
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Compliance" title="KYC Verification" subtitle="Review and manage identity verification documents" />

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
        <div className="relative flex-1">
          <Input placeholder="Search by name, email, or document type..." value={search}
            onChange={(e) => setSearch(e.target.value)} className="h-9 text-xs pl-8" />
        </div>
        <div className="relative">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 pr-8 text-xs appearance-none cursor-pointer">
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
        <div className="relative">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 pr-8 text-xs appearance-none cursor-pointer">
            <option value="all">All Types</option>
            {Object.entries(DOC_TYPES).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setSearch(""); setStatusFilter("all"); setTypeFilter("all"); }}>
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Sort toolbar */}
      <div className="flex items-center gap-0.5" aria-label="Sort KYC documents">
        <span className="text-[10px] text-muted-foreground mr-1">Sort:</span>
        {SORT_COLUMNS.map((col) => sortHeader(col.key, col.label))}
      </div>

      {/* Document List */}
      <div className="space-y-1">
        {documents.length === 0 ? (
          <div className="card-subtle p-8 text-center text-sm text-muted-foreground">No documents found</div>
        ) : (
          documents.map((doc: any) => {
            const statusCfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pending;
            return (
              <div key={doc.id} className="card-subtle p-4 cursor-pointer hover:bg-secondary/20 transition-colors"
                onClick={() => openDetail(doc)}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{DOC_TYPES[doc.documentType] || doc.documentType}</span>
                        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${statusCfg.color}`}>
                          {statusCfg.label}
                        </span>
                        {doc.hasFile && (
                          <span className="inline-flex items-center rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium">
                            📎 File
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                        <span className="flex items-center gap-1"><User className="h-3 w-3" /> {doc.userName || `User ${doc.userId}`}</span>
                        <span>·</span>
                        <span>{formatTime(doc.uploadedAt)}</span>
                        {doc.rejectionReason && (
                          <><span>·</span><span className="text-red-500 flex items-center gap-0.5">
                            <AlertTriangle className="h-3 w-3" /> {doc.rejectionReason.slice(0, 40)}
                          </span></>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {doc.status === "pending" && (
                      <>
                        <Button variant="ghost" size="sm" className="h-7 text-[10px] text-emerald-600"
                          onClick={(e) => { e.stopPropagation(); handleApprove(doc); }}>
                          <CheckCircle className="h-3 w-3 mr-1" /> Approve
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-[10px] text-destructive"
                          onClick={(e) => { e.stopPropagation(); setRejectTarget(doc); setShowRejectDialog(true); }}>
                          <XCircle className="h-3 w-3 mr-1" /> Reject
                        </Button>
                      </>
                    )}
                    <Link
                      to={`/admin/audit-logs?entity=kyc_document&entityId=${doc.id}`}
                      className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                      title={`View the audit trail for ${DOC_TYPES[doc.documentType] || doc.documentType} #${doc.id}`}
                      aria-label={`View audit trail for document ${doc.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <History className="h-3.5 w-3.5" />
                    </Link>
                    <Button variant="ghost" size="icon-sm" className="h-7 w-7"
                      aria-label="View document details"
                      onClick={(e) => { e.stopPropagation(); openDetail(doc); }}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        <div>
          Showing {documents.length} of {total} documents
          {total > 0 && ` · Page ${page} of ${totalPages}`}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs appearance-none cursor-pointer"
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <span className="px-2 font-medium tabular-nums">{page} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Reject Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={(open) => !open && setShowRejectDialog(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Document</AlertDialogTitle>
            <AlertDialogDescription>
              Provide a reason for rejecting this {DOC_TYPES[rejectTarget?.documentType]?.toLowerCase() || "document"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input placeholder="Rejection reason (e.g. blurry image, expired document...)"
              value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="text-xs" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setRejectTarget(null); setRejectReason(""); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={handleReject}>Reject</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
