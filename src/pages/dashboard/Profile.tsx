/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2, User, Shield, ShieldCheck, Upload, CheckCircle, XCircle, Clock,
  FileText, X, AlertTriangle, RefreshCw,
  ArrowUp, ArrowDown, ArrowUpDown, History,
} from "lucide-react";
import { toast } from "sonner";
import { AccountSecurity } from "@/components/dashboard/AccountSecurity";

const DOC_TYPES = [
  { type: "passport", label: "International Passport", icon: "🪪", required: true },
  { type: "national_id", label: "National ID", icon: "🆔", required: false },
  { type: "drivers_license", label: "Driver's License", icon: "🚗", required: false },
  { type: "proof_of_address", label: "Proof of Address", icon: "🏠", required: false },
  { type: "selfie", label: "Selfie Verification", icon: "🤳", required: false },
];

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE_MB = 5;

function formatTime(ts: number | null) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getStatusConfig(status: string) {
  switch (status) {
    case "approved":
      return { label: "Approved", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle };
    case "pending":
      return { label: "Pending Review", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Clock };
    case "rejected":
      return { label: "Rejected", color: "bg-red-500/10 text-red-600 border-red-500/20", icon: XCircle };
    default:
      return { label: "Not Submitted", color: "bg-secondary text-secondary-foreground", icon: Upload };
  }
}

const KYC_SORT_COLUMNS: Array<{ key: string; label: string }> = [
  { key: "documentType", label: "Type" },
  { key: "status", label: "Status" },
  { key: "uploadedAt", label: "Uploaded" },
];

/**
 * User-scoped document audit trail — a timeline of the document's lifecycle
 * (submitted → approved/rejected) pulled from the audit log via
 * GET /api/kyc/my/:id/history. Mounted on demand so the query only fires
 * when the user opens the dialog.
 */
