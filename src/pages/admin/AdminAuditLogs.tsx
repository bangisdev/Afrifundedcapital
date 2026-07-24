/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Shield } from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  profile_updated: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  user_role_updated: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  user_locked: "bg-red-500/10 text-red-600 dark:text-red-400",
  user_unlocked: "bg-green-500/10 text-green-600 dark:text-green-400",
  kyc_approved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  kyc_rejected: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  payment_completed: "bg-green-500/10 text-green-600 dark:text-green-400",
  payment_failed: "bg-red-500/10 text-red-600 dark:text-red-400",
  certificate_issued: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  challenge_created: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  challenge_updated: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
};

function getActionBadge(action: string) {
  const colors = ACTION_COLORS[action] || "bg-secondary text-muted-foreground";
  return (
    <Badge variant="outline" className={`${colors} border-0 text-xs font-normal`}>
      {action.replace(/_/g, " ")}
    </Badge>
  );
}

export default function AdminAuditLogs() {
  const logs = useQuery(api.users.listAuditLogs, {});
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState<string | null>(null);

  if (!logs) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const actions = [...new Set((logs as any[]).map((l: any) => l.action))].sort();
  const entities = [...new Set((logs as any[]).map((l: any) => l.entity))].sort();

  const filtered = (logs as any[]).filter((log: any) => {
    if (filterAction && log.action !== filterAction) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        log.action.toLowerCase().includes(q) ||
        log.entity.toLowerCase().includes(q) ||
        log.userName?.toLowerCase().includes(q) ||
        log.details?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Audit Logs</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Track all administrative actions and system events
          </p>
        </div>
        <Badge variant="outline" className="text-xs font-normal">
          {filtered.length} entries
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 text-xs h-9"
            placeholder="Search logs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-9 rounded-md border border-border bg-transparent px-3 text-xs text-muted-foreground"
          value={filterAction || ""}
          onChange={(e) => setFilterAction(e.target.value || null)}
        >
          <option value="">All actions</option>
          {(actions as any[]).map((a: any) => (
            <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>

      {/* Logs list */}
      <div className="space-y-1">
        {filtered.length === 0 ? (
          <div className="card-subtle p-8 text-center">
            <Shield className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No audit logs found matching your filters.</p>
          </div>
        ) : (
          (filtered as any[]).map((log: any) => (
            <div key={log._id} className="card-subtle p-3 flex items-start gap-3">
              <div className="shrink-0 pt-0.5">
                {getActionBadge(log.action)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                  {log.userName && (
                    <span className="font-medium text-foreground">{log.userName}</span>
                  )}
                  <span>on</span>
                  <Badge variant="outline" className="text-[10px] font-mono border-0 bg-secondary/50">
                    {log.entity}
                  </Badge>
                  {log.details && (
                    <span className="italic">{log.details}</span>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                {new Date(log.timestamp).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
