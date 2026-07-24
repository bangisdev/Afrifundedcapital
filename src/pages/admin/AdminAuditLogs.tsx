/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { Loader2 } from "lucide-react";

export default function AdminAuditLogs() {
  const { data: logs, isLoading } = useApiQuery<any[]>(["admin", "auditLogs"], "/api/users/audit-logs");

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-8">
      <div><h1 className="text-lg font-medium tracking-tight">Audit Logs</h1><p className="text-xs text-muted-foreground mt-1">{(logs || []).length} entries</p></div>
      <div className="space-y-1">
        {(logs || []).map((log: any) => (
          <div key={log.id} className="card-subtle p-3 flex items-center justify-between text-xs">
            <div><span className="font-medium">{log.action}</span> <span className="text-muted-foreground">on {log.entity}</span>{log.entityId && <span className="text-muted-foreground"> #{log.entityId}</span>}</div>
            <span className="text-muted-foreground">{log.timestamp ? new Date(log.timestamp).toLocaleString() : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
