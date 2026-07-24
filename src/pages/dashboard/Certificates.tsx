/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Award, ExternalLink, Download } from "lucide-react";

export default function Certificates() {
  const { data: certificates, isLoading } = useApiQuery<any[]>(["certificates", "my"], "/api/certificates/my");

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-8">
      <div><h1 className="text-lg font-medium tracking-tight">Certificates</h1><p className="text-xs text-muted-foreground mt-1">View and download your trading certificates</p></div>
      {!certificates || certificates.length === 0 ? (
        <div className="card-subtle p-8 text-center"><Award className="h-8 w-8 mx-auto mb-3 text-muted-foreground" /><p className="text-sm text-muted-foreground mb-4">No certificates yet</p><p className="text-xs text-muted-foreground">Complete a challenge phase to earn certificates</p></div>
      ) : (
        <div className="space-y-3">
          {certificates.map((cert: any) => (
            <div key={cert.id} className="card-subtle p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center"><Award className="h-5 w-5 text-muted-foreground" /></div>
                <div>
                  <div className="text-sm font-medium">{cert.type?.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())} Certificate</div>
                  <div className="text-xs text-muted-foreground mt-0.5">#{cert.certificateNumber} · Issued {cert.issuedAt ? new Date(cert.issuedAt).toLocaleDateString() : ""}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{cert.type}</Badge>
                {cert.verificationCode && (
                  <Button variant="outline" size="sm" className="text-[10px] h-7" onClick={() => window.open(`/verify/${cert.verificationCode}`, "_blank")}>
                    <ExternalLink className="h-2.5 w-2.5 mr-1" /> Verify
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
