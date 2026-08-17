/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2,
  Plus,
  Server,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Cable,
  Activity,
  RefreshCcw,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  ShieldAlert,
  Gavel,
  Newspaper,
  CalendarClock,
  Trash2,
  Save,
  Clock,
  Wallet,
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
  const [tab, setTab] = useState("accounts");
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
  // Mutations invalidate ONLY the queries they touch instead of the whole
  // cache — the old blanket invalidateQueries() refetched every query on the
  // page (accounts list, status, config, queue, reconciliation) at once, which
  // churned the dev proxy and reset the active tab.
  const createAccount = useApiMutation<any, any>("post", "/api/trading/admin/mt5", {
    invalidateKeys: [["admin", "mt5"]],
  });
  const { data: users } = useApiQuery<any[]>(["admin", "usersBrief"], "/api/users/brief");
  const [selectedUser, setSelectedUser] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const accounts = data?.items || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const stats = data?.stats || { total: 0, active: 0, suspended: 0, totalBalance: 0 };

  // ── Connector status & config ──────────────────────────────
  const { data: statusData, refetch: refetchStatus } = useApiQuery<any>(
    ["admin", "mt5Status"],
    "/api/trading/admin/status",
  );
  const { data: configData, refetch: refetchConfig } = useApiQuery<any>(
    ["admin", "mt5Config"],
    "/api/trading/admin/config",
  );
  const saveConfig = useApiMutation<any, any>("put", "/api/trading/admin/config", {
    invalidateKeys: [["admin", "mt5Config"], ["admin", "mt5Status"]],
  });
  const testConnection = useApiMutation<any, any>("post", "/api/trading/admin/test-connection", {
    invalidateKeys: [],
  });
  const [testResult, setTestResult] = useState<any>(null);

  // Local config form state (seeded once from the server)
  const [form, setForm] = useState<any>(null);
  useResetOnChange([configData], () => {
    if (!configData?.config) return;
    setForm({
      enabled: configData.config.enabled,
      baseUrls: (configData.config.baseUrls || []).join(", "),
      apiKey: "",
      managerLogin: configData.config.managerLogin,
      managerPassword: "",
      group: configData.config.group,
      leverage: configData.config.leverage,
      serverName: configData.config.serverName,
      requestTimeoutMs: configData.config.requestTimeoutMs,
      maxRetries: configData.config.maxRetries,
      retryBaseDelayMs: configData.config.retryBaseDelayMs,
      reconciliationTolerance: configData.config.reconciliationTolerance,
    });
  }, Boolean(configData?.config));

  // ── Retry queue ────────────────────────────────────────────
  const { data: queueData, refetch: refetchQueue } = useApiQuery<any>(
    ["admin", "mt5Queue"],
    "/api/trading/admin/queue",
  );
  const processQueue = useApiMutation<any, any>("post", "/api/trading/admin/queue/process", {
    invalidateKeys: [["admin", "mt5Queue"], ["admin", "mt5Status"]],
  });
  const retryJob = useApiMutation<any, any>("post", "/api/trading/admin/queue/retry-all", {
    invalidateKeys: [["admin", "mt5Queue"], ["admin", "mt5Status"]],
  });
  const [processingQueue, setProcessingQueue] = useState(false);

  // ── Reconciliation ─────────────────────────────────────────
  const { data: reconcileData, refetch: refetchReconcile } = useApiQuery<any>(
    ["admin", "mt5Reconcile"],
    "/api/trading/admin/reconcile/history",
  );
  const runReconcile = useApiMutation<any, any>("post", "/api/trading/admin/reconcile", {
    invalidateKeys: [["admin", "mt5Reconcile"], ["admin", "mt5Status"]],
  });
  const [reconciling, setReconciling] = useState(false);

  const [showSecrets, setShowSecrets] = useState(false);

  const cfg = statusData?.config || {};
  const queueStats = statusData?.queue || queueData?.stats || { pending: 0, done: 0, failed: 0, total: 0 };
  const reconcileStatus = statusData?.reconciliation || null;

  const handleSaveConfig = async () => {
    if (!form) return;
    try {
      await saveConfig.mutateAsync({
        enabled: form.enabled,
        baseUrls: form.baseUrls.split(",").map((s: string) => s.trim()).filter(Boolean),
        apiKey: form.apiKey,
        managerLogin: form.managerLogin,
        managerPassword: form.managerPassword,
        group: form.group,
        leverage: Number(form.leverage),
        serverName: form.serverName,
        requestTimeoutMs: Number(form.requestTimeoutMs),
        maxRetries: Number(form.maxRetries),
        retryBaseDelayMs: Number(form.retryBaseDelayMs),
        reconciliationTolerance: Number(form.reconciliationTolerance),
      });
      toast.success("MT5 gateway config saved");
      refetchStatus();
      refetchConfig();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save MT5 config");
    }
  };

  const handleTestConnection = async () => {
    setTestResult(null);
    try {
      const res = await testConnection.mutateAsync({});
      setTestResult(res);
      if (res.ok) {
        toast.success(res.mode === "simulated" ? "Simulated provider active" : `Gateway reachable (${res.latencyMs}ms)`);
      } else {
        toast.error(res.message || "Gateway unreachable");
      }
    } catch (e: any) {
      setTestResult({ ok: false, message: e?.message || "Connection test failed" });
      toast.error(e?.message || "Connection test failed");
    }
  };

  const handleProcessQueue = async () => {
    setProcessingQueue(true);
    try {
      const res = await processQueue.mutateAsync({ ignoreBackoff: true, limit: 50 });
      toast.success(`Processed ${res.processed} job(s) — ${res.succeeded} ok, ${res.failed} failed`);
      refetchQueue();
      refetchStatus();
    } catch (e: any) {
      toast.error(e?.message || "Failed to process queue");
    }
    setProcessingQueue(false);
  };

  const handleRetryAll = async () => {
    try {
      const res = await retryJob.mutateAsync({});
      toast.success(`Reset ${res.retried} failed job(s) to pending`);
      refetchQueue();
      refetchStatus();
    } catch (e: any) {
      toast.error(e?.message || "Failed to retry jobs");
    }
  };

  const handleRunReconcile = async () => {
    setReconciling(true);
    try {
      const res = await runReconcile.mutateAsync({});
      toast.success(
        `Reconciliation: ${res.total} checked — ${res.matched} matched, ${res.mismatch} mismatch, ${res.unavailable} unavailable`,
      );
      refetchReconcile();
      refetchStatus();
    } catch (e: any) {
      toast.error(e?.message || "Reconciliation failed");
    }
    setReconciling(false);
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Infrastructure"
        title="MT5 Manager"
        subtitle="Provision accounts, monitor the gateway, retry queue, and reconciliation"
        actions={
          tab === "accounts" ? (
            <Button size="sm" className="text-xs" onClick={() => setShowCreate(true)}>
              <Plus className="h-3 w-3 mr-1" /> Create Account
            </Button>
          ) : undefined
        }
      />

      {/* Connector status banner */}
      <div className="card-subtle p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={`h-8 w-8 rounded-md flex items-center justify-center ${statusData?.providerMode === "gateway" ? "bg-emerald-500/10" : "bg-secondary"}`}>
            <Cable className={`h-4 w-4 ${statusData?.providerMode === "gateway" ? "text-emerald-500" : "text-muted-foreground"}`} />
          </div>
          <div>
            <div className="text-sm font-medium">
              {statusData?.providerMode === "gateway" ? "Live MT5 Gateway" : "Simulated Provider"}
            </div>
            <div className="text-xs text-muted-foreground">
              {statusData?.providerMode === "gateway"
                ? `Connected via ${cfg.baseUrls?.length || 0} endpoint(s) · ${cfg.serverName || "server"}`
                : "No gateway configured — sync uses simulated data. Configure below to go live."}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div><span className="font-medium text-foreground">{queueStats.pending ?? 0}</span> queued</div>
          <div><span className="font-medium text-foreground">{queueStats.failed ?? 0}</span> failed</div>
          <div>
            {reconcileStatus
              ? `Last reconcile: ${new Date(reconcileStatus.lastRunAt).toLocaleString()}`
              : "No reconciliation yet"}
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="border border-border bg-transparent p-0.5">
          <TabsTrigger value="accounts" className="text-xs data-[state=active]:bg-secondary gap-1.5"><Server className="h-3 w-3" /> Accounts</TabsTrigger>
          <TabsTrigger value="connector" className="text-xs data-[state=active]:bg-secondary gap-1.5"><Cable className="h-3 w-3" /> Connector</TabsTrigger>
          <TabsTrigger value="queue" className="text-xs data-[state=active]:bg-secondary gap-1.5"><Activity className="h-3 w-3" /> Retry Queue {queueStats.pending > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}</TabsTrigger>
          <TabsTrigger value="reconcile" className="text-xs data-[state=active]:bg-secondary gap-1.5"><RefreshCcw className="h-3 w-3" /> Reconciliation</TabsTrigger>
          <TabsTrigger value="rules" className="text-xs data-[state=active]:bg-secondary gap-1.5"><Gavel className="h-3 w-3" /> Rule Engine</TabsTrigger>
          <TabsTrigger value="news" className="text-xs data-[state=active]:bg-secondary gap-1.5"><Newspaper className="h-3 w-3" /> News Calendar</TabsTrigger>
        </TabsList>

        {/* ─── ACCOUNTS TAB ─────────────────────────────── */}
        <TabsContent value="accounts" className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card-subtle p-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center"><Server className="h-4 w-4 text-muted-foreground" /></div>
              <div><div className="text-lg font-medium">{stats.total}</div><div className="text-[10px] text-muted-foreground">Total Accounts</div></div>
            </div>
            <div className="card-subtle p-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-md bg-emerald-500/10 flex items-center justify-center"><Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /></div>
              <div><div className="text-lg font-medium">{stats.active}</div><div className="text-[10px] text-muted-foreground">Active</div></div>
            </div>
            <div className="card-subtle p-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-md bg-amber-500/10 flex items-center justify-center"><ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" /></div>
              <div><div className="text-lg font-medium">{stats.suspended}</div><div className="text-[10px] text-muted-foreground">Suspended</div></div>
            </div>
            <div className="card-subtle p-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-md bg-blue-500/10 flex items-center justify-center"><Wallet className="h-4 w-4 text-blue-600 dark:text-blue-400" /></div>
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
                  try {
                    const res = await createAccount.mutateAsync({ userId: parseInt(selectedUser) });
                    toast.success(`Account ${res.login} created (${res.provisioned})`);
                  } catch (e: any) {
                    toast.error(e?.message || "Failed to create account");
                  }
                  setShowCreate(false); refetch();
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
              <EmptyList
                icon={<Server className="h-5 w-5" />}
                title="No MT5 accounts found"
                hint="Accounts appear here once a challenge is funded, or you can provision one manually with Create Account."
              />
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
        </TabsContent>

        {/* ─── CONNECTOR TAB ────────────────────────────── */}
        <TabsContent value="connector" className="space-y-6">
          {/* Status */}
          <div className="card-subtle p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-2 w-2 rounded-full ${statusData?.configured ? "bg-emerald-500" : "bg-yellow-500"}`} />
              <div>
                <div className="text-sm font-medium">Gateway Status</div>
                <div className="text-xs text-muted-foreground">
                  {statusData?.configured
                    ? `Configured (${statusData.providerMode}) — sync pulls live MT5 data`
                    : "Not configured — sync uses simulated data"}
                </div>
              </div>
            </div>
            <Button size="sm" variant="outline" className="text-xs" onClick={handleTestConnection} disabled={testConnection.isPending}>
              {testConnection.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Cable className="h-3 w-3 mr-1" />}
              Test Connection
            </Button>
          </div>

          {testResult && (
            <div className={`card-subtle p-4 flex items-start gap-3 ${testResult.ok ? "border-emerald-500/20" : "border-red-500/20"}`}>
              {testResult.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />}
              <div>
                <div className={`text-xs font-medium ${testResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {testResult.ok ? `Connected (${testResult.latencyMs}ms)` : "Connection failed"}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">{testResult.message}</div>
              </div>
            </div>
          )}

          {/* Config form */}
          <div className="card-subtle p-6 space-y-5">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <Cable className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Manager API Gateway Connection</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">Enable gateway</span>
                <Switch
                  checked={form?.enabled ?? false}
                  onCheckedChange={(v) => setForm((f: any) => ({ ...f, enabled: v }))}
                />
              </div>
            </div>

            {form && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Gateway Base URL(s) — comma-separated for failover</label>
                  <Input
                    value={form.baseUrls}
                    onChange={(e) => setForm((f: any) => ({ ...f, baseUrls: e.target.value }))}
                    placeholder="https://mt5-gw-1.internal:8443, https://mt5-gw-2.internal:8443"
                    className="text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    The gateway wraps the MT5 Manager API (native protocol) and exposes the JSON contract. Requests fail over across these URLs.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">API Key</label>
                    <div className="relative">
                      <Input
                        type={showSecrets ? "text" : "password"}
                        value={form.apiKey}
                        onChange={(e) => setForm((f: any) => ({ ...f, apiKey: e.target.value }))}
                        placeholder={cfg.hasApiKey ? `••••••${cfg.apiKeyLast4 || ""} (leave blank to keep)` : "Gateway bearer token"}
                        className="text-xs font-mono pr-10"
                      />
                      <button
                        onClick={() => setShowSecrets(!showSecrets)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-secondary rounded"
                      >
                        {showSecrets ? <EyeOff className="h-3 w-3 text-muted-foreground" /> : <Eye className="h-3 w-3 text-muted-foreground" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Manager Login</label>
                    <Input value={form.managerLogin} onChange={(e) => setForm((f: any) => ({ ...f, managerLogin: e.target.value }))} className="text-xs font-mono" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Manager Password</label>
                    <div className="relative">
                      <Input
                        type={showSecrets ? "text" : "password"}
                        value={form.managerPassword}
                        onChange={(e) => setForm((f: any) => ({ ...f, managerPassword: e.target.value }))}
                        placeholder={cfg.hasManagerPassword ? "•••••• (leave blank to keep)" : "Manager API password"}
                        className="text-xs font-mono pr-10"
                      />
                      <button
                        onClick={() => setShowSecrets(!showSecrets)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-secondary rounded"
                      >
                        {showSecrets ? <EyeOff className="h-3 w-3 text-muted-foreground" /> : <Eye className="h-3 w-3 text-muted-foreground" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Server Display Name</label>
                    <Input value={form.serverName} onChange={(e) => setForm((f: any) => ({ ...f, serverName: e.target.value }))} className="text-xs font-mono" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Default Group</label>
                    <Input value={form.group} onChange={(e) => setForm((f: any) => ({ ...f, group: e.target.value }))} className="text-xs font-mono" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Default Leverage</label>
                    <Input type="number" value={form.leverage} onChange={(e) => setForm((f: any) => ({ ...f, leverage: e.target.value }))} className="text-xs font-mono" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Request Timeout (ms)</label>
                    <Input type="number" value={form.requestTimeoutMs} onChange={(e) => setForm((f: any) => ({ ...f, requestTimeoutMs: e.target.value }))} className="text-xs font-mono" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Max Retries</label>
                    <Input type="number" value={form.maxRetries} onChange={(e) => setForm((f: any) => ({ ...f, maxRetries: e.target.value }))} className="text-xs font-mono" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Retry Base Delay (ms)</label>
                    <Input type="number" value={form.retryBaseDelayMs} onChange={(e) => setForm((f: any) => ({ ...f, retryBaseDelayMs: e.target.value }))} className="text-xs font-mono" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Reconciliation Tolerance ($)</label>
                    <Input type="number" step="0.01" value={form.reconciliationTolerance} onChange={(e) => setForm((f: any) => ({ ...f, reconciliationTolerance: e.target.value }))} className="text-xs font-mono" />
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <Button size="sm" className="text-xs" onClick={handleSaveConfig} disabled={saveConfig.isPending}>
                    {saveConfig.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Cable className="h-3 w-3 mr-1" />}
                    Save Gateway Config
                  </Button>
                  {statusData?.lastSyncAt && (
                    <span className="text-[10px] text-muted-foreground">
                      Last account sync: {new Date(statusData.lastSyncAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ─── RETRY QUEUE TAB ──────────────────────────── */}
        <TabsContent value="queue" className="space-y-6">
          <div className="grid grid-cols-4 gap-3">
            <div className="card-subtle p-3"><div className="text-lg font-medium">{queueStats.pending ?? 0}</div><div className="text-[10px] text-muted-foreground">Pending</div></div>
            <div className="card-subtle p-3"><div className="text-lg font-medium">{queueStats.done ?? 0}</div><div className="text-[10px] text-muted-foreground">Done</div></div>
            <div className="card-subtle p-3"><div className="text-lg font-medium">{queueStats.failed ?? 0}</div><div className="text-[10px] text-muted-foreground">Failed</div></div>
            <div className="card-subtle p-3"><div className="text-lg font-medium">{queueStats.total ?? 0}</div><div className="text-[10px] text-muted-foreground">Total Jobs</div></div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" className="text-xs" onClick={handleProcessQueue} disabled={processingQueue}>
              {processingQueue ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Activity className="h-3 w-3 mr-1" />}
              Process Queue Now
            </Button>
            <Button size="sm" variant="outline" className="text-xs" onClick={handleRetryAll} disabled={retryJob.isPending}>
              <RefreshCcw className="h-3 w-3 mr-1" /> Retry All Failed
            </Button>
          </div>

          <div className="space-y-1">
            {(queueData?.items || []).length === 0 ? (
              <EmptyList
                icon={<Activity className="h-5 w-5" />}
                title="Queue is empty"
                hint="Sync jobs that fail (for example, a gateway timeout) land here and are retried with backoff."
              />
            ) : (
              (queueData?.items || []).map((job: any) => (
                <div key={job.id} className="card-subtle p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant={job.status === "done" ? "default" : job.status === "failed" ? "destructive" : "secondary"} className="text-[10px] shrink-0">{job.status}</Badge>
                    <div className="min-w-0">
                      <div className="text-xs font-medium">{job.action} · MT5 #{job.mt5AccountId}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{job.error || `Attempts: ${job.retryCount}/${job.maxRetries}`}</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(job.createdAt).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        {/* ─── RECONCILIATION TAB ───────────────────────── */}
        <TabsContent value="reconcile" className="space-y-6">
          <div className="card-subtle p-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Reconciliation</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {reconcileStatus
                  ? `Last run: ${new Date(reconcileStatus.lastRunAt).toLocaleString()} · ${reconcileStatus.totalEntries} entries recorded`
                  : "No reconciliation has been run yet"}
              </div>
            </div>
            <Button size="sm" className="text-xs" onClick={handleRunReconcile} disabled={reconciling}>
              {reconciling ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCcw className="h-3 w-3 mr-1" />}
              Run Reconciliation
            </Button>
          </div>

          <div className="space-y-1">
            {(reconcileData?.items || []).length === 0 ? (
              <EmptyList
                icon={<RefreshCcw className="h-5 w-5" />}
                title="No reconciliation entries yet"
                hint="Run a reconciliation to compare live MT5 balances against the values stored locally."
              />
            ) : (
              (reconcileData?.items || []).map((entry: any) => (
                <div key={entry.id} className="card-subtle p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant={entry.status === "matched" ? "default" : entry.status === "mismatch" ? "destructive" : "secondary"} className="text-[10px] shrink-0">{entry.status}</Badge>
                    <div className="min-w-0">
                      <div className="text-xs font-medium">#{entry.login} · diff {entry.difference >= 0 ? "+" : ""}{entry.difference}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        server ${entry.serverBalance?.toLocaleString()} vs local ${entry.localBalance?.toLocaleString()} · {entry.source}
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground shrink-0">{new Date(entry.recordedAt).toLocaleString()}</div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        {/* ─── RULE ENGINE TAB ────────────────────────────── */}
        <TabsContent value="rules" className="space-y-6">
          <RuleEnginePanel />
        </TabsContent>

        {/* ─── NEWS CALENDAR TAB ────────────────────────── */}
        <TabsContent value="news" className="space-y-6">
          <NewsCalendarPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Consistent empty state for the list panels — icon, title and optional hint.
 */
function EmptyList({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="card-subtle px-6 py-10 flex flex-col items-center justify-center gap-2.5 text-center">
      <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-xs text-muted-foreground max-w-sm">{hint}</p>}
    </div>
  );
}

/**
 * Rule Engine ops view — active/non-terminal challenges with their template
 * rules and the violations the engine recorded (see GET /api/trading/admin/rules).
 */
function RuleEnginePanel() {
  const { data, isLoading } = useApiQuery<any>(["admin", "mt5", "rules"], "/api/trading/admin/rules");
  const challenges: any[] = data?.challenges || [];

  const statusVariant = (status: string) =>
    status === "violated" ? "destructive" : status === "active" ? "default" : "secondary";

  const ruleChips = (rules: any) => {
    if (!rules) return <span className="text-[10px] text-muted-foreground">No template</span>;
    const chips: string[] = [];
    chips.push(`DD ${rules.maxDrawdown}% / daily ${rules.dailyDrawdown}%`);
    if (rules.consistencyTarget) chips.push(`Consistency ≤${rules.consistencyTarget}%`);
    if (rules.maxPositionSize) chips.push(`Max pos ${rules.maxPositionSize} lots`);
    if (!rules.allowEATrading) chips.push("No EA");
    if (!rules.allowCopyTrading) chips.push("No copy");
    if (!rules.allowNewsTrading) {
      const before = rules.newsBlackoutBeforeMinutes ?? 15;
      const after = rules.newsBlackoutAfterMinutes ?? 15;
      chips.push(before === after ? `No news ${before}m` : `No news ${before}m/${after}m`);
    }
    if (!rules.allowWeekendHolding) chips.push("No weekend");
    return chips.join(" · ");
  };

  if (isLoading) {
    return <div className="card-subtle p-8 text-center text-muted-foreground text-xs flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading rule engine…</div>;
  }

  if (challenges.length === 0) {
    return (
      <div className="card-subtle p-8 text-center text-muted-foreground text-xs">
        No active challenges — rules are evaluated automatically after each metrics sync.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="card-subtle p-4 text-xs text-muted-foreground flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
        <span>
          Rules are evaluated automatically after each metrics sync. Hard violations (drawdowns, consistency,
          position size, weekend/news/EA/copy-trading) terminate the challenge, suspend the account, notify the
          trader, and are recorded in the audit trail as <code className="text-foreground">challenge.violated</code>.
        </span>
      </div>

      {challenges.map((ch: any) => (
        <div key={ch.challengeId} className="card-subtle p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{ch.label || `Challenge #${ch.challengeId}`}</span>
                <Badge variant={statusVariant(ch.status) as any} className="text-[10px]">{ch.status}</Badge>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {ch.trader?.name || ch.trader?.email || `User #${ch.trader?.id}`} · ${ch.accountSize?.toLocaleString()} · phase {ch.currentPhase ?? 1}
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground shrink-0">
              Updated {ch.updatedAt ? new Date(ch.updatedAt).toLocaleString() : "—"}
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-border p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Enforced rules</div>
              <div className="text-xs">{ruleChips(ch.rules)}</div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Latest metrics</div>
              {ch.latestMetrics ? (
                <div className="text-xs space-y-0.5">
                  <div>Balance <span className="font-medium">${ch.latestMetrics.balance?.toLocaleString()}</span> · Equity <span className="font-medium">${ch.latestMetrics.equity?.toLocaleString()}</span></div>
                  <div>Total profit <span className={ch.latestMetrics.totalProfit >= 0 ? "text-emerald-600" : "text-red-500"}>${ch.latestMetrics.totalProfit?.toLocaleString()}</span> · target {ch.latestMetrics.profitTargetProgress?.toFixed(0)}%</div>
                  <div>Drawdown <span className="font-medium">${ch.latestMetrics.currentDrawdown?.toLocaleString()}</span> · daily ${ch.latestMetrics.dailyDrawdown?.toLocaleString()} · {ch.latestMetrics.tradingDaysCount} day(s)</div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">No sync yet</div>
              )}
            </div>
          </div>

          {(ch.violations || []).length > 0 && (
            <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/5 p-3">
              <div className="text-[10px] uppercase tracking-wide text-red-500 mb-1.5 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Violations
              </div>
              <div className="space-y-1">
                {(ch.violations || []).map((v: any, i: number) => (
                  <div key={i} className="text-xs flex items-start gap-2">
                    <Badge variant="destructive" className="text-[10px] shrink-0">{v.code || v.type}</Badge>
                    <span className="text-muted-foreground min-w-0">{v.message || `Rule ${v.code || v.type} violated`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  NEWS CALENDAR — the high-impact event feed the rule engine's news-trading
//  rule consumes (settings key `news_calendar`, a JSON array of events).
//  Previously only editable via raw settings JSON — this panel gives admins a
//  proper editor: add / remove events, mark impact, save with audit trail.
// ═══════════════════════════════════════════════════════════════════════════

interface NewsEvent {
  /** Epoch ms — when the release lands. */
  at: number;
  impact: "high" | "medium" | "low";
  /** Human-readable label, e.g. "US Non-Farm Payrolls". */
  title?: string;
}

const IMPACT_ORDER: NewsEvent["impact"][] = ["high", "medium", "low"];

const IMPACT_BADGE: Record<NewsEvent["impact"], string> = {
  high: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  low: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
};

/** Normalize raw feed rows (settings JSON) into typed events; impact defaults to high. */
function parseNewsEvents(raw: any[]): NewsEvent[] {
  return raw
    .filter((e: any) => e && typeof e.at === "number" && Number.isFinite(e.at))
    .map((e: any) => ({
      at: e.at,
      impact: IMPACT_ORDER.includes(e.impact) ? e.impact : "high",
      title: typeof e.title === "string" && e.title.trim() ? e.title : undefined,
    }));
}

/** Format an epoch ms value into an <input type="datetime-local"> value (local time). */
function toLocalInput(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse an <input type="datetime-local"> value (local time) into epoch ms. */
function fromLocalInput(v: string): number {
  return v ? new Date(v).getTime() : Number.NaN;
}

function formatEventTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Compact relative countdown — "in 3h", "12m ago", "now". */
function relativeFromNow(ts: number, now: number): string {
  const diff = ts - now;
  if (Math.abs(diff) < 60_000) return "now";
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  if (mins < 60) return diff >= 0 ? `in ${mins}m` : `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return diff >= 0 ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return diff >= 0 ? `in ${days}d` : `${days}d ago`;
}

/**
 * News Calendar editor — reads/writes the `news_calendar` settings row via the
 * generic audited settings endpoints (GET/PUT /api/seed/settings). High-impact
 * events are the ones the rule engine enforces; medium/low are informational.
 */
function NewsCalendarPanel() {
  const { data: settings, isLoading } = useApiQuery<any[]>(
    ["admin", "mt5", "news-calendar"],
    "/api/seed/settings"
  );

  const [events, setEvents] = useState<NewsEvent[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);

  // Snapshot of "now" refreshed every 30s — keeps the next-event countdown
  // fresh without calling Date.now() during render (React purity).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const [newAt, setNewAt] = useState("");
  const [newImpact, setNewImpact] = useState<NewsEvent["impact"]>("high");
  const [newTitle, setNewTitle] = useState("");

  // Hydrate the local editors from the settings row exactly once. This is the
  // React-sanctioned render-phase "adjust state when data arrives" pattern —
  // later cache refreshes are ignored so unsaved local edits survive.
  const serverRow = settings?.find((s: any) => s.key === "news_calendar");
  const serverEvents = serverRow && Array.isArray(serverRow.value) ? serverRow.value : [];
  if (hydratedKey === null && !isLoading) {
    const parsed = parseNewsEvents(serverEvents);
    setEvents(parsed);
    setSavedSnapshot(JSON.stringify([...parsed].sort((a, b) => a.at - b.at)));
    setNewAt(toLocalInput(now + 24 * 60 * 60 * 1000));
    setHydratedKey("hydrated");
  }

  const save = useApiMutation<any, any>("put", "/api/seed/settings/news_calendar", {
    invalidateKeys: [["admin", "mt5", "news-calendar"]],
    onSuccess: () => {
      toast.success("News calendar saved — the rule engine picks it up on the next metrics sync");
    },
  });

  const sorted = [...events].sort((a, b) => a.at - b.at);
  const dirty = JSON.stringify(sorted) !== savedSnapshot;
  const highCount = sorted.filter((e) => e.impact === "high").length;
  const next = sorted.find((e) => e.at >= now);

  const addEvent = () => {
    const at = fromLocalInput(newAt);
    if (!Number.isFinite(at)) {
      toast.error("Pick a valid date and time for the event");
      return;
    }
    setEvents((prev) => [...prev, { at, impact: newImpact, title: newTitle.trim() || undefined }]);
    setNewTitle("");
    setNewAt(toLocalInput(at + 24 * 60 * 60 * 1000));
  };

  const removeEvent = (index: number) => {
    setEvents((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    save.mutate({ value: sorted, group: "mt5" });
    setSavedSnapshot(JSON.stringify(sorted));
  };

  const handleClearAll = () => {
    setEvents([]);
  };

  if (isLoading) {
    return <div className="card-subtle p-8 text-center text-muted-foreground text-xs flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading news calendar…</div>;
  }

  return (
    <div className="space-y-6">
      {/* How the feed is enforced */}
      <div className="card-subtle p-4 text-xs text-muted-foreground flex items-start gap-2">
        <Newspaper className="h-4 w-4 shrink-0 mt-0.5 text-sky-500" />
        <span>
          This feed powers the rule engine's <code className="text-foreground">news_trading</code> rule: when a
          challenge template disables news trading, any position opened within the template's configured blackout
          window (default <b className="text-foreground/80">±15 minutes</b>, set on Admin → Challenges) of a{" "}
          <span className="font-medium text-red-600 dark:text-red-400">high-impact</span> event violates the rule.
          Medium/low events are informational only. Changes save through the audited settings endpoint and are recorded
          in the audit trail as <code className="text-foreground">settings.updated</code>.
        </span>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card-subtle p-3">
          <div className="text-lg font-medium">{sorted.length}</div>
          <div className="text-[10px] text-muted-foreground">Configured events</div>
        </div>
        <div className="card-subtle p-3">
          <div className="text-lg font-medium text-red-600 dark:text-red-400">{highCount}</div>
          <div className="text-[10px] text-muted-foreground">High-impact (enforced)</div>
        </div>
        <div className="card-subtle p-3">
          <div className="text-sm font-medium truncate">{next ? formatEventTime(next.at) : "—"}</div>
          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {next ? `Next event ${relativeFromNow(next.at, now)}` : "Nothing scheduled"}
          </div>
        </div>
      </div>

      {/* Add event */}
      <div className="card-subtle p-5 space-y-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Add news event</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_auto_1.4fr_auto] items-end">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Date &amp; time (local)</label>
            <Input
              type="datetime-local"
              value={newAt}
              onChange={(e) => setNewAt(e.target.value)}
              className="text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Impact</label>
            <div className="flex rounded-md border border-border p-0.5">
              {IMPACT_ORDER.map((imp) => (
                <button
                  key={imp}
                  type="button"
                  onClick={() => setNewImpact(imp)}
                  className={`rounded px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    newImpact === imp
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {imp}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Event label (optional)</label>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addEvent()}
              placeholder="e.g. US Non-Farm Payrolls"
              className="text-xs"
            />
          </div>
          <Button size="sm" className="text-xs" onClick={addEvent}>
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
      </div>

      {/* Configured events */}
      <div className="card-subtle p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Configured events</h3>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={handleClearAll} disabled={sorted.length === 0}>
              <Trash2 className="h-3 w-3 mr-1" /> Clear all
            </Button>
            <Button size="sm" className="text-xs" onClick={handleSave} disabled={!dirty || save.isPending}>
              {save.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
              {save.isPending ? "Saving…" : "Save feed"}
            </Button>
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="card-subtle p-8 text-center text-muted-foreground text-xs">
            No events configured — the news-trading rule stays dormant until you add high-impact releases.
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((ev, i) => (
              <div key={`${ev.at}-${i}`} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      ev.impact === "high" ? "bg-red-500" : ev.impact === "medium" ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">
                      {ev.title || (ev.impact === "high" ? "High-impact news release" : `${ev.impact}-impact news release`)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {formatEventTime(ev.at)} · {relativeFromNow(ev.at, now)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase ${IMPACT_BADGE[ev.impact]}`}>
                    {ev.impact}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeEvent(i)}
                    className="text-muted-foreground hover:text-red-500 transition-colors"
                    title="Remove event"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <div className={`text-[10px] ${dirty ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
            {dirty
              ? "Unsaved changes — the rule engine still uses the last saved feed"
              : "All changes saved — enforced on the next metrics sync"}
          </div>
        </div>
      </div>
    </div>
  );
}
