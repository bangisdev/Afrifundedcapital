/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Award, Download, ExternalLink, CheckCircle, Share2, Printer, Copy } from "lucide-react";
import { toast } from "sonner";

function downloadCertificatePdf(cert: {
  _id: string;
  certificateNumber: string;
  verificationCode: string;
  type: string;
  issuedAt: number;
}) {
  const verifyUrl = `${window.location.origin}/verify/${cert.verificationCode}`;
  const win = window.open("", "_blank");
  if (!win) {
    toast.error("Please allow pop-ups to download certificates");
    return;
  }

  const typeLabel = (t: string) => {
    switch (t) {
      case "phase_1": return "Phase 1 Passed";
      case "phase_2": return "Phase 2 Passed";
      case "funded": return "Funded Trader";
      default: return t;
    }
  };

  win.document.write(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Certificate — ${cert.certificateNumber}</title>
  <style>
    @page { margin: 0; size: landscape; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .certificate {
      width: 720px;
      padding: 60px;
      text-align: center;
    }
    .border-frame {
      border: 2px solid #111;
      padding: 48px 40px;
      position: relative;
    }
    .border-frame::before {
      content: '';
      position: absolute;
      top: 8px; left: 8px; right: 8px; bottom: 8px;
      border: 1px solid #ddd;
      pointer-events: none;
    }
    .title { font-size: 10px; letter-spacing: 4px; text-transform: uppercase; color: #888; margin-bottom: 24px; }
    .badge {
      display: inline-block;
      border: 1px solid #111;
      padding: 6px 20px;
      font-size: 11px;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 32px;
    }
    .label { font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: #888; margin-bottom: 6px; }
    .trader-name { font-size: 28px; font-weight: 300; letter-spacing: 1px; margin-bottom: 32px; }
    .detail-row { display: flex; justify-content: center; gap: 48px; margin-bottom: 32px; }
    .detail { text-align: center; }
    .detail .value { font-size: 13px; font-weight: 500; }
    .detail .lbl { font-size: 8px; letter-spacing: 2px; text-transform: uppercase; color: #888; margin-top: 4px; }
    .verify-text { font-size: 9px; color: #aaa; margin-top: 24px; }
    .verify-text a { color: #111; text-decoration: none; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="certificate">
    <div class="border-frame">
      <div class="title">AfriFundedCapital</div>
      <div class="badge">${typeLabel(cert.type)}</div>
      <div class="label">Trader</div>
      <div class="trader-name">Verified Trader</div>
      <div class="detail-row">
        <div class="detail">
          <div class="value">${cert.certificateNumber}</div>
          <div class="lbl">Certificate Number</div>
        </div>
        <div class="detail">
          <div class="value">${new Date(cert.issuedAt).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}</div>
          <div class="lbl">Issue Date</div>
        </div>
      </div>
      <div class="verify-text">
        Verify at <a href="${verifyUrl}">${verifyUrl}</a>
      </div>
    </div>
    <button class="no-print" onclick="window.print()" style="margin-top:24px;padding:8px 24px;border:1px solid #111;background:#fff;cursor:pointer;font-size:12px;border-radius:4px;">
      Save as PDF
    </button>
  </div>
  <script>setTimeout(() => window.print(), 500);</script>
</body>
</html>`);
  win.document.close();
}

function getVerifyUrl(code: string) {
  return `${window.location.origin}/verify/${code}`;
}

function typeLabel(type: string) {
  switch (type) {
    case "phase_1": return "Phase 1 Passed";
    case "phase_2": return "Phase 2 Passed";
    case "funded": return "Funded Trader";
    default: return type;
  }
}

export default function Certificates() {
  const certificates = useQuery(api.certificates.getMyCertificates);

  if (!certificates) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Certificates</h1>
        <p className="text-xs text-muted-foreground mt-1">
          View, download, and share your achievement certificates
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
                  <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                    {cert.certificateNumber}
                  </div>
                </div>
                <CheckCircle className="h-5 w-5 text-foreground" />
              </div>

              <div className="space-y-2 text-xs text-muted-foreground mb-4">
                <div className="flex justify-between">
                  <span>Issued</span>
                  <span className="text-foreground">
                    {new Date(cert.issuedAt).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs flex-1"
                    onClick={() => {
                      downloadCertificatePdf(cert);
                      toast.success("Opening certificate for download…");
                    }}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs flex-1"
                    onClick={() => {
                      window.open(`/verify/${cert.verificationCode}`, "_blank");
                    }}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Verify
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => {
                    const url = getVerifyUrl(cert.verificationCode);
                    navigator.clipboard.writeText(url);
                    toast.success("Verification link copied to clipboard");
                  }}
                >
                  <Share2 className="h-3 w-3 mr-1.5" />
                  Copy verification link to share
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
