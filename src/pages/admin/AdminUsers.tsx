/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { readResponseBody, errorMessageOf } from "@/lib/api";
import { useState, useEffect, useMemo } from "react";
import { useResetOnChange } from "@/hooks/use-reset-on-change";
import { useNow } from "@/hooks/use-now";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/dashboard/PageLoader";
import { formatRelativeTime } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Search,
  Shield,
  Lock,
  Unlock,
  Trash2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Users,
  UserCheck,
  UserX,
  Eye,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface User {
  id: number;
  name: string | null;
  email: string | null;
  role: string | null;
  kycStatus: string | null;
  onboardingComplete: boolean | null;
  emailVerified: boolean | null;
  twoFactorEnabled: boolean | null;
  accountLockedUntil: number | null;
  phone: string | null;
  country: string | null;
  tradingExperience: string | null;
  timezone: string | null;
  referralCode: string | null;
  createdAt: number | null;
  updatedAt: number | null;
}

interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: { total: number; admins: number; verified: number; locked: number };
}

const PAGE_SIZES = [10, 25, 50];

const ROLES = [
  "super_admin", "support_admin", "finance_admin", "client_manager",
  "compliance_admin", "marketing_admin", "affiliate_manager", "user",
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin", support_admin: "Support Admin",
  finance_admin: "Finance Admin", client_manager: "Client Manager",
  compliance_admin: "Compliance Admin", marketing_admin: "Marketing Admin",
  affiliate_manager: "Affiliate Manager", user: "User",
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-destructive/10 text-destructive border-destructive/20",
  support_admin: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  finance_admin: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  client_manager: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  compliance_admin: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  marketing_admin: "bg-pink-500/10 text-pink-600 border-pink-500/20",
  affiliate_manager: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  user: "bg-secondary text-secondary-foreground",
};

const KYC_COLORS: Record<string, string> = {
  approved: "bg-emerald-500/10 text-emerald-600",
  pending: "bg-amber-500/10 text-amber-600",
  rejected: "bg-red-500/10 text-red-600",
  unverified: "bg-secondary text-secondary-foreground",
};

