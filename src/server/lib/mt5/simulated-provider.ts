import type {
  MT5Provider,
  MT5AccountInfo,
  MT5TradeRecord,
  MT5SyncResult,
  ChallengeRow,
  SyncMetrics,
} from "./types";

/**
 * Fallback provider used when no MT5 Manager API gateway is configured.
 *
 * Keeps demos, tests, and local development fully functional by simulating
 * realistic daily market movement. Production deployments should configure a
 * gateway (`mt5_config` setting) to switch to real MT5 data automatically.
 */
export class SimulatedMT5Provider implements MT5Provider {
  readonly mode = "simulated" as const;
  readonly configured = false;

  async ping(): Promise<{ ok: boolean; latencyMs: number; message: string }> {
    return { ok: true, latencyMs: 1, message: "Simulated provider (no gateway configured)" };
  }

  async createAccount(input: {
    name: string;
    email: string;
    balance: number;
    leverage: number;
    group: string;
    password: string;
    investorPassword: string;
  }): Promise<{ login: string; server: string }> {
    void input;
    return {
      login: "AFC" + Math.floor(100000 + Math.random() * 900000),
      server: "AfriFundedCapital-Demo",
    };
  }

  async getAccountInfo(_login: string): Promise<MT5AccountInfo> {
    throw new Error("Simulated provider has no live account info");
  }

  async getTradeHistory(_login: string, _from: number, _to: number): Promise<MT5TradeRecord[]> {
    return [];
  }

  async syncDaily(
    challenge: ChallengeRow,
    previousMetrics: SyncMetrics | null,
  ): Promise<MT5SyncResult> {
    const result = simulateDailySync(challenge, previousMetrics);
    return { ...result, source: "simulated" };
  }

  async suspendAccount(_login: string): Promise<void> {
    /* simulated — no-op */
  }

  async activateAccount(_login: string): Promise<void> {
    /* simulated — no-op */
  }

  async changePassword(_login: string, _password: string): Promise<void> {
    /* simulated — no-op */
  }

  async changeInvestorPassword(_login: string, _password: string): Promise<void> {
    /* simulated — no-op */
  }
}

/**
 * Simulates pulling the latest daily metrics from MT5 server.
 * (Original implementation — preserved verbatim so behavior is unchanged.)
 */
export function simulateDailySync(
  challenge: ChallengeRow,
  previousMetrics: SyncMetrics | null | undefined,
): { metrics: SyncMetrics; accountUpdate: { balance: number; equity: number } } {
  const baseBalance = challenge.accountSize;
  const prev = previousMetrics;

  // Use previous day's balance as starting point
  const prevBalance = prev?.balance ?? baseBalance;

  // Simulate daily P/L with realistic variance (slight upward bias)
  const dailyVariance = (Math.random() - 0.47) * baseBalance * 0.015; // ~1.5% max daily swing
  const newBalance = Math.max(baseBalance * 0.5, prevBalance + dailyVariance); // Floor at 50% of initial
  const floatingPL = (Math.random() - 0.5) * baseBalance * 0.008;
  const newEquity = newBalance + floatingPL;

  const totalProfit = newBalance - baseBalance;
  const currentDrawdown = Math.max(0, baseBalance - newEquity);
  const dailyDrawdown = Math.max(0, -dailyVariance);
  const peakBalance = Math.max(prev?.balance ?? 0, newBalance);

  // Calculate drawdown relative to peak
  const trailingDrawdown = peakBalance > 0 ? ((peakBalance - newEquity) / peakBalance) * 100 : 0;

  const tradingDaysCount = (prev?.tradingDaysCount ?? 0) + 1;
  const closedTrades = (prev?.closedTrades ?? 0) + Math.floor(Math.random() * 5) + 1;

  // Win rate with slight improvement over time
  const baseWinRate = 48 + Math.min(tradingDaysCount * 0.1, 8);
  const winRate = baseWinRate + (Math.random() - 0.5) * 6;

  const openPositions = Math.floor(Math.random() * 6);
  const avgRR = 1.2 + Math.random() * 1.5;
  const profitFactor = 1.0 + (winRate / 100) * avgRR * 0.5 + (Math.random() - 0.5) * 0.3;

  const largestWin = prev?.largestWin
    ? Math.max(prev.largestWin, Math.round(baseBalance * 0.025 * Math.random()))
    : Math.round(baseBalance * 0.02 * Math.random());
  const largestLoss = prev?.largestLoss
    ? Math.min(prev.largestLoss, -Math.round(baseBalance * 0.015 * Math.random()))
    : -Math.round(baseBalance * 0.012 * Math.random());

  // Consecutive tracking
  const isWin = dailyVariance > 0;
  const consecutiveWins = isWin ? (prev?.consecutiveWins ?? 0) + 1 : 0;
  const consecutiveLosses = isWin ? 0 : (prev?.consecutiveLosses ?? 0) + 1;

  // Risk and health scores
  const riskScore = Math.min(100, Math.max(0, 50 + (trailingDrawdown * 5) + (Math.random() - 0.5) * 10));
  const healthScore = Math.min(100, Math.max(0, 80 - (trailingDrawdown * 3) + (winRate - 50) * 0.5 + (Math.random() - 0.5) * 10));

  const profitTargetProgress = challenge.profitTarget > 0
    ? Math.min(100, Math.max(0, (totalProfit / (challenge.profitTarget * baseBalance / 100)) * 100))
    : 0;

  return {
    metrics: {
      balance: Math.round(newBalance * 100) / 100,
      equity: Math.round(newEquity * 100) / 100,
      floatingPL: Math.round(floatingPL * 100) / 100,
      dailyPL: Math.round(dailyVariance * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
      currentDrawdown: Math.round(currentDrawdown * 100) / 100,
      dailyDrawdown: Math.round(dailyDrawdown * 100) / 100,
      trailingDrawdown: Math.round(trailingDrawdown * 100) / 100,
      relativeDrawdown: Math.round((currentDrawdown / baseBalance) * 10000) / 100,
      absoluteDrawdown: Math.round(Math.max(0, baseBalance - newEquity) * 100) / 100,
      remainingDrawdown: Math.round(Math.max(0, challenge.maxDrawdown * baseBalance / 100 - currentDrawdown) * 100) / 100,
      profitTargetProgress: Math.round(profitTargetProgress * 100) / 100,
      tradingDaysCount,
      openPositions,
      closedTrades,
      winRate: Math.round(winRate * 10) / 10,
      lossRate: Math.round((100 - winRate) * 10) / 10,
      averageRR: Math.round(avgRR * 100) / 100,
      profitFactor: Math.round(profitFactor * 100) / 100,
      expectancy: Math.round(((winRate / 100) * baseBalance * 0.015 - ((100 - winRate) / 100) * baseBalance * 0.01) * 100) / 100,
      largestWin,
      largestLoss,
      consecutiveWins,
      consecutiveLosses,
      riskScore: Math.round(riskScore),
      healthScore: Math.round(healthScore),
    },
    accountUpdate: {
      balance: Math.round(newBalance * 100) / 100,
      equity: Math.round(newEquity * 100) / 100,
    },
  };
}
