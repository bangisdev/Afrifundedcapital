/**
 * Unit tests for the MT5 challenge rule engine (`src/server/lib/mt5/rule-engine.ts`).
 *
 * The engine is a pure function — no DB, no network — so every rule is tested
 * deterministically with the shared fixtures. Covers all eight hard rules,
 * the two drawdown proximity warnings, template mapping, and helpers.
 */
import { describe, expect, it } from "vitest";
import {
  DRAWDOWN_WARNING_THRESHOLD,
  evaluateChallengeRules,
  hasHardViolation,
  ruleLabel,
  rulesFromTemplate,
  violationReason,
  type RuleViolation,
} from "../lib/mt5/rule-engine";
import { NOW, SATURDAY, TEMPLATE_DEFAULTS, makeChallenge, makeMetrics, makeTrade } from "./helpers/mt5-fixtures";

const rules = rulesFromTemplate({ ...TEMPLATE_DEFAULTS });
const codes = (vs: RuleViolation[]) => vs.map((v) => v.code);
const severities = (vs: RuleViolation[]) => vs.map((v) => v.severity);

describe("rulesFromTemplate", () => {
  it("maps template values onto the engine rule set", () => {
    expect(rules.profitTarget).toBe(10);
    expect(rules.dailyDrawdown).toBe(5);
    expect(rules.maxDrawdown).toBe(10);
    expect(rules.minTradingDays).toBe(3);
    expect(rules.consistencyTarget).toBe(20);
    expect(rules.maxPositionSize).toBe(2);
    expect(rules.allowWeekendHolding).toBe(false);
    expect(rules.allowNewsTrading).toBe(false);
    expect(rules.allowEATrading).toBe(false);
    expect(rules.allowCopyTrading).toBe(false);
  });

  it("treats zero/null rule fields as disabled", () => {
    const disabled = rulesFromTemplate({
      ...TEMPLATE_DEFAULTS,
      maxDrawdown: 0,
      dailyDrawdown: 0,
      consistencyTarget: null,
      maxPositionSize: null,
    });
    expect(disabled.maxDrawdown).toBe(0);
    expect(disabled.dailyDrawdown).toBe(0);
    expect(disabled.consistencyTarget).toBeNull();
    expect(disabled.maxPositionSize).toBeNull();
  });
});

describe("max drawdown", () => {
  const base = { challenge: makeChallenge(), rules, now: NOW };

  it("is clean while drawdown is well under the limit", () => {
    const vs = evaluateChallengeRules({ ...base, metrics: makeMetrics({ currentDrawdown: 7_000 }) });
    expect(vs).toEqual([]);
  });

  it("emits a non-terminal warning at 80% of the limit", () => {
    expect(DRAWDOWN_WARNING_THRESHOLD).toBe(0.8);
    // Limit = 10% × $100k = $10k; 85% of the limit → warning.
    const vs = evaluateChallengeRules({ ...base, metrics: makeMetrics({ currentDrawdown: 8_500 }) });
    expect(codes(vs)).toEqual(["max_drawdown_warning"]);
    expect(severities(vs)).toEqual(["warning"]);
    expect(hasHardViolation(vs)).toBe(false);
    expect(vs[0].evidence.usedPct).toBe(85);
  });

  it("emits a hard violation at/over the limit", () => {
    const vs = evaluateChallengeRules({ ...base, metrics: makeMetrics({ currentDrawdown: 10_000 }) });
    expect(codes(vs)).toEqual(["max_drawdown"]);
    expect(severities(vs)).toEqual(["hard"]);
    expect(hasHardViolation(vs)).toBe(true);
  });

  it("never warns or breaches when the rule is disabled", () => {
    const noRule = rulesFromTemplate({ ...TEMPLATE_DEFAULTS, maxDrawdown: 0 });
    const vs = evaluateChallengeRules({ ...base, rules: noRule, metrics: makeMetrics({ currentDrawdown: 99_000 }) });
    expect(vs).toEqual([]);
  });
});

describe("daily drawdown", () => {
  const base = { challenge: makeChallenge(), rules, now: NOW };

  it("warns at 80% of the daily limit", () => {
    // Limit = 5% × $100k = $5k; 90% → warning.
    const vs = evaluateChallengeRules({ ...base, metrics: makeMetrics({ dailyDrawdown: 4_500 }) });
    expect(codes(vs)).toEqual(["daily_drawdown_warning"]);
    expect(severities(vs)).toEqual(["warning"]);
  });

  it("breaches at/over the daily limit", () => {
    const vs = evaluateChallengeRules({ ...base, metrics: makeMetrics({ dailyDrawdown: 5_000 }) });
    expect(codes(vs)).toEqual(["daily_drawdown"]);
    expect(hasHardViolation(vs)).toBe(true);
  });
});

