/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";

export default function AdminSupport() {
  const { data: tickets, isLoading, refetch } = useApiQuery<any[]>(["admin", "tickets"], "/api/support/admin/all");
  const updateStatus = useApiMutation<any, any>("put", "/api/support/admin/${id}/status");
  const addMessage = useApiMutation<any, any>("post", "/api/support/${id}/messages");
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [reply, setReply] = useState("");

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-8">
      <div><h1 className="text-lg font-medium tracking-tight">Support Tickets</h1><p className="text-xs text-muted-foreground mt-1">{(tickets || []).length} tickets</p></div>
      <div className="space-y-1">
        {(tickets || []).map((t: any) => (
          <div key={t.id} className="card-subtle p-4 flex items-center justify-between cursor-pointer hover:bg-secondary/20" onClick={() => setSelectedTicket(t)}>
            <div><div className="text-sm font-medium">{t.subject}</div><div className="text-xs text-muted-foreground">User {t.userId} · {t.category} · {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : ""}</div></div>
            <div className="flex items-center gap-2">
              <Badge variant={t.status === "open" ? "default" : "secondary"} className="text-[10px]">{t.status}</Badge>
              {t.status === "open" && (
                <Button variant="ghost" size="sm" className="text-[10px] h-7" onClick={async (e) => { e.stopPropagation(); await updateStatus.mutateAsync({ id: t.id, status: "resolved" }); toast.success("Resolved"); refetch(); }}>Resolve</Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
