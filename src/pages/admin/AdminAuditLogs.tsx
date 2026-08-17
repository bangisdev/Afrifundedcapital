/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Search,
  ScrollText,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  UserRound,
  Award,
  Trophy,
  ShieldAlert,
  Clock,
  BadgeCheck,
  RotateCcw,
  Play,
  type LucideIcon,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useResetOnChange } from "@/hooks/use-reset-on-change";
import { useSearchParams } from "react-router";

interface AuditLogsResponse {
  logs: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: { total: number; byAction: Record<string, number> };
}

const PAGE_SIZES = [10, 25, 50];

// Quick-filter chips for challenge lifecycle events — one tap filters the
// action dropdown to exactly that transition (clicking again clears it).
const CHALLENGE_LIFECYCLE_CHIPS: Array<{ action: string; label: string; icon: LucideIcon }> = [
  { action: "challenge.phase_passed", label: "Phase Passed", icon: Award },
  { action: "challenge.funded", label: "Funded", icon: Trophy },
  { action: "challenge.violated", label: "Violated", icon: ShieldAlert },
  { action: "challenge.expired", label: "Expired", icon: Clock },
];

// Payment lifecycle quick filters — same one-tap toggle behavior.
const PAYMENT_LIFECYCLE_CHIPS: Array<{ action: string; label: string; icon: LucideIcon }> = [
  { action: "payment.completed", label: "Completed", icon: BadgeCheck },
  { action: "payment.refunded", label: "Refunded", icon: RotateCcw },
  { action: "payment.resumed", label: "Resumed", icon: Play },
];

function FilterChip({
  label,
  icon: Icon,
  active,
  onToggle,
}: {
  action: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
      }`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function formatDateTime(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

// Renders an audit entry's details. When the details carry a challengeLabel
// (e.g. payment.completed / payment.refunded entries), the purchase label is
// surfaced prominently instead of being buried in the raw JSON dump.
function DetailsLine({ details }: { details: string | object | null | undefined }) {
  if (!details) return null;

  let parsed: any = null;
  let raw: string;
  if (typeof details === "string") {
    raw = details;
    try {
      parsed = JSON.parse(details);
    } catch {
      parsed = null;
    }
  } else {
    raw = JSON.stringify(details);
    parsed = details;
  }

  if (parsed && typeof parsed === "object" && parsed.challengeLabel) {
    const { challengeLabel, ...rest } = parsed;
    const restRaw = Object.keys(rest).length > 0 ? JSON.stringify(rest) : "";
    return (
      <div className="mt-0.5 space-y-0.5">
        <div className="text-[10px] font-medium text-emerald-600 dark:text-emerald-500 truncate">
          {challengeLabel}
        </div>
        {restRaw && <div className="text-[10px] text-muted-foreground/80 font-mono truncate">{restRaw}</div>}
      </div>
    );
  }

  return <div className="text-[10px] text-muted-foreground/80 mt-0.5 font-mono truncate">{raw}</div>;
}

function ActorCell({ log }: { log: any }) {
  const name = log.userName;
  const email = log.userEmail;
  const initials = getInitials(name);

  if (name || email) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center shrink-0">
          {initials ? (
            <span className="text-[9px] font-medium text-muted-foreground">{initials}</span>
          ) : (
            <UserRound className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0">
          {name && <div className="text-xs font-medium truncate">{name}</div>}
          {email && <div className="text-[10px] text-muted-foreground truncate">{email}</div>}
        </div>
      </div>
    );
  }

  // Actor's account no longer exists — show a clear label instead of a bare id
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="h-6 w-6 rounded-full bg-secondary/50 flex items-center justify-center shrink-0">
        <UserRound className="h-3 w-3 text-muted-foreground/70" />
      </div>
      <div className="text-xs text-muted-foreground truncate">
        {log.userDeleted ? `Deleted user #${log.userId ?? "—"}` : `User #${log.userId ?? "—"}`}
      </div>
    </div>
  );
}

