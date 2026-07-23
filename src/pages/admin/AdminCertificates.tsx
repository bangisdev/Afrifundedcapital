import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Award, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function AdminCertificates() {
  const certificates = useQuery(api.certificates.listAllCertificates, {});

  if (!certificates) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const typeLabel = (type: string) => {
    switch (type) {
      case "phase_1": return "Phase 1";
      case "phase_2": return "Phase 2";
      case "funded": return "Funded";
      default: return type;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Certificates</h1>
        <p className="text-xs text-muted-foreground mt-1">
          View and manage all issued certificates
        </p>
      </div>

      {certificates.length === 0 ? (
        <div className="card-subtle p-8 text-center">
          <Award className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">No certificates issued</p>
        </div>
      ) : (
        <div className="space-y-1">
          {certificates.map((c: any) => (
            <div key={c._id} className="card-subtle p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{c.userName || c.userEmail || "Unknown"}</div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px] rounded-full">
                    {typeLabel(c.type)}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono">
                    {c.certificateNumber}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.issuedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
                  <ExternalLink className="h-3 w-3 mr-1" /> Verify
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
