/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2, User, Shield, Upload, CheckCircle, XCircle, Clock,
  FileText, Trash2, Eye, X, AlertTriangle, RefreshCw, Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";

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

export default function Profile() {
  const { user } = useAuth();
  // Server-driven pagination — request a generous page size so all doc types are visible
  const kycQuery = "/api/kyc/my?page=1&pageSize=50";
  const { data: kycDocsData, refetch: refetchKyc } = useApiQuery<any>(["kyc", "my", kycQuery], kycQuery);
  const kycDocs = kycDocsData?.documents || [];
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
    return kycDocs?.find((d: any) => d.documentType === type);
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
      </Tabs>

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
