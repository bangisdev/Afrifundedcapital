/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export default function AdminCertificates() {
  const { data: certificates, isLoading } = useApiQuery<any[]>(["admin", "certificates"], "/api/certificates/admin/all");

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-8">
      <div><h1 className="text-lg font-medium tracking-tight">Certificates</h1><p className="text-xs text-muted-foreground mt-1">{(certificates || []).length} certificates issued</p></div>
      <div className="space-y-1">
        {(certificates || []).map((c: any) => (
          <div key={c.id} className="card-subtle p-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">#{c.certificateNumber}</div>
              <div className="text-xs text-muted-foreground">User {c.userId} · {c.type?.replace(/_/g, " ")} · {c.issuedAt ? new Date(c.issuedAt).toLocaleDateString() : ""}</div>
            </div>
            <Badge variant="outline" className="text-[10px]">{c.type}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
