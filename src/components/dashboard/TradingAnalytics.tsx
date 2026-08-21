/* eslint-disable @typescript-eslint/no-explicit-any */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  PieChart, Pie, Cell, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ComposedChart, Line, Scatter, ScatterChart,
  Legend,
} from "recharts";
import { useMemo } from "react";
import {
  TrendingUp, TrendingDown, BarChart3, Target,
  PieChart as PieChartIcon, Activity, Calendar,
  Crosshair, Zap, Award,
} from "lucide-react";

// ═══════════════════════════════════════════════════════
//  Chart config
// ═══════════════════════════════════════════════════════

const chartConfig = {
  balance: { label: "Balance", color: "var(--chart-1)" },
  equity: { label: "Equity", color: "var(--chart-2)" },
  drawdown: { label: "Drawdown", color: "var(--destructive)" },
  dailyPL: { label: "Daily P&L", color: "var(--chart-1)" },
  wins: { label: "Wins", color: "#10b981" },
  losses: { label: "Losses", color: "#ef4444" },
  cumulativePL: { label: "Cumulative P&L", color: "#3b82f6" },
};

const WIN_COLOR = "#10b981";
const LOSS_COLOR = "#ef4444";
const NEUTRAL_COLOR = "#6b7280";
const ACCENT_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

// ═══════════════════════════════════════════════════════
//  Win / Loss Donut Chart
// ═══════════════════════════════════════════════════════

