import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

function generateChars(length: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// ═══════════════════════════════════════════════
//  DEMO TRADING DATA SEEDER
//  Generates 60 days of realistic metrics history
//  so charts render immediately on the trading page.
// ═══════════════════════════════════════════════

export const seedDemoTradingData = action({
  handler: async (ctx) => {
    // Find all active/funded user challenges
    const challenges: Array<{
      _id: any;
      userId: any;
      accountSize: number;
      profitTarget: number;
      maxDrawdown: number;
      dailyDrawdown: number;
      minTradingDays: number;
      mt5AccountId: any;
    }> = await (ctx as any).runQuery((internal as any).seed.listChallengesForDemo, {});

    if (challenges.length === 0) {
      return { seeded: 0, accountsCreated: 0, message: "No challenges found. Purchase a challenge first." };
    }

    let totalMetricsSeeded = 0;
    let accountsCreated = 0;

    for (const challenge of challenges) {
      const userId = challenge.userId;
      const accountSize = challenge.accountSize;
      const profitTarget = challenge.profitTarget;
      const maxDrawdown = challenge.maxDrawdown;

      // Find or create MT5 account
      let mt5AccountId = challenge.mt5AccountId;
      if (!mt5AccountId) {
        const login = `AFC${1000000 + Math.floor(Math.random() * 9000000)}`;
        const password = `Tr@der${generateChars(6)}!`;
        const investorPassword = `Inv@${generateChars(6)}!`;

        const accountId = await (ctx as any).runMutation((internal as any).seed.createDemoMt5Account, {
          userId,
          login,
          password,
          investorPassword,
          balance: accountSize,
          equity: accountSize,
        });

        mt5AccountId = accountId;
        accountsCreated++;

        // Link MT5 account to challenge
        await (ctx as any).runMutation((internal as any).seed.linkMt5ToChallenge, {
          challengeId: challenge._id,
          mt5AccountId: accountId,
        });
      }

      // Generate 60 days of historical trading metrics (back to front for realistic progression)
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const totalDays = 60;

      // Simulate a realistic equity curve starting from accountSize
      let currentBalance = accountSize;
      let peakBalance = accountSize;
      let runningProfit = 0;
      let tradingDayCount = 0;
      let closedTrades = 0;
      let wins = 0;
      let losses = 0;
      let totalWinAmount = 0;
      let totalLossAmount = 0;
      let largestWinVal = 0;
      let largestLossVal = 0;
      let consecutiveWinsCount = 0;
      let consecutiveLossesCount = 0;
      let maxConsecutiveWins = 0;
      let maxConsecutiveLosses = 0;

      // Generate metrics snapshots
      for (let day = totalDays - 1; day >= 0; day--) {
        const isTradingDay = day % 7 < 5; // Mon-Fri only
        if (!isTradingDay) continue;

        tradingDayCount++;

        // Simulate daily P&L with slight upward bias (-1.5% to +3%)
        const dailyReturnPct = (Math.random() * 4.5 - 1.5) / 100;
        const dailyPL = currentBalance * dailyReturnPct;

        // Simulate some days with no activity (about 20% of trading days)
        let openPositions = 0;
        let newTrades = 0;
        if (Math.random() > 0.2) {
          openPositions = Math.floor(Math.random() * 4) + 1;
          newTrades = Math.floor(Math.random() * 3) + Math.floor(Math.random() * 3);
          closedTrades += newTrades;
          if (newTrades > 0) {
            // Track wins/losses
            for (let t = 0; t < newTrades; t++) {
              const tradePL = (Math.random() * 4 - 1.5) * (accountSize * 0.005);
              if (tradePL > 0) {
                wins++;
                totalWinAmount += tradePL;
                if (tradePL > largestWinVal) largestWinVal = tradePL;
                consecutiveWinsCount++;
                consecutiveLossesCount = 0;
                if (consecutiveWinsCount > maxConsecutiveWins) maxConsecutiveWins = consecutiveWinsCount;
              } else {
                losses++;
                totalLossAmount += Math.abs(tradePL);
                if (Math.abs(tradePL) > largestLossVal) largestLossVal = Math.abs(tradePL);
                consecutiveLossesCount++;
                consecutiveWinsCount = 0;
                if (consecutiveLossesCount > maxConsecutiveLosses) maxConsecutiveLosses = consecutiveLossesCount;
              }
            }
          }
        }

        const newBalance = currentBalance + dailyPL;
        const newEquity = newBalance + dailyPL * (Math.random() * 0.5);
        const equity = Math.max(newEquity, newBalance * 0.9);

        // Update running values
        currentBalance = newBalance;
        runningProfit = currentBalance - accountSize;
        if (currentBalance > peakBalance) peakBalance = currentBalance;

        // Calculate drawdowns
        const currentDrawdown = peakBalance > 0
          ? ((peakBalance - currentBalance) / peakBalance) * 100
          : 0;
        const dailyDd = Math.min(dailyPL < 0 ? (Math.abs(dailyPL) / accountSize) * 100 : 0, currentDrawdown);
        const trailingDrawdown = currentDrawdown;
        const absoluteDrawdown = Math.max(0, accountSize - currentBalance) / accountSize * 100;
        const relativeDrawdown = currentDrawdown;
        const remainingDrawdown = Math.max(0, maxDrawdown - currentDrawdown);

        // Profit target progress
        const profitTargetAmount = accountSize * (profitTarget / 100);
        const profitTargetProgress = profitTargetAmount > 0
          ? Math.min(100, (runningProfit / profitTargetAmount) * 100)
          : 0;

        // Calculate stats
        const totalTrades = wins + losses;
        const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
        const lossRate = totalTrades > 0 ? (losses / totalTrades) * 100 : 0;
        const avgWin = wins > 0 ? totalWinAmount / wins : 0;
        const avgLoss = losses > 0 ? totalLossAmount / losses : 0;
        const averageRR = avgLoss > 0 ? avgWin / avgLoss : 1;
        const profitFactor = totalLossAmount > 0 ? totalWinAmount / totalLossAmount : totalWinAmount > 0 ? 10 : 1;
        const expectancy = totalTrades > 0
          ? ((winRate / 100) * (totalWinAmount / totalTrades) - (lossRate / 100) * (totalLossAmount / totalTrades))
          : 0;
        const floatingPL = equity - currentBalance;

        // Record the metrics snapshot via the real mutation (which also runs the rule engine)
        try {
          await (ctx as any).runMutation((internal as any).trading.recordTradingMetrics, {
            mt5AccountId,
            challengeId: challenge._id,
            balance: Math.round(currentBalance * 100) / 100,
            equity: Math.round(equity * 100) / 100,
            floatingPL: Math.round(floatingPL * 100) / 100,
            dailyPL: Math.round(dailyPL * 100) / 100,
            totalProfit: Math.round(runningProfit * 100) / 100,
            currentDrawdown: Math.round(currentDrawdown * 100) / 100,
            dailyDrawdown: Math.round(dailyDd * 100) / 100,
            trailingDrawdown: Math.round(trailingDrawdown * 100) / 100,
            relativeDrawdown: Math.round(relativeDrawdown * 100) / 100,
            absoluteDrawdown: Math.round(absoluteDrawdown * 100) / 100,
            remainingDrawdown: Math.round(remainingDrawdown * 100) / 100,
            profitTargetProgress: Math.round(profitTargetProgress * 100) / 100,
            tradingDaysCount: tradingDayCount,
            openPositions,
            closedTrades,
            winRate: Math.round(winRate * 100) / 100,
            lossRate: Math.round(lossRate * 100) / 100,
            averageRR: Math.round(averageRR * 100) / 100,
            profitFactor: Math.round(profitFactor * 100) / 100,
            expectancy: Math.round(expectancy * 100) / 100,
            largestWin: Math.round(largestWinVal * 100) / 100,
            largestLoss: Math.round(largestLossVal * 100) / 100,
            consecutiveWins: maxConsecutiveWins,
            consecutiveLosses: maxConsecutiveLosses,
          });
          totalMetricsSeeded++;
        } catch (e: any) {
          console.error(`Failed to record metrics for day ${day}:`, e?.message);
        }
      }
    }

    return {
      seeded: totalMetricsSeeded,
      accountsCreated,
      message: `Seeded ${totalMetricsSeeded} metrics data points across ${challenges.length} challenge(s)`,
    };
  },
});