function formatTimestamp(ts: number | null) {
  if (!ts) return "—";
  return formatRelativeTime(ts) || new Date(ts).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminUsers() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [kycFilter, setKycFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showUserDetail, setShowUserDetail] = useState(false);
  const [editingRole, setEditingRole] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Debounce the search input so we don't hit the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to first page whenever filters, page size, or sort change
  useResetOnChange([debouncedSearch, roleFilter, kycFilter, pageSize, sortBy, sortOrder], () => {
    setPage(1);
  });

  const now = useNow();

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder("desc");
    }
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
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (roleFilter !== "all") params.set("role", roleFilter);
  if (kycFilter !== "all") params.set("kycStatus", kycFilter);
  const listQuery = `/api/users/list?${params.toString()}`;

  const { data, isLoading, refetch } = useApiQuery<UsersResponse>(["admin", "users", listQuery], listQuery);

  const users = data?.users || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const stats = useMemo(
    () => data?.stats || { total: 0, admins: 0, verified: 0, locked: 0 },
    [data],
  );

  // Direct fetch helpers for dynamic endpoints
  const apiPut = async (path: string, body: any) => {
    const res = await fetch(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) { throw new Error(errorMessageOf(await readResponseBody(res), res.status)); }
    return readResponseBody(res);
  };

  const apiDelete = async (path: string) => {
    const res = await fetch(path, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) { throw new Error(errorMessageOf(await readResponseBody(res), res.status)); }
    return readResponseBody(res);
  };

  const handleUpdateRole = async (userId: number, newRole: string) => {
    setActionLoading(userId);
    try {
      await apiPut(`/api/users/${userId}/role`, { role: newRole });
      toast.success(`Role updated to ${ROLE_LABELS[newRole] || newRole}`);
      setEditingRole(null);
      refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update role");
    }
    setActionLoading(null);
  };

  const handleToggleLock = async (userId: number, locked: boolean) => {
    setActionLoading(userId);
    try {
      await apiPut(`/api/users/${userId}/status`, { locked });
      toast.success(locked ? "Account locked" : "Account unlocked");
      refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed to toggle status");
    }
    setActionLoading(null);
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setActionLoading(deleteTarget.id);
    try {
      await apiDelete(`/api/users/${deleteTarget.id}`);
      toast.success(`User ${deleteTarget.email} deleted`);
      setDeleteTarget(null);
      // If we just deleted the last row on this page, step back a page
      if (users.length === 1 && page > 1) setPage(page - 1);
      refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete user");
    }
    setActionLoading(null);
  };

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader eyebrow="People" title="User Management" subtitle="View, edit, and manage all platform users" />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Users", value: stats.total, icon: Users },
          { label: "Admins", value: stats.admins, icon: Shield },
          { label: "Verified", value: stats.verified, icon: UserCheck },
          { label: "Locked", value: stats.locked, icon: UserX },
        ].map((s) => (
          <div key={s.label} className="card-subtle p-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center">
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="text-lg font-medium">{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone, or referral code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>
        <div className="relative">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 pr-8 text-xs appearance-none cursor-pointer"
          >
            <option value="all">All Roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={kycFilter}
            onChange={(e) => setKycFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 pr-8 text-xs appearance-none cursor-pointer"
          >
            <option value="all">All KYC Status</option>
            <option value="unverified">Unverified</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
        {(search || roleFilter !== "all" || kycFilter !== "all") && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setSearch(""); setRoleFilter("all"); setKycFilter("all"); }}>
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Users Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium text-muted-foreground">{sortHeader("name", "User")}</th>
                <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">{sortHeader("role", "Role")}</th>
                <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">{sortHeader("kycStatus", "KYC")}</th>
                <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">Status</th>
                <th className="text-left p-3 font-medium text-muted-foreground hidden xl:table-cell">{sortHeader("createdAt", "Joined")}</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">No users found</td>
                </tr>
              ) : (
                users.map((u) => {
                  const isLocked = u.accountLockedUntil && u.accountLockedUntil > now;
                  return (
                    <tr key={u.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-medium shrink-0">
                            {u.name?.[0]?.toUpperCase() || u.email?.[0]?.toUpperCase() || "?"}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{u.name || "Unnamed"}</div>
                            <div className="text-muted-foreground truncate">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        <div className="relative">
                          {editingRole === u.id ? (
                            <div className="flex items-center gap-1">
                              <select
                                defaultValue={u.role || "user"}
                                onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                                className="h-7 rounded border border-input bg-background px-1.5 text-[10px] w-32"
                                autoFocus
                                onBlur={() => setEditingRole(null)}
                              >
                                {ROLES.map((r) => (
                                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                                ))}
                              </select>
                              <button onClick={() => setEditingRole(null)} className="text-muted-foreground hover:text-foreground">
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setEditingRole(u.id)}
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium cursor-pointer hover:opacity-80 transition-opacity ${ROLE_COLORS[u.role || "user"] || ""}`}
                            >
                              {ROLE_LABELS[u.role || "user"] || u.role || "user"}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-3 hidden lg:table-cell">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${KYC_COLORS[u.kycStatus || "unverified"] || ""}`}>
                          {u.kycStatus || "unverified"}
                        </span>
                      </td>
                      <td className="p-3 hidden lg:table-cell">
                        {isLocked ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-red-600">
                            <Lock className="h-3 w-3" /> Locked
                          </span>
                        ) : u.emailVerified ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600">
                            <UserCheck className="h-3 w-3" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">Unverified</span>
                        )}
                      </td>
                      <td className="p-3 hidden xl:table-cell text-muted-foreground">{formatTimestamp(u.createdAt)}</td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          {actionLoading === u.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <>
                              <Link
                                to={`/admin/audit-logs?entity=user&entityId=${u.id}`}
                                className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                                title={`View the audit trail for user ${u.name || u.email || `#${u.id}`}`}
                                aria-label={`View audit trail for user ${u.id}`}
                              >
                                <History className="h-3.5 w-3.5" />
                              </Link>
                              <Button variant="ghost" size="icon-sm" className="h-7 w-7" title="View details"
                                onClick={() => { setSelectedUser(u); setShowUserDetail(true); }}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon-sm" className="h-7 w-7"
                                title={isLocked ? "Unlock account" : "Lock account"}
                                onClick={() => handleToggleLock(u.id, !isLocked)}>
                                {isLocked ? <Unlock className="h-3.5 w-3.5 text-emerald-600" /> : <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                              </Button>
                              <Button variant="ghost" size="icon-sm" className="h-7 w-7" title="Delete user"
                                onClick={() => setDeleteTarget(u)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        <div>
          Showing {users.length} of {total} users
          {total > 0 && ` · Page ${page} of ${totalPages}`}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
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

      {/* User Detail Modal */}
      {showUserDetail && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowUserDetail(false)}>
          <div className="bg-background border rounded-lg shadow-lg w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-sm font-medium">
                  {selectedUser.name?.[0]?.toUpperCase() || selectedUser.email?.[0]?.toUpperCase() || "?"}
                </div>
                <div>
                  <div className="font-medium">{selectedUser.name || "Unnamed"}</div>
                  <div className="text-xs text-muted-foreground">{selectedUser.email}</div>
                </div>
              </div>
              <button onClick={() => setShowUserDetail(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  { label: "User ID", value: `#${selectedUser.id}` },
                  { label: "Role", value: ROLE_LABELS[selectedUser.role || "user"] || selectedUser.role || "user" },
                  { label: "KYC Status", value: selectedUser.kycStatus || "unverified" },
                  { label: "Email Verified", value: selectedUser.emailVerified ? "Yes" : "No" },
                  { label: "2FA Enabled", value: selectedUser.twoFactorEnabled ? "Yes" : "No" },
                  { label: "Onboarding", value: selectedUser.onboardingComplete ? "Complete" : "Incomplete" },
                  { label: "Phone", value: selectedUser.phone || "—" },
                  { label: "Country", value: selectedUser.country || "—" },
                  { label: "Timezone", value: selectedUser.timezone || "—" },
                  { label: "Experience", value: selectedUser.tradingExperience || "—" },
                  { label: "Referral Code", value: selectedUser.referralCode || "—" },
                  { label: "Joined", value: formatDateTime(selectedUser.createdAt) },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="text-muted-foreground mb-0.5">{item.label}</div>
                    <div className="font-medium">{item.value}</div>
                  </div>
                ))}
              </div>
              <div className="border-t pt-3 flex gap-2">
                <Button variant="outline" size="sm" className="text-xs"
                  onClick={async () => {
                    const newRole = selectedUser.role === "user" ? "super_admin" : "user";
                    await handleUpdateRole(selectedUser.id, newRole);
                    setSelectedUser({ ...selectedUser, role: newRole });
                  }}>
                  <Shield className="h-3 w-3 mr-1" /> Toggle Admin
                </Button>
                <Button variant="outline" size="sm" className="text-xs"
                  onClick={() => handleToggleLock(selectedUser.id, !(selectedUser.accountLockedUntil && selectedUser.accountLockedUntil > now))}>
                  {selectedUser.accountLockedUntil && selectedUser.accountLockedUntil > now ? (
                    <><Unlock className="h-3 w-3 mr-1" /> Unlock</>
                  ) : (
                    <><Lock className="h-3 w-3 mr-1" /> Lock</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{deleteTarget?.email}</strong>?
              This will remove all their data including sessions, wallet, challenges, and certificates.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={handleDeleteUser}>
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
