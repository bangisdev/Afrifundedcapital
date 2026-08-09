/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Pure unit tests for the MT5 rule engine — no DB, no provider. Each rule is
 * exercised with crafted metrics/trades to assert the exact violation emitted.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateChallengeRules,
  rulesFromTemplate,
  ruleLabel,
  violationReason,
  hasHardViolation,
  type ChallengeRules,
  type RuleViolation,
} from "../lib/mt5/rule-engine";
import type { ChallengeRow, SyncMetrics, MT5TradeRecord } from "../lib/mt5/types";

const BASE_RULES: ChallengeRules = {
  profitTarget: 10,
  dailyDrawdown: 5,
  maxDrawdown: 10,
  minTradingDays: 5,
  consistencyTarget: 30,
  maxPositionSize: 5,
  allowWeekendHolding: false,
  allowNewsTrading: false,
  allowEATrading: false,
  allowCopyTrading: false,
};

const BASE_METRICS: SyncMetrics = {
  balance: 10000,
  equity: 10000,
  floatingPL: 0,
  dailyPL: 0,
  totalProfit: 0,
  currentDrawdown: 0,
  dailyDrawdown: 0,
  trailingDrawdown: 0,
  relativeDrawdown: 0,
  absoluteDrawdown: 0,
  remainingDrawdown: 1000,
  profitTargetProgress: 0,
  tradingDaysCount: 1,
  openPositions: 0,
  closedTrades: 0,
  winRate: 50,
  lossRate: 50,
  averageRR: 1,
  profitFactor: 1,
  expectancy: 0,
  largestWin: 0,
  largestLoss: 0,
  consecutiveWins: 0,
  consecutiveLosses: 0,
  riskScore: 50,
  healthScore: 80,
};

function challenge(overrides: Partial<ChallengeRow> = {}): ChallengeRow {
  return { id: 1, userId: 1, accountSize: 10000, maxDrawdown: 10, profitTarget: 10, minTradingDays: 5, ...overrides } as ChallengeRow;
}

function metrics(overrides: Partial<SyncMetrics> = {}): SyncMetrics {
  return { ...BASE_METRICS, ...overrides };
}

function trade(overrides: Partial<MT5TradeRecord> = {}): MT5TradeRecord {
  return {
    ticket: 1,
    login: "123",
    symbol: "EURUSD",
    action: "buy",
    volume: 0.1,
    priceOpen: 1.1,
    priceClose: 1.11,
    profit: 10,
    commission: 0,
    swap: 0,
    openedAt: Date.now() - 3600_000,
    closedAt: Date.now(),
    ...overrides,
  };
}

function codes(violations: RuleViolation[]): string[] {
  return violations.map((v) => v.code);
}

describe("rulesFromTemplate", () => {
  it("maps a template row and disables null/zero rules", () => {
    const rules = rulesFromTemplate({
      profitTarget: 10,
      dailyDrawdown: 5,
      maxDrawdown: 10,
      minTradingDays: 3,
      consistencyTarget: 30,
      maxPositionSize: null,
      allowWeekendHolding: false,
      allowNewsTrading: true,
      allowEATrading: true,
      allowCopyTrading: false,
    } as any);
    expect(rules.maxDrawdown).toBe(10);
    expect(rules.consistencyTarget).toBe(30);
    expect(rules.maxPositionSize).toBeNull(); // null → disabled
    expect(rules.allowEATrading).toBe(true);
    expect(rules.allowCopyTrading).toBe(false);
  });
});

