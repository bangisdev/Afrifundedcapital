/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useResetOnChange } from "@/hooks/use-reset-on-change";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PageLoader } from "@/components/dashboard/PageLoader";
import { formatMoney, formatShortDate, formatRelativeTime } from "@/lib/utils";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Loader2, TrendingUp, TrendingDown, Minus, Server,
  Activity, BarChart3, RefreshCw, Target, Shield, Zap,
  ArrowUp, ArrowDown, ArrowUpDown, AlertTriangle, CheckCircle2,
  Trophy, Flame, Clock, Sparkles,
} from "lucide-react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Cell,
} from "recharts";
import { useMemo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

// ═══════════════════════════════════════════════════════
//  Chart config
// ═══════════════════════════════════════════════════════

const chartConfig = {
  balance: { label: "Balance", color: "var(--chart-1)" },
  equity: { label: "Equity", color: "var(--chart-2)" },
  drawdown: { label: "Drawdown", color: "var(--destructive)" },
  dailyPL: { label: "Daily P&L", color: "var(--chart-1)" },
};

// ═══════════════════════════════════════════════════════
//  Sub-components
// ═══════════════════════════════════════════════════════

function MetricCard({ label, value, trend, subtitle, destructive, icon: Icon }: {
  label: string; value: string; trend?: "up" | "down" | "neutral";
  subtitle?: string; destructive?: boolean; icon?: any;
}) {
  return (
    <div className="card-subtle p-4 space-y-1.5">
      <div className="flex items-center gap-1.5 stat-label">
        {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
        {label}
      </div>
      <div className={`stat-value ${destructive ? "text-destructive" : ""}`}>{value}</div>
      {(trend || subtitle) && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {trend === "up" && <TrendingUp className="h-3 w-3 text-emerald-500" />}
          {trend === "down" && <TrendingDown className="h-3 w-3 text-destructive" />}
          {trend === "neutral" && <Minus className="h-3 w-3 text-muted-foreground" />}
          {subtitle && <span>{subtitle}</span>}
        </div>
      )}
    </div>
  );
}

/** Drawdown gauge — visual bar showing how close to the limit */
function DrawdownGauge({ current, max, label, type = "max" }: {
  current: number; max: number; label: string; type?: "max" | "daily";
}) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const isDanger = pct >= 80;
  const isWarning = pct >= 50;
  const barColor = isDanger ? "bg-destructive" : isWarning ? "bg-amber-500" : "bg-emerald-500";
  const textColor = isDanger ? "text-destructive" : isWarning ? "text-amber-600" : "text-emerald-600";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`text-xs font-medium ${textColor}`}>
          {(current || 0).toFixed(2)}% / {(max || 0).toFixed(1)}%
        </span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Remaining: {(max || 0) - (current || 0)}</span>
        {isDanger && (
          <span className="flex items-center gap-1 text-destructive">
            <AlertTriangle className="h-3 w-3" /> Danger zone
          </span>
        )}
      </div>
    </div>
  );
}

/** Profit target progress ring */
function ProfitTargetRing({ progress, targetPct }: { progress: number; targetPct: number }) {
  const capped = Math.min(progress, 100);
  const circumference = 2 * Math.PI * 36;
  const strokeDashoffset = circumference - (capped / 100) * circumference;
  const isComplete = capped >= 100;
  const color = isComplete ? "#10b981" : capped >= 70 ? "#3b82f6" : "#f59e0b";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <svg width="88" height="88" viewBox="0 0 88 88">
          <circle cx="44" cy="44" r="36" fill="none" stroke="var(--secondary)" strokeWidth="6" />
          <circle
            cx="44" cy="44" r="36" fill="none"
            stroke={color} strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 44 44)"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold" style={{ color }}>{capped}%</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-xs font-medium">Profit Target</div>
        <div className="text-[10px] text-muted-foreground">{targetPct}% required</div>
      </div>
    </div>
  );
}

/** Health score badge */
function HealthBadge({ score }: { score: number }) {
  const color = score >= 80 ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
    : score >= 60 ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
    : "bg-red-500/10 text-red-600 border-red-500/20";
  const label = score >= 80 ? "Excellent" : score >= 60 ? "Good" : "At Risk";

  return (
    <Badge variant="outline" className={`${color} text-[10px]`}>
      <Shield className="h-2.5 w-2.5 mr-1" />
      Health: {label} ({score})
    </Badge>
  );
}

// ═══════════════════════════════════════════════════════
//  Main Trading Dashboard
// ═══════════════════════════════════════════════════════

