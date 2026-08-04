import type { Db } from "../../db";
import {
  tradingMetrics,
  drawdownHistory,
  mt5Accounts,
  userChallenges,
} from "../../schema";
import { eq, desc, and } from "drizzle-orm";
import type { MT5Provider, ChallengeRow } from "./types";
import { maybeGenerateCertificate } from "../certificates";
import { createNotification } from "../notifications";

export interface SyncOutcome {
  synced: boolean;
  reason?: "already_synced" | "skipped";
  source?: "gateway" | "simulated";
  error?: string;
}

/**
 * Sync a single challenge — pulls latest MT5 data through the provider and
 * stores it. Handles the daily-dedup window, status transitions (phase
 * completion → certificate, max-drawdown violation, expiry).
 *
 * Returns `{ synced: false, reason: "already_synced" }` when a sync already
 * happened within the last 23 hours, and `{ synced: false, reason: "skipped" }`
 * when the challenge isn't in a syncable state.
 */
export async function syncChallenge(
  db: Db,
  provider: MT5Provider,
  challenge: ChallengeRow,
): Promise<SyncOutcome> {
  const now = Date.now();

  if (challenge.status !== "active") {
    return { synced: false, reason: "skipped" };
  }

  // Get latest metrics for this challenge
  const latestMetrics = db.select().from(tradingMetrics)
    .where(eq(tradingMetrics.challengeId, challenge.id))
    .orderBy(desc(tradingMetrics.recordedAt))
    .limit(1).get();

  // Check if we already synced today (within last 23 hours)
  if (latestMetrics && (now - latestMetrics.recordedAt) < 23 * 60 * 60 * 1000) {
    return { synced: false, reason: "already_synced" };
  }

  // Pull data through the provider (real gateway or simulated fallback).
  const previousMetrics = latestMetrics
    ? omitTimestamps(latestMetrics)
    : null;

  let result: Awaited<ReturnType<MT5Provider["syncDaily"]>>;
  try {
    result = await provider.syncDaily(challenge, previousMetrics);
  } catch (err) {
    return {
      synced: false,
      reason: "skipped",
      error: err instanceof Error ? err.message : "MT5 sync failed",
    };
  }

  const { metrics, accountUpdate } = result;

  // Insert new metrics record
  db.insert(tradingMetrics).values({
    mt5AccountId: challenge.mt5AccountId || 0,
    challengeId: challenge.id,
    ...metrics,
    recordedAt: now,
  }).run();

  // Insert drawdown history
  db.insert(drawdownHistory).values({
    challengeId: challenge.id,
    mt5AccountId: challenge.mt5AccountId || 0,
    balance: accountUpdate.balance,
    equity: accountUpdate.equity,
    drawdown: metrics.currentDrawdown,
    dailyDrawdown: metrics.dailyDrawdown,
    peakBalance: Math.max(latestMetrics?.balance ?? challenge.accountSize, accountUpdate.balance),
    recordedAt: now,
  }).run();

  // Update MT5 account balance/equity
  if (challenge.mt5AccountId) {
    db.update(mt5Accounts).set({
      balance: accountUpdate.balance,
      equity: accountUpdate.equity,
      lastSyncAt: now,
    }).where(eq(mt5Accounts.id, challenge.mt5AccountId)).run();
  }

  // ─── Check for challenge status transitions ────────────────
  // If profit target reached and min trading days met, advance the challenge
  const profitTargetAmount = (challenge.profitTarget / 100) * challenge.accountSize;
  const minDaysMet = (metrics.tradingDaysCount ?? 0) >= challenge.minTradingDays;
  const profitReached = (metrics.totalProfit ?? 0) >= profitTargetAmount;

  if (profitReached && minDaysMet && challenge.status === "active") {
    // Determine next status based on current phase
    let nextStatus: string | null = null;

    if (challenge.currentPhase === 2) {
      nextStatus = "phase_2_passed";
    } else if (challenge.currentPhase === 1 || !challenge.currentPhase) {
      nextStatus = "phase_1_passed";
    } else {
      nextStatus = "funded";
    }

    // Update challenge status
    db.update(userChallenges).set({
      status: nextStatus,
      currentPhase: nextStatus === "phase_1_passed" ? 2 : (challenge.currentPhase || 1),
      phase1PassedAt: nextStatus === "phase_1_passed" ? now : challenge.phase1PassedAt,
      phase2PassedAt: nextStatus === "phase_2_passed" ? now : challenge.phase2PassedAt,
      fundedAt: nextStatus === "funded" ? now : challenge.fundedAt,
      updatedAt: now,
    }).where(eq(userChallenges.id, challenge.id)).run();

    // Auto-generate certificate for the completed phase
    maybeGenerateCertificate(db, challenge.id, nextStatus);
  }

  // ─── Check for challenge violation (max drawdown exceeded) ──
  const maxDrawdownAmount = (challenge.maxDrawdown / 100) * challenge.accountSize;
  if ((metrics.currentDrawdown ?? 0) >= maxDrawdownAmount && challenge.status === "active") {
    db.update(userChallenges).set({
      status: "violated",
      violations: JSON.stringify([{ type: "max_drawdown", date: now, drawdown: metrics.currentDrawdown }]),
      updatedAt: now,
    }).where(eq(userChallenges.id, challenge.id)).run();

    createNotification(db, challenge.userId, {
      type: "challenge_violation",
      title: "Challenge Violation",
      message: `Your challenge has been violated due to exceeding the maximum drawdown limit (${challenge.maxDrawdown}%). Your account has been suspended.`,
      link: "/dashboard/challenges",
    });
  }

  // ─── Check for challenge expiry ──────────────────────────
  if (challenge.expiresAt && challenge.expiresAt < now && challenge.status === "active") {
    db.update(userChallenges).set({
      status: "expired",
      updatedAt: now,
    }).where(eq(userChallenges.id, challenge.id)).run();

    createNotification(db, challenge.userId, {
      type: "challenge_expired",
      title: "Challenge Expired",
      message: `Your challenge (Account Size: $${challenge.accountSize.toLocaleString()}) has expired. You can purchase a new challenge from the dashboard.`,
      link: "/dashboard/challenges",
    });
  }

  return { synced: true, source: result.source };
}

/** List active challenges that still need a sync (used by admin sync-all and queue). */
export function getActiveChallenges(db: Db): ChallengeRow[] {
  return db.select().from(userChallenges)
    .where(eq(userChallenges.status, "active"))
    .all();
}

/** Find the challenge bound to an MT5 account (for queue handlers). */
export function getChallengeByMt5Account(db: Db, mt5AccountId: number): ChallengeRow | null {
  return db.select().from(userChallenges)
    .where(and(
      eq(userChallenges.mt5AccountId, mt5AccountId),
      eq(userChallenges.status, "active"),
    ))
    .get() ?? null;
}

/** Strip auto/managed columns so a stored row can be passed back as "previous". */
function omitTimestamps(row: typeof tradingMetrics.$inferSelect) {
  const { id, mt5AccountId, challengeId, recordedAt, ...rest } = row;
  void id;
  void mt5AccountId;
  void challengeId;
  void recordedAt;
  return rest;
}
