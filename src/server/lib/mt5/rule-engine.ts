/**
 * MT5 Challenge Rule Engine.
 *
 * Pure, side-effect-free evaluation of challenge template rules against the
 * synced metrics snapshot + recent trade history. The sync service calls
 * `evaluateChallengeRules` after each metrics sync and turns hard violations
 * into challenge terminations.
 *
 * Rules evaluated (all configurable per template):
 *   - max drawdown    (current drawdown >= % of account size)
 *   - daily drawdown  (daily drawdown >= % of account size)
 *   - consistency     (best day's profit > consistencyTarget % of total profit)
 *   - max position size (any trade volume > maxPositionSize lots)
 *   - weekend holding (trade opened/closed on Sat/Sun when disallowed)
 *   - news trading    (trade opened within ±15 min of a high-impact news event)
 *   - EA detection    (heuristics: high frequency, robotic spacing, night trading)
 *   - copy trading    (identical trade signatures within a short window)
 *
 * Trade-based rules need closed-trade history from the gateway provider;
 * when no gateway is configured (simulated mode) those checks simply see no
 * trades. The news rule additionally requires a configured news feed
 * (settings key `news_calendar`) — without events it never fires.
 */
import type { ChallengeRow, MT5TradeRecord, SyncMetrics } from "./types";

/** Template rules that the engine understands (subset of challenge_templates). */
export interface ChallengeRules {
  profitTarget: number; // %
  dailyDrawdown: number; // %
  maxDrawdown: number; // %
  minTradingDays: number;
  /** Best-day share of total profit allowed, in %. null/0 = rule disabled. */
  consistencyTarget: number | null;
  /** Maximum allowed position size in lots. null/0 = rule disabled. */
  maxPositionSize: number | null;
  allowWeekendHolding: boolean;
  allowNewsTrading: boolean;
  allowEATrading: boolean;
  allowCopyTrading: boolean;
}

export type RuleCode =
  | "max_drawdown"
  | "daily_drawdown"
  | "consistency"
  | "max_position_size"
  | "weekend_holding"
  | "news_trading"
  | "ea_detected"
  | "copy_trading_detected";

export interface RuleViolation {
  code: RuleCode;
  /** "hard" ends the challenge; "warning" is surfaced but non-terminal. */
  severity: "hard" | "warning";
  message: string;
  evidence: Record<string, unknown>;
  detectedAt: number;
}

export interface RuleEngineInput {
  challenge: ChallengeRow;
  rules: ChallengeRules;
  metrics: SyncMetrics;
  /** All stored daily metrics for this challenge, oldest → newest. */
  metricsHistory: Array<{ dailyPL: number | null; totalProfit: number | null; recordedAt: number }>;
  /** Closed trades in the evaluation window (gateway provider only). */
  trades: MT5TradeRecord[];
  /** High-impact news event timestamps (epoch ms) — from a configured feed. */
  newsEvents?: number[];
  now?: number;
}

/** Map a challenge_templates row into the rule set the engine consumes. */
export function rulesFromTemplate(template: {
  profitTarget: number;
  dailyDrawdown: number;
  maxDrawdown: number;
  minTradingDays: number;
  consistencyTarget: number | null;
  maxPositionSize: number | null;
  allowWeekendHolding: boolean | null;
  allowNewsTrading: boolean | null;
  allowEATrading: boolean | null;
  allowCopyTrading: boolean | null;
}): ChallengeRules {
  return {
    profitTarget: template.profitTarget ?? 0,
    dailyDrawdown: template.dailyDrawdown ?? 0,
    maxDrawdown: template.maxDrawdown ?? 0,
    minTradingDays: template.minTradingDays ?? 0,
    consistencyTarget: template.consistencyTarget && template.consistencyTarget > 0 ? template.consistencyTarget : null,
    maxPositionSize: template.maxPositionSize && template.maxPositionSize > 0 ? template.maxPositionSize : null,
    allowWeekendHolding: !!template.allowWeekendHolding,
    allowNewsTrading: !!template.allowNewsTrading,
    allowEATrading: !!template.allowEATrading,
    allowCopyTrading: !!template.allowCopyTrading,
  };
}

/** Human-readable rule label (used by notifications, audit, and the UI). */
export function ruleLabel(code: RuleCode): string {
  switch (code) {
    case "max_drawdown": return "Max drawdown";
    case "daily_drawdown": return "Daily drawdown";
    case "consistency": return "Consistency rule";
    case "max_position_size": return "Max position size";
    case "weekend_holding": return "Weekend holding";
    case "news_trading": return "News trading";
    case "ea_detected": return "EA trading";
    case "copy_trading_detected": return "Copy trading";
  }
}