describe("drawdown rules", () => {
  it("flags max drawdown breach", () => {
    const vs = evaluateChallengeRules({
      challenge: challenge(),
      rules: BASE_RULES,
      metrics: metrics({ currentDrawdown: 1100, equity: 8900, balance: 8900 }), // 11% > 10% of 10000
      metricsHistory: [],
      trades: [],
    });
    expect(codes(vs)).toContain("max_drawdown");
    expect(vs[0].severity).toBe("hard");
    expect(vs[0].evidence.currentDrawdown).toBe(1100);
  });

  it("flags daily drawdown breach separately", () => {
    const vs = evaluateChallengeRules({
      challenge: challenge(),
      rules: BASE_RULES,
      metrics: metrics({ dailyDrawdown: 600, dailyPL: -600 }), // 6% > 5% of 10000
      metricsHistory: [],
      trades: [],
    });
    expect(codes(vs)).toContain("daily_drawdown");
    expect(codes(vs)).not.toContain("max_drawdown");
  });

  it("does not flag drawdowns under the limits", () => {
    const vs = evaluateChallengeRules({
      challenge: challenge(),
      rules: BASE_RULES,
      metrics: metrics({ currentDrawdown: 500, dailyDrawdown: 300 }),
      metricsHistory: [],
      trades: [],
    });
    expect(vs).toEqual([]);
  });
});

describe("consistency rule", () => {
  it("flags when the best day exceeds the consistency target", () => {
    const vs = evaluateChallengeRules({
      challenge: challenge(),
      rules: BASE_RULES, // target 30%
      metrics: metrics({ totalProfit: 600 }),
      metricsHistory: [
        { dailyPL: 100, totalProfit: 100, recordedAt: 1 },
        { dailyPL: 500, totalProfit: 600, recordedAt: 2 }, // best day = 83% of 600
      ],
      trades: [],
    });
    expect(codes(vs)).toContain("consistency");
    expect(vs.find((v) => v.code === "consistency")!.evidence.bestDayPct).toBe(83.3);
  });

  it("ignores consistency when total profit is not positive", () => {
    const vs = evaluateChallengeRules({
      challenge: challenge(),
      rules: BASE_RULES,
      metrics: metrics({ totalProfit: -100 }),
      metricsHistory: [{ dailyPL: 50, totalProfit: -100, recordedAt: 1 }],
      trades: [],
    });
    expect(codes(vs)).not.toContain("consistency");
  });

  it("is skipped when the rule is disabled", () => {
    const vs = evaluateChallengeRules({
      challenge: challenge(),
      rules: { ...BASE_RULES, consistencyTarget: null },
      metrics: metrics({ totalProfit: 600 }),
      metricsHistory: [{ dailyPL: 500, totalProfit: 600, recordedAt: 1 }],
      trades: [],
    });
    expect(vs).toEqual([]);
  });
});

