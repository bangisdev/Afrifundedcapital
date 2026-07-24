/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

export default function AdminKyc() {
  const { data: documents, isLoading, refetch } = useApiQuery<any[]>(["admin", "kyc"], "/api/kyc/admin/all");
  const approve = useApiMutation<any, any>("post", "/api/kyc/admin/${id}/approve");
  const reject = useApiMutation<any, any>("post", "/api/kyc/admin/${id}/reject");

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-8">
      <div><h1 className="text-lg font-medium tracking-tight">KYC Verification</h1><p className="text-xs text-muted-foreground mt-1">{(documents || []).length} documents</p></div>
      <div className="space-y-1">
        {(documents || []).map((doc: any) => (
          <div key={doc.id} className="card-subtle p-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{doc.documentType?.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}</div>
              <div className="text-xs text-muted-foreground">User {doc.userId} · Uploaded {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : ""}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={doc.status === "approved" ? "default" : doc.status === "rejected" ? "destructive" : "secondary"} className="text-[10px]">{doc.status}</Badge>
              {doc.status === "pending" && (
                <>
                  <Button variant="ghost" size="sm" className="h-7 text-[10px] text-emerald-600" onClick={async () => { await approve.mutateAsync({ id: doc.id }); toast.success("Approved"); refetch(); }}><CheckCircle className="h-3 w-3 mr-1" /> Approve</Button>
                  <Button variant="ghost" size="sm" className="h-7 text-[10px] text-destructive" onClick={async () => { await reject.mutateAsync({ id: doc.id, reason: "Does not meet requirements" }); toast.success("Rejected"); refetch(); }}><XCircle className="h-3 w-3 mr-1" /> Reject</Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
