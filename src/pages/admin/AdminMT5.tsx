/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
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
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-medium tracking-tight">MT5 Manager</h1><p className="text-xs text-muted-foreground mt-1">Provision accounts, monitor the gateway, retry queue, and reconciliation</p></div>
        {tab === "accounts" && (
          <Button size="sm" className="text-xs" onClick={() => setShowCreate(true)}><Plus className="h-3 w-3 mr-1" /> Create Account</Button>
        )}
      </div>

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
              <div className="card-subtle p-8 text-center text-muted-foreground text-xs">Queue is empty</div>
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
              <div className="card-subtle p-8 text-center text-muted-foreground text-xs">No reconciliation entries yet — run one to compare live balances against stored values</div>
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
      </Tabs>
    </div>
  );
}
