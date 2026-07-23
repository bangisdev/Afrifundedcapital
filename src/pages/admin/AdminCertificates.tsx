/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Award, ExternalLink, Copy, Download } from "lucide-react";
import { toast } from "sonner";

function typeLabel(type: string) {
  switch (type) {
    case "phase_1": return "Phase 1";
    case "phase_2": return "Phase 2";
    case "funded": return "Funded";
    default: return type;
  }
}

function downloadCertificatePdf(cert: {
  _id: string;
  certificateNumber: string;
  verificationCode: string;
  type: string;
  issuedAt: number;
  userName?: string;
}) {
  const verifyUrl = `${window.location.origin}/verify/${cert.verificationCode}`;
  const win = window.open("", "_blank");
  if (!win) return;

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
      <div class="trader-name">${cert.userName || "Verified Trader"}</div>
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

export default function AdminCertificates() {
  const certificates = useQuery(api.certificates.listAllCertificates, {});

  if (!certificates) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
              <div className="min-w-0">
                <div className="text-sm font-medium">{c.userName || c.userEmail || "Unknown"}</div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-[10px] rounded-full">
                    {typeLabel(c.type)}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono">
                    {c.certificateNumber}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.issuedAt).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    downloadCertificatePdf(c);
                  }}
                >
                  <Download className="h-3 w-3 mr-1" />
                  PDF
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => {
                    const url = `${window.location.origin}/verify/${c.verificationCode}`;
                    navigator.clipboard.writeText(url);
                    toast.success("Verification link copied");
                  }}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy link
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    window.open(`/verify/${c.verificationCode}`, "_blank");
                  }}
                >
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
