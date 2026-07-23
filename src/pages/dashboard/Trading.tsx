import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Server,
  Key,
  SlidersHorizontal,
  DollarSign,
  Activity,
  BarChart3,
  PieChart,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { useMemo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

const chartConfig = {
  balance: {
    label: "Balance",
    color: "var(--chart-1)",
  },
  equity: {
    label: "Equity",
    color: "var(--chart-2)",
  },
  drawdown: {
    label: "Drawdown",
    color: "var(--destructive)",
  },
};

function formatDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function MetricCard({
  label,
  value,
  trend,
  subtitle,
  destructive,
}: {
  label: string;
  value: string;
  trend?: "up" | "down" | "neutral";
  subtitle?: string;
  destructive?: boolean;
}) {
  return (
    <div className="card-subtle p-4 space-y-1.5">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${destructive ? "text-destructive" : ""}`}>
        {value}
      </div>
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
  const challenges = useQuery(api.challenges.getMyChallenges);
  const metrics = useQuery(api.challenges.getDashboardMetrics);
  const metricsHistory = useQuery(api.challenges.getMyMetricsHistory);
  const mt5Accounts = useQuery(api.mt5.getMyMt5Accounts);
  const seedDemoData = useAction(api.demoSeeder.seedDemoTradingData);
  const [seeding, setSeeding] = useState(false);
  const [autoSeeding, setAutoSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);
  const autoSeededRef = useRef(false);

  const isLoading = !challenges || !metrics || !metricsHistory || !mt5Accounts;

  // Auto-seed demo data when the page first loads and detects empty metrics
  useEffect(() => {
    if (
      !isLoading &&
      !autoSeededRef.current &&
      challenges.length > 0 &&
      mt5Accounts.length > 0 &&
      metricsHistory.length === 0
    ) {
      autoSeededRef.current = true;
      setAutoSeeding(true);

      seedDemoData()
        .then((result: any) => {
          const msg = result.message || `Seeded ${result.seeded} data points across ${challenges.length} challenge(s)`;
          setSeedResult(msg);
          toast.success("Demo data generated", {
            description: msg,
          });
        })
        .catch((e: any) => {
          const msg = e.message || "Failed to generate demo data";
          setSeedResult(`Error: ${msg}`);
          toast.error("Demo data generation failed", {
            description: msg,
          });
        })
        .finally(() => {
          setAutoSeeding(false);
        });
    }
  }, [isLoading, challenges, mt5Accounts, metricsHistory, seedDemoData]);

  const handleSeedDemoData = async () => {
    if (autoSeeding) return;
    setSeeding(true);
    setAutoSeeding(false);
    setSeedResult(null);
    try {
      const result = await seedDemoData();
      const msg = (result as any).message ||
        `Seeded ${(result as any).seeded} data points across ${challenges?.length || 0} challenge(s)`;
      setSeedResult(msg);
      toast.success("Demo data generated", {
        description: msg,
      });
    } catch (e: any) {
      const msg = e.message || "Failed to generate demo data";
      setSeedResult(`Error: ${msg}`);
      toast.error("Demo data generation failed", {
        description: msg,
      });
    } finally {
      setSeeding(false);
    }
  };

  const isSeeding = seeding || autoSeeding;

  const chartData = useMemo(() => {
    if (!metricsHistory || metricsHistory.length === 0) return [];
    // Sample down to max 50 data points for chart readability
    const step = Math.max(1, Math.floor(metricsHistory.length / 50));
    return metricsHistory
      .filter((_, i) => i % step === 0)
      .map((m) => ({
        time: formatDate(m.recordedAt),
        balance: m.balance,
        equity: m.equity,
        drawdown: m.currentDrawdown,
      }));
  }, [metricsHistory]);

  const drawdownData = useMemo(() => {
    if (!metricsHistory || metricsHistory.length === 0) return [];
    const step = Math.max(1, Math.floor(metricsHistory.length / 50));
    return metricsHistory
      .filter((_, i) => i % step === 0)
      .map((m) => ({
        time: formatDate(m.recordedAt),
        drawdown: m.currentDrawdown,
        dailyDrawdown: m.dailyDrawdown,
      }));
  }, [metricsHistory]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeChallenges = challenges.filter((c) => c.status === "active");
  const fundedChallenges = challenges.filter((c) => c.status === "funded");
  const latestMetrics = metrics.latestMetrics;
  const hasCharts = chartData.length > 0;

  // Compute aggregate stats
  const totalBalance = mt5Accounts.reduce((sum, a) => sum + a.balance, 0);
  const totalEquity = mt5Accounts.reduce((sum, a) => sum + a.equity, 0);
  const floatingPL = totalEquity - totalBalance;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-lg font-medium tracking-tight">Trading</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Monitor your trading performance, account details, and real-time metrics
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Total Balance"
          value={`$${totalBalance.toLocaleString()}`}
        />
        <MetricCard
          label="Total Equity"
          value={`$${totalEquity.toLocaleString()}`}
          trend={floatingPL >= 0 ? "up" : "down"}
          subtitle={`Floating: ${floatingPL >= 0 ? "+" : ""}$${floatingPL.toFixed(2)}`}
          destructive={floatingPL < 0}
        />
        <MetricCard
          label="Active Challenges"
          value={String(activeChallenges.length)}
          subtitle={fundedChallenges.length > 0 ? `${fundedChallenges.length} funded` : undefined}
        />
        <MetricCard
          label="MT5 Accounts"
          value={String(mt5Accounts.length)}
          subtitle={mt5Accounts.filter((a) => a.isActive).length + " active"}
        />
      </div>

      {/* MT5 Accounts Section */}
      {mt5Accounts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium">MT5 Accounts</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {mt5Accounts.map((acc) => {
              const hasMetrics = metricsHistory?.some(
                (m) => m.challengeId === activeChallenges.find((c) => c.mt5AccountId === acc._id)?._id
              );
              return (
                <Card key={acc._id} className="gap-0">
                  <CardHeader className="pb-3 flex-row items-center justify-between gap-0">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                        <Server className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-medium">
                          Account #{acc.login}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {acc.server} · {acc.currency}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={acc.isSuspended ? "destructive" : acc.isActive ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {acc.isSuspended ? "Suspended" : acc.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    {/* Key details */}
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <div className="text-muted-foreground mb-0.5">Balance</div>
                        <div className="font-medium">${acc.balance.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-0.5">Equity</div>
                        <div className="font-medium">${acc.equity.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-0.5">Leverage</div>
                        <div className="font-medium">1:{acc.leverage}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-muted-foreground mb-0.5">Login</div>
                        <div className="font-mono text-[11px]">{acc.login}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-0.5">Group</div>
                        <div className="font-medium truncate">{acc.group}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <SlidersHorizontal className="h-3 w-3" />
                        <span>Password: ••••••••</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Key className="h-3 w-3" />
                        <span>Investor: ••••••••</span>
                      </div>
                    </div>
                    {acc.lastSyncAt && (
                      <p className="text-[10px] text-muted-foreground">
                        Last synced: {formatDate(acc.lastSyncAt)} at {formatTime(acc.lastSyncAt)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state for no MT5 accounts */}
      {mt5Accounts.length === 0 && !isLoading && (
        <div className="card-subtle p-8 text-center space-y-2">
          <Server className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No MT5 accounts yet. Purchase and start a challenge to get one.
          </p>
        </div>
      )}

      {/* Charts Section */}
      {hasCharts ? (
        <div className="space-y-6">
          <h2 className="text-sm font-medium">Performance Charts</h2>

          {/* Equity / Balance Line Chart */}
          <Card className="gap-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                Balance & Equity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="aspect-[2/1] w-full">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="time"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    domain={["auto", "auto"]}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent />}
                  />
                  <Line
                    type="monotone"
                    dataKey="balance"
                    stroke="var(--color-balance)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="equity"
                    stroke="var(--color-equity)"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </LineChart>
              </ChartContainer>
              <p className="text-[10px] text-muted-foreground mt-2">
                Solid line: Balance · Dashed line: Equity
              </p>
            </CardContent>
          </Card>

          {/* Drawdown Area Chart */}
          <Card className="gap-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Drawdown Tracker
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="aspect-[2/1] w-full">
                <AreaChart data={drawdownData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="time"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    domain={[0, "auto"]}
                    tickFormatter={(v) => `${v.toFixed(1)}%`}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent />}
                  />
                  <defs>
                    <linearGradient id="drawdownFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-drawdown)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="var(--color-drawdown)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="drawdown"
                    stroke="var(--color-drawdown)"
                    fill="url(#drawdownFill)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ChartContainer>
              <p className="text-[10px] text-muted-foreground mt-2">
                Current drawdown over time
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        mt5Accounts.length > 0 && (
          <div className="card-subtle p-8 text-center space-y-3">
            {autoSeeding ? (
              <>
                <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    Generating demo trading data…
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Creating 60 days of sample metrics so charts render immediately.
                  </p>
                </div>
              </>
            ) : (
              <>
                <BarChart3 className="h-8 w-8 mx-auto text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    No trading metrics recorded yet. Charts will appear once trading data is synced.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Generate sample trading data to see charts and metrics in action immediately.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSeedDemoData}
                  disabled={isSeeding}
                  className="gap-1.5"
                >
                  {seeding ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {seeding ? "Generating…" : "Generate Demo Data"}
                </Button>
              </>
            )}
            {seedResult && (
              <p className={`text-xs ${seedResult.startsWith("Error") ? "text-destructive" : "text-muted-foreground"}`}>
                {seedResult}
              </p>
            )}
          </div>
        )
      )}

      {/* Latest Metrics */}
      {latestMetrics ? (
        <div className="space-y-4">
          <h2 className="text-sm font-medium">Current Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Balance"
              value={`$${latestMetrics.balance.toLocaleString()}`}
            />
            <MetricCard
              label="Equity"
              value={`$${latestMetrics.equity.toLocaleString()}`}
            />
            <MetricCard
              label="Floating P/L"
              value={`${latestMetrics.floatingPL >= 0 ? "+" : ""}$${latestMetrics.floatingPL.toFixed(2)}`}
              destructive={latestMetrics.floatingPL < 0}
            />
            <MetricCard
              label="Total Profit"
              value={`${latestMetrics.totalProfit >= 0 ? "+" : ""}$${latestMetrics.totalProfit.toFixed(2)}`}
              destructive={latestMetrics.totalProfit < 0}
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Win Rate"
              value={`${latestMetrics.winRate?.toFixed(1) || 0}%`}
            />
            <MetricCard
              label="Profit Factor"
              value={latestMetrics.profitFactor?.toFixed(2) || "0.00"}
              trend={latestMetrics.profitFactor && latestMetrics.profitFactor > 1 ? "up" : "down"}
            />
            <MetricCard
              label="Risk Score"
              value={`${latestMetrics.riskScore || 0}/100`}
              destructive={(latestMetrics.riskScore || 0) > 50}
            />
            <MetricCard
              label="Health Score"
              value={`${latestMetrics.healthScore || 0}/100`}
              trend={(latestMetrics.healthScore || 0) > 50 ? "up" : "down"}
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Open Positions"
              value={String(latestMetrics.openPositions)}
            />
            <MetricCard
              label="Closed Trades"
              value={String(latestMetrics.closedTrades)}
            />
            <MetricCard
              label="Drawdown"
              value={`${latestMetrics.currentDrawdown.toFixed(2)}%`}
              destructive={latestMetrics.currentDrawdown > 5}
              subtitle={`Max: ${challenges.find((c) => c.status === "active")?.maxDrawdown || 0}%`}
            />
            <MetricCard
              label="Daily Drawdown"
              value={`${latestMetrics.dailyDrawdown.toFixed(2)}%`}
              destructive={latestMetrics.dailyDrawdown > 3}
              subtitle={`Max: ${challenges.find((c) => c.status === "active")?.dailyDrawdown || 0}%`}
            />
          </div>
        </div>
      ) : mt5Accounts.length > 0 ? (          <div className="card-subtle p-8 text-center space-y-3">
          {autoSeeding ? (
            <>
              <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">
                  Generating demo trading data…
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Creating 60 days of sample metrics so charts render immediately.
                </p>
              </div>
            </>
          ) : (
            <>
              <Activity className="h-8 w-8 mx-auto text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">
                  No trading metrics available yet. Metrics appear once your MT5 account receives trading data.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Generate sample trading data to see metrics and charts immediately.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSeedDemoData}
                disabled={isSeeding}
                className="gap-1.5"
              >
                {seeding ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {seeding ? "Generating…" : "Generate Demo Data"}
              </Button>
            </>
          )}
          {seedResult && (
            <p className={`text-xs ${seedResult.startsWith("Error") ? "text-destructive" : "text-muted-foreground"}`}>
              {seedResult}
            </p>
          )}
        </div>
      ) : null}

      {/* Active Challenges */}
      {activeChallenges.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium">Active Challenges</h2>
          <div className="grid gap-4">
            {activeChallenges.map((ch) => {
              const chMetrics = metricsHistory
                ?.filter((m) => m.challengeId === ch._id)
                .sort((a, b) => b.recordedAt - a.recordedAt);
              const latest = chMetrics?.[0];

              return (
                <Card key={ch._id} className="gap-0">
                  <CardHeader className="pb-3 flex-row items-center justify-between gap-0">
                    <div>
                      <CardTitle className="text-sm font-medium">
                        ${ch.accountSize.toLocaleString()} — {(ch as any).templateName || "Challenge"}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Target: {ch.profitTarget}% · Max DD: {ch.maxDrawdown}% · Leverage: 1:{ch.maxLeverage}
                      </p>
                    </div>
                    <Badge variant="default" className="text-[10px]">
                      Active
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    {/* Profit target progress */}
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                        <span>Profit Target Progress</span>
                        <span>{latest ? `${latest.profitTargetProgress.toFixed(1)}%` : "0%"}</span>
                      </div>
                      <div className="progress-bar">
                        <div
                          className="progress-bar-fill"
                          style={{ width: `${Math.min(latest?.profitTargetProgress || 0, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Mini metrics row */}
                    <div className="grid grid-cols-4 gap-3 text-xs">
                      <div>
                        <div className="text-muted-foreground mb-0.5">Balance</div>
                        <div className="font-medium">${latest?.balance.toLocaleString() || ch.accountSize.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-0.5">Equity</div>
                        <div className="font-medium">${latest?.equity.toLocaleString() || ch.accountSize.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-0.5">Drawdown</div>
                        <div className={`font-medium ${latest && latest.currentDrawdown > ch.dailyDrawdown * 0.8 ? "text-destructive" : ""}`}>
                          {latest ? `${latest.currentDrawdown.toFixed(1)}%` : "0%"}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-0.5">Days</div>
                        <div className="font-medium">{latest?.tradingDaysCount || 0}/{ch.minTradingDays}</div>
                      </div>
                    </div>

                    {/* Violation warnings */}
                    {ch.violations && ch.violations.length > 0 && (
                      <div className="flex items-start gap-2 p-2 rounded bg-destructive/5 text-xs text-destructive">
                        <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>
                          {ch.violations.length} violation{ch.violations.length > 1 ? "s" : ""} — {ch.violations[ch.violations.length - 1].description}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Funded Accounts */}
      {fundedChallenges.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium">Funded Accounts</h2>
          <div className="grid gap-4">
            {fundedChallenges.map((ch) => (
              <Card key={ch._id} className="gap-0">
                <CardHeader className="pb-3 flex-row items-center justify-between gap-0">
                  <div>
                    <CardTitle className="text-sm font-medium">
                      ${ch.accountSize.toLocaleString()} Funded Account
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(ch as any).templateName || "Funded"} · 90% Profit Share
                    </p>
                  </div>
                  <Badge variant="default" className="text-[10px] bg-foreground text-background">
                    Funded
                  </Badge>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground">
                  {ch.mt5AccountId ? (
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="h-3 w-3" />
                      <span>MT5 account linked</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="h-3 w-3" />
                      <span>Awaiting MT5 provisioning</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
