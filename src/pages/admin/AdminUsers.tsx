/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Shield, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";

export default function AdminUsers() {
  const { data: users, isLoading } = useApiQuery<any[]>(["admin", "users"], "/api/users/list");
  const updateRole = useApiMutation<any, any>("put", "/api/users/${id}/role");
  const toggleStatus = useApiMutation<any, any>("put", "/api/users/${id}/status");
  const [search, setSearch] = useState("");

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const filtered = (users || []).filter((u: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-8">
      <div><h1 className="text-lg font-medium tracking-tight">Users</h1><p className="text-xs text-muted-foreground mt-1">Manage platform users ({filtered.length})</p></div>
      <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input type="text" placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full h-9 pl-8 pr-3 rounded-md border border-input bg-background text-xs" />
      </div>
      <div className="space-y-1">
        {filtered.map((u: any) => (
          <div key={u.id} className="card-subtle p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-medium">{u.name?.[0] || u.email?.[0]}</div>
              <div><div className="text-sm font-medium">{u.name || "Unnamed"}</div><div className="text-xs text-muted-foreground">{u.email}</div></div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">{u.role || "user"}</Badge>
              <Badge variant={u.kycStatus === "approved" ? "default" : "secondary"} className="text-[10px]">KYC: {u.kycStatus || "unverified"}</Badge>
              <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={async () => {
                const newRole = u.role === "user" ? "super_admin" : "user";
                await updateRole.mutateAsync({ id: u.id, role: newRole });
                toast.success(`Role updated to ${newRole}`);
              }}>Change Role</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