describe("consistency rule", () => {
  const base = { challenge: makeChallenge(), rules, now: NOW };

  it("flags when the best day exceeds the share of total profit", () => {
    const vs = evaluateChallengeRules({
      ...base,
      metrics: makeMetrics({ totalProfit: 1_000 }),
      metricsHistory: [
        { dailyPL: 250, totalProfit: 1_000, recordedAt: NOW - 86_400_000 },
        { dailyPL: 100, totalProfit: 1_000, recordedAt: NOW },
      ],
    });
    expect(codes(vs)).toContain("consistency");
    expect(vs.find((v) => v.code === "consistency")?.severity).toBe("hard");
  });

  it("is clean when no single day crosses the threshold", () => {
    const vs = evaluateChallengeRules({
      ...base,
      metrics: makeMetrics({ totalProfit: 1_000 }),
      metricsHistory: [{ dailyPL: 100, totalProfit: 1_000, recordedAt: NOW }],
    });
    expect(codes(vs)).not.toContain("consistency");
  });

  it("is clean when the account is not in profit", () => {
    const vs = evaluateChallengeRules({
      ...base,
      metrics: makeMetrics({ totalProfit: -500 }),
      metricsHistory: [{ dailyPL: 1_000, totalProfit: -500, recordedAt: NOW }],
    });
    expect(codes(vs)).not.toContain("consistency");
  });
});

describe("max position size", () => {
  const base = { challenge: makeChallenge(), rules, now: NOW };

  it("flags a trade above the lot limit", () => {
    const vs = evaluateChallengeRules({ ...base, metrics: makeMetrics(), trades: [makeTrade({ volume: 3 }) ]});
    expect(codes(vs)).toContain("max_position_size");
    expect(vs.find((v) => v.code === "max_position_size")?.evidence.volume).toBe(3);
  });

  it("is clean at or under the lot limit", () => {
    const vs = evaluateChallengeRules({ ...base, metrics: makeMetrics(), trades: [makeTrade({ volume: 2 }) ]});
    expect(codes(vs)).not.toContain("max_position_size");
  });
});

describe("weekend holding", () => {
  const base = { challenge: makeChallenge(), rules, now: NOW };

  it("flags a position opened on Saturday", () => {
    const vs = evaluateChallengeRules({
      ...base,
      metrics: makeMetrics(),
      trades: [makeTrade({ openedAt: SATURDAY, closedAt: SATURDAY + 3_600_000 })],
    });
    expect(codes(vs)).toContain("weekend_holding");
  });

  it("is clean on a weekday open", () => {
    const vs = evaluateChallengeRules({ ...base, metrics: makeMetrics(), trades: [makeTrade()] });
    expect(codes(vs)).not.toContain("weekend_holding");
  });

  it("is clean when weekend holding is allowed", () => {
    const allowed = rulesFromTemplate({ ...TEMPLATE_DEFAULTS, allowWeekendHolding: true });
    const vs = evaluateChallengeRules({
      ...base,
      rules: allowed,
      metrics: makeMetrics(),
      trades: [makeTrade({ openedAt: SATURDAY, closedAt: SATURDAY + 3_600_000 })],
    });
    expect(vs).toEqual([]);
  });
});

describe("news trading", () => {
  const base = { challenge: makeChallenge(), rules, now: NOW };
  const newsAt = NOW;

  it("flags a trade opened within ±15 min of a high-impact event", () => {
    const vs = evaluateChallengeRules({
      ...base,
      metrics: makeMetrics(),
      trades: [makeTrade({ openedAt: newsAt - 10 * 60_000 })],
      newsEvents: [newsAt],
    });
    expect(codes(vs)).toContain("news_trading");
  });

  it("never fires without a configured news feed", () => {
    const vs = evaluateChallengeRules({
      ...base,
      metrics: makeMetrics(),
      trades: [makeTrade({ openedAt: newsAt - 10 * 60_000 })],
    });
    expect(codes(vs)).not.toContain("news_trading");
  });

  it("is clean when the trade is outside the window", () => {
    const vs = evaluateChallengeRules({
      ...base,
      metrics: makeMetrics(),
      trades: [makeTrade({ openedAt: newsAt - 20 * 60_000 })],
      newsEvents: [newsAt],
    });
    expect(codes(vs)).not.toContain("news_trading");
  });
});

