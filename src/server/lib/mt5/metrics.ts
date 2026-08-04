import type {
  ChallengeRow,
  MT5AccountInfo,
  MT5TradeRecord,
  SyncMetrics,
} from "./types";

/**
 * Compute the full daily metrics snapshot from REAL MT5 data:
 * account info (balance/equity/floating P/L/open positions) plus the closed
 * trade history returned by the Manager API gateway.
 *
 * This replaces the simulated metrics when a gateway is configured: win rate,
 * profit factor, largest win/loss, consecutive streaks, etc. are derived from
 * actual closed deals instead of random numbers.
 */
export function computeMetricsFromGateway(
  challenge: ChallengeRow,
  info: MT5AccountInfo,
  trades: MT5TradeRecord[],
  prev: SyncMetrics | null,
): { metrics: SyncMetrics; accountUpdate: { balance: number; equity: number } } {
  const baseBalance = challenge.accountSize;
  const balance = info.balance;
  const equity = info.equity;
  const floatingPL = info.floatingPL ?? equity - balance;
  const totalProfit = balance - baseBalance;

  // ── Trade-derived stats ──────────────────────────────────────────
  const closed = trades.filter((t) => t.profit !== 0 || t.commission !== 0 || t.swap !== 0);
  const net = (t: MT5TradeRecord) => t.profit + t.commission + t.swap;
  const wins = closed.filter((t) => net(t) > 0);
  const losses = closed.filter((t) => net(t) < 0);
  const grossProfit = wins.reduce((s, t) => s + net(t), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + net(t), 0));

  const closedTrades = prev?.closedTrades ?? 0;
  const totalClosed = Math.max(closedTrades, closed.length);
  const winRate = totalClosed > 0 ? (wins.length / totalClosed) * 100 : (prev?.winRate ?? 50);
  const lossRate = 100 - winRate;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const averageRR = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 999 : 0;

  const largestWin = Math.max(prev?.largestWin ?? 0, ...closed.map(net).filter((v) => v > 0), 0);
  const largestLoss = Math.min(
    prev?.largestLoss ?? 0,
    ...closed.map(net).filter((v) => v < 0),
    0,
  );

  // Consecutive streaks from the most recent trades (chronological).
  const sorted = [...closed].sort((a, b) => a.closedAt - b.closedAt);
  let consecutiveWins = prev?.consecutiveWins ?? 0;
  let consecutiveLosses = prev?.consecutiveLosses ?? 0;
  if (sorted.length > 0) {
    consecutiveWins = 0;
    consecutiveLosses = 0;
    for (const t of sorted) {
      if (net(t) > 0) {
        consecutiveWins++;
        consecutiveLosses = 0;
      } else if (net(t) < 0) {
        consecutiveLosses++;
        consecutiveWins = 0;
      }
    }
  }

  const expectancy = totalClosed > 0
    ? (grossProfit - grossLoss) / totalClosed
    : prev?.expectancy ?? 0;

  // ── Drawdowns ────────────────────────────────────────────────────
  const peakBalance = Math.max(prev?.balance ?? baseBalance, balance);
  const currentDrawdown = Math.max(0, peakBalance - equity);
  const dailyDrawdown = Math.max(0, -floatingPL);
  const trailingDrawdown = peakBalance > 0 ? ((peakBalance - equity) / peakBalance) * 100 : 0;
  const relativeDrawdown = baseBalance > 0 ? (currentDrawdown / baseBalance) * 100 : 0;
  const absoluteDrawdown = Math.max(0, baseBalance - equity);
  const remainingDrawdown = Math.max(
    0,
    (challenge.maxDrawdown / 100) * baseBalance - currentDrawdown,
  );

  const profitTargetProgress = challenge.profitTarget > 0
    ? Math.min(100, Math.max(0, (totalProfit / ((challenge.profitTarget / 100) * baseBalance)) * 100))
    : 0;

  // ── Risk / health scores ─────────────────────────────────────────
  const riskScore = Math.min(
    100,
    Math.max(0, 50 + trailingDrawdown * 5 + (100 - Math.min(100, winRate)) * 0.2),
  );
  const healthScore = Math.min(
    100,
    Math.max(0, 80 - trailingDrawdown * 3 + (winRate - 50) * 0.5),
  );

  const tradingDaysCount = (prev?.tradingDaysCount ?? 0) + 1;

  const metrics: SyncMetrics = {
    balance: Math.round(balance * 100) / 100,
    equity: Math.round(equity * 100) / 100,
    floatingPL: Math.round(floatingPL * 100) / 100,
    dailyPL: Math.round((balance - (prev?.balance ?? baseBalance)) * 100) / 100,
    totalProfit: Math.round(totalProfit * 100) / 100,
    currentDrawdown: Math.round(currentDrawdown * 100) / 100,
    dailyDrawdown: Math.round(dailyDrawdown * 100) / 100,
    trailingDrawdown: Math.round(trailingDrawdown * 100) / 100,
    relativeDrawdown: Math.round(relativeDrawdown * 100) / 100,
    absoluteDrawdown: Math.round(absoluteDrawdown * 100) / 100,
    remainingDrawdown: Math.round(remainingDrawdown * 100) / 100,
    profitTargetProgress: Math.round(profitTargetProgress * 100) / 100,
    tradingDaysCount,
    openPositions: info.openPositions ?? 0,
    closedTrades: totalClosed,
    winRate: Math.round(winRate * 10) / 10,
    lossRate: Math.round(lossRate * 10) / 10,
    averageRR: Math.round(averageRR * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    expectancy: Math.round(expectancy * 100) / 100,
    largestWin: Math.round(largestWin * 100) / 100,
    largestLoss: Math.round(largestLoss * 100) / 100,
    consecutiveWins,
    consecutiveLosses,
    riskScore: Math.round(riskScore),
    healthScore: Math.round(healthScore),
  };

  return {
    metrics,
    accountUpdate: {
      balance: Math.round(balance * 100) / 100,
      equity: Math.round(equity * 100) / 100,
    },
  };
}
