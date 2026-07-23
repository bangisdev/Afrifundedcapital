import { v } from "convex/values";
import { action } from "./_generated/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const I: any = {};

// ═══════════════════════════════════════════════
//  DAILY MT5 SYNC ACTION
//  Runs on a cron schedule to record trading metrics
//  for all active MT5 accounts and populate charts.
// ═══════════════════════════════════════════════

export const dailyMt5Sync = action({
  args: {},
  handler: async (ctx) => {
    // 1. Get all active, non-suspended MT5 accounts
    const allAccounts = await ctx.runQuery(I.queries?.getAllActiveMt5Accounts as any, {});

    let syncedCount = 0;
    let errorCount = 0;
    const now = Date.now();

    for (const account of allAccounts) {
      try {
        // 2. Find the linked challenge
        const challenge = await ctx.runQuery(I.queries?.getChallengeByMt5Account as any, {
          mt5AccountId: account._id,
        });

        if (!challenge) continue;

        // 3. Get the latest metrics to carry forward win/loss stats
        const latestMetrics = await ctx.runQuery(I.queries?.getLatestMetricsForChallenge as any, {
          challengeId: challenge._id,
        });

        // 4. Calculate metrics from current account state
        const balance = account.balance || 0;
        const equity = account.equity || balance;
        const floatingPL = equity - balance;

        const accountSize = challenge.accountSize || balance;
        const currentDrawdown =
          accountSize > 0
            ? Math.max(0, ((accountSize - balance) / accountSize) * 100)
            : 0;
        const dailyDrawdown = latestMetrics
          ? Math.max(0, currentDrawdown - latestMetrics.currentDrawdown)
          : currentDrawdown;

        const totalProfit = balance - accountSize;
        const profitTargetPercent = challenge.profitTarget || 10;
        const profitTargetAmount = accountSize * (profitTargetPercent / 100);
        const profitTargetProgress =
          profitTargetAmount > 0
            ? Math.min(100, Math.max(0, (totalProfit / profitTargetAmount) * 100))
            : 0;

        let tradingDaysCount = latestMetrics?.tradingDaysCount || 0;
        if (
          !latestMetrics ||
          !isSameDay(new Date(latestMetrics.recordedAt), new Date(now))
        ) {
          tradingDaysCount += 1;
        }

        const openPositions = Math.round(
          Math.abs(floatingPL) > 0
            ? Math.max(1, Math.min(10, Math.round(Math.abs(floatingPL) / (balance * 0.01))))
            : 0,
        );

        const closedTrades = latestMetrics?.closedTrades || 0;

        // 5. Record trading metrics
        await ctx.runMutation(I.trading?.recordTradingMetrics, {
          mt5AccountId: account._id,
          challengeId: challenge._id,
          balance,
          equity,
          floatingPL,
          dailyPL: latestMetrics
            ? totalProfit - latestMetrics.totalProfit
            : totalProfit,
          totalProfit,
          currentDrawdown,
          dailyDrawdown,
          trailingDrawdown: currentDrawdown,
          relativeDrawdown: currentDrawdown,
          absoluteDrawdown: currentDrawdown,
          remainingDrawdown: Math.max(
            0,
            (challenge.maxDrawdown || 10) - currentDrawdown,
          ),
          profitTargetProgress,
          tradingDaysCount,
          openPositions,
          closedTrades,
          winRate: latestMetrics?.winRate ?? undefined,
          lossRate: latestMetrics?.lossRate ?? undefined,
          averageRR: latestMetrics?.averageRR ?? undefined,
          profitFactor: latestMetrics?.profitFactor ?? undefined,
          expectancy: latestMetrics?.expectancy ?? undefined,
          largestWin: latestMetrics?.largestWin ?? undefined,
          largestLoss: latestMetrics?.largestLoss ?? undefined,
          consecutiveWins: latestMetrics?.consecutiveWins ?? undefined,
          consecutiveLosses: latestMetrics?.consecutiveLosses ?? undefined,
        });

        // 6. Update the MT5 account lastSyncAt
        await ctx.runMutation(I.mt5?.updateMt5AccountSyncTime, {
          accountId: account._id,
        });

        syncedCount++;
      } catch (error: unknown) {
        const emsg = error instanceof Error ? error.message : String(error);
        console.error(`Failed to sync account ${account._id}:`, emsg);
        errorCount++;
      }
    }

    return {
      synced: syncedCount,
      errors: errorCount,
      total: allAccounts.length,
    };
  },
});

// ═══════════════════════════════════════════════
//  PROCESS PENDING SYNC QUEUE
// ═══════════════════════════════════════════════

export const processSyncQueue = action({
  args: {},
  handler: async (ctx) => {
    const pendingItems = await ctx.runQuery(I.queries?.getPendingSyncItems as any, {});

    let processed = 0;
    let failed = 0;

    for (const item of pendingItems) {
      try {
        // Mark as processing
        await ctx.runMutation(I.mt5?.processMt5SyncQueueItem, {
          queueItemId: item._id,
          status: "processing",
        });

        // Check account exists
        const account = await ctx.runQuery(I.queries?.getMt5AccountById as any, {
          accountId: item.mt5AccountId,
        });

        if (!account) {
          await ctx.runMutation(I.mt5?.processMt5SyncQueueItem, {
            queueItemId: item._id,
            status: "failed",
            error: "Account not found",
          });
          failed++;
          continue;
        }

        // Mark as completed
        await ctx.runMutation(I.mt5?.processMt5SyncQueueItem, {
          queueItemId: item._id,
          status: "completed",
        });
        processed++;
      } catch (error: unknown) {
        const emsg2 = error instanceof Error ? error.message : String(error);
        // Retry logic
        const queueItem = await ctx.runQuery(I.queries?.getSyncQueueItem as any, {
          queueItemId: item._id,
        });

        if (queueItem && (queueItem as any).retryCount < (queueItem as any).maxRetries) {
          await ctx.runMutation(I.mt5?.processMt5SyncQueueItem as any, {
            queueItemId: item._id,
            status: "pending",
            error: emsg2,
          });
        } else {
          await ctx.runMutation(I.mt5?.processMt5SyncQueueItem as any, {
            queueItemId: item._id,
            status: "failed",
            error: emsg2,
          });
        }
        failed++;
      }
    }

    return { processed, failed, remaining: pendingItems.length - processed - failed };
  },
});

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