export default function AdminAuditLogs() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Precise entity scoping from the URL — e.g. Admin Settings' "Last changed
  // by" links here with ?entity=setting&entityId=flutterwave_config.
  // Derived straight from the URL (no state mirroring) so same-route navigation
  // from a deep link stays in sync with zero extra effects, and clearing just
  // strips the params.
  const [searchParams, setSearchParams] = useSearchParams();
  const entityFilter = searchParams.get("entity") || "";
  const entityIdFilter = searchParams.get("entityId") || "";

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useResetOnChange([debouncedSearch, actionFilter, pageSize, entityFilter, entityIdFilter], () => {
    setPage(1);
  });

  const clearEntityFilter = () => {
    setSearchParams({}, { replace: true });
  };

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (actionFilter !== "all") params.set("action", actionFilter);
  if (entityFilter) params.set("entity", entityFilter);
  if (entityIdFilter) params.set("entityId", entityIdFilter);
  const listQuery = `/api/users/audit-logs?${params.toString()}`;

  const { data, isLoading } = useApiQuery<AuditLogsResponse>(["admin", "auditLogs", listQuery], listQuery);

  const logs = data?.logs || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const stats = data?.stats || { total: 0, byAction: {} };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const topActions = Object.entries(stats.byAction || {}).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="System" title="Audit Logs" subtitle="Security and activity trail across the platform" />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-subtle p-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center"><ScrollText className="h-4 w-4 text-muted-foreground" /></div>
          <div>
            <div className="text-lg font-medium">{stats.total || total}</div>
            <div className="text-[10px] text-muted-foreground">Total Entries</div>
          </div>
        </div>
        {topActions.map(([action, count]) => (
          <div key={action} className="card-subtle p-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center"><ScrollText className="h-4 w-4 text-muted-foreground" /></div>
            <div>
              <div className="text-lg font-medium">{count}</div>
              <div className="text-[10px] text-muted-foreground capitalize">{action.replace(/_/g, " ")}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by action, entity, user name, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>
        <div className="relative">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 pr-8 text-xs appearance-none cursor-pointer"
          >
            <option value="all">All Actions</option>
            {Object.keys(stats.byAction || {}).map((a) => (
              <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
        {(search || actionFilter !== "all") && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setSearch(""); setActionFilter("all"); }}>
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Quick filter chips — challenge + payment lifecycle */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-medium text-muted-foreground mr-1">Challenge lifecycle:</span>
        {CHALLENGE_LIFECYCLE_CHIPS.map((chip) => (
          <FilterChip
            key={chip.action}
            {...chip}
            active={actionFilter === chip.action}
            onToggle={() => setActionFilter(actionFilter === chip.action ? "all" : chip.action)}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-medium text-muted-foreground mr-1">Payment lifecycle:</span>
        {PAYMENT_LIFECYCLE_CHIPS.map((chip) => (
          <FilterChip
            key={chip.action}
            {...chip}
            active={actionFilter === chip.action}
            onToggle={() => setActionFilter(actionFilter === chip.action ? "all" : chip.action)}
          />
        ))}
      </div>

      {/* Entity scope chip (from deep links) */}
      {(entityFilter || entityIdFilter) && (
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-muted-foreground font-medium">Scoped to:</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2.5 py-1 font-mono">
            {entityFilter || "any"}
            {entityIdFilter && <> · #{entityIdFilter}</>}
            <button
              onClick={clearEntityFilter}
              className="hover:text-foreground transition-colors"
              aria-label="Clear entity filter"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}

      {/* List */}
      <div className="space-y-1">
        {logs.length === 0 ? (
          <div className="card-subtle p-8 text-center text-muted-foreground text-xs">No audit log entries found</div>
        ) : (
          logs.map((log: any) => (
            <div key={log.id} className="card-subtle p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <ActorCell log={log} />
                <div className="min-w-0">
                  <div className="text-xs">
                    <span className="font-medium">{log.action}</span>{" "}
                    <span className="text-muted-foreground">on {log.entity}</span>
                    {log.entityId && <span className="text-muted-foreground"> #{log.entityId}</span>}
                  </div>
                  {log.details && <DetailsLine details={log.details} />}
                </div>
              </div>
              <span className="text-muted-foreground text-xs shrink-0 ml-3">
                {log.timestamp ? formatDateTime(log.timestamp) : ""}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        <div>Showing {logs.length} of {total} entries · Page {page} of {totalPages}</div>
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
