/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Shield, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

export default function AdminKyc() {
  const docs = useQuery(api.kyc.listKycDocuments, {});
  const approveDoc = useMutation(api.kyc.approveKycDocument);
  const rejectDoc = useMutation(api.kyc.rejectKycDocument);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [notes, setNotes] = useState("");

  if (!docs) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleApprove = async () => {
    if (!selectedDoc) return;
    try {
      await approveDoc({ documentId: selectedDoc._id, notes });
      toast.success("Document approved");
      setSelectedDoc(null);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleReject = async () => {
    if (!selectedDoc || !rejectionReason) {
      toast.error("Rejection reason required");
      return;
    }
    try {
      await rejectDoc({ documentId: selectedDoc._id, rejectionReason, notes });
      toast.success("Document rejected");
      setSelectedDoc(null);
      setRejectionReason("");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      approved: "bg-foreground text-background",
      pending: "bg-secondary text-secondary-foreground",
      rejected: "bg-destructive/10 text-destructive",
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
        <h1 className="text-lg font-medium tracking-tight">KYC Verification</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Review and verify user identity documents
        </p>
      </div>

      {docs.length === 0 ? (
        <div className="card-subtle p-8 text-center">
          <Shield className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">No documents to review</p>
        </div>
      ) : (
        <div className="space-y-1">
          {docs.map((doc: any) => (
            <button
              key={doc._id}
              onClick={() => setSelectedDoc(doc)}
              className="w-full card-subtle p-4 flex items-center justify-between text-left hover:bg-secondary/30 transition-colors"
            >
              <div>
                <div className="text-sm font-medium">
                  {doc.user?.name || doc.user?.email || "Unknown"}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {statusBadge(doc.status)}
                  <span className="text-xs text-muted-foreground">{doc.documentType?.replace(/_/g, " ")}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(doc.uploadedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {doc.status === "pending" && (
                  <>
                    <Button variant="ghost" size="sm" className="text-xs text-foreground"
                      onClick={(e) => { e.stopPropagation(); setSelectedDoc(doc); }}>
                      Review
                    </Button>
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Review Dialog */}
      <Dialog open={!!selectedDoc} onOpenChange={(o) => { if (!o) setSelectedDoc(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">Review Document</DialogTitle>
          </DialogHeader>
          {selectedDoc && (
            <div className="space-y-4">
              <div className="card-subtle p-4">
                <div className="text-xs text-muted-foreground mb-1">User</div>
                <div className="text-sm font-medium">{selectedDoc.user?.name || "Unknown"}</div>
                <div className="text-xs text-muted-foreground">{selectedDoc.user?.email}</div>
              </div>
              <div className="card-subtle p-4">
                <div className="text-xs text-muted-foreground mb-1">Document Type</div>
                <div className="text-sm font-medium">{selectedDoc.documentType?.replace(/_/g, " ")}</div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Internal Notes</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="text-xs min-h-[60px]"
                  placeholder="Optional notes..."
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Rejection Reason (required for rejection)</label>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="text-xs min-h-[60px]"
                  placeholder="Why is this document being rejected?"
                />
              </div>
              <div className="flex gap-3">
                <Button className="flex-1 text-xs" size="sm" onClick={handleApprove}>
                  <CheckCircle className="h-3 w-3 mr-1" /> Approve
                </Button>
                <Button variant="outline" className="flex-1 text-xs" size="sm" onClick={handleReject}>
                  <XCircle className="h-3 w-3 mr-1" /> Reject
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
