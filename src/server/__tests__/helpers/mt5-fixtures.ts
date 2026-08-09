/**
 * Shared deterministic fixtures for the MT5 rule-engine / sync-service tests.
 *
 * All timestamps are fixed so weekend/night/EA heuristics are reproducible:
 * `NOW` is Monday 2023-11-06 10:00 UTC.
 */
import type { ChallengeRow, MT5TradeRecord, SyncMetrics } from "../../lib/mt5/types";

export const NOW = Date.UTC(2023, 10, 6, 10, 0, 0);

/** Saturday 2023-11-04 10:00 UTC — for weekend-holding cases. */
export const SATURDAY = Date.UTC(2023, 10, 4, 10, 0, 0);

/** A complete user_challenges row with sane defaults (all fields settable). */
export function makeChallenge(overrides: Partial<ChallengeRow> = {}): ChallengeRow {
  return {
    id: 1,
    userId: 1,
    templateId: 1,
    accountSizeId: 1,
    status: "active",
    accountSize: 100_000,
    currency: "USD",
    profitTarget: 10,
    dailyDrawdown: 5,
    maxDrawdown: 10,
    maxLeverage: 100,
    minTradingDays: 3,
    maxTradingDays: null,
    startedAt: NOW,
    phase1PassedAt: null,
    phase2PassedAt: null,
    fundedAt: null,
    expiresAt: null,
    paymentId: null,
    amountPaid: 100,
    violations: null,
    mt5AccountId: null,
    currentPhase: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** A complete trading-metrics insert with neutral defaults (all fields settable). */
export function makeMetrics(overrides: Partial<SyncMetrics> = {}): SyncMetrics {
  return {
    balance: 100_000,
    equity: 100_000,
    floatingPL: 0,
    dailyPL: 0,
    totalProfit: 0,
    currentDrawdown: 0,
    dailyDrawdown: 0,
    trailingDrawdown: 0,
    relativeDrawdown: 0,
    absoluteDrawdown: 0,
    remainingDrawdown: 10_000,
    profitTargetProgress: 0,
    tradingDaysCount: 1,
    openPositions: 0,
    closedTrades: 0,
    winRate: null,
    lossRate: null,
    averageRR: null,
    profitFactor: null,
    expectancy: null,
    largestWin: null,
    largestLoss: null,
    consecutiveWins: null,
    consecutiveLosses: null,
    riskScore: null,
    healthScore: null,
    ...overrides,
  };
}

/** A closed trade defaulting to a weekday-daytime open (no EA/weekend signal). */
export function makeTrade(overrides: Partial<MT5TradeRecord> = {}): MT5TradeRecord {
  return {
    ticket: 1,
    login: "1001",
    symbol: "EURUSD",
    action: "buy",
    volume: 0.5,
    priceOpen: 1.1,
    priceClose: 1.105,
    profit: 100,
    commission: 0,
    swap: 0,
    openedAt: NOW,
    closedAt: NOW + 3_600_000,
    ...overrides,
  };
}

/** Template row shape consumed by `rulesFromTemplate` (values mirror challenge_templates). */
export const TEMPLATE_DEFAULTS = {
  profitTarget: 10,
  dailyDrawdown: 5,
  maxDrawdown: 10,
  minTradingDays: 3,
  consistencyTarget: 20,
  maxPositionSize: 2,
  allowWeekendHolding: false,
  allowNewsTrading: false,
  allowEATrading: false,
  allowCopyTrading: false,
} as const;
