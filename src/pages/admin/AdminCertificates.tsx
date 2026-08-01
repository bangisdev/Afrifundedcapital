/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Search,
  Award,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";

interface CertificatesResponse {
  certificates: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: { total: number; byType: Record<string, number> };
}

const PAGE_SIZES = [10, 25, 50];

function formatDate(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminCertificates() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, typeFilter, pageSize]);

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (typeFilter !== "all") params.set("type", typeFilter);
  const listQuery = `/api/certificates/admin/all?${params.toString()}`;

  const { data, isLoading } = useApiQuery<CertificatesResponse>(["admin", "certificates", listQuery], listQuery);

  const certificates = data?.certificates || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const stats = data?.stats || { total: 0, byType: {} };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Certificates</h1>
        <p className="text-xs text-muted-foreground mt-1">All issued certificates and verification records</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-subtle p-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center"><Award className="h-4 w-4 text-muted-foreground" /></div>
          <div>
            <div className="text-lg font-medium">{stats.total || total}</div>
            <div className="text-[10px] text-muted-foreground">Total Issued</div>
          </div>
        </div>
        {Object.entries(stats.byType || {}).slice(0, 3).map(([type, count]) => (
          <div key={type} className="card-subtle p-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center"><Award className="h-4 w-4 text-muted-foreground" /></div>
            <div>
              <div className="text-lg font-medium">{count}</div>
              <div className="text-[10px] text-muted-foreground capitalize">{type.replace(/_/g, " ")}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by certificate number, user name, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>
        <div className="relative">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 pr-8 text-xs appearance-none cursor-pointer"
          >
            <option value="all">All Types</option>
            <option value="phase_1_passed">Phase 1 Passed</option>
            <option value="phase_2_passed">Phase 2 Passed</option>
            <option value="funded">Funded Trader</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
        {(search || typeFilter !== "all") && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setSearch(""); setTypeFilter("all"); }}>
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* List */}
      <div className="space-y-1">
        {certificates.length === 0 ? (
          <div className="card-subtle p-8 text-center text-muted-foreground text-xs">No certificates found</div>
        ) : (
          certificates.map((c: any) => (
            <div key={c.id} className="card-subtle p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">#{c.certificateNumber}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {c.userName || `User ${c.userId}`} · {c.type?.replace(/_/g, " ")} · {c.issuedAt ? formatDate(c.issuedAt) : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {c.verificationCode && <span className="text-[10px] font-mono text-muted-foreground">#{c.verificationCode}</span>}
                <Badge variant="outline" className="text-[10px] capitalize">{c.type?.replace(/_/g, " ")}</Badge>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        <div>Showing {certificates.length} of {total} certificates · Page {page} of {totalPages}</div>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs appearance-none cursor-pointer"
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <span className="px-2 font-medium tabular-nums">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