export function WinLossDonut({
  winRate,
  totalTrades,
  avgWin,
  avgLoss,
  profitFactor,
  expectancy,
}: {
  winRate: number;
  totalTrades: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  expectancy: number;
}) {
  const lossRate = 100 - winRate;
  const pieData = [
    { name: "Wins", value: Math.round(winRate * 10) / 10, fill: WIN_COLOR },
    { name: "Losses", value: Math.round(lossRate * 10) / 10, fill: LOSS_COLOR },
  ];

  return (
    <Card className="gap-0 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <PieChartIcon className="h-4 w-4 text-muted-foreground" />
          Win / Loss Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          {/* Donut */}
          <div className="flex justify-center">
            <div className="relative">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                    strokeWidth={0}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload?.length) {
                        return (
                          <div className="bg-background border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
                            <span className="font-medium">{payload[0].name}:</span>{" "}
                            <span className="font-mono">{payload[0].value}%</span>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold">{winRate.toFixed(1)}%</span>
                <span className="text-[10px] text-muted-foreground">Win Rate</span>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 p-3 rounded-lg bg-secondary/30">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Win</div>
              <div className="text-base font-semibold text-emerald-600">{formatMoney(avgWin)}</div>
            </div>
            <div className="space-y-1 p-3 rounded-lg bg-secondary/30">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Loss</div>
              <div className="text-base font-semibold text-destructive">{formatMoney(avgLoss)}</div>
            </div>
            <div className="space-y-1 p-3 rounded-lg bg-secondary/30">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Profit Factor</div>
              <div className={`text-base font-semibold ${profitFactor >= 1.5 ? "text-emerald-600" : profitFactor >= 1 ? "text-amber-600" : "text-destructive"}`}>
                {profitFactor.toFixed(2)}
              </div>
            </div>
            <div className="space-y-1 p-3 rounded-lg bg-secondary/30">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Expectancy</div>
              <div className={`text-base font-semibold ${expectancy >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                {formatMoney(expectancy)}
              </div>
            </div>
            <div className="col-span-2 space-y-1 p-3 rounded-lg bg-secondary/30">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Trades</div>
              <div className="text-base font-semibold">{totalTrades}</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════
//  Cumulative P&L Chart
// ═══════════════════════════════════════════════════════

export function CumulativePLChart({ metricsHistory }: { metricsHistory: any[] }) {
  const data = useMemo(() => {
    if (!metricsHistory.length) return [];
    const step = Math.max(1, Math.floor(metricsHistory.length / 60));
    let cumulative = 0;
    return metricsHistory
      .filter((_: any, i: number) => i % step === 0 || i === metricsHistory.length - 1)
      .map((m: any) => {
        cumulative += m.dailyPL || 0;
        return {
          time: new Date(m.recordedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          cumulativePL: Math.round(cumulative * 100) / 100,
          dailyPL: m.dailyPL || 0,
        };
      });
  }, [metricsHistory]);

  if (data.length === 0) return null;

  return (
    <Card className="gap-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          Cumulative P&L
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-[2.5/1] w-full">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <defs>
              <linearGradient id="cumPLFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="cumulativePL" stroke="#3b82f6" fill="url(#cumPLFill)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
          </AreaChart>
        </ChartContainer>
        <p className="text-[10px] text-muted-foreground mt-2">Running total of daily profits and losses</p>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════
//  Performance by Day of Week
// ═══════════════════════════════════════════════════════

export function PerformanceByDayChart({ metricsHistory }: { metricsHistory: any[] }) {
  const data = useMemo(() => {
    if (!metricsHistory.length) return [];
    const dayMap: Record<string, { total: number; count: number; wins: number; losses: number }> = {};

    for (const m of metricsHistory) {
      const date = new Date(m.recordedAt);
      const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
      if (!dayMap[dayName]) dayMap[dayName] = { total: 0, count: 0, wins: 0, losses: 0 };
      dayMap[dayName].total += m.dailyPL || 0;
      dayMap[dayName].count += 1;
      if ((m.dailyPL || 0) > 0) dayMap[dayName].wins += 1;
      else if ((m.dailyPL || 0) < 0) dayMap[dayName].losses += 1;
    }

    const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return dayOrder
      .filter((d) => dayMap[d])
      .map((d) => ({
        day: d,
        avgPL: dayMap[d].count > 0 ? Math.round((dayMap[d].total / dayMap[d].count) * 100) / 100 : 0,
        totalPL: Math.round(dayMap[d].total * 100) / 100,
        winRate: dayMap[d].count > 0 ? Math.round((dayMap[d].wins / dayMap[d].count) * 100) : 0,
        trades: dayMap[d].count,
      }));
  }, [metricsHistory]);

  if (data.length === 0) return null;

  return (
    <Card className="gap-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          Performance by Day of Week
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-[2.5/1] w-full">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
            <ChartTooltip
              cursor={false}
              content={({ active, payload }) => {
                if (active && payload?.length) {
                  const d = payload[0].payload;
                  return (
                    <div className="bg-background border border-border rounded-lg px-3 py-2 text-xs shadow-lg space-y-1">
                      <div className="font-medium">{d.day}</div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Avg P&L:</span>
                        <span className={`font-mono ${d.avgPL >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                          {d.avgPL >= 0 ? "+" : ""}{formatMoney(d.avgPL)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Win Rate:</span>
                        <span className="font-mono">{d.winRate}%</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Days Traded:</span>
                        <span className="font-mono">{d.trades}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="avgPL" radius={[4, 4, 0, 0]}>
              {data.map((entry: any, idx: number) => (
                <Cell key={idx} fill={entry.avgPL >= 0 ? WIN_COLOR : LOSS_COLOR} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
        <p className="text-[10px] text-muted-foreground mt-2">Average daily P&L for each day of the trading week</p>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════
//  Enhanced Equity Curve with Gradient Area Fill
// ═══════════════════════════════════════════════════════

export function EnhancedEquityCurve({ metricsHistory }: { metricsHistory: any[] }) {
  const data = useMemo(() => {
    if (!metricsHistory.length) return [];
    const step = Math.max(1, Math.floor(metricsHistory.length / 60));
    return metricsHistory
      .filter((_: any, i: number) => i % step === 0 || i === metricsHistory.length - 1)
      .map((m: any) => ({
        time: new Date(m.recordedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        balance: m.balance,
        equity: m.equity,
        peak: m.balance, // simplified peak tracking
      }));
  }, [metricsHistory]);

  if (data.length === 0) return null;

  return (
    <Card className="gap-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Equity Curve
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-[2.5/1] w-full">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} domain={["auto", "auto"]} tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <defs>
              <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.1} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="equity" stroke="#10b981" fill="url(#eqFill)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
            <Area type="monotone" dataKey="balance" stroke="#3b82f6" fill="url(#balFill)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
          </AreaChart>
        </ChartContainer>
        <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Equity (with unrealized P&L)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 bg-blue-500 border-dashed" style={{ borderTop: "2px dashed #3b82f6" }} />
            Balance (closed positions only)
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════
//  P&L Distribution Bar Chart
// ═══════════════════════════════════════════════════════

export function PnLDistribution({ metricsHistory }: { metricsHistory: any[] }) {
  const data = useMemo(() => {
    if (!metricsHistory.length) return [];
    // Create distribution buckets
    const ppls = metricsHistory.map((m: any) => m.dailyPL || 0).filter((v: number) => v !== 0);
    if (ppls.length === 0) return [];

    const min = Math.min(...ppls);
    const max = Math.max(...ppls);
    const range = max - min || 1;
    const bucketCount = Math.min(12, Math.max(5, Math.ceil(Math.sqrt(ppls.length))));
    const bucketSize = range / bucketCount;

    const buckets: Record<number, { count: number; range: string; positive: boolean }> = {};
    for (let i = 0; i < bucketCount; i++) {
      const lo = min + i * bucketSize;
      const hi = lo + bucketSize;
      buckets[i] = { count: 0, range: `$${lo.toFixed(0)}–$${hi.toFixed(0)}`, positive: (lo + hi) / 2 >= 0 };
    }

    for (const v of ppls) {
      const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor((v - min) / bucketSize)));
      buckets[idx].count++;
    }

    return Object.values(buckets);
  }, [metricsHistory]);

  if (data.length === 0) return null;

  return (
    <Card className="gap-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          P&L Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-[2.5/1] w-full">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="range" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 8, fill: "var(--muted-foreground)" }} angle={-30} textAnchor="end" height={50} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} allowDecimals={false} />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload?.length) {
                  return (
                    <div className="bg-background border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
                      <div className="font-medium">{payload[0].payload.range}</div>
                      <div className="text-muted-foreground">{payload[0].value} days</div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {data.map((entry: any, idx: number) => (
                <Cell key={idx} fill={entry.positive ? WIN_COLOR : LOSS_COLOR} fillOpacity={0.75} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
        <p className="text-[10px] text-muted-foreground mt-2">Distribution of daily profit/loss outcomes</p>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════
//  Trading Radar Chart (Multi-Axis Performance)
// ═══════════════════════════════════════════════════════

export function TradingRadar({ perfSummary }: { perfSummary: any }) {
  if (!perfSummary) return null;

  // Normalize each metric to 0-100 scale for the radar
  const winRateScore = Math.min(100, Math.max(0, perfSummary.winRate || 0));
  const profitFactorScore = Math.min(100, Math.max(0, ((perfSummary.profitFactor || 0) / 3) * 100));
  const rrScore = Math.min(100, Math.max(0, ((perfSummary.averageRR || 0) / 3) * 100));
  const consistencyScore = Math.min(100, Math.max(0, 100 - (perfSummary.riskScore || 50)));
  const healthScore = perfSummary.healthScore || 50;
  const expectancyScore = Math.min(100, Math.max(0, 50 + (perfSummary.expectancy || 0)));

  const radarData = [
    { metric: "Win Rate", value: winRateScore, fullMark: 100 },
    { metric: "Profit Factor", value: profitFactorScore, fullMark: 100 },
    { metric: "Risk:Reward", value: rrScore, fullMark: 100 },
    { metric: "Consistency", value: consistencyScore, fullMark: 100 },
    { metric: "Health", value: healthScore, fullMark: 100 },
    { metric: "Expectancy", value: expectancyScore, fullMark: 100 },
  ];

  return (
    <Card className="gap-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          Trading Profile Radar
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex justify-center">
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis
                dataKey="metric"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 100]}
                tick={{ fontSize: 8, fill: "var(--muted-foreground)" }}
                tickCount={5}
              />
              <Radar
                name="Performance"
                dataKey="value"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.2}
                strokeWidth={2}
                dot={{ r: 3, fill: "#3b82f6" }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload?.length) {
                    return (
                      <div className="bg-background border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
                        <div className="font-medium">{payload[0].payload.metric}</div>
                        <div className="text-muted-foreground">Score: {payload[0].value}/100</div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════
//  Monthly Performance Heatmap (Calendar-style)
// ═══════════════════════════════════════════════════════

export function MonthlyPerformanceGrid({ metricsHistory }: { metricsHistory: any[] }) {
  const monthlyData = useMemo(() => {
    if (!metricsHistory.length) return [];
    const monthMap: Record<string, { total: number; count: number; positive: number }> = {};

    for (const m of metricsHistory) {
      const date = new Date(m.recordedAt);
      const key = date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      if (!monthMap[key]) monthMap[key] = { total: 0, count: 0, positive: 0 };
      monthMap[key].total += m.dailyPL || 0;
      monthMap[key].count += 1;
      if ((m.dailyPL || 0) > 0) monthMap[key].positive += 1;
    }

    return Object.entries(monthMap).map(([month, data]) => ({
      month,
      totalPL: Math.round(data.total * 100) / 100,
      winRate: data.count > 0 ? Math.round((data.positive / data.count) * 100) : 0,
      tradingDays: data.count,
    }));
  }, [metricsHistory]);

  if (monthlyData.length === 0) return null;

  return (
    <Card className="gap-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Award className="h-4 w-4 text-muted-foreground" />
          Monthly Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {monthlyData.map((m) => {
            const intensity = m.totalPL >= 0 ? "emerald" : "red";
            const bgClass = m.totalPL > 0
              ? `bg-emerald-500/${Math.min(20, Math.max(5, Math.round(Math.abs(m.totalPL) / 100) + 5))} border-emerald-500/20`
              : m.totalPL < 0
                ? `bg-red-500/${Math.min(20, Math.max(5, Math.round(Math.abs(m.totalPL) / 100) + 5))} border-red-500/20`
                : "bg-secondary/50 border-border";

            return (
              <div key={m.month} className={`rounded-lg border p-3 text-center space-y-1 ${bgClass}`}>
                <div className="text-xs font-medium text-muted-foreground">{m.month}</div>
                <div className={`text-sm font-bold ${m.totalPL >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                  {m.totalPL >= 0 ? "+" : ""}{formatMoney(m.totalPL)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {m.winRate}% WR · {m.tradingDays}d
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════
//  Enhanced Daily P&L Bar Chart
// ═══════════════════════════════════════════════════════

export function EnhancedDailyPL({ metricsHistory }: { metricsHistory: any[] }) {
  const data = useMemo(() => {
    if (!metricsHistory.length) return [];
    const recent = metricsHistory.slice(-30);
    let running = 0;
    return recent.map((m: any) => {
      running += m.dailyPL || 0;
      return {
        time: new Date(m.recordedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        pl: m.dailyPL || 0,
        running: Math.round(running * 100) / 100,
      };
    });
  }, [metricsHistory]);

  if (data.length === 0) return null;

  const totalWinDays = data.filter((d: any) => d.pl > 0).length;
  const totalLossDays = data.filter((d: any) => d.pl < 0).length;

  return (
    <Card className="gap-0">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-muted-foreground" />
            Daily P&L (Last 30 Days)
          </CardTitle>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              {totalWinDays} winning
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
              {totalLossDays} losing
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-[2.5/1] w-full">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
            <ChartTooltip
              cursor={false}
              content={({ active, payload }) => {
                if (active && payload?.length) {
                  const d = payload[0].payload;
                  return (
                    <div className="bg-background border border-border rounded-lg px-3 py-2 text-xs shadow-lg space-y-1">
                      <div className="font-medium">{d.time}</div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Daily P&L:</span>
                        <span className={`font-mono ${d.pl >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                          {d.pl >= 0 ? "+" : ""}{formatMoney(d.pl)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Running:</span>
                        <span className={`font-mono ${d.running >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                          {d.running >= 0 ? "+" : ""}{formatMoney(d.running)}
                        </span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="pl" radius={[2, 2, 0, 0]}>
              {data.map((entry: any, idx: number) => (
                <Cell key={idx} fill={entry.pl >= 0 ? WIN_COLOR : LOSS_COLOR} fillOpacity={0.8} />
              ))}
            </Bar>
            <Line type="monotone" dataKey="running" stroke="#3b82f6" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
          </ComposedChart>
        </ChartContainer>
        <p className="text-[10px] text-muted-foreground mt-2">Bars: daily P&L · Dashed line: running cumulative</p>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════
//  Drawdown Chart with Enhanced Styling
// ═══════════════════════════════════════════════════════

export function EnhancedDrawdownChart({ metricsHistory, drawdownData }: { metricsHistory: any[]; drawdownData: any[] }) {
  const data = useMemo(() => {
    const raw = drawdownData.length ? drawdownData : metricsHistory;
    if (!raw.length) return [];
    const step = Math.max(1, Math.floor(raw.length / 60));
    return raw
      .filter((_: any, i: number) => i % step === 0 || i === raw.length - 1)
      .map((d: any) => ({
        time: new Date(d.recordedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        drawdown: d.drawdown || d.currentDrawdown || 0,
        daily: d.dailyDrawdown || 0,
      }));
  }, [drawdownData, metricsHistory]);

  if (data.length === 0) return null;

  return (
    <Card className="gap-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-destructive" />
          Drawdown Tracker
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-[2.5/1] w-full">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} domain={[0, "auto"]} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <defs>
              <linearGradient id="ddFillEnhanced" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="ddDailyFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="drawdown" stroke="#ef4444" fill="url(#ddFillEnhanced)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
            <Area type="monotone" dataKey="daily" stroke="#f59e0b" fill="url(#ddDailyFill)" strokeWidth={1} dot={false} />
          </AreaChart>
        </ChartContainer>
        <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 bg-red-500" />
            Max Drawdown
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 bg-amber-500" />
            Daily Drawdown
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