/** Short reason clause for the violation notification. */
export function violationReason(v: RuleViolation, rules: ChallengeRules): string {
  switch (v.code) {
    case "max_drawdown": return `exceeding the maximum drawdown limit (${rules.maxDrawdown}%)`;
    case "daily_drawdown": return `exceeding the daily drawdown limit (${rules.dailyDrawdown}%)`;
    case "consistency": return `breaching the consistency rule (one day exceeded ${rules.consistencyTarget}% of total profit)`;
    case "max_position_size": return "opening positions larger than the allowed maximum";
    case "weekend_holding": return "holding positions over the weekend";
    case "news_trading": return "trading around high-impact news events";
    case "ea_detected": return "using trading patterns consistent with automated (EA) trading";
    case "copy_trading_detected": return "using patterns consistent with copy trading";
  }
}

const NEWS_WINDOW_MS = 15 * 60 * 1000; // ±15 min around a news event
const EA_SPACING_MS = 60_000; // robotic gap between consecutive opens
const EA_MIN_STREAK = 3; // consecutive robotic gaps needed
const EA_MIN_NIGHT_TRADES = 5; // opens between 22:00–06:59 UTC
const EA_MIN_TRADE_COUNT = 15; // total trades in the window
const COPY_WINDOW_MS = 10_000; // identical-signature window

function isWeekendUTC(ts: number): boolean {
  const day = new Date(ts).getUTCDay();
  return day === 0 || day === 6;
}

function isNightUTC(ts: number): boolean {
  const h = new Date(ts).getUTCHours();
  return h >= 22 || h <= 6;
}

/**
 * Evaluate every enabled rule for one challenge. Returns all violations found
 * (usually zero). `hard` violations terminate the challenge; `warning`s are
 * surfaced but non-terminal (the engine currently only emits hard violations).
 */
