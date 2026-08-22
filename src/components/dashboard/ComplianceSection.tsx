/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Shield, AlertTriangle, CheckCircle2, XCircle, Clock,
  TrendingDown, BarChart3, Target, Bot, Copy, Calendar,
  Newspaper, Layers, Zap,
} from "lucide-react";
import { ComplianceGauge, getStatusFromPercent, type GaugeStatus } from "./ComplianceGauge";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/* ─── Types ────────────────────────────────────────── */

interface ComplianceRule {
  code: string;
  label: string;
  icon: React.ElementType;
  /** 0-100 percent of limit used (higher = closer to breach) */
  usagePercent: number;
  /** Human-readable current value */
  currentValue: string;
  /** Human-readable limit */
  limitValue: string;
  /** Status override */
  status: GaugeStatus;
  /** Whether this rule is enabled for the challenge */
  enabled: boolean;
  /** Optional detail text for tooltip */
  detail?: string;
  /** Whether any violation has occurred */
  violated: boolean;
  /** Violation message if any */
  violationMessage?: string;
}

interface ComplianceSectionProps {
  challenge: any;
  metrics: any;
  metricsHistory?: any[];
}

/* ─── Helpers ──────────────────────────────────────── */

function formatMoney(val: number): string {
  return `$${Math.abs(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(val: number): string {
  return `${val.toFixed(1)}%`;
}

/* ─── Rule Computation ─────────────────────────────── */

function computeRules(
  challenge: any,
  metrics: any,
  metricsHistory: any[] = []
): ComplianceRule[] {
  const accountSize = challenge.accountSize || 0;
  const rules = challenge.templateRules || {};
  const violations: any[] = (() => {
    try { return challenge.violations ? JSON.parse(challenge.violations) : []; }
    catch { return []; }
  })();

  const violationMap = new Map<string, any>();
  violations.forEach((v: any) => {
    const key = v.code || v.type;
    if (key && !violationMap.has(key)) violationMap.set(key, v);
  });

  const result: ComplianceRule[] = [];

  // 1. Max Drawdown
  const maxDdPct = rules.maxDrawdown ?? challenge.maxDrawdown ?? 0;
  if (maxDdPct > 0 && accountSize > 0) {
    const limit = (maxDdPct / 100) * accountSize;
    const current = metrics?.currentDrawdown ?? 0;
    const usage = Math.min((current / limit) * 100, 100);
    const status = violationMap.has("max_drawdown") ? "breach" :
      usage >= 90 ? "danger" : usage >= 70 ? "warning" :
      usage >= 50 ? "caution" : "safe";
    result.push({
      code: "max_drawdown",
      label: "Max Drawdown",
      icon: TrendingDown,
      usagePercent: usage,
      currentValue: `${formatMoney(current)} / ${formatMoney(limit)}`,
      limitValue: `${maxDdPct}% of account`,
      status,
      enabled: true,
      detail: `Maximum allowed drawdown is ${maxDdPct}% (${formatMoney(limit)}) of your $${accountSize.toLocaleString()} account. Current unrealized + realized loss from peak: ${formatMoney(current)}.`,
      violated: violationMap.has("max_drawdown"),
      violationMessage: violationMap.get("max_drawdown")?.message,
    });
  }

  // 2. Daily Drawdown
  const dailyDdPct = rules.dailyDrawdown ?? challenge.dailyDrawdown ?? 0;
  if (dailyDdPct > 0 && accountSize > 0) {
    const limit = (dailyDdPct / 100) * accountSize;
    const current = metrics?.dailyDrawdown ?? 0;
    const usage = Math.min((current / limit) * 100, 100);
    const status = violationMap.has("daily_drawdown") ? "breach" :
      usage >= 90 ? "danger" : usage >= 70 ? "warning" :
      usage >= 50 ? "caution" : "safe";
    result.push({
      code: "daily_drawdown",
      label: "Daily Drawdown",
      icon: BarChart3,
      usagePercent: usage,
      currentValue: `${formatMoney(current)} / ${formatMoney(limit)}`,
      limitValue: `${dailyDdPct}% per day`,
      status,
      enabled: true,
      detail: `Maximum daily loss is ${dailyDdPct}% (${formatMoney(limit)}). Resets at midnight UTC. Today's drawdown: ${formatMoney(current)}.`,
      violated: violationMap.has("daily_drawdown"),
      violationMessage: violationMap.get("daily_drawdown")?.message,
    });
  }

  // 3. Profit Target
  const profitTargetPct = rules.profitTarget ?? challenge.profitTarget ?? 0;
  if (profitTargetPct > 0 && accountSize > 0) {
    const targetAmount = (profitTargetPct / 100) * accountSize;
    const totalProfit = metrics?.totalProfit ?? 0;
    const progress = metrics?.profitTargetProgress ?? (totalProfit > 0 ? Math.min((totalProfit / targetAmount) * 100, 100) : 0);
    const status: GaugeStatus = progress >= 100 ? "safe" : progress >= 75 ? "caution" : progress >= 50 ? "caution" : "safe";
    result.push({
      code: "profit_target",
      label: "Profit Target",
      icon: Target,
      usagePercent: Math.min(progress, 100),
      currentValue: formatPercent(progress),
      limitValue: `${profitTargetPct}% (${formatMoney(targetAmount)})`,
      status,
      enabled: true,
      detail: `Your challenge requires ${profitTargetPct}% profit (${formatMoney(targetAmount)}). Current profit: ${formatMoney(totalProfit)} (${formatPercent(progress)} of target).`,
      violated: false,
    });
  }

  // 4. Trading Days
  const minDays = rules.minTradingDays ?? challenge.minTradingDays ?? 0;
  if (minDays > 0) {
    const current = metrics?.tradingDaysCount ?? 0;
    const usage = Math.min((current / minDays) * 100, 100);
    const status: GaugeStatus = usage >= 100 ? "safe" : usage >= 75 ? "caution" : usage >= 50 ? "warning" : "danger";
    result.push({
      code: "min_trading_days",
      label: "Min Trading Days",
      icon: Calendar,
      usagePercent: usage,
      currentValue: `${current} / ${minDays} days`,
      limitValue: `Minimum ${minDays} trading days required`,
      status,
      enabled: true,
      detail: `You must trade on at least ${minDays} days. You have traded on ${current} day(s). ${minDays - current > 0 ? `${minDays - current} more needed.` : "Requirement met!"}`,
      violated: false,
    });
  }

  // 5. Consistency Rule
  const consistencyTarget = rules.consistencyTarget;
  if (consistencyTarget && consistencyTarget > 0 && metricsHistory.length > 0) {
    const totalProfit = metrics?.totalProfit ?? 0;
    if (totalProfit > 0) {
      const bestDay = Math.max(0, ...metricsHistory.map((m: any) => m.dailyPL ?? 0));
      const bestPct = (bestDay / totalProfit) * 100;
      const usage = Math.min((bestPct / consistencyTarget) * 100, 100);
      const status = violationMap.has("consistency") ? "breach" :
        usage >= 90 ? "danger" : usage >= 70 ? "warning" :
        usage >= 50 ? "caution" : "safe";
      result.push({
        code: "consistency",
        label: "Consistency Rule",
        icon: Layers,
        usagePercent: usage,
        currentValue: `Best day: ${formatPercent(bestPct)} of total`,
        limitValue: `Max ${consistencyTarget}% per day`,
        status,
        enabled: true,
        detail: `No single day's profit can exceed ${consistencyTarget}% of total profit. Best day: ${formatMoney(bestDay)} (${formatPercent(bestPct)}). Total profit: ${formatMoney(totalProfit)}.`,
        violated: violationMap.has("consistency"),
        violationMessage: violationMap.get("consistency")?.message,
      });
    }
  }

  // 6. Max Position Size
  const maxPosSize = rules.maxPositionSize;
  if (maxPosSize && maxPosSize > 0) {
    result.push({
      code: "max_position_size",
      label: "Max Position Size",
      icon: Zap,
      usagePercent: violationMap.has("max_position_size") ? 100 : 0,
      currentValue: violationMap.has("max_position_size") ? "Exceeded" : "OK",
      limitValue: `${maxPosSize} lots max`,
      status: violationMap.has("max_position_size") ? "breach" : "safe",
      enabled: true,
      detail: `Maximum allowed position size is ${maxPosSize} lots per trade.`,
      violated: violationMap.has("max_position_size"),
      violationMessage: violationMap.get("max_position_size")?.message,
    });
  }

  // 7. Weekend Holding
  const allowWeekend = rules.allowWeekendHolding ?? true;
  result.push({
    code: "weekend_holding",
    label: "Weekend Holding",
    icon: Calendar,
    usagePercent: violationMap.has("weekend_holding") ? 100 : 0,
    currentValue: allowWeekend ? "Allowed" : (violationMap.has("weekend_holding") ? "Violated" : "Not held"),
    limitValue: allowWeekend ? "No restriction" : "Positions must close before weekend",
    status: violationMap.has("weekend_holding") ? "breach" : "safe",
    enabled: !allowWeekend,
    detail: allowWeekend
      ? "You are allowed to hold positions over the weekend."
      : "All positions must be closed before market close on Friday. Opening or holding on Saturday/Sunday is prohibited.",
    violated: violationMap.has("weekend_holding"),
    violationMessage: violationMap.get("weekend_holding")?.message,
  });

  // 8. News Trading
  const allowNews = rules.allowNewsTrading ?? true;
  result.push({
    code: "news_trading",
    label: "News Trading",
    icon: Newspaper,
    usagePercent: violationMap.has("news_trading") ? 100 : 0,
    currentValue: allowNews ? "Allowed" : (violationMap.has("news_trading") ? "Violated" : "No breaches"),
    limitValue: allowNews ? "No restriction" : "Blackout ±15min around news",
    status: violationMap.has("news_trading") ? "breach" : "safe",
    enabled: !allowNews,
    detail: allowNews
      ? "You are allowed to trade during high-impact news events."
      : "Opening positions within 15 minutes before/after high-impact news events is prohibited.",
    violated: violationMap.has("news_trading"),
    violationMessage: violationMap.get("news_trading")?.message,
  });

  // 9. EA Trading
  const allowEA = rules.allowEATrading ?? true;
  result.push({
    code: "ea_detected",
    label: "EA / Bot Trading",
    icon: Bot,
    usagePercent: violationMap.has("ea_detected") ? 100 : 0,
    currentValue: allowEA ? "Allowed" : (violationMap.has("ea_detected") ? "Detected" : "Not detected"),
    limitValue: allowEA ? "No restriction" : "Manual trading required",
    status: violationMap.has("ea_detected") ? "breach" : "safe",
    enabled: !allowEA,
    detail: allowEA
      ? "Expert Advisors and automated trading bots are permitted."
      : "Automated trading via EAs or bots is prohibited. Heuristics detect robotic patterns, high-frequency, and night trading.",
    violated: violationMap.has("ea_detected"),
    violationMessage: violationMap.get("ea_detected")?.message,
  });

  // 10. Copy Trading
  const allowCopy = rules.allowCopyTrading ?? false;
  result.push({
    code: "copy_trading_detected",
    label: "Copy Trading",
    icon: Copy,
    usagePercent: violationMap.has("copy_trading_detected") ? 100 : 0,
    currentValue: allowCopy ? "Allowed" : (violationMap.has("copy_trading_detected") ? "Detected" : "Not detected"),
    limitValue: allowCopy ? "No restriction" : "Independent trading required",
    status: violationMap.has("copy_trading_detected") ? "breach" : "safe",
    enabled: !allowCopy,
    detail: allowCopy
      ? "Copy trading from other accounts is permitted."
      : "Identical trade signatures within a short window are detected and prohibited.",
    violated: violationMap.has("copy_trading_detected"),
    violationMessage: violationMap.get("copy_trading_detected")?.message,
  });

  return result;
}