describe("EA detection", () => {
  const base = { challenge: makeChallenge(), rules, now: NOW };

  it("flags robotic spacing between consecutive opens", () => {
    const trades = [0, 1, 2, 3].map((i) =>
      makeTrade({ ticket: i + 1, symbol: `SYM${i}`, volume: 0.1 + i * 0.1, openedAt: NOW + i * 30_000 }),
    );
    const vs = evaluateChallengeRules({ ...base, metrics: makeMetrics(), trades });
    expect(codes(vs)).toContain("ea_detected");
    expect(vs.find((v) => v.code === "ea_detected")?.evidence.maxRoboticStreak).toBeGreaterThanOrEqual(3);
  });

  it("flags 5+ night opens", () => {
    const night = Date.UTC(2023, 10, 6, 23, 0, 0); // Monday 23:00 UTC
    const trades = [0, 1, 2, 3, 4].map((i) =>
      makeTrade({ ticket: i + 1, symbol: `N${i}`, volume: 0.1 + i * 0.1, openedAt: night + i * 60_000 }),
    );
    const vs = evaluateChallengeRules({ ...base, metrics: makeMetrics(), trades });
    expect(codes(vs)).toContain("ea_detected");
    expect(vs.find((v) => v.code === "ea_detected")?.evidence.nightTrades).toBeGreaterThanOrEqual(5);
  });

  it("flags high trade frequency (15+ trades)", () => {
    const trades = Array.from({ length: 15 }, (_, i) =>
      makeTrade({ ticket: i + 1, symbol: `F${i}`, volume: 0.1, openedAt: NOW + i * 300_000 }),
    );
    const vs = evaluateChallengeRules({ ...base, metrics: makeMetrics(), trades });
    expect(codes(vs)).toContain("ea_detected");
    expect(vs.find((v) => v.code === "ea_detected")?.evidence.highFrequency).toBe(true);
  });

  it("is clean for a handful of spaced manual-looking trades", () => {
    const trades = [0, 1, 2].map((i) =>
      makeTrade({ ticket: i + 1, symbol: `M${i}`, volume: 0.5, openedAt: NOW + i * 3_600_000 }),
    );
    const vs = evaluateChallengeRules({ ...base, metrics: makeMetrics(), trades });
    expect(codes(vs)).not.toContain("ea_detected");
  });

  it("is clean when EA trading is allowed", () => {
    const allowed = rulesFromTemplate({ ...TEMPLATE_DEFAULTS, allowEATrading: true });
    const trades = [0, 1, 2, 3].map((i) =>
      makeTrade({ ticket: i + 1, symbol: `SYM${i}`, volume: 0.1 + i * 0.1, openedAt: NOW + i * 30_000 }),
    );
    const vs = evaluateChallengeRules({ ...base, rules: allowed, metrics: makeMetrics(), trades });
    expect(codes(vs)).not.toContain("ea_detected");
  });
});

describe("copy trading detection", () => {
  const base = { challenge: makeChallenge(), rules, now: NOW };

  it("flags identical signatures opened within the window", () => {
    const trades = [
      makeTrade({ ticket: 1, openedAt: NOW }),
      makeTrade({ ticket: 2, openedAt: NOW + 5_000 }),
    ];
    const vs = evaluateChallengeRules({ ...base, metrics: makeMetrics(), trades });
    expect(codes(vs)).toContain("copy_trading_detected");
  });

  it("is clean when signatures differ", () => {
    const trades = [
      makeTrade({ ticket: 1, symbol: "EURUSD", openedAt: NOW }),
      makeTrade({ ticket: 2, symbol: "GBPUSD", openedAt: NOW + 5_000 }),
    ];
    const vs = evaluateChallengeRules({ ...base, metrics: makeMetrics(), trades });
    expect(codes(vs)).not.toContain("copy_trading_detected");
  });

  it("is clean when copy trading is allowed", () => {
    const allowed = rulesFromTemplate({ ...TEMPLATE_DEFAULTS, allowCopyTrading: true });
    const vs = evaluateChallengeRules({
      ...base,
      rules: allowed,
      metrics: makeMetrics(),
      trades: [makeTrade({ ticket: 1, openedAt: NOW }), makeTrade({ ticket: 2, openedAt: NOW + 5_000 })],
    });
    expect(vs).toEqual([]);
  });
});

describe("severity helpers", () => {
  it("hasHardViolation is true only when a hard violation is present", () => {
    const warning: RuleViolation = {
      code: "max_drawdown_warning",
      severity: "warning",
      message: "approaching",
      evidence: {},
      detectedAt: NOW,
    };
    const hard: RuleViolation = { ...warning, code: "max_drawdown", severity: "hard" };
    expect(hasHardViolation([warning])).toBe(false);
    expect(hasHardViolation([warning, hard])).toBe(true);
    expect(hasHardViolation([])).toBe(false);
  });

  it("ruleLabel covers every rule code including the warnings", () => {
    for (const code of ["max_drawdown", "daily_drawdown", "consistency", "max_position_size", "weekend_holding", "news_trading", "ea_detected", "copy_trading_detected", "max_drawdown_warning", "daily_drawdown_warning"] as const) {
      expect(ruleLabel(code).length).toBeGreaterThan(0);
    }
  });

  it("violationReason reads the limit from the rules for warnings", () => {
    const warning: RuleViolation = {
      code: "max_drawdown_warning",
      severity: "warning",
      message: "x",
      evidence: {},
      detectedAt: NOW,
    };
    expect(violationReason(warning, rules)).toContain("10%");
  });
});
