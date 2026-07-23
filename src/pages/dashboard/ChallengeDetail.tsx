import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, TrendingUp, Wallet, Target, AlertTriangle, Activity, BarChart3, Clock, ChevronRight } from "lucide-react";

export default function ChallengeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const challenge = useQuery(api.challenges.getMyChallengeById, {
    challengeId: id as any,
  });
  const template = challenge
    ? useQuery(api.challenges.getChallengeTemplate, { templateId: challenge.templateId })
    : undefined;
  const latestMetrics = challenge
    ? useQuery(api.trading.getChallengeMetrics, { challengeId: challenge._id as any })
    : undefined;
  const metricsHistory = challenge
    ? useQuery(api.trading.getChallengeMetricsHistory, { challengeId: challenge._id as any, limit: 10 })
    : undefined;
  const drawdownHistory = challenge
    ? useQuery(api.trading.getDrawdownHistory, { challengeId: challenge._id as any, limit: 20 })
    : undefined;

  if (!id) {
    return (
      <div className="card-subtle p-8 text-center">
        <p className="text-xs text-muted-foreground">No challenge ID provided</p>
        <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={() => navigate("/dashboard/challenges")}>
          Back to Challenges
        </Button>
      </div>
    );
  }

  if (!challenge || template === undefined) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statusLabel = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      active: { label: "Active", className: "bg-foreground text-background" },
      pending: { label: "Pending", className: "bg-secondary text-secondary-foreground" },
      phase_1_passed: { label: "Phase 1 Passed", className: "bg-foreground text-background" },
      phase_2_passed: { label: "Phase 2 Passed", className: "bg-foreground text-background" },
      funded: { label: "Funded", className: "bg-foreground text-background" },
      violated: { label: "Violated", className: "bg-destructive/10 text-destructive" },
      expired: { label: "Expired", className: "bg-secondary text-secondary-foreground" },
    };
    return map[status] || { label: status, className: "bg-secondary text-secondary-foreground" };
  };

  const st = statusLabel(challenge.status);
  const violations = challenge.violations || [];
  const criticalViolations = violations.filter((v: any) => v.severity === "critical");
  const warningViolations = violations.filter((v: any) => v.severity === "warning");
  const m = latestMetrics;

  const progressPercent = Math.min(m?.profitTargetProgress ?? 0, 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/dashboard/challenges")} className="h-7 w-7 flex items-center justify-center rounded hover:bg-secondary transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-medium tracking-tight">{template?.name || "Challenge"}</h1>
              <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${st.className}`}>{st.label}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              ${challenge.accountSize.toLocaleString()} · Started {new Date(challenge.createdAt).toLocaleDateString()}
              {challenge.expiresAt ? ` · Expires ${new Date(challenge.expiresAt).toLocaleDateString()}` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Balance",
            value: m ? `$${m.balance.toLocaleString()}` : "—",
            icon: <Wallet className="h-4 w-4" />,
            sub: m ? `Equity: $${m.equity.toLocaleString()}` : undefined,
          },
          {
            label: "Profit Target",
            value: m ? `${m.profitTargetProgress.toFixed(1)}%` : "—",
            icon: <Target className="h-4 w-4" />,
            sub: template ? `${template.profitTarget}% required` : undefined,
          },
          {
            label: "Drawdown",
            value: m ? `${m.currentDrawdown.toFixed(2)}%` : "—",
            icon: <TrendingDownIcon className="h-4 w-4 text-destructive" />,
            sub: `Max: ${challenge.maxDrawdown}% · Daily: ${challenge.dailyDrawdown}%`,
          },
          {
            label: "Health Score",
            value: m ? `${m.healthScore ?? "—"}/100` : "—",
            icon: <Activity className="h-4 w-4" />,
            sub: m?.riskScore !== undefined ? `Risk: ${m.riskScore}/100` : undefined,
          },
        ].map((card) => (
          <div key={card.label} className="card-subtle p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-6 rounded-full border border-border flex items-center justify-center">{card.icon}</div>
              <span className="text-xs text-muted-foreground">{card.label}</span>
            </div>
            <div className="text-lg font-medium">{card.value}</div>
            {card.sub && <div className="text-[10px] text-muted-foreground mt-0.5">{card.sub}</div>}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="card-subtle p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium">Profit Target Progress</span>
          <span className="text-xs text-muted-foreground">{progressPercent.toFixed(1)}%</span>
        </div>
        <div className="h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-foreground transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Stats grid */}
      {m && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Trading Days", value: m.tradingDaysCount, icon: <CalendarIcon /> },
            { label: "Open Positions", value: m.openPositions, icon: <BarChart3 className="h-3.5 w-3.5" /> },
            { label: "Closed Trades", value: m.closedTrades, icon: <Activity className="h-3.5 w-3.5" /> },
            { label: "Total P&L", value: `$${m.totalProfit.toLocaleString()}`, icon: <TrendingUp className="h-3.5 w-3.5" /> },
            { label: "Win Rate", value: m.winRate !== undefined ? `${m.winRate.toFixed(1)}%` : "—", icon: <Target className="h-3.5 w-3.5" /> },
            { label: "Profit Factor", value: m.profitFactor !== undefined ? m.profitFactor.toFixed(2) : "—", icon: <Activity className="h-3.5 w-3.5" /> },
            { label: "Avg R:R", value: m.averageRR !== undefined ? m.averageRR.toFixed(2) : "—", icon: <BarChart3 className="h-3.5 w-3.5" /> },
            { label: "Expectancy", value: m.expectancy !== undefined ? m.expectancy.toFixed(2) : "—", icon: <TrendingUp className="h-3.5 w-3.5" /> },
          ].map((stat) => (
            <div key={stat.label} className="card-subtle p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full border border-border flex items-center justify-center">{stat.icon}</div>
                <div>
                  <div className="text-[10px] text-muted-foreground">{stat.label}</div>
                  <div className="text-sm font-medium">{stat.value}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Consecutive wins/losses and largest win/loss */}
      {m && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Consecutive Wins", value: m.consecutiveWins ?? 0 },
            { label: "Consecutive Losses", value: m.consecutiveLosses ?? 0 },
            { label: "Largest Win", value: m.largestWin !== undefined ? `$${m.largestWin.toLocaleString()}` : "—" },
            { label: "Largest Loss", value: m.largestLoss !== undefined ? `$${m.largestLoss.toLocaleString()}` : "—" },
          ].map((stat) => (
            <div key={stat.label} className="card-subtle p-3 text-xs">
              <span className="text-muted-foreground">{stat.label}</span>
              <div className="font-medium mt-0.5">{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Violations */}
      {violations.length > 0 && (
        <div>
          <h2 className="text-sm font-medium mb-3">Violations</h2>
          <div className="space-y-1">
            {violations.map((v: any, i: number) => (
              <div key={i} className="card-subtle p-3 flex items-start gap-3 text-xs">
                <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${v.severity === "critical" ? "text-destructive" : "text-amber-500"}`} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize">{v.type.replace(/_/g, " ")}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${v.severity === "critical" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-500"}`}>
                      {v.severity}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-0.5">{v.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(v.detectedAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrics history */}
      {metricsHistory && metricsHistory.length > 1 && (
        <div>
          <h2 className="text-sm font-medium mb-3">Recent Metrics</h2>
          <div className="space-y-1">
            {metricsHistory.slice(0, 10).map((metric: any) => (
              <div key={metric._id} className="card-subtle p-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground w-24">{new Date(metric.recordedAt).toLocaleDateString()} {new Date(metric.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <span>Balance: <span className="font-medium">${metric.balance.toLocaleString()}</span></span>
                  <span>Equity: <span className="font-medium">${metric.equity.toLocaleString()}</span></span>
                  <span>DD: <span className="font-medium">{metric.currentDrawdown.toFixed(2)}%</span></span>
                </div>
                <div className="text-muted-foreground">
                  P&L: <span className={metric.totalProfit >= 0 ? "text-emerald-500" : "text-destructive"}>
                    ${metric.totalProfit >= 0 ? "+" : ""}{metric.totalProfit.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No metrics state */}
      {!m && latestMetrics === undefined && (
        <div className="card-subtle p-8 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
        </div>
      )}
      {latestMetrics === null && (
        <div className="card-subtle p-8 text-center">
          <Activity className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No trading data yet</p>
          <p className="text-xs text-muted-foreground mt-1">Metrics will appear once trading begins on the MT5 account.</p>
        </div>
      )}

      {/* Challenge rules */}
      {template && (
        <div>
          <h2 className="text-sm font-medium mb-3">Challenge Rules</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Profit Target", value: `${template.profitTarget}%` },
              { label: "Max Drawdown", value: `${template.maxDrawdown}%` },
              { label: "Daily Drawdown", value: `${template.dailyDrawdown}%` },
              { label: "Min Trading Days", value: template.minTradingDays },
              { label: "Leverage", value: `1:${template.maxLeverage}` },
              { label: "Duration", value: template.durationDays > 0 ? `${template.durationDays} days` : "Unlimited" },
              { label: "EA Trading", value: template.allowEATrading ? "Allowed" : "Not allowed" },
              { label: "Weekend Holding", value: template.allowWeekendHolding ? "Allowed" : "Not allowed" },
            ].map((rule) => (
              <div key={rule.label} className="card-subtle p-3 text-xs">
                <span className="text-muted-foreground">{rule.label}</span>
                <div className="font-medium mt-0.5">{rule.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail info */}
      <div className="card-subtle p-4 text-xs text-muted-foreground space-y-1">
        <div className="flex justify-between">
          <span>Challenge ID</span>
          <span className="font-mono">{challenge._id}</span>
        </div>
        <div className="flex justify-between">
          <span>Amount Paid</span>
          <span>₦{challenge.amountPaid?.toLocaleString() || 0}</span>
        </div>
        {challenge.startedAt && (
          <div className="flex justify-between">
            <span>Started At</span>
            <span>{new Date(challenge.startedAt).toLocaleString()}</span>
          </div>
        )}
        {challenge.mt5AccountId && (
          <div className="flex justify-between">
            <span>MT5 Account</span>
            <span className="font-mono">{challenge.mt5AccountId}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Simple inline icons to avoid importing too many Lucide icons
function TrendingDownIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
      <polyline points="16 17 22 17 22 11" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