export function evaluateChallengeRules(input: RuleEngineInput): RuleViolation[] {
  const now = input.now ?? Date.now();
  const { rules, metrics, challenge, trades } = input;
  const baseBalance = challenge.accountSize || 0;
  const violations: RuleViolation[] = [];

  const push = (code: RuleCode, severity: RuleViolation["severity"], message: string, evidence: Record<string, unknown>) => {
    violations.push({ code, severity, message, evidence, detectedAt: now });
  };

  // ── Drawdowns ─────────────────────────────────────────────
  if (rules.maxDrawdown > 0 && baseBalance > 0) {
    const limit = (rules.maxDrawdown / 100) * baseBalance;
    const current = metrics.currentDrawdown ?? 0;
    if (current >= limit) {
      push(
        "max_drawdown",
        "hard",
        `Current drawdown ${current.toFixed(2)} exceeds the ${rules.maxDrawdown}% limit (${limit.toFixed(2)}).`,
        { currentDrawdown: current, limit, maxDrawdownPct: rules.maxDrawdown, equity: metrics.equity, balance: metrics.balance },
      );
    }
  }

  if (rules.dailyDrawdown > 0 && baseBalance > 0) {
    const limit = (rules.dailyDrawdown / 100) * baseBalance;
    const daily = metrics.dailyDrawdown ?? 0;
    if (daily >= limit) {
      push(
        "daily_drawdown",
        "hard",
        `Daily drawdown ${daily.toFixed(2)} exceeds the ${rules.dailyDrawdown}% limit (${limit.toFixed(2)}).`,
        { dailyDrawdown: daily, limit, dailyDrawdownPct: rules.dailyDrawdown, dailyPL: metrics.dailyPL },
      );
    }
  }

  // ── Consistency rule ──────────────────────────────────────
  // Best day's profit must not exceed consistencyTarget % of total profit
  // (only meaningful while the account is in profit).
  if (rules.consistencyTarget && rules.consistencyTarget > 0 && input.metricsHistory.length > 0) {
    const totalProfit = metrics.totalProfit ?? 0;
    if (totalProfit > 0) {
      const bestDay = Math.max(0, ...input.metricsHistory.map((m) => m.dailyPL ?? 0));
      const bestPct = (bestDay / totalProfit) * 100;
      if (bestDay > 0 && bestPct > rules.consistencyTarget) {
        push(
          "consistency",
          "hard",
          `Best day (${bestDay.toFixed(2)}) is ${bestPct.toFixed(1)}% of total profit — above the ${rules.consistencyTarget}% consistency limit.`,
          { bestDay, bestDayPct: Math.round(bestPct * 10) / 10, totalProfit, consistencyTarget: rules.consistencyTarget },
        );
      }
    }
  }

  // ── Trade-based rules ─────────────────────────────────────
  if (trades.length > 0) {
    // Max position size
    if (rules.maxPositionSize && rules.maxPositionSize > 0) {
      const oversize = trades.find((t) => t.volume > rules.maxPositionSize!);
      if (oversize) {
        push(
          "max_position_size",
          "hard",
          `Position of ${oversize.volume} lots on ${oversize.symbol} exceeds the ${rules.maxPositionSize} lot limit.`,
          { symbol: oversize.symbol, volume: oversize.volume, limit: rules.maxPositionSize, action: oversize.action },
        );
      }
    }

    // Weekend holding
    if (!rules.allowWeekendHolding) {
      const weekendTrade = trades.find((t) => isWeekendUTC(t.openedAt) || isWeekendUTC(t.closedAt));
      if (weekendTrade) {
        push(
          "weekend_holding",
          "hard",
          `Position on ${weekendTrade.symbol} was held over the weekend.`,
          { symbol: weekendTrade.symbol, openedAt: weekendTrade.openedAt, closedAt: weekendTrade.closedAt },
        );
      }
    }

    // News trading — only meaningful with a configured news feed
    if (!rules.allowNewsTrading && input.newsEvents && input.newsEvents.length > 0) {
      const newsTrade = trades.find((t) =>
        input.newsEvents!.some((ev) => Math.abs(t.openedAt - ev) <= NEWS_WINDOW_MS),
      );
      if (newsTrade) {
        push(
          "news_trading",
          "hard",
          `Position on ${newsTrade.symbol} was opened within ${NEWS_WINDOW_MS / 60_000} minutes of a high-impact news event.`,
          { symbol: newsTrade.symbol, openedAt: newsTrade.openedAt, windowMinutes: NEWS_WINDOW_MS / 60_000 },
        );
      }
    }

    // EA detection — heuristic signatures of automation
    if (!rules.allowEATrading) {
      const sorted = [...trades].sort((a, b) => a.openedAt - b.openedAt);
      let streak = 0;
      let maxStreak = 0;
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i].openedAt - sorted[i - 1].openedAt;
        if (gap > 0 && gap <= EA_SPACING_MS) {
          streak += 1;
          maxStreak = Math.max(maxStreak, streak);
        } else {
          streak = 0;
        }
      }
      const nightTrades = sorted.filter((t) => isNightUTC(t.openedAt)).length;
      const highFrequency = trades.length >= EA_MIN_TRADE_COUNT;

      if (maxStreak >= EA_MIN_STREAK || nightTrades >= EA_MIN_NIGHT_TRADES || highFrequency) {
        push(
          "ea_detected",
          "hard",
          "Trading patterns consistent with automated (EA) trading were detected.",
          { tradeCount: trades.length, maxRoboticStreak: maxStreak, nightTrades, highFrequency },
        );
      }
    }

    // Copy trading — identical signature within a short window
    if (!rules.allowCopyTrading) {
      const signature = (t: MT5TradeRecord) => `${t.symbol}|${t.volume}|${t.action}|${t.priceOpen}`;
      const seen = new Map<string, number>();
      let duplicate: MT5TradeRecord | null = null;
      for (const t of trades) {
        const sig = signature(t);
        const firstOpen = seen.get(sig);
        if (firstOpen !== undefined && Math.abs(t.openedAt - firstOpen) <= COPY_WINDOW_MS) {
          duplicate = t;
          break;
        }
        seen.set(sig, t.openedAt);
      }
      if (duplicate) {
        push(
          "copy_trading_detected",
          "hard",
          `Duplicate trades with an identical signature were detected on ${duplicate.symbol}.`,
          { symbol: duplicate.symbol, volume: duplicate.volume, action: duplicate.action, priceOpen: duplicate.priceOpen, windowMs: COPY_WINDOW_MS },
        );
      }
    }
  }

  return violations;
}

/** True when any violation is terminal. */
export function hasHardViolation(violations: RuleViolation[]): boolean {
  return violations.some((v) => v.severity === "hard");
}
