/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { useApiQuery } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Award,
  ExternalLink,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";

interface CertificatesResponse {
  certificates: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: { total: number; byType: Record<string, number> };
}

const PAGE_SIZES = [5, 10, 25];

export default function Certificates() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  // Sorting (whitelisted columns on the server: id, type, certificateNumber, issuedAt)
  const [sortBy, setSortBy] = useState("issuedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const SORT_COLUMNS: Array<{ key: string; label: string }> = [
    { key: "type", label: "Type" },
    { key: "certificateNumber", label: "Number" },
    { key: "issuedAt", label: "Issued" },
  ];
  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder("desc");
    }
    setPage(1);
  };
  const sortHeader = (sortKey: string, label: string) => {
    const active = sortBy === sortKey;
    return (
      <button
        key={sortKey}
        type="button"
        onClick={() => handleSort(sortKey)}
        aria-label={`Sort by ${label}`}
        aria-pressed={active}
        className={`inline-flex items-center gap-1 font-medium transition-colors rounded px-1 py-0.5 -mx-1 ${
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
        {active ? (
          sortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </button>
    );
  };

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  params.set("sortBy", sortBy);
  params.set("sortOrder", sortOrder);
  const listQuery = `/api/certificates/my?${params.toString()}`;

  const { data, isLoading } = useApiQuery<CertificatesResponse>(["certificates", "my", listQuery], listQuery);

  const certificates = data?.certificates || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  // Clamp page if the current page exceeds total pages (e.g. after data changes)
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  // Reset to first page whenever the sort changes
  useEffect(() => {
    setPage(1);
  }, [sortBy, sortOrder]);

  const handleDownload = async (certId: number, certNumber: string) => {
    setDownloadingId(certId);
    try {
      const res = await fetch(`/api/certificates/${certId}/pdf`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificate-${certNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Download error:", err);
    } finally {
      setDownloadingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Certificates</h1>
          <p className="text-xs text-muted-foreground mt-1">
            View and download your trading certificates
          </p>
        </div>
        {total > 0 && (
          <div className="text-xs text-muted-foreground">
            {total} certificate{total === 1 ? "" : "s"}
          </div>
        )}
      </div>

      {certificates.length === 0 ? (
        <div className="card-subtle p-8 text-center">
          <Award className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-4">
            No certificates yet
          </p>
          <p className="text-xs text-muted-foreground">
            Complete a challenge phase to earn certificates
          </p>
        </div>
      ) : (
        <>
          <div className="card-subtle px-4 py-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-medium text-muted-foreground mr-1">Sort:</span>
            {SORT_COLUMNS.map((c) => sortHeader(c.key, c.label))}
          </div>
          <div className="space-y-3">
            {certificates.map((cert: any) => (
              <div
                key={cert.id}
                className="card-subtle p-5 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center">
                    <Award className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">
                      {cert.type
                        ?.replace(/_/g, " ")
                        .replace(/\b\w/g, (l: string) => l.toUpperCase())}{" "}
                      Certificate
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      #{cert.certificateNumber} · Issued{" "}
                      {cert.issuedAt
                        ? new Date(cert.issuedAt).toLocaleDateString()
                        : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {cert.type}
                  </Badge>
                  {cert.verificationCode && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-[10px] h-7"
                      onClick={() =>
                        window.open(
                          `/verify/${cert.verificationCode}`,
                          "_blank"
                        )
                      }
                    >
                      <ExternalLink className="h-2.5 w-2.5 mr-1" /> Verify
                    </Button>
                  )}
                  <Button
                    variant="default"
                    size="sm"
                    className="text-[10px] h-7"
                    disabled={downloadingId === cert.id}
                    onClick={() =>
                      handleDownload(cert.id, cert.certificateNumber)
                    }
                  >
                    {downloadingId === cert.id ? (
                      <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
                    ) : (
                      <Download className="h-2.5 w-2.5 mr-1" />
                    )}
                    PDF
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <div>
              Showing {certificates.length} of {total} certificates · Page {page} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs appearance-none cursor-pointer"
                aria-label="Rows per page"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>{n} / page</option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </Button>
                <span className="px-2 font-medium tabular-nums">{page} / {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
