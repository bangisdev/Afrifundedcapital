import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams, Link } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  CheckCircle2,
  SearchX,
  ShieldCheck,
  Calendar,
  Hash,
  Award,
  User,
  ExternalLink,
  Copy,
  Printer,
} from "lucide-react";
import { toast } from "sonner";

export default function VerifyCertificate() {
  const { verificationCode } = useParams();
  const result = useQuery(
    api.certificates.verifyCertificate,
    verificationCode ? { verificationCode } : "skip",
  );

  // ── Loading ──
  if (result === undefined) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
          <p className="text-xs text-muted-foreground mt-3">Verifying certificate…</p>
        </div>
      </div>
    );
  }

  // ── Invalid / Not Found ──
  if (!result?.valid) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center">
          <div className="h-14 w-14 rounded-full border border-border flex items-center justify-center mx-auto">
            <SearchX className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-medium mt-5 tracking-tight">Certificate Not Found</h1>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            We couldn't find a certificate matching{" "}
            <span className="font-mono text-foreground/80">{verificationCode}</span>.
            Please verify the code and try again.
          </p>
          <div className="mt-6 space-y-2">
            <Button variant="outline" size="sm" className="text-xs w-full" asChild>
              <Link to="/">
                <ExternalLink className="h-3 w-3 mr-1.5" />
                Visit AfriFundedCapital
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const cert = result.certificate!;
  const trader = result.trader!;
  const challenge = result.challenge;

  const typeColor = (type: string) => {
    switch (type) {
      case "funded": return "bg-foreground text-background";
      case "phase_1": return "bg-secondary text-secondary-foreground";
      case "phase_2": return "bg-secondary text-secondary-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  // ── Valid Certificate Display ──
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-sm w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-lg font-medium tracking-tight uppercase">AfriFundedCapital</h1>
          <div className="flex items-center justify-center gap-1.5 mt-3">
            <CheckCircle2 className="h-4 w-4 text-foreground" />
            <span className="text-xs font-medium">Certificate Verified</span>
          </div>
        </div>

        {/* Badge */}
        <div className="text-center mb-6">
          <div className="h-16 w-16 rounded-full bg-foreground/5 flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="h-8 w-8 text-foreground" />
          </div>
          <span
            className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full ${typeColor(cert.type)}`}
          >
            {cert.typeLabel}
          </span>
        </div>

        {/* Trader name */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground mb-1">
            <User className="h-3.5 w-3.5" />
            <span className="text-[11px] uppercase tracking-widest">Trader</span>
          </div>
          <h2 className="text-xl font-light tracking-tight">{trader.name}</h2>
        </div>

        {/* Details */}
        <div className="border border-border/50 rounded-lg divide-y divide-border/50 mb-8">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <Award className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Certificate Number</span>
            </div>
            <span className="text-xs font-mono font-medium">{cert.certificateNumber}</span>
          </div>

          {challenge?.accountSize && (
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Account Size</span>
              </div>
              <span className="text-xs font-medium">{challenge.accountSize}</span>
            </div>
          )}

          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Issued</span>
            </div>
            <span className="text-xs">
              {new Date(cert.issuedAt).toLocaleDateString("en-NG", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
        </div>

        {/* Verification badge */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-foreground/5">
            <CheckCircle2 className="h-3 w-3 text-foreground" />
            <span className="text-[10px] text-muted-foreground">
              Digitally verified by AfriFundedCapital
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs w-full"
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              toast.success("Verification URL copied");
            }}
          >
            <Copy className="h-3 w-3 mr-1.5" />
            Copy Verification Link
          </Button>
          <Button variant="outline" size="sm" className="text-xs w-full" onClick={() => window.print()}>
            <Printer className="h-3 w-3 mr-1.5" />
            Print / Save as PDF
          </Button>
          <Button variant="ghost" size="sm" className="text-xs w-full" asChild>
            <Link to="/">
              <ExternalLink className="h-3 w-3 mr-1.5" />
              Visit AfriFundedCapital
            </Link>
          </Button>
        </div>

        {/* Footer */}
        <p className="text-[10px] text-muted-foreground text-center mt-8 leading-relaxed">
          This certificate confirms that the named trader has successfully completed
          the required evaluation phases and met all trading objectives.
        </p>
      </div>
    </div>
  );
}
