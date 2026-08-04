/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plus,
  Server,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useResetOnChange } from "@/hooks/use-reset-on-change";
import { toast } from "sonner";

interface Mt5Response {
  items: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: { total: number; active: number; suspended: number; totalBalance: number };
}

const PAGE_SIZES = [10, 25, 50];

export default function AdminMT5() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useResetOnChange([debouncedSearch, statusFilter, pageSize], () => {
    setPage(1);
  });

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const listQuery = `/api/trading/admin/mt5?${params.toString()}`;

  const { data, isLoading, refetch } = useApiQuery<Mt5Response>(["admin", "mt5", listQuery], listQuery);
  const createAccount = useApiMutation<any, any>("post", "/api/trading/admin/mt5");
  const { data: users } = useApiQuery<any[]>(["admin", "usersBrief"], "/api/users/brief");
  const [selectedUser, setSelectedUser] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const accounts = data?.items || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const stats = data?.stats || { total: 0, active: 0, suspended: 0, totalBalance: 0 };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-medium tracking-tight">MT5 Accounts</h1><p className="text-xs text-muted-foreground mt-1">Provision, monitor, and manage trading accounts</p></div>
        <Button size="sm" className="text-xs" onClick={() => setShowCreate(true)}><Plus className="h-3 w-3 mr-1" /> Create Account</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-subtle p-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center"><Server className="h-4 w-4 text-muted-foreground" /></div>
          <div><div className="text-lg font-medium">{stats.total}</div><div className="text-[10px] text-muted-foreground">Total Accounts</div></div>
        </div>
        <div className="card-subtle p-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center"><Server className="h-4 w-4 text-muted-foreground" /></div>
          <div><div className="text-lg font-medium">{stats.active}</div><div className="text-[10px] text-muted-foreground">Active</div></div>
        </div>
        <div className="card-subtle p-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center"><Server className="h-4 w-4 text-muted-foreground" /></div>
          <div><div className="text-lg font-medium">{stats.suspended}</div><div className="text-[10px] text-muted-foreground">Suspended</div></div>
        </div>
        <div className="card-subtle p-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center"><Server className="h-4 w-4 text-muted-foreground" /></div>
          <div><div className="text-lg font-medium">${(stats.totalBalance || 0).toLocaleString()}</div><div className="text-[10px] text-muted-foreground">Combined Balance</div></div>
        </div>
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

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by login, server, user name, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 pr-8 text-xs appearance-none cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="inactive">Inactive</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
        {(search || statusFilter !== "all") && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* List */}
      <div className="space-y-1">
        {accounts.length === 0 ? (
          <div className="card-subtle p-8 text-center text-muted-foreground text-xs">No MT5 accounts found</div>
        ) : (
          accounts.map((acc: any) => (
            <div key={acc.id} className="card-subtle p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center"><Server className="h-4 w-4 text-muted-foreground" /></div>
                <div>
                  <div className="text-sm font-medium">#{acc.login}</div>
                  <div className="text-xs text-muted-foreground">{acc.server} · {acc.userName || acc.userEmail || `User ${acc.userId}`}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span>Balance: ${(acc.balance || 0).toLocaleString()}</span>
                <Badge variant={acc.isActive ? "default" : "secondary"} className="text-[10px]">{acc.isSuspended ? "Suspended" : acc.isActive ? "Active" : "Inactive"}</Badge>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        <div>Showing {accounts.length} of {total} accounts · Page {page} of {totalPages}</div>
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
