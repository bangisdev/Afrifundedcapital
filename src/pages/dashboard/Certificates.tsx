import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Award, Download, ExternalLink, CheckCircle } from "lucide-react";

export default function Certificates() {
  const certificates = useQuery(api.certificates.getMyCertificates);

  if (!certificates) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const typeLabel = (type: string) => {
    switch (type) {
      case "phase_1": return "Phase 1 Passed";
      case "phase_2": return "Phase 2 Passed";
      case "funded": return "Funded Trader";
      default: return type;
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Certificates</h1>
        <p className="text-xs text-muted-foreground mt-1">
          View and download your achievement certificates
        </p>
      </div>

      {certificates.length === 0 ? (
        <div className="card-subtle p-12 text-center">
          <Award className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-1">No certificates yet</p>
          <p className="text-xs text-muted-foreground">
            Complete a challenge phase to earn your certificate
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {certificates.map((cert) => (
            <div key={cert._id} className="card-subtle p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-sm font-medium">{typeLabel(cert.type)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {cert.certificateNumber}
                  </div>
                </div>
                <CheckCircle className="h-5 w-5 text-foreground" />
              </div>

              <div className="space-y-2 text-xs text-muted-foreground mb-4">
                <div className="flex justify-between">
                  <span>Issued</span>
                  <span className="text-foreground">{new Date(cert.issuedAt).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Verification Code</span>
                  <span className="text-foreground font-mono text-[10px]">{cert.verificationCode.slice(0, 12)}…</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-xs flex-1">
                  <Download className="h-3 w-3 mr-1" />
                  Download PDF
                </Button>
                <Button variant="outline" size="sm" className="text-xs flex-1">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Verify
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
