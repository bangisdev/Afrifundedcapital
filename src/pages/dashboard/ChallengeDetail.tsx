/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { useParams, useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Loader2, ArrowLeft, Activity, BarChart3 } from "lucide-react";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { useMemo } from "react";

const chartConfig = {
  balance: { label: "Balance", color: "var(--chart-1)" },
  equity: { label: "Equity", color: "var(--chart-2)" },
  drawdown: { label: "Drawdown", color: "var(--destructive)" },
};

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ChallengeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const challengeId = id || "0";
  const { data: challenge, isLoading: cLoading } = useApiQuery<any>(["challenge", challengeId], `/api/challenges/my/${challengeId}`);
  const { data: metricsHistory, isLoading: mLoading } = useApiQuery<any[]>(["challenge", challengeId, "metrics"], `/api/challenges/my/${challengeId}/metrics`);
  const { data: metrics } = useApiQuery<any>(["challenge", challengeId, "latest"], `/api/trading/challenge/${challengeId}/metrics`);

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

  if (cLoading || mLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!challenge) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/challenges")}><ArrowLeft className="h-3 w-3 mr-1" /> Back</Button>
        <div className="card-subtle p-8 text-center"><p className="text-sm text-muted-foreground">Challenge not found</p></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/challenges")}><ArrowLeft className="h-3 w-3" /></Button>
          <div>
            <h1 className="text-lg font-medium tracking-tight">${challenge.accountSize?.toLocaleString()} Challenge</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Target: {challenge.profitTarget}% · Max DD: {challenge.maxDrawdown}% · Leverage: 1:{challenge.maxLeverage}</p>
          </div>
        </div>
        <Badge variant={challenge.status === "active" ? "default" : "secondary"} className="text-[10px]">{challenge.status}</Badge>
      </div>

      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card-subtle p-4"><div className="stat-label">Balance</div><div className="stat-value mt-1">${(metrics.balance || 0).toLocaleString()}</div></div>
          <div className="card-subtle p-4"><div className="stat-label">Equity</div><div className="stat-value mt-1">${(metrics.equity || 0).toLocaleString()}</div></div>
          <div className="card-subtle p-4"><div className="stat-label">Profit Target</div><div className="stat-value mt-1">{(metrics.profitTargetProgress || 0).toFixed(1)}%</div></div>
          <div className="card-subtle p-4"><div className="stat-label">Health</div><div className="stat-value mt-1">{metrics.healthScore || 0}/100</div></div>
        </div>
      )}

      {chartData.length > 0 && (
        <div className="space-y-6">
          <Card className="gap-0">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Activity className="h-4 w-4 text-muted-foreground" /> Balance & Equity</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="aspect-[2/1] w-full">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} domain={["auto", "auto"]} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="balance" stroke="var(--color-balance)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="equity" stroke="var(--color-equity)" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="gap-0">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><BarChart3 className="h-4 w-4 text-muted-foreground" /> Drawdown</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="aspect-[2/1] w-full">
                <AreaChart data={drawdownData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} domain={[0, "auto"]} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <defs><linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-drawdown)" stopOpacity={0.2} /><stop offset="100%" stopColor="var(--color-drawdown)" stopOpacity={0} /></linearGradient></defs>
                  <Area type="monotone" dataKey="drawdown" stroke="var(--color-drawdown)" fill="url(#ddFill)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {chartData.length === 0 && (
        <div className="card-subtle p-8 text-center"><Activity className="h-8 w-8 mx-auto mb-3 text-muted-foreground" /><p className="text-sm text-muted-foreground">No metrics recorded yet</p></div>
      )}
    </div>
  );
}