describe("trade-based rules", () => {
  const now = Date.now();

  it("flags positions larger than maxPositionSize", () => {
    const vs = evaluateChallengeRules({
      challenge: challenge(),
      rules: BASE_RULES,
      metrics: metrics(),
      metricsHistory: [],
      trades: [trade({ volume: 6, symbol: "GBPUSD" })],
    });
    expect(codes(vs)).toContain("max_position_size");
    expect(vs.find((v) => v.code === "max_position_size")!.evidence.volume).toBe(6);
  });

  it("flags weekend holding when disallowed", () => {
    const saturday = new Date("2026-08-08T12:00:00Z").getTime(); // Saturday
    const vs = evaluateChallengeRules({
      challenge: challenge(),
      rules: BASE_RULES,
      metrics: metrics(),
      metricsHistory: [],
      trades: [trade({ openedAt: saturday, symbol: "USDJPY" })],
    });
    expect(codes(vs)).toContain("weekend_holding");
  });

  it("does not flag weekend holding when allowed", () => {
    const saturday = new Date("2026-08-08T12:00:00Z").getTime();
    const vs = evaluateChallengeRules({
      challenge: challenge(),
      rules: { ...BASE_RULES, allowWeekendHolding: true },
      metrics: metrics(),
      metricsHistory: [],
      trades: [trade({ openedAt: saturday })],
    });
    expect(codes(vs)).not.toContain("weekend_holding");
  });

  it("flags news trading within ±15 minutes of a high-impact event", () => {
    const eventAt = now;
    const vs = evaluateChallengeRules({
      challenge: challenge(),
      rules: BASE_RULES,
      metrics: metrics(),
      metricsHistory: [],
      trades: [trade({ openedAt: eventAt + 5 * 60 * 1000 })], // 5 min after
      newsEvents: [eventAt],
    });
    expect(codes(vs)).toContain("news_trading");
  });

  it("skips news rule without a configured feed", () => {
    const vs = evaluateChallengeRules({
      challenge: challenge(),
      rules: BASE_RULES,
      metrics: metrics(),
      metricsHistory: [],
      trades: [trade()],
      newsEvents: [],
    });
    expect(codes(vs)).not.toContain("news_trading");
  });

  it("detects robotic spacing as EA trading", () => {
    const start = now;
    const trades = Array.from({ length: 5 }, (_, i) => trade({ openedAt: start + i * 30_000, symbol: "EURUSD" }));
    const vs = evaluateChallengeRules({
      challenge: challenge(),
      rules: BASE_RULES,
      metrics: metrics(),
      metricsHistory: [],
      trades,
    });
    expect(codes(vs)).toContain("ea_detected");
    expect(vs.find((v) => v.code === "ea_detected")!.evidence.maxRoboticStreak).toBe(4);
  });

  it("detects night-time trading as EA trading", () => {
    const night = new Date("2026-08-06T23:30:00Z").getTime(); // 23:30 UTC
    const trades = Array.from({ length: 5 }, (_, i) => trade({ openedAt: night + i * 60_000, symbol: "EURUSD" }));
    const vs = evaluateChallengeRules({
      challenge: challenge(),
      rules: BASE_RULES,
      metrics: metrics(),
      metricsHistory: [],
      trades,
    });
    expect(codes(vs)).toContain("ea_detected");
  });

  it("does not flag normal manual-style trading as EA", () => {
    const trades = [
      trade({ openedAt: now - 3 * 3600_000, symbol: "EURUSD" }),
      trade({ openedAt: now - 2 * 3600_000, symbol: "GBPUSD", action: "sell" }),
      trade({ openedAt: now - 1 * 3600_000, symbol: "USDJPY" }),
    ];
    const vs = evaluateChallengeRules({
      challenge: challenge(),
      rules: BASE_RULES,
      metrics: metrics(),
      metricsHistory: [],
      trades,
    });
    expect(codes(vs)).not.toContain("ea_detected");
  });

  it("detects copy trading from identical signatures within a short window", () => {
    const vs = evaluateChallengeRules({
      challenge: challenge(),
      rules: BASE_RULES,
      metrics: metrics(),
      metricsHistory: [],
      trades: [
        trade({ ticket: 1, symbol: "EURUSD", volume: 0.5, priceOpen: 1.2, openedAt: now }),
        trade({ ticket: 2, symbol: "EURUSD", volume: 0.5, priceOpen: 1.2, openedAt: now + 3_000 }),
      ],
    });
    expect(codes(vs)).toContain("copy_trading_detected");
  });

  it("does not flag similar trades far apart in time", () => {
    const vs = evaluateChallengeRules({
      challenge: challenge(),
      rules: BASE_RULES,
      metrics: metrics(),
      metricsHistory: [],
      trades: [
        trade({ ticket: 1, symbol: "EURUSD", volume: 0.5, priceOpen: 1.2, openedAt: now }),
        trade({ ticket: 2, symbol: "EURUSD", volume: 0.5, priceOpen: 1.2, openedAt: now + 3600_000 }),
      ],
    });
    expect(codes(vs)).not.toContain("copy_trading_detected");
  });
});

describe("helpers", () => {
  it("hasHardViolation and labels", () => {
    const v: RuleViolation = { code: "max_drawdown", severity: "hard", message: "x", evidence: {}, detectedAt: 1 };
    expect(hasHardViolation([v])).toBe(true);
    expect(ruleLabel("consistency")).toBe("Consistency rule");
    expect(violationReason(v, BASE_RULES)).toContain("maximum drawdown");
    expect(violationReason({ ...v, code: "ea_detected" }, BASE_RULES)).toContain("EA");
  });
});
