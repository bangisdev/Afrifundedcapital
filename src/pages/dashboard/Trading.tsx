/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useResetOnChange } from "@/hooks/use-reset-on-change";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Loader2, TrendingUp, TrendingDown, Minus, Server,
  Activity, BarChart3, Sparkles, RefreshCw,
  ArrowUp, ArrowDown, ArrowUpDown,
} from "lucide-react";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { useMemo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

const chartConfig = {
  balance: { label: "Balance", color: "var(--chart-1)" },
  equity: { label: "Equity", color: "var(--chart-2)" },
  drawdown: { label: "Drawdown", color: "var(--destructive)" },
};

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function MetricCard({ label, value, trend, subtitle, destructive }: {
  label: string; value: string; trend?: "up" | "down" | "neutral"; subtitle?: string; destructive?: boolean;
}) {
  return (
    <div className="card-subtle p-4 space-y-1.5">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${destructive ? "text-destructive" : ""}`}>{value}</div>
      {(trend || subtitle) && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {trend === "up" && <TrendingUp className="h-3 w-3 text-foreground" />}
          {trend === "down" && <TrendingDown className="h-3 w-3 text-destructive" />}
          {trend === "neutral" && <Minus className="h-3 w-3 text-muted-foreground" />}
          {subtitle && <span>{subtitle}</span>}
        </div>
      )}
    </div>
  );
}

export default function Trading() {
  const { user } = useAuth();
  const { data: challengesData, isLoading: cLoading } = useApiQuery<any>(["challenges", "my"], "/api/challenges/my");
  const challenges = useMemo(() => challengesData?.challenges || [], [challengesData]);
  const { data: metrics } = useApiQuery<any>(["metrics", "dashboard"], "/api/challenges/metrics");
  const { data: metricsHistory, isLoading: mLoading } = useApiQuery<any[]>(["metrics", "history"], "/api/challenges/my/0/metrics");
  const [mt5Page, setMt5Page] = useState(1);
  const [mt5PageSize, setMt5PageSize] = useState(10);
  const [mt5SortBy, setMt5SortBy] = useState("createdAt");
  const [mt5SortOrder, setMt5SortOrder] = useState<"asc" | "desc">("desc");
  const mt5Params = new URLSearchParams();
  mt5Params.set("page", String(mt5Page));
  mt5Params.set("pageSize", String(mt5PageSize));
  mt5Params.set("sortBy", mt5SortBy);
  mt5Params.set("sortOrder", mt5SortOrder);
  const mt5Query = `/api/trading/mt5?${mt5Params.toString()}`;
  const { data: mt5Data, isLoading: mt5Loading } = useApiQuery<any>(["mt5", "my", mt5Query], mt5Query);
  const mt5Accounts = useMemo(() => mt5Data?.accounts || [], [mt5Data]);
  const mt5Total = mt5Data?.total || 0;
  const mt5TotalPages = mt5Data?.totalPages || 1;
  const seedMutation = useApiMutation<any, any>("post", "/api/trading/seed-demo");
  const syncMutation = useApiMutation<any, any>("post", "/api/trading/sync");
  const [seeding, setSeeding] = useState(false);
  const [autoSeeding, setAutoSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);
  const autoSeedingRef = useRef(false);
  const autoSyncedRef = useRef(false);

  // Reset to first page whenever page size or sort changes
  useResetOnChange([mt5PageSize, mt5SortBy, mt5SortOrder], () => {
    setMt5Page(1);
  });

  // Sortable columns matching the server whitelist for /api/trading/mt5
  const MT5_SORT_COLUMNS: Array<{ key: string; label: string }> = [
    { key: "login", label: "Login" },
    { key: "balance", label: "Balance" },
    { key: "equity", label: "Equity" },
    { key: "leverage", label: "Leverage" },
    { key: "server", label: "Server" },
    { key: "createdAt", label: "Created" },
  ];

  const handleMt5Sort = (key: string) => {
    if (mt5SortBy === key) {
      setMt5SortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setMt5SortBy(key);
      setMt5SortOrder("desc");
    }
  };

  // Clamp page if the current page exceeds total pages
  useResetOnChange([mt5TotalPages, mt5Page], () => setMt5Page(1), mt5Page > mt5TotalPages && mt5TotalPages > 0);

  const isLoading = cLoading || mLoading || mt5Loading;

  useEffect(() => {
    if (!isLoading && !user?.isDemoSeeded && (challenges?.length || 0) > 0 && (mt5Accounts?.length || 0) > 0 && (metricsHistory?.length || 0) === 0 && !autoSeedingRef.current) {
      autoSeedingRef.current = true;
      setAutoSeeding(true);
      seedMutation.mutateAsync({ challengeId: challenges![0].id })
        .then((result: any) => {
          const msg = result?.message || "Demo data generated";
          setSeedResult(msg);
          toast.success("Demo data generated", { description: msg });
        })
        .catch((e: any) => {
          setSeedResult(`Error: ${e.message}`);
          toast.error("Demo data generation failed", { description: e.message });
        })
        .finally(() => setAutoSeeding(false));
    }
  }, [isLoading, user?.isDemoSeeded, challenges, mt5Accounts, metricsHistory, seedMutation]);

  const handleSeedDemoData = async () => {
    if (autoSeeding || !challenges?.length) return;
    setSeeding(true);
    try {
      const result = await seedMutation.mutateAsync({ challengeId: challenges[0].id });
      setSeedResult(result?.message || "Seeded");
      toast.success("Demo data generated");
    } catch (e: any) {
      setSeedResult(`Error: ${e.message}`);
      toast.error("Demo data failed");
    } finally { setSeeding(false); }
  };

  const isSeeding = seeding || autoSeeding;
  const [syncing, setSyncing] = useState(false);

  // Auto-sync active challenges on load (once per session)
  useEffect(() => {
    if (!isLoading && (challenges?.length || 0) > 0 && !syncing && !autoSyncedRef.current) {
      autoSyncedRef.current = true;
      syncMutation.mutateAsync({}).catch(() => {});
    }
  }, [isLoading, challenges, syncing, syncMutation]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncMutation.mutateAsync({});
      if (result?.synced > 0) {
        toast.success(`Synced ${result.synced} challenge(s) with latest metrics`);
      }
    } catch {
      // Silently ignore sync errors
    }
    setSyncing(false);
  };

  const chartData = useMemo(() => {
    if (!metricsHistory || metricsHistory.length === 0) return [];
    const step = Math.max(1, Math.floor(metricsHistory.length / 50));
    return metricsHistory.filter((_: any, i: number) => i % step === 0).map((m: any) => ({
      time: formatDate(m.recordedAt), balance: m.balance, equity: m.equity, drawdown: m.currentDrawdown,
    }));
  }, [metricsHistory]);

  const drawdownData = useMemo(() => {
    if (!metricsHistory || metricsHistory.length === 0) return [];
    const step = Math.max(1, Math.floor(metricsHistory.length / 50));
    return metricsHistory.filter((_: any, i: number) => i % step === 0).map((m: any) => ({
      time: formatDate(m.recordedAt), drawdown: m.currentDrawdown, dailyDrawdown: m.dailyDrawdown,
    }));
  }, [metricsHistory]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const activeChallenges = (challenges || []).filter((c: any) => c.status === "active");
  const fundedChallenges = (challenges || []).filter((c: any) => c.status === "funded");
  const latestMetrics = metrics?.latestMetrics;
  const hasCharts = chartData.length > 0;
  const totalBalance = (mt5Accounts || []).reduce((sum: number, a: any) => sum + (a.balance || 0), 0);
  const totalEquity = (mt5Accounts || []).reduce((sum: number, a: any) => sum + (a.equity || 0), 0);
  const floatingPL = totalEquity - totalBalance;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Trading</h1>
          <p className="text-xs text-muted-foreground mt-1">Monitor your trading performance, account details, and real-time metrics</p>
        </div>
        <Button variant="outline" size="sm" className="text-xs" onClick={handleSync} disabled={syncing}>
          {syncing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          {syncing ? "Syncing..." : "Sync Now"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total Balance" value={`$${totalBalance.toLocaleString()}`} />
        <MetricCard label="Total Equity" value={`$${totalEquity.toLocaleString()}`} trend={floatingPL >= 0 ? "up" : "down"} subtitle={`Floating: ${floatingPL >= 0 ? "+" : ""}$${floatingPL.toFixed(2)}`} destructive={floatingPL < 0} />
        <MetricCard label="Active Challenges" value={String(activeChallenges.length)} subtitle={fundedChallenges.length > 0 ? `${fundedChallenges.length} funded` : undefined} />
        <MetricCard label="MT5 Accounts" value={String((mt5Accounts || []).length)} subtitle={`${(mt5Accounts || []).filter((a: any) => a.isActive).length} active`} />
      </div>

      {(mt5Accounts || []).length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">MT5 Accounts</h2>
            <div className="flex items-center gap-0.5 flex-wrap" aria-label="Sort MT5 accounts">
              <span className="text-[10px] text-muted-foreground mr-1 hidden sm:inline">Sort:</span>
              {MT5_SORT_COLUMNS.map((col) => {
                const active = mt5SortBy === col.key;
                return (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => handleMt5Sort(col.key)}
                    aria-label={`Sort by ${col.label}`}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1 text-[11px] font-medium transition-colors rounded px-1.5 py-0.5 ${
                      active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {col.label}
                    {active ? (
                      mt5SortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-50" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {(mt5Accounts || []).map((acc: any) => (
              <Card key={acc.id} className="gap-0">
                <CardHeader className="pb-3 flex-row items-center justify-between gap-0">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center"><Server className="h-4 w-4 text-muted-foreground" /></div>
                    <div>
                      <CardTitle className="text-sm font-medium">Account #{acc.login}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">{acc.server} · {acc.currency}</p>
                    </div>
                  </div>
                  <Badge variant={acc.isSuspended ? "destructive" : acc.isActive ? "default" : "secondary"} className="text-[10px]">
                    {acc.isSuspended ? "Suspended" : acc.isActive ? "Active" : "Inactive"}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div><div className="text-muted-foreground mb-0.5">Balance</div><div className="font-medium">${(acc.balance || 0).toLocaleString()}</div></div>
                    <div><div className="text-muted-foreground mb-0.5">Equity</div><div className="font-medium">${(acc.equity || 0).toLocaleString()}</div></div>
                    <div><div className="text-muted-foreground mb-0.5">Leverage</div><div className="font-medium">1:{acc.leverage}</div></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div><div className="text-muted-foreground mb-0.5">Login</div><div className="font-mono text-[11px]">{acc.login}</div></div>
                    <div><div className="text-muted-foreground mb-0.5">Group</div><div className="font-medium truncate">{acc.group}</div></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination footer */}
          <div className="flex items-center justify-between pt-1">
            <div className="text-[10px] text-muted-foreground">Showing {mt5Total === 0 ? 0 : (mt5Page - 1) * mt5PageSize + 1}–{Math.min(mt5Page * mt5PageSize, mt5Total)} of {mt5Total} accounts</div>
            <div className="flex items-center gap-2">
              <select
                value={mt5PageSize}
                onChange={(e) => setMt5PageSize(Number(e.target.value))}
                className="h-7 px-2 rounded-md border border-input bg-background text-[11px] cursor-pointer outline-none"
                aria-label="Rows per page"
              >
                {[10, 25, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
              </select>
              <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" disabled={mt5Page <= 1} onClick={() => setMt5Page((p) => p - 1)}>Prev</Button>
              <span className="px-2 text-[11px] font-medium tabular-nums">{mt5Page} / {mt5TotalPages}</span>
              <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" disabled={mt5Page >= mt5TotalPages} onClick={() => setMt5Page((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </div>
      )}

      {(mt5Accounts || []).length === 0 && !isLoading && (
        <div className="card-subtle p-8 text-center space-y-2">
          <Server className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No MT5 accounts yet. Purchase and start a challenge to get one.</p>
        </div>
      )}

      {hasCharts ? (
        <div className="space-y-6">
          <h2 className="text-sm font-medium">Performance Charts</h2>
          <Card className="gap-0">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Activity className="h-4 w-4 text-muted-foreground" /> Balance & Equity</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="aspect-[2/1] w-full">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} domain={["auto", "auto"]} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="balance" stroke="var(--color-balance)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="equity" stroke="var(--color-equity)" strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                </LineChart>
              </ChartContainer>
              <p className="text-[10px] text-muted-foreground mt-2">Solid line: Balance · Dashed line: Equity</p>
            </CardContent>
          </Card>

          <Card className="gap-0">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><BarChart3 className="h-4 w-4 text-muted-foreground" /> Drawdown Tracker</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="aspect-[2/1] w-full">
                <AreaChart data={drawdownData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} domain={[0, "auto"]} tickFormatter={(v) => `${v.toFixed(1)}%`} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <defs><linearGradient id="drawdownFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-drawdown)" stopOpacity={0.2} /><stop offset="100%" stopColor="var(--color-drawdown)" stopOpacity={0} /></linearGradient></defs>
                  <Area type="monotone" dataKey="drawdown" stroke="var(--color-drawdown)" fill="url(#drawdownFill)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                </AreaChart>
              </ChartContainer>
              <p className="text-[10px] text-muted-foreground mt-2">Current drawdown over time</p>
            </CardContent>
          </Card>
        </div>
      ) : (mt5Accounts || []).length > 0 && (
        <div className="card-subtle p-8 text-center space-y-3">
          {autoSeeding ? (
            <><Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" /><div><p className="text-sm text-muted-foreground">Generating demo trading data…</p></div></>
          ) : (
            <><BarChart3 className="h-8 w-8 mx-auto text-muted-foreground" /><div><p className="text-sm text-muted-foreground">No trading metrics recorded yet.</p></div>
              <Button variant="outline" size="sm" onClick={handleSeedDemoData} disabled={isSeeding} className="gap-1.5">
                {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {seeding ? "Generating…" : "Generate Demo Data"}
              </Button></>
          )}
          {seedResult && <p className={`text-xs ${seedResult.startsWith("Error") ? "text-destructive" : "text-muted-foreground"}`}>{seedResult}</p>}
        </div>
      )}

      {latestMetrics && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium">Current Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Balance" value={`$${latestMetrics.balance.toLocaleString()}`} />
            <MetricCard label="Equity" value={`$${latestMetrics.equity.toLocaleString()}`} />
            <MetricCard label="Floating P/L" value={`${latestMetrics.floatingPL >= 0 ? "+" : ""}$${latestMetrics.floatingPL.toFixed(2)}`} destructive={latestMetrics.floatingPL < 0} />
            <MetricCard label="Total Profit" value={`${latestMetrics.totalProfit >= 0 ? "+" : ""}$${latestMetrics.totalProfit.toFixed(2)}`} destructive={latestMetrics.totalProfit < 0} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Win Rate" value={`${latestMetrics.winRate?.toFixed(1) || 0}%`} />
            <MetricCard label="Profit Factor" value={latestMetrics.profitFactor?.toFixed(2) || "0.00"} trend={latestMetrics.profitFactor > 1 ? "up" : "down"} />
            <MetricCard label="Health Score" value={`${latestMetrics.healthScore || 0}/100`} trend={(latestMetrics.healthScore || 0) > 50 ? "up" : "down"} />
            <MetricCard label="Trading Days" value={String(latestMetrics.tradingDaysCount || 0)} />
          </div>
        </div>
      )}

      {activeChallenges.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium">Active Challenges</h2>
          <div className="grid gap-4">
            {activeChallenges.map((ch: any) => (
              <Card key={ch.id} className="gap-0">
                <CardHeader className="pb-3 flex-row items-center justify-between gap-0">
                  <div>
                    <CardTitle className="text-sm font-medium">${ch.accountSize?.toLocaleString()} — Challenge</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Target: {ch.profitTarget}% · Max DD: {ch.maxDrawdown}% · Leverage: 1:{ch.maxLeverage}</p>
                  </div>
                  <Badge variant="default" className="text-[10px]">Active</Badge>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      )}

      {fundedChallenges.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium">Funded Accounts</h2>
          <div className="grid gap-4">
            {fundedChallenges.map((ch: any) => (
              <Card key={ch.id} className="gap-0">
                <CardHeader className="pb-3 flex-row items-center justify-between gap-0">
                  <div><CardTitle className="text-sm font-medium">${ch.accountSize?.toLocaleString()} Funded Account</CardTitle></div>
                  <Badge variant="default" className="text-[10px] bg-foreground text-background">Funded</Badge>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