/* ─── Subcomponents ────────────────────────────────── */

function StatusIcon({ status }: { status: GaugeStatus }) {
  switch (status) {
    case "breach":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "danger":
      return <AlertTriangle className="h-4 w-4 text-red-400" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case "caution":
      return <Clock className="h-4 w-4 text-blue-500" />;
    case "safe":
    default:
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  }
}

function statusLabel(status: GaugeStatus): string {
  switch (status) {
    case "breach": return "Breached";
    case "danger": return "Danger";
    case "warning": return "At Risk";
    case "caution": return "Monitor";
    case "safe": return "Clear";
  }
}

function statusBadgeClass(status: GaugeStatus): string {
  switch (status) {
    case "breach": return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    case "danger": return "bg-red-500/10 text-red-500 dark:text-red-400 border-red-500/20";
    case "warning": return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    case "caution": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    case "safe": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
  }
}

/* ─── Main Component ───────────────────────────────── */

export function ComplianceSection({ challenge, metrics, metricsHistory = [] }: ComplianceSectionProps) {
  const rules = useMemo(
    () => computeRules(challenge, metrics, metricsHistory),
    [challenge, metrics, metricsHistory]
  );

  const activeRules = rules.filter((r) => r.enabled || r.violated);
  const violatedCount = rules.filter((r) => r.violated).length;
  const warningCount = rules.filter((r) => r.status === "warning" || r.status === "danger").length;
  const overallStatus: GaugeStatus = violatedCount > 0 ? "breach" :
    warningCount > 0 ? "warning" : "safe";

  // Compute overall health score from all gauges
  const avgHealth = activeRules.length > 0
    ? Math.round(activeRules.reduce((sum, r) => sum + (r.violated ? 0 : Math.max(0, 100 - r.usagePercent)), 0) / activeRules.length)
    : 100;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* ─── Overall Status Banner ─── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "rounded-xl border p-5",
            overallStatus === "breach"
              ? "border-red-500/30 bg-red-500/5"
              : overallStatus === "warning"
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-green-500/20 bg-green-500/5"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center",
                overallStatus === "breach" ? "bg-red-500/10" :
                overallStatus === "warning" ? "bg-amber-500/10" : "bg-green-500/10"
              )}>
                <Shield className={cn(
                  "h-5 w-5",
                  overallStatus === "breach" ? "text-red-500" :
                  overallStatus === "warning" ? "text-amber-500" : "text-green-500"
                )} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Compliance Status</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {violatedCount > 0
                    ? `${violatedCount} rule violation${violatedCount > 1 ? "s" : ""} detected — challenge may be at risk`
                    : warningCount > 0
                    ? `${warningCount} rule${warningCount > 1 ? "s" : ""} approaching limit — trade carefully`
                    : "All rules within safe thresholds — keep it up"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn("text-[10px] font-medium", statusBadgeClass(overallStatus))}>
                {statusLabel(overallStatus)}
              </Badge>
              <div className="text-right">
                <div className="text-2xl font-bold tabular-nums">{avgHealth}</div>
                <div className="text-[10px] text-muted-foreground">Health Score</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ─── Key Gauge Row ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {rules.filter((r) =>
            ["max_drawdown", "daily_drawdown", "profit_target", "min_trading_days"].includes(r.code)
          ).map((rule) => (
            <motion.div
              key={rule.code}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="card-subtle p-4 flex flex-col items-center"
            >
              <ComplianceGauge
                percent={rule.usagePercent}
                value={rule.code === "profit_target"
                  ? formatPercent(rule.usagePercent)
                  : rule.code === "min_trading_days"
                  ? `${Math.round(rule.usagePercent)}%`
                  : `${Math.round(rule.usagePercent)}%`
                }
                label={rule.label}
                subtitle={rule.limitValue}
                status={rule.status}
                size={100}
              />
            </motion.div>
          ))}
        </div>

        {/* ─── Rule Cards Grid ─── */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            All Trading Rules
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {rules.map((rule, i) => {
              const Icon = rule.icon;
              return (
                <motion.div
                  key={rule.code}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i }}
                  className={cn(
                    "card-subtle p-4 transition-colors",
                    rule.violated && "border-red-500/30 bg-red-500/5",
                    rule.status === "danger" && !rule.violated && "border-amber-500/20",
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                      rule.violated ? "bg-red-500/10" :
                      rule.status === "danger" ? "bg-red-500/5" :
                      rule.status === "warning" ? "bg-amber-500/10" :
                      "bg-secondary"
                    )}>
                      <Icon className={cn(
                        "h-4 w-4",
                        rule.violated ? "text-red-500" :
                        rule.status === "danger" ? "text-red-400" :
                        rule.status === "warning" ? "text-amber-500" :
                        "text-muted-foreground"
                      )} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{rule.label}</span>
                          <StatusIcon status={rule.status} />
                        </div>
                        <Badge variant="outline" className={cn("text-[9px] font-medium", statusBadgeClass(rule.status))}>
                          {statusLabel(rule.status)}
                        </Badge>
                      </div>

                      {/* Bar gauge */}
                      <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${rule.usagePercent}%` }}
                          transition={{ duration: 0.8, delay: 0.1 * i, ease: "easeOut" }}
                          className={cn(
                            "h-full rounded-full",
                            rule.violated ? "bg-red-500" :
                            rule.status === "danger" ? "bg-red-400" :
                            rule.status === "warning" ? "bg-amber-500" :
                            rule.status === "caution" ? "bg-blue-500" :
                            "bg-green-500"
                          )}
                        />
                      </div>

                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {rule.currentValue}
                        </span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground underline-offset-2 hover:underline transition-colors">
                              Details
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs">
                            {rule.detail}
                          </TooltipContent>
                        </Tooltip>
                      </div>

                      {/* Violation message */}
                      {rule.violated && rule.violationMessage && (
                        <div className="mt-2 flex items-start gap-1.5 p-2 rounded-md bg-red-500/5 border border-red-500/20">
                          <AlertTriangle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
                          <span className="text-[10px] text-red-600 dark:text-red-400 leading-snug">
                            {rule.violationMessage}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* ─── Rules Legend ─── */}
        <div className="card-subtle p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Status Guide</div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {[
              { status: "safe" as GaugeStatus, label: "0–49% — Clear" },
              { status: "caution" as GaugeStatus, label: "50–69% — Monitor" },
              { status: "warning" as GaugeStatus, label: "70–89% — At Risk" },
              { status: "danger" as GaugeStatus, label: "90–99% — Danger" },
              { status: "breach" as GaugeStatus, label: "100% — Breached" },
            ].map(({ status: s, label: l }) => (
              <div key={s} className="flex items-center gap-1.5">
                <StatusIcon status={s} />
                <span className="text-[10px] text-muted-foreground">{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