export default function Trading() {
  const { user } = useAuth();
  const { data: dashboardData, isLoading } = useApiQuery<any>(
    ["trading", "dashboard"],
    "/api/trading/dashboard",
  );
  const syncMutation = useApiMutation<any, any>("post", "/api/trading/sync");
  const seedMutation = useApiMutation<any, any>("post", "/api/trading/seed-demo");
  const [syncing, setSyncing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const autoSyncedRef = useRef(false);
  const autoSeedingRef = useRef(false);

  const challenges = dashboardData?.challenges || [];
  const accounts = dashboardData?.accounts || [];
  const metricsHistory = dashboardData?.metricsHistory || [];
  const drawdownDataRaw = dashboardData?.drawdownData || [];
  const summary = dashboardData?.summary || {};
  const perfSummary = dashboardData?.perfSummary || null;
  const primaryChallenge = challenges[0] || null;
  const primaryMetrics = primaryChallenge?.metrics || null;

  // Auto-sync once
  useEffect(() => {
    if (!isLoading && challenges.length > 0 && !autoSyncedRef.current) {
      autoSyncedRef.current = true;
      syncMutation.mutateAsync({}).catch(() => {});
    }
  }, [isLoading, challenges.length, syncMutation]);

  // Auto-seed demo data if no metrics yet
  useEffect(() => {
    if (!isLoading && primaryChallenge && metricsHistory.length === 0 && !autoSeedingRef.current) {
      autoSeedingRef.current = true;
      seedMutation.mutateAsync({ challengeId: primaryChallenge.id })
        .then(() => toast.success("Demo trading data generated"))
        .catch(() => {});
    }
  }, [isLoading, primaryChallenge, metricsHistory.length, seedMutation]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncMutation.mutateAsync({});
      if (result?.synced > 0) toast.success(`Synced ${result.synced} challenge(s)`);
    } catch { /* silent */ }
    setSyncing(false);
  };

  const handleSeed = async () => {
    if (!primaryChallenge) return;
    setSeeding(true);
    try {
      await seedMutation.mutateAsync({ challengeId: primaryChallenge.id });
      toast.success("Demo data generated");
    } catch { toast.error("Failed to generate demo data"); }
    setSeeding(false);
  };

  // Chart data — equity curve
  const equityCurveData = useMemo(() => {
    if (!metricsHistory.length) return [];
    const step = Math.max(1, Math.floor(metricsHistory.length / 60));
    return metricsHistory
      .filter((_: any, i: number) => i % step === 0 || i === metricsHistory.length - 1)
      .map((m: any) => ({
        time: formatShortDate(m.recordedAt),
        balance: m.balance,
        equity: m.equity,
      }));
  }, [metricsHistory]);

  // Chart data — daily P&L
  const dailyPLData = useMemo(() => {
    if (!metricsHistory.length) return [];
    const recent = metricsHistory.slice(-30);
    return recent.map((m: any) => ({
      time: formatShortDate(m.recordedAt),
      pl: m.dailyPL,
    }));
  }, [metricsHistory]);

  // Chart data — drawdown
  const drawdownChartData = useMemo(() => {
    if (!drawdownDataRaw.length && !metricsHistory.length) return [];
    if (drawdownDataRaw.length) {
      const step = Math.max(1, Math.floor(drawdownDataRaw.length / 60));
      return drawdownDataRaw
        .filter((_: any, i: number) => i % step === 0)
        .map((d: any) => ({ time: formatShortDate(d.recordedAt), drawdown: d.drawdown, daily: d.dailyDrawdown }));
    }
    const step = Math.max(1, Math.floor(metricsHistory.length / 60));
    return metricsHistory
      .filter((_: any, i: number) => i % step === 0)
      .map((m: any) => ({ time: formatShortDate(m.recordedAt), drawdown: m.currentDrawdown, daily: m.dailyDrawdown }));
  }, [drawdownDataRaw, metricsHistory]);

  if (isLoading) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Trading" title="Trading" subtitle="Monitor your performance" />
        <PageLoader rows={6} />
      </div>
    );
  }

  if (!challenges.length && !accounts.length) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Trading" title="Trading" subtitle="Monitor your performance" />
        <div className="card-subtle p-12 text-center space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-secondary/50 flex items-center justify-center mx-auto">
            <Activity className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-medium">No Trading Activity Yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Purchase and start a challenge to see your real-time trading dashboard with equity curves,
              drawdown tracking, and performance analytics.
            </p>
          </div>
          <Button asChild className="mt-4">
            <a href="/dashboard/challenges">Browse Challenges</a>
          </Button>
        </div>
      </div>
    );
  }

  const totalPL = summary.floatingPL || 0;
  const hasCharts = equityCurveData.length > 1;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Trading"
        title="Trading Dashboard"
        subtitle="Real-time performance metrics, equity curves, and drawdown tracking"
        actions={
          <div className="flex gap-2">
            {metricsHistory.length === 0 && (
              <Button variant="outline" size="sm" className="text-xs" onClick={handleSeed} disabled={seeding}>
                {seeding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                Generate Demo Data
              </Button>
            )}
            <Button variant="outline" size="sm" className="text-xs" onClick={handleSync} disabled={syncing}>
              {syncing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              {syncing ? "Syncing…" : "Sync Now"}
            </Button>
          </div>
        }
      />

      {/* ─── Summary Stats ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Total Balance"
          value={formatMoney(summary.totalBalance || 0)}
          icon={Server}
        />
        <MetricCard
          label="Total Equity"
          value={formatMoney(summary.totalEquity || 0)}
          trend={totalPL >= 0 ? "up" : "down"}
          subtitle={`Floating: ${totalPL >= 0 ? "+" : ""}${formatMoney(totalPL)}`}
          destructive={totalPL < 0}
          icon={Activity}
        />
        <MetricCard
          label="Active Challenges"
          value={String(summary.activeChallengeCount || 0)}
          subtitle={`${summary.activeAccountCount || 0} MT5 accounts active`}
          icon={Target}
        />
        <MetricCard
          label="Total P&L"
          value={`${totalPL >= 0 ? "+" : ""}${formatMoney(totalPL)}`}
          trend={totalPL >= 0 ? "up" : "down"}
          destructive={totalPL < 0}
          icon={totalPL >= 0 ? TrendingUp : TrendingDown}
        />
      </div>

      {/* ─── Active Challenge Card ─── */}
      {primaryChallenge && (
        <Card className="gap-0 overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 flex items-center justify-center">
                  <Trophy className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <CardTitle className="text-sm font-medium">
                    {primaryChallenge.templateName || `Challenge #${primaryChallenge.id}`}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatMoney(primaryChallenge.accountSize)} account · Phase {primaryChallenge.currentPhase || 1}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {primaryMetrics?.healthScore != null && <HealthBadge score={primaryMetrics.healthScore} />}
                <Badge variant="default" className="text-[10px]">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                  Active
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Key metrics row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Balance</div>
                <div className="text-lg font-semibold">{formatMoney(primaryMetrics?.balance ?? primaryChallenge.accountSize)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Equity</div>
                <div className={`text-lg font-semibold ${(primaryMetrics?.equity ?? 0) >= (primaryMetrics?.balance ?? 0) ? "text-emerald-600" : "text-destructive"}`}>
                  {formatMoney(primaryMetrics?.equity ?? primaryChallenge.accountSize)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Floating P&L</div>
                <div className={`text-lg font-semibold ${(primaryMetrics?.floatingPL ?? 0) >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                  {primaryMetrics?.floatingPL != null ? `${primaryMetrics.floatingPL >= 0 ? "+" : ""}${formatMoney(primaryMetrics.floatingPL)}` : "—"}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Trading Days</div>
                <div className="text-lg font-semibold flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  {primaryMetrics?.tradingDaysCount ?? 0}
                  <span className="text-xs text-muted-foreground font-normal">
                    / {primaryChallenge.minTradingDays} min
                  </span>
                </div>
              </div>
            </div>

            {/* Drawdown gauges + Profit target ring */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-4">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Drawdown Limits</h4>
                <DrawdownGauge
                  current={primaryMetrics?.currentDrawdown ?? 0}
                  max={primaryChallenge.maxDrawdown}
                  label="Maximum Drawdown"
                  type="max"
                />
                <DrawdownGauge
                  current={primaryMetrics?.dailyDrawdown ?? 0}
                  max={primaryChallenge.dailyDrawdown}
                  label="Daily Drawdown"
                  type="daily"
                />
              </div>
              <div className="flex items-center justify-center">
                <ProfitTargetRing
                  progress={primaryMetrics?.profitTargetProgress ?? 0}
                  targetPct={primaryChallenge.profitTarget}
                />
              </div>
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick Stats</h4>
                <div className="space-y-2.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Open Positions</span>
                    <span className="font-medium">{primaryMetrics?.openPositions ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Closed Trades</span>
                    <span className="font-medium">{primaryMetrics?.closedTrades ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Win Rate</span>
                    <span className="font-medium">{primaryMetrics?.winRate?.toFixed(1) ?? "—"}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Profit Factor</span>
                    <span className="font-medium">{primaryMetrics?.profitFactor?.toFixed(2) ?? "—"}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Remaining DD</span>
                    <span className={`font-medium ${(primaryMetrics?.remainingDrawdown ?? 0) <= 0 ? "text-destructive" : ""}`}>
                      {formatMoney(primaryMetrics?.remainingDrawdown ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Max Leverage</span>
                    <span className="font-medium">1:{primaryChallenge.maxLeverage}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Violations warning */}
            {primaryChallenge.violations && primaryChallenge.violations.length > 0 && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-destructive">Rule Violations Detected</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {primaryChallenge.violations.length} violation(s) recorded. Review your trading rules to avoid account suspension.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Performance Analytics ─── */}
      {perfSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
          <div className="card-subtle p-3 text-center space-y-1">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Win Rate</div>
            <div className="text-lg font-bold">{perfSummary.winRate?.toFixed(1) ?? "—"}%</div>
          </div>
          <div className="card-subtle p-3 text-center space-y-1">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Profit Factor</div>
            <div className="text-lg font-bold">{perfSummary.profitFactor?.toFixed(2) ?? "—"}</div>
          </div>
          <div className="card-subtle p-3 text-center space-y-1">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg R:R</div>
            <div className="text-lg font-bold">{perfSummary.averageRR?.toFixed(2) ?? "—"}</div>
          </div>
          <div className="card-subtle p-3 text-center space-y-1">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Largest Win</div>
            <div className="text-lg font-bold text-emerald-600">{formatMoney(perfSummary.largestWin ?? 0)}</div>
          </div>
          <div className="card-subtle p-3 text-center space-y-1">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Largest Loss</div>
            <div className="text-lg font-bold text-destructive">{formatMoney(perfSummary.largestLoss ?? 0)}</div>
          </div>
          <div className="card-subtle p-3 text-center space-y-1">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Streak</div>
            <div className="text-lg font-bold flex items-center justify-center gap-1">
              <Flame className="h-4 w-4 text-amber-500" />
              {perfSummary.consecutiveWins ?? 0}W / {perfSummary.consecutiveLosses ?? 0}L
            </div>
          </div>
        </div>
      )}

      {/* ─── Charts ─── */}
      {hasCharts && (
        <div className="space-y-6">
          <h2 className="text-sm font-medium">Performance Charts</h2>

          {/* Equity Curve */}
          <Card className="gap-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" /> Equity Curve
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="aspect-[2.5/1] w-full">
                <LineChart data={equityCurveData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} domain={["auto", "auto"]} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="balance" stroke="var(--color-balance)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="equity" stroke="var(--color-equity)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                </LineChart>
              </ChartContainer>
              <p className="text-[10px] text-muted-foreground mt-2">Solid: Balance · Dashed: Equity</p>
            </CardContent>
          </Card>

          {/* Daily P&L Bar Chart */}
          {dailyPLData.length > 0 && (
            <Card className="gap-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" /> Daily P&L (Last 30 Days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="aspect-[2.5/1] w-full">
                  <BarChart data={dailyPLData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <Bar dataKey="pl" radius={[2, 2, 0, 0]}>
                      {dailyPLData.map((entry: any, idx: number) => (
                        <Cell key={idx} fill={entry.pl >= 0 ? "#10b981" : "#ef4444"} fillOpacity={0.8} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
                <p className="text-[10px] text-muted-foreground mt-2">Green: profitable days · Red: loss days</p>
              </CardContent>
            </Card>
          )}

          {/* Drawdown Chart */}
          {drawdownChartData.length > 0 && (
            <Card className="gap-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-destructive" /> Drawdown Tracker
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="aspect-[2.5/1] w-full">
                  <AreaChart data={drawdownChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} domain={[0, "auto"]} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <defs>
                      <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-drawdown)" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="var(--color-drawdown)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="drawdown" stroke="var(--color-drawdown)" fill="url(#ddFill)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  </AreaChart>
                </ChartContainer>
                <p className="text-[10px] text-muted-foreground mt-2">Drawdown from peak balance over time</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ─── MT5 Accounts ─── */}
      {accounts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium">MT5 Accounts</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {accounts.map((acc: any) => (
              <Card key={acc.id} className="gap-0">
                <CardHeader className="pb-3 flex-row items-center justify-between gap-0">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                      <Server className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-medium">Account #{acc.login}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">{acc.server} · 1:{acc.leverage}</p>
                    </div>
                  </div>
                  <Badge variant={acc.isSuspended ? "destructive" : acc.isActive ? "default" : "secondary"} className="text-[10px]">
                    {acc.isSuspended ? "Suspended" : acc.isActive ? "Active" : "Inactive"}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <div className="text-muted-foreground mb-0.5">Balance</div>
                      <div className="font-medium">{formatMoney(acc.balance || 0)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-0.5">Equity</div>
                      <div className="font-medium">{formatMoney(acc.equity || 0)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-0.5">Last Sync</div>
                      <div className="font-medium">{acc.lastSyncAt ? formatRelativeTime(acc.lastSyncAt) : "Never"}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
