/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Server } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function AdminMT5() {
  const { data: accounts, isLoading, refetch } = useApiQuery<any[]>(["admin", "mt5"], "/api/trading/mt5");
  const createAccount = useApiMutation<any, any>("post", "/api/trading/admin/mt5");
  const { data: users } = useApiQuery<any[]>(["admin", "usersBrief"], "/api/users/brief");
  const [selectedUser, setSelectedUser] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-medium tracking-tight">MT5 Accounts</h1><p className="text-xs text-muted-foreground mt-1">{(accounts || []).length} accounts</p></div>
        <Button size="sm" className="text-xs" onClick={() => setShowCreate(true)}><Plus className="h-3 w-3 mr-1" /> Create Account</Button>
      </div>

      {showCreate && (
        <div className="card-subtle p-4 space-y-3">
          <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs">
            <option value="">Select user</option>
            {(users || []).map((u: any) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
          </select>
          <div className="flex gap-2">
            <Button size="sm" className="text-xs" onClick={async () => {
              if (!selectedUser) { toast.error("Select a user"); return; }
              await createAccount.mutateAsync({ userId: parseInt(selectedUser) });
              toast.success("Account created"); setShowCreate(false); refetch();
            }}>Create</Button>
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {(accounts || []).map((acc: any) => (
          <div key={acc.id} className="card-subtle p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center"><Server className="h-4 w-4 text-muted-foreground" /></div>
              <div>
                <div className="text-sm font-medium">#{acc.login}</div>
                <div className="text-xs text-muted-foreground">{acc.server} · User {acc.userId}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span>Balance: ${(acc.balance || 0).toLocaleString()}</span>
              <Badge variant={acc.isActive ? "default" : "secondary"} className="text-[10px]">{acc.isSuspended ? "Suspended" : acc.isActive ? "Active" : "Inactive"}</Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
