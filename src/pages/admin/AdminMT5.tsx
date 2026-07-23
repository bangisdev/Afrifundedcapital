/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  TrendingUp,
  Search,
  RefreshCw,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Play,
  Pause,
  Server,
  Users,
  Activity,
  ListOrdered,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Id } from "@/convex/_generated/dataModel";

// ─── Helpers ───

function SyncStatusBadge({ account }: { account: any }) {
  if (!account.lastSyncAt) {
    return (
      <Badge variant="outline" className="text-[10px] font-normal border-0 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
        <AlertCircle className="h-2.5 w-2.5 mr-1" />
        Never synced
      </Badge>
    );
  }
  const hoursSinceSync = (Date.now() - account.lastSyncAt) / (1000 * 60 * 60);
  if (hoursSinceSync < 1) {
    return (
      <Badge variant="outline" className="text-[10px] font-normal border-0 bg-green-500/10 text-green-600 dark:text-green-400">
        <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
        Synced recently
      </Badge>
    );
  }
  if (hoursSinceSync < 24) {
    return (
      <Badge variant="outline" className="text-[10px] font-normal border-0 bg-blue-500/10 text-blue-600 dark:text-blue-400">
        <Clock className="h-2.5 w-2.5 mr-1" />
        {Math.round(hoursSinceSync)}h ago
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] font-normal border-0 bg-red-500/10 text-red-600 dark:text-red-400">
      <AlertCircle className="h-2.5 w-2.5 mr-1" />
      {Math.round(hoursSinceSync / 24)}d ago
    </Badge>
  );
}

function QueueStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    processing: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    completed: "bg-green-500/10 text-green-600 dark:text-green-400",
    failed: "bg-red-500/10 text-red-600 dark:text-red-400",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] font-normal border-0", colors[status] || "")}>
      {status}
    </Badge>
  );
}

// ─── Create Account Dialog ───

function CreateAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const userSearchRef = useRef<HTMLInputElement>(null);
  const [userSearch, setUserSearch] = useState("");
  const allUsers = useQuery(api.users.listUsersBrief, { search: userSearch || undefined, limit: 20 });
  const createAccount = useMutation(api.mt5.createMt5Account);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("AfriFundedCapital-Server");
  const [group, setGroup] = useState("\\AfriFundedCapital\\Challenge");
  const [leverage, setLeverage] = useState("100");
  const [balance, setBalance] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [creating, setCreating] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const selectedUser = allUsers?.find((u) => u._id === selectedUserId);

  const reset = () => {
    setSelectedUserId(null);
    setLogin("");
    setPassword("");
    setServer("AfriFundedCapital-Server");
    setGroup("\\AfriFundedCapital\\Challenge");
    setLeverage("100");
    setBalance("");
    setCurrency("USD");
    setUserSearch("");
    setShowUserDropdown(false);
  };

  const handleCreate = async () => {
    if (!selectedUserId) { toast.error("Please select a user"); return; }
    if (!login) { toast.error("Login is required"); return; }
    if (!password) { toast.error("Password is required"); return; }

    setCreating(true);
    try {
      await createAccount({
        userId: selectedUserId as Id<"users">,
        login,
        password,
        server,
        group,
        leverage: parseInt(leverage) || 100,
        balance: balance ? parseFloat(balance) : undefined,
        currency,
      });
      toast.success("MT5 account created");
      reset();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message);
    }
    setCreating(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">Create MT5 Account</DialogTitle>
          <DialogDescription className="text-xs">
            Provision a new MetaTrader 5 trading account for a user.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* User picker */}
          <div className="space-y-1.5">
            <Label className="text-xs">User</Label>
            <div className="relative">
              <Input
                ref={userSearchRef}
                className="text-xs h-9"
                placeholder="Search by name or email…"
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  setShowUserDropdown(true);
                }}
                onFocus={() => setShowUserDropdown(true)}
              />
              {showUserDropdown && allUsers && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-card border border-border rounded-md shadow-md max-h-48 overflow-y-auto">
                  {allUsers.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground text-center">No users found</div>
                  ) : (
                    allUsers.map((u) => (
                      <button
                        key={u._id}
                        className={cn(
                          "w-full text-left px-3 py-2 text-xs hover:bg-secondary transition-colors",
                          selectedUserId === u._id && "bg-secondary font-medium",
                        )}
                        onClick={() => {
                          setSelectedUserId(u._id);
                          setUserSearch(u.name || u.email || "");
                          setShowUserDropdown(false);
                        }}
                      >
                        {u.name || "Unnamed"} <span className="text-muted-foreground">— {u.email}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            {selectedUser && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Selected: {selectedUser.name || selectedUser.email}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Login</Label>
              <Input className="text-xs h-9 font-mono" placeholder="e.g. 100001" value={login} onChange={(e) => setLogin(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Password</Label>
              <Input className="text-xs h-9 font-mono" type="text" placeholder="Secure password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Server</Label>
              <Input className="text-xs h-9 font-mono" value={server} onChange={(e) => setServer(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Group</Label>
              <Input className="text-xs h-9 font-mono" value={group} onChange={(e) => setGroup(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Leverage</Label>
              <Select value={leverage} onValueChange={setLeverage}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 10, 25, 50, 100, 200, 500, 1000].map((l) => (
                    <SelectItem key={l} value={String(l)} className="text-xs">
                      1:{l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Initial Balance</Label>
              <Input className="text-xs h-9" type="number" placeholder="0" value={balance} onChange={(e) => setBalance(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["USD", "EUR", "GBP", "NGN"].map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" className="text-xs h-8" onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
              Create Account
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Account Dialog ───

function EditAccountDialog({
  account,
  open,
  onOpenChange,
}: {
  account: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateAccount = useMutation(api.mt5.updateMt5Account);

  const [balance, setBalance] = useState("");
  const [equity, setEquity] = useState("");
  const [group, setGroup] = useState("");
  const [leverage, setLeverage] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (account) {
      setBalance(String(account.balance ?? 0));
      setEquity(String(account.equity ?? 0));
      setGroup(account.group || "");
      setLeverage(String(account.leverage ?? 100));
    }
  }, [account]);

  const handleSave = async () => {
    setUpdating(true);
    try {
      await updateAccount({
        accountId: account._id,
        balance: parseFloat(balance) || 0,
        equity: parseFloat(equity) || 0,
        group: group || undefined,
        leverage: parseInt(leverage) || 100,
      });
      toast.success("Account updated");
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message);
    }
    setUpdating(false);
  };

  if (!account) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">Edit MT5 Account</DialogTitle>
          <DialogDescription className="text-xs">
            Login: {account.login} · {account.server}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Balance</Label>
              <Input className="text-xs h-9" type="number" value={balance} onChange={(e) => setBalance(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Equity</Label>
              <Input className="text-xs h-9" type="number" value={equity} onChange={(e) => setEquity(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Group</Label>
              <Input className="text-xs h-9 font-mono" value={group} onChange={(e) => setGroup(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Leverage</Label>
              <Select value={leverage} onValueChange={setLeverage}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 10, 25, 50, 100, 200, 500, 1000].map((l) => (
                    <SelectItem key={l} value={String(l)} className="text-xs">1:{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" className="text-xs h-8" onClick={handleSave} disabled={updating}>
              {updating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ───

export default function AdminMT5() {
  const accounts = useQuery(api.mt5.listAllMt5Accounts, {});
  const syncQueue = useQuery(api.mt5.getMt5SyncQueue, {});
  const updateAccount = useMutation(api.mt5.updateMt5Account);
  const queueSync = useMutation(api.mt5.queueMt5Sync);
  const processQueue = useMutation(api.mt5.processMt5SyncQueue);
  const purgeQueue = useMutation(api.mt5.purgeMt5SyncQueue);

  const [search, setSearch] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [editAccount, setEditAccount] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [queueTab, setQueueTab] = useState("all");

  if (!accounts || !syncQueue) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Stats ──
  const totalAccounts = accounts.length;
  const activeAccounts = accounts.filter((a) => a.isActive && !a.isSuspended).length;
  const suspendedAccounts = accounts.filter((a) => a.isSuspended).length;
  const neverSynced = accounts.filter((a) => !a.lastSyncAt).length;

  // ── Queue stats ──
  const pendingSync = syncQueue.filter((q) => q.status === "pending").length;
  const failedSync = syncQueue.filter((q) => q.status === "failed").length;
  const completedSync = syncQueue.filter((q) => q.status === "completed").length;
  const processingSync = syncQueue.filter((q) => q.status === "processing").length;

  // ── Filtered accounts ──
  const filtered = search
    ? accounts.filter(
        (a) =>
          a.login.toLowerCase().includes(search.toLowerCase()) ||
          a.userName?.toLowerCase().includes(search.toLowerCase()) ||
          a.userEmail?.toLowerCase().includes(search.toLowerCase()) ||
          a.server.toLowerCase().includes(search.toLowerCase()),
      )
    : accounts;

  // ── Filtered queue ──
  const queueFiltered =
    queueTab === "all"
      ? syncQueue
      : syncQueue.filter((q) => q.status === queueTab);

  // ── Handlers ──

  const handleToggleStatus = async (account: any, suspend: boolean) => {
    setUpdating(account._id);
    try {
      await updateAccount({
        accountId: account._id,
        isSuspended: suspend,
      });
      toast.success(suspend ? "Account suspended" : "Account activated");
    } catch (error: any) {
      toast.error(error.message);
    }
    setUpdating(null);
  };

  const handleQueueSync = async (accountId: string) => {
    try {
      await queueSync({ mt5AccountId: accountId as any, action: "sync" });
      toast.success("Sync queued");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleQueueSyncAll = async () => {
    const toSync = accounts.filter((a) => a.isActive);
    let queued = 0;
    for (const a of toSync) {
      try {
        await queueSync({ mt5AccountId: a._id as any, action: "sync" });
        queued++;
      } catch {}
    }
    toast.success(`Queued sync for ${queued} account${queued !== 1 ? "s" : ""}`);
  };

  const handleRetryQueueItem = async (itemId: string) => {
    try {
      await processQueue({ queueItemId: itemId as any, status: "pending" });
      toast.success("Item reset to pending for retry");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handlePurgeCompleted = async () => {
    try {
      const removed = await purgeQueue({ status: "completed", olderThanHours: 1 });
      toast.success(`Removed ${removed} completed item${removed !== 1 ? "s" : ""}`);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handlePurgeFailed = async () => {
    try {
      const removed = await purgeQueue({ status: "failed" });
      toast.success(`Removed ${removed} failed item${removed !== 1 ? "s" : ""}`);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">MT5 Management</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage MetaTrader 5 accounts, sync controls, and queue monitoring
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8"
            onClick={handleQueueSyncAll}
          >
            <RefreshCw className="h-3 w-3 mr-1.5" />
            Sync All
          </Button>
          <Button
            size="sm"
            className="text-xs h-8"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-3 w-3 mr-1.5" />
            Create Account
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-subtle p-4 space-y-1">
          <div className="stat-label">Total Accounts</div>
          <div className="stat-value">{totalAccounts}</div>
          <p className="text-[10px] text-muted-foreground">All MT5 accounts</p>
        </div>
        <div className="card-subtle p-4 space-y-1">
          <div className="stat-label">Active</div>
          <div className="stat-value text-green-600 dark:text-green-400">{activeAccounts}</div>
          <p className="text-[10px] text-muted-foreground">{suspendedAccounts} suspended</p>
        </div>
        <div className="card-subtle p-4 space-y-1">
          <div className="stat-label">Pending Sync</div>
          <div className="stat-value text-yellow-600 dark:text-yellow-400">{pendingSync}</div>
          <p className="text-[10px] text-muted-foreground">{failedSync} failed · {processingSync} processing</p>
        </div>
        <div className="card-subtle p-4 space-y-1">
          <div className="stat-label">Never Synced</div>
          <div className="stat-value text-destructive">{neverSynced}</div>
          <p className="text-[10px] text-muted-foreground">Accounts without sync</p>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="accounts" className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="accounts" className="text-xs">
            <Server className="h-3.5 w-3.5 mr-1.5" />
            Accounts
          </TabsTrigger>
          <TabsTrigger value="queue" className="text-xs">
            <ListOrdered className="h-3.5 w-3.5 mr-1.5" />
            Sync Queue
            {pendingSync > 0 && (
              <Badge variant="default" className="ml-1.5 text-[9px] h-4 px-1 bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-0">
                {pendingSync}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ═══════ ACCOUNTS TAB ═══════ */}
        <TabsContent value="accounts" className="space-y-4">
          {/* Search & visibility */}
          <div className="flex items-center gap-3">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 text-xs h-9"
                placeholder="Search by login, user, or server…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              title={showPasswords ? "Hide passwords" : "Show passwords"}
              onClick={() => setShowPasswords(!showPasswords)}
            >
              {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          </div>

          {/* Accounts List */}
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="card-subtle p-8 text-center space-y-2">
                <TrendingUp className="h-8 w-8 mx-auto text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  {search ? "No accounts matching your search." : "No MT5 accounts yet. Create one to get started."}
                </p>
              </div>
            ) : (
              filtered.map((account) => (
                <div key={account._id} className="card-subtle p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      {/* Top row: login, badges */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-sm font-medium font-mono">
                          Login: {account.login}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-normal border-0",
                            account.isSuspended
                              ? "bg-red-500/10 text-red-600 dark:text-red-400"
                              : account.isActive
                                ? "bg-green-500/10 text-green-600 dark:text-green-400"
                                : "bg-secondary text-muted-foreground",
                          )}
                        >
                          {account.isSuspended ? "Suspended" : account.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <SyncStatusBadge account={account} />
                      </div>

                      {/* User & server info */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-muted-foreground">User</span>
                          <p className="font-medium truncate">{account.userName || account.userEmail || "—"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Server</span>
                          <p className="font-medium font-mono text-[11px]">{account.server}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Balance</span>
                          <p className="font-medium font-mono">{account.currency} {account.balance?.toLocaleString() || "0"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Equity</span>
                          <p className="font-medium font-mono">{account.currency} {account.equity?.toLocaleString() || "0"}</p>
                        </div>
                      </div>

                      {/* Password reveal */}
                      {showPasswords && (
                        <div className="mt-2 pt-2 border-t border-border grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-muted-foreground">Password</span>
                            <p className="font-mono text-[11px] break-all">{account.password}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Investor Password</span>
                            <p className="font-mono text-[11px] break-all">{account.investorPassword}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 ml-4 shrink-0">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        title="Queue sync"
                        onClick={() => handleQueueSync(account._id)}
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                      {account.isSuspended ? (
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          title="Activate"
                          onClick={() => handleToggleStatus(account, false)}
                          disabled={updating === account._id}
                        >
                          {updating === account._id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="h-3 w-3" />
                          )}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          title="Suspend"
                          onClick={() => handleToggleStatus(account, true)}
                          disabled={updating === account._id}
                        >
                          {updating === account._id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Pause className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        title="Edit"
                        onClick={() => setEditAccount(account)}
                      >
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Footer details */}
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                    <span>Group: <span className="font-mono">{account.group}</span></span>
                    <span>Leverage: <span className="font-mono">1:{account.leverage}</span></span>
                    <span>Created: {new Date(account.createdAt).toLocaleDateString()}</span>
                    {account.lastSyncAt && (
                      <span>Last sync: {new Date(account.lastSyncAt).toLocaleString()}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        {/* ═══════ SYNC QUEUE TAB ═══════ */}
        <TabsContent value="queue" className="space-y-4">
          {/* Queue stats + actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-[10px] font-normal bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-0">
                  {pendingSync} pending
                </Badge>
                <Badge variant="outline" className="text-[10px] font-normal bg-blue-500/10 text-blue-600 dark:text-blue-400 border-0">
                  {processingSync} processing
                </Badge>
                <Badge variant="outline" className="text-[10px] font-normal bg-green-500/10 text-green-600 dark:text-green-400 border-0">
                  {completedSync} completed
                </Badge>
                <Badge variant="outline" className="text-[10px] font-normal bg-red-500/10 text-red-600 dark:text-red-400 border-0">
                  {failedSync} failed
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={handlePurgeCompleted} disabled={completedSync === 0}>
                <Trash2 className="h-3 w-3 mr-1" />
                Purge Completed
              </Button>
              <Button variant="outline" size="sm" className="text-xs h-7 text-destructive" onClick={handlePurgeFailed} disabled={failedSync === 0}>
                <XCircle className="h-3 w-3 mr-1" />
                Purge Failed
              </Button>
            </div>
          </div>

          {/* Queue status filter tabs */}
          <Tabs value={queueTab} onValueChange={setQueueTab} className="space-y-3">
            <TabsList className="h-8">
              {["all", "pending", "processing", "completed", "failed"].map((s) => (
                <TabsTrigger key={s} value={s} className="text-xs capitalize px-3">
                  {s}
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    ({s === "all" ? syncQueue.length : syncQueue.filter((q) => q.status === s).length})
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="space-y-1">
              {queueFiltered.length === 0 ? (
                <div className="card-subtle p-8 text-center space-y-2">
                  <Activity className="h-8 w-8 mx-auto text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    No {queueTab !== "all" ? queueTab : ""} queue items.
                  </p>
                </div>
              ) : (
                queueFiltered.slice(0, 50).map((item) => {
                  const account = accounts.find((a) => a._id === item.mt5AccountId);
                  return (
                    <div key={item._id} className="card-subtle p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-xs">
                          <QueueStatusBadge status={item.status} />
                          <span className="font-medium capitalize">{item.action}</span>
                          <span className="text-muted-foreground">
                            Account: <span className="font-mono">{account?.login || item.mt5AccountId.slice(0, 8) + "…"}</span>
                          </span>
                          <span className="text-muted-foreground font-mono text-[10px]">
                            {new Date(item.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {item.status === "failed" && (
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-6 w-6"
                              title="Retry"
                              onClick={() => handleRetryQueueItem(item._id)}
                            >
                              <RefreshCw className="h-2.5 w-2.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {item.error && (
                        <p className="mt-1.5 text-[10px] text-destructive font-mono">{item.error}</p>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>Retries: {item.retryCount}/{item.maxRetries}</span>
                        {item.processedAt && (
                          <span>Processed: {new Date(item.processedAt).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* Create Account Dialog */}
      <CreateAccountDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* Edit Account Dialog */}
      <EditAccountDialog account={editAccount} open={!!editAccount} onOpenChange={(o) => { if (!o) setEditAccount(null); }} />
    </div>
  );
}