function DocHistoryDialog({ doc, onClose }: { doc: any; onClose: () => void }) {
  const { data, isLoading } = useApiQuery<any>(
    ["kyc", "history", String(doc.id)],
    `/api/kyc/my/${doc.id}/history`,
  );
  const events: any[] = data?.events || [];

  const actionMeta = (action: string) => {
    switch (action) {
      case "kyc.uploaded":
        return { label: "Document submitted for review", icon: Upload, color: "text-muted-foreground", dot: "bg-secondary" };
      case "kyc.approved":
        return { label: "Document approved", icon: CheckCircle, color: "text-emerald-600", dot: "bg-emerald-500" };
      case "kyc.rejected":
        return { label: "Document rejected", icon: XCircle, color: "text-red-500", dot: "bg-red-500" };
      default:
        return { label: action.replace(/_/g, " "), icon: History, color: "text-muted-foreground", dot: "bg-secondary" };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-background border rounded-lg shadow-lg max-w-lg w-full mx-4 max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-sm font-medium">Document History</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">
              {doc.documentType?.replace(/_/g, " ")}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close history" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 overflow-auto max-h-[70vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-xs">No history available for this document yet.</p>
            </div>
          ) : (
            <div className="space-y-0">
              {events.map((ev: any, i: number) => {
                const meta = actionMeta(ev.action);
                const Icon = meta.icon;
                const reason = ev.action === "kyc.rejected"
                  ? ev.details?.reason || ev.details?.message
                  : null;
                return (
                  <div key={i} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < events.length - 1 && (
                      <div className="absolute left-[9px] top-5 bottom-0 w-px bg-border" />
                    )}
                    <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${meta.dot}`}>
                      <Icon className={`h-3 w-3 ${meta.color}`} />
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <div className={`text-xs font-medium ${meta.color}`}>{meta.label}</div>
                      {reason && (
                        <div className="text-[11px] text-red-500/90 mt-0.5">“{reason}”</div>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {formatTime(ev.timestamp)}
                        {ev.actorName && <span> · by {ev.actorName}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();
  // Server-driven pagination + sorting — request a generous page size so all doc types are visible
  const [kycSortBy, setKycSortBy] = useState("uploadedAt");
  const [kycSortOrder, setKycSortOrder] = useState<"asc" | "desc">("desc");
  const kycParams = new URLSearchParams();
  kycParams.set("page", "1");
  kycParams.set("pageSize", "50");
  kycParams.set("sortBy", kycSortBy);
  kycParams.set("sortOrder", kycSortOrder);
  const kycQuery = `/api/kyc/my?${kycParams.toString()}`;
  const { data: kycDocsData, refetch: refetchKyc } = useApiQuery<any>(["kyc", "my", kycQuery], kycQuery);
  const kycDocs = kycDocsData?.documents || [];

  const handleKycSort = (key: string) => {
    if (kycSortBy === key) {
      setKycSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setKycSortBy(key);
      setKycSortOrder("desc");
    }
  };

  const kycSortHeaders = (sortKey: string, label: string) => {
    const active = kycSortBy === sortKey;
    return (
      <button
        key={sortKey}
        type="button"
        onClick={() => handleKycSort(sortKey)}
        aria-label={`Sort by ${label}`}
        aria-pressed={active}
        className={`inline-flex items-center gap-1 text-[11px] font-medium transition-colors rounded px-1.5 py-0.5 ${
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
        {active ? (
          kycSortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </button>
    );
  };
  const updateProfile = useApiMutation<any, any>("put", "/api/users/profile");
  const uploadKyc = useApiMutation<any, any>("post", "/api/kyc/upload");
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(String(user?.name || ""));
  const [phone, setPhone] = useState(String(user?.phone || ""));
  const [address, setAddress] = useState(String(user?.address || ""));
  const [country, setCountry] = useState(String(user?.country || ""));

  // File upload state
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<any>(null);
  const [historyDoc, setHistoryDoc] = useState<any>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateProfile.mutateAsync({ name, phone, address, country });
      toast.success("Profile updated");
    } catch (error: any) { toast.error(error.message); }
    setSaving(false);
  };

  const getLatestDoc = (type: string) => {
    // Pick the newest submission for each type regardless of server sort order
    const ofType = (kycDocs || []).filter((d: any) => d.documentType === type);
    return ofType.reduce((newest: any, d: any) => {
      if (!newest) return d;
      return (d.uploadedAt || 0) > (newest.uploadedAt || 0) ? d : newest;
    }, null);
  };

  const processFile = useCallback(async (file: File, docType: string) => {
    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error(`Invalid file type. Accepted: JPEG, PNG, WebP, PDF`);
      return;
    }

    // Validate file size
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`File size must be under ${MAX_SIZE_MB}MB`);
      return;
    }

    setUploadingType(docType);

    try {
      // Read file as base64 data URL
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });

      await uploadKyc.mutateAsync({
        documentType: docType,
        fileData: dataUrl,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });

      toast.success(`${docType.replace(/_/g, " ")} uploaded for review`);
      refetchKyc();
    } catch (err: any) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploadingType(null);
    }
  }, [uploadKyc, refetchKyc]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
    const file = e.target.files?.[0];
    if (file) processFile(file, docType);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  }, [processFile]);

  const handleDrop = useCallback((e: React.DragEvent, docType: string) => {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file, docType);
  }, [processFile]);

  const kycStatus = user?.kycStatus || "unverified";

  if (!user) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Profile</h1>
        <p className="text-xs text-muted-foreground mt-1">Manage your personal information and verification documents</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="border border-border bg-transparent p-0.5">
          <TabsTrigger value="profile" className="text-xs data-[state=active]:bg-secondary">
            <User className="h-3 w-3 mr-1" /> Profile
          </TabsTrigger>
          <TabsTrigger value="kyc" className="text-xs data-[state=active]:bg-secondary">
            <Shield className="h-3 w-3 mr-1" /> KYC
          </TabsTrigger>
          <TabsTrigger value="security" className="text-xs data-[state=active]:bg-secondary">
            <ShieldCheck className="h-3 w-3 mr-1" /> Security
          </TabsTrigger>
        </TabsList>

        {/* ─── Profile Tab ─── */}
        <TabsContent value="profile" className="space-y-4">
          <div className="card-subtle p-6">
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Full Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="text-xs h-9" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Phone</label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="text-xs h-9" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Address</label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} className="text-xs h-9" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Country</label>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} className="text-xs h-9" />
              </div>
            </div>
            <Button size="sm" className="text-xs" onClick={handleSaveProfile} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </TabsContent>

        {/* ─── KYC Tab ─── */}
        <TabsContent value="kyc" className="space-y-4">
          {/* KYC Status Banner */}
          <div className={`card-subtle p-4 border ${
            kycStatus === "approved" ? "border-emerald-500/20" :
            kycStatus === "pending" ? "border-amber-500/20" :
            kycStatus === "rejected" ? "border-red-500/20" :
            "border-border"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                  kycStatus === "approved" ? "bg-emerald-500/10" :
                  kycStatus === "pending" ? "bg-amber-500/10" :
                  kycStatus === "rejected" ? "bg-red-500/10" :
                  "bg-secondary"
                }`}>
                  <Shield className={`h-4 w-4 ${
                    kycStatus === "approved" ? "text-emerald-600" :
                    kycStatus === "pending" ? "text-amber-600" :
                    kycStatus === "rejected" ? "text-red-600" :
                    "text-muted-foreground"
                  }`} />
                </div>
                <div>
                  <div className="text-sm font-medium">Identity Verification</div>
                  <div className="text-xs text-muted-foreground">
                    {kycStatus === "approved" && "Your identity is verified. Profile fields are now locked."}
                    {kycStatus === "pending" && "Documents are under review. This usually takes 1-24 hours."}
                    {kycStatus === "rejected" && "One or more documents were rejected. Please re-upload."}
                    {kycStatus === "unverified" && "Upload your identity documents to get verified."}
                  </div>
                </div>
              </div>
              {(() => {
                const cfg = getStatusConfig(kycStatus);
                const Icon = cfg.icon;
                return (
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.color}`}>
                    <Icon className="h-3 w-3 mr-1" /> {cfg.label}
                  </span>
                );
              })()}
            </div>
          </div>

          {/* Requirements */}
          <div className="card-subtle p-4">
            <div className="text-xs text-muted-foreground mb-2 font-medium">Verification Requirements</div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• Upload at least <strong className="text-foreground">one government-issued ID</strong> (Passport or National ID)</p>
              <p>• OR upload a <strong className="text-foreground">Driver's License + Proof of Address</strong></p>
              <p>• Accepted formats: JPEG, PNG, WebP, PDF (max {MAX_SIZE_MB}MB)</p>
            </div>
          </div>

          {/* Submitted Documents — sortable list */}
          {kycDocs.length > 0 && (
            <div className="card-subtle p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs text-muted-foreground font-medium">Submitted Documents ({kycDocs.length})</div>
                <div className="flex items-center gap-0.5" aria-label="Sort KYC documents">
                  <span className="text-[10px] text-muted-foreground mr-1 hidden sm:inline">Sort:</span>
                  {KYC_SORT_COLUMNS.map((col) => kycSortHeaders(col.key, col.label))}
                </div>
              </div>
              <div className="border-t border-border">
                {kycDocs.map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between gap-3 py-2 border-b border-border/60 last:border-b-0 text-xs">
                    <div className="font-medium capitalize">{doc.documentType?.replace(/_/g, " ")}</div>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground capitalize">{doc.status}</span>
                      <span className="text-muted-foreground tabular-nums">{formatTime(doc.uploadedAt)}</span>
                      <button
                        type="button"
                        onClick={() => setHistoryDoc(doc)}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                        aria-label={`View history for ${doc.documentType}`}
                      >
                        <History className="h-3 w-3" />
                        View history
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Document Upload Cards */}
          <div className="space-y-3">
            {DOC_TYPES.map((doc) => {
              const latestDoc = getLatestDoc(doc.type);
              const status = latestDoc?.status || "none";
              const cfg = getStatusConfig(status);
              const StatusIcon = cfg.icon;
              const isUploading = uploadingType === doc.type;
              const canUpload = status !== "approved" && !isUploading;

              return (
                <div
                  key={doc.type}
                  className={`card-subtle p-4 transition-colors ${
                    dragOver === doc.type ? "border-primary bg-primary/5" : ""
                  }`}
                  onDragOver={(e) => { e.preventDefault(); if (canUpload) setDragOver(doc.type); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => canUpload && handleDrop(e, doc.type)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-lg">{doc.icon}</div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{doc.label}</span>
                          {doc.required && (
                            <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">Required</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {latestDoc ? (
                            <>
                              <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cfg.color}`}>
                                <StatusIcon className="h-2.5 w-2.5 mr-0.5" /> {cfg.label}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {formatTime(latestDoc.uploadedAt)}
                              </span>
                            </>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Not yet submitted</span>
                          )}
                        </div>
                        {latestDoc?.rejectionReason && (
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-red-500">
                            <AlertTriangle className="h-3 w-3" />
                            {latestDoc.rejectionReason}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {latestDoc && (
                        <button
                          type="button"
                          onClick={() => setHistoryDoc(latestDoc)}
                          className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                          aria-label={`View history for ${doc.label}`}
                        >
                          <History className="h-3 w-3" />
                          View history
                        </button>
                      )}
                      {status === "pending" && (
                        <span className="text-[10px] text-muted-foreground">Under review</span>
                      )}
                      {status === "approved" && (
                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                      )}
                      {canUpload && (
                        <>
                          <input
                            ref={(el) => { fileInputRefs.current[doc.type] = el; }}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            className="hidden"
                            onChange={(e) => handleFileSelect(e, doc.type)}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px]"
                            onClick={() => fileInputRefs.current[doc.type]?.click()}
                            disabled={isUploading}
                          >
                            {isUploading ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : latestDoc?.status === "rejected" ? (
                              <RefreshCw className="h-3 w-3 mr-1" />
                            ) : (
                              <Upload className="h-3 w-3 mr-1" />
                            )}
                            {latestDoc?.status === "rejected" ? "Re-upload" : "Upload"}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ─── Security Tab ─── */}
        <TabsContent value="security" className="space-y-4">
          <AccountSecurity />
        </TabsContent>
      </Tabs>

      {/* Document History Dialog */}
      {historyDoc && <DocHistoryDialog doc={historyDoc} onClose={() => setHistoryDoc(null)} />}

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setPreviewDoc(null)}>
          <div className="bg-background border rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-[85vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-sm font-medium">{previewDoc.documentType?.replace(/_/g, " ")}</h2>
              <button onClick={() => setPreviewDoc(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[70vh]">
              {previewDoc.fileUrl?.startsWith("data:image") ? (
                <img src={previewDoc.fileUrl} alt="Document" className="max-w-full rounded" />
              ) : previewDoc.fileUrl?.startsWith("data:application/pdf") ? (
                <iframe src={previewDoc.fileUrl} className="w-full h-[60vh] rounded" />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2" />
                  <p className="text-sm">Preview not available</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
