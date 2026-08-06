import type { Db } from "../../db";
import {
  tradingMetrics,
  drawdownHistory,
  mt5Accounts,
  userChallenges,
  challengeTemplates,
} from "../../schema";
import { eq, desc, and } from "drizzle-orm";
import type { MT5Provider, ChallengeRow } from "./types";
import { maybeGenerateCertificate } from "../certificates";
import { createNotification } from "../notifications";
import { writeAuditLog } from "../audit";

export interface SyncOutcome {
  synced: boolean;
  reason?: "already_synced" | "skipped";
  source?: "gateway" | "simulated";
  error?: string;
}

/**
 * Resolve the purchase label ("Two-Step Evaluation · $50,000") for a
 * challenge row, for stamping audit entries.
 */
export function resolveChallengeLabel(db: Db, challenge: ChallengeRow): string | null {
  try {
    const template = db
      .select()
      .from(challengeTemplates)
      .where(eq(challengeTemplates.id, challenge.templateId))
      .get();
    if (template?.name && challenge.accountSize != null) {
      return `${template.name} · $${challenge.accountSize.toLocaleString("en-US")}`;
    }
  } catch { /* non-critical */ }
  return null;
}

/**
 * Audit a system-driven lifecycle transition (phase pass, funding, violation,
 * expiry). The actor is the challenge owner — like payment.completed, the
 * event belongs to the trader's journey rather than an admin action.
 */
function writeLifecycleAudit(
  db: Db,
  challenge: ChallengeRow,
  action: string,
  extra: Record<string, unknown> = {},
): void {
  try {
    writeAuditLog(db, {
      userId: challenge.userId,
      action,
      entity: "challenge",
      entityId: challenge.id,
      details: {
        challengeLabel: resolveChallengeLabel(db, challenge),
        accountSize: challenge.accountSize,
        ...extra,
      },
    });
  } catch { /* audit is non-critical */ }
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

    // Audit the lifecycle transition — which phase was passed (or funded),
    // stamped with the challenge label.
    writeLifecycleAudit(
      db,
      challenge,
      nextStatus === "funded" ? "challenge.funded" : "challenge.phase_passed",
      {
        phase: nextStatus,
        profitTargetAmount,
        totalProfit: metrics.totalProfit ?? 0,
        tradingDays: metrics.tradingDaysCount ?? 0,
      },
    );
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

    // Audit the violation with the challenge label.
    writeLifecycleAudit(db, challenge, "challenge.violated", {
      violationType: "max_drawdown",
      drawdown: metrics.currentDrawdown ?? 0,
      maxDrawdownPct: challenge.maxDrawdown,
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

    // Audit the expiry with the challenge label.
    writeLifecycleAudit(db, challenge, "challenge.expired", {
      expiresAt: challenge.expiresAt,
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
