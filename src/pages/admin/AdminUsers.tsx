/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Shield, ShieldOff, UserCog } from "lucide-react";
import { toast } from "sonner";

export default function AdminUsers() {
  const [search, setSearch] = useState("");
  const usersList = useQuery(api.users.listUsers, { search: search || undefined });
  const updateRole = useMutation(api.users.updateUserRole);
  const toggleStatus = useMutation(api.users.toggleUserStatus);

  if (!usersList) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleRoleChange = async (userId: any, role: string) => {
    try {
      await updateRole({ userId, role: role || undefined });
      toast.success("Role updated");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleToggleLock = async (userId: any, currentState: boolean) => {
    try {
      await toggleStatus({ userId, locked: !currentState });
      toast.success(currentState ? "User unlocked" : "User locked");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Users</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage platform users and their roles
          </p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 text-xs h-9"
        />
      </div>

      <div className="space-y-1">
        {usersList.users.length === 0 ? (
          <div className="card-subtle p-8 text-center">
            <p className="text-xs text-muted-foreground">No users found</p>
          </div>
        ) : (
          usersList.users.map((u) => (
            <div key={u._id} className="card-subtle p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                  <span className="text-xs font-medium">
                    {u.name?.[0] || u.email?.[0] || "?"}
                  </span>
                </div>
                <div>
                  <div className="text-sm font-medium">{u.name || "Unnamed"}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px] rounded-full">
                      {u.role || "user"}
                    </Badge>
                    {u.kycStatus === "approved" && (
                      <Badge variant="outline" className="text-[10px] rounded-full border-foreground">
                        Verified
                      </Badge>
                    )}
                    {u.accountLockedUntil && u.accountLockedUntil > Date.now() && (
                      <Badge variant="outline" className="text-[10px] rounded-full border-destructive text-destructive">
                        Locked
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={u.role || "user"}
                  onChange={(e) => handleRoleChange(u._id, e.target.value === "user" ? "" : e.target.value)}
                >
                  <option value="user">User</option>
                  <option value="super_admin">Super Admin</option>
                  <option value="support_admin">Support</option>
                  <option value="finance_admin">Finance</option>
                  <option value="compliance_admin">Compliance</option>
                  <option value="client_manager">Client Manager</option>
                </select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleToggleLock(u._id, !!(u.accountLockedUntil && u.accountLockedUntil > Date.now()))}
                >
                  {u.accountLockedUntil && u.accountLockedUntil > Date.now() ? (
                    <ShieldOff className="h-3 w-3 text-destructive" />
                  ) : (
                    <Shield className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
