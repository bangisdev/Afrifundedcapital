/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { useParams, useNavigate, Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ArrowLeft, Activity, BarChart3, AlertTriangle, Check, X, ExternalLink, Shield } from "lucide-react";
import { PageLoader } from "@/components/dashboard/PageLoader";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { useMemo, useState } from "react";
import { newsBlackoutWindow, RULE_HINTS } from "@/lib/utils";
import { ComplianceSection } from "@/components/dashboard/ComplianceSection";
import { cn } from "@/lib/utils";

const chartConfig = {
  balance: { label: "Balance", color: "var(--chart-1)" },
  equity: { label: "Equity", color: "var(--chart-2)" },
  drawdown: { label: "Drawdown", color: "var(--destructive)" },
};

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * News-trading rule value: "Yes" when allowed, otherwise the template's
 * configured blackout window ("No · 15m", "No · 30m/5m", "No · no blackout").
 */
function newsTradingLabel(t: any): string {
  if (t.allowNewsTrading !== false) return "Yes";
  const win = newsBlackoutWindow(t);
  return win ? `No · ${win}` : "No · no blackout";
}

function ruleRow(label: string, allowed: boolean, value?: string, hint?: string) {
  return (
    <div className="flex items-start gap-1.5 text-xs">
      {allowed ? (
        <Check className="h-3 w-3 text-brand shrink-0 mt-0.5" />
      ) : (
        <X className="h-3 w-3 text-muted-foreground/50 shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">{label}</span>
          <span className={`font-medium tabular-nums ${allowed ? "text-foreground" : "text-muted-foreground"}`}>
            {value ?? (allowed ? "Yes" : "No")}
          </span>
        </div>
        {hint && (
          <div className="mt-0.5 whitespace-normal text-[10px] leading-snug text-muted-foreground/70">
            {hint}{" "}
            <Link
              to="/docs/trading-rules"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-foreground hover:text-brand transition-colors duration-150"
            >
              Learn more
              <ExternalLink className="h-2.5 w-2.5" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

type Tab = "compliance" | "metrics" | "rules";

export default function ChallengeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const challengeId = id || "0";
  const { data: challenge, isLoading: cLoading } = useApiQuery<any>(["challenge", challengeId], `/api/challenges/my/${challengeId}`);
  const { data: metricsHistory, isLoading: mLoading } = useApiQuery<any[]>(["challenge", challengeId, "metrics"], `/api/challenges/my/${challengeId}/metrics`);
  const { data: metrics } = useApiQuery<any>(["challenge", challengeId, "latest"], `/api/trading/challenge/${challengeId}/metrics`);
  const [activeTab, setActiveTab] = useState<Tab>("compliance");

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
    return <PageLoader />;
  }

  if (!challenge) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/challenges")}><ArrowLeft className="h-3 w-3 mr-1" /> Back</Button>
        <div className="card-subtle p-8 text-center"><p className="text-sm text-muted-foreground">Challenge not found</p></div>
      </div>
    );
  }

  const tabs: Array<{ key: Tab; label: string; icon: React.ElementType }> = [
    { key: "compliance", label: "Compliance Dashboard", icon: Shield },
    { key: "metrics", label: "Performance Charts", icon: Activity },
    { key: "rules", label: "Trading Rules", icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Button variant="ghost" size="sm" className="-ml-2 text-xs text-muted-foreground" onClick={() => navigate("/dashboard/challenges")}>
          <ArrowLeft className="h-3 w-3 mr-1" /> Back to Challenges
        </Button>
        <PageHeader
          eyebrow="Trading"
          title={
            challenge.templateName
              ? `${challenge.templateName} · $${Number(challenge.accountSize || 0).toLocaleString()}`
              : `$${challenge.accountSize?.toLocaleString()} Challenge`
          }
          subtitle={
            <>
              {challenge.templateName ? `Challenge #${challenge.id} · ` : ""}
              Target: {challenge.profitTarget}% · Max DD: {challenge.maxDrawdown}% · Leverage: 1:{challenge.maxLeverage}
            </>
          }
          actions={
            <Badge variant={challenge.status === "active" ? "default" : "secondary"} className="text-[10px]">
              {challenge.status}
            </Badge>
          }
        />
      </div>

      {/* Quick Stats */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card-subtle p-4"><div className="stat-label">Balance</div><div className="stat-value mt-1">${(metrics.balance || 0).toLocaleString()}</div></div>
          <div className="card-subtle p-4"><div className="stat-label">Equity</div><div className="stat-value mt-1">${(metrics.equity || 0).toLocaleString()}</div></div>
          <div className="card-subtle p-4"><div className="stat-label">Profit Target</div><div className="stat-value mt-1">{(metrics.profitTargetProgress || 0).toFixed(1)}%</div></div>
          <div className="card-subtle p-4"><div className="stat-label">Health</div><div className="stat-value mt-1">{metrics.healthScore || 0}/100</div></div>
        </div>
      )}

      {/* Violations Alert */}
      {(() => {
        let violations: any[] = [];
        try { violations = challenge.violations ? JSON.parse(challenge.violations) : []; } catch { violations = []; }
        if (violations.length === 0) return null;
        return (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400 mb-2">
              <AlertTriangle className="h-4 w-4" /> Challenge violated — {violations.length} rule breach(es)
            </div>
            <ul className="space-y-2">
              {violations.map((v: any, i: number) => (
                <li key={i} className="text-xs">
                  <div className="flex items-start gap-2">
                    <Badge variant="destructive" className="text-[10px] shrink-0">{(v.code || v.type || "rule").replace(/_/g, " ")}</Badge>
                    <div className="min-w-0">
                      <div className="text-foreground/90">{v.message || `Detected: ${v.type || v.code}`}</div>
                      <div className="text-muted-foreground mt-0.5">
                        {v.detectedAt ? new Date(v.detectedAt).toLocaleString() : v.date ? new Date(v.date).toLocaleString() : ""}
                        {v.drawdown != null && ` · Drawdown $${Number(v.drawdown).toLocaleString()}`}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {/* Tab Navigation */}
      <div className="flex items-center border-b border-border/50">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors",
                activeTab === tab.key
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "compliance" && (
        <ComplianceSection
          challenge={challenge}
          metrics={metrics}
          metricsHistory={metricsHistory || []}
        />
      )}

      {activeTab === "metrics" && (
        <div className="space-y-6">
          {chartData.length > 0 ? (
            <>
              <div className="card-subtle">
                <div className="px-5 pt-4 pb-2">
                  <h3 className="text-sm font-medium flex items-center gap-2"><Activity className="h-4 w-4 text-muted-foreground" /> Balance & Equity</h3>
                </div>
                <div className="px-2 pb-2">
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
                </div>
              </div>

              <div className="card-subtle">
                <div className="px-5 pt-4 pb-2">
                  <h3 className="text-sm font-medium flex items-center gap-2"><BarChart3 className="h-4 w-4 text-muted-foreground" /> Drawdown</h3>
                </div>
                <div className="px-2 pb-2">
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
                </div>
              </div>
            </>
          ) : (
            <div className="card-subtle p-8 text-center">
              <Activity className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No metrics recorded yet</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "rules" && challenge.templateRules && (
        <div className="card-subtle p-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Challenge Rules</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2.5">
            {ruleRow("Weekend Holding", challenge.templateRules.allowWeekendHolding ?? false, undefined, RULE_HINTS.weekendHolding)}
            {ruleRow("News Trading", challenge.templateRules.allowNewsTrading !== false, newsTradingLabel(challenge.templateRules), RULE_HINTS.newsTrading)}
            {ruleRow("Expert Advisors", challenge.templateRules.allowEATrading !== false, undefined, RULE_HINTS.eaTrading)}
            {ruleRow("Copy Trading", !!challenge.templateRules.allowCopyTrading, undefined, RULE_HINTS.copyTrading)}
          </div>
        </div>
      )}

      {activeTab === "rules" && !challenge.templateRules && (
        <div className="card-subtle p-8 text-center">
          <BarChart3 className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No trading rules configured for this challenge</p>
        </div>
      )}
    </div>
  );
}
