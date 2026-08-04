import type { Db } from "../../db";
import { mt5Reconciliation, mt5Accounts, tradingMetrics, userChallenges } from "../../schema";
import { eq, desc, sql, and } from "drizzle-orm";
import type { MT5Provider } from "./types";
import { getActiveChallenges } from "./sync-service";

export interface ReconciliationSummary {
  total: number;
  matched: number;
  mismatch: number;
  unavailable: number;
  source: "gateway" | "simulated";
  tolerance: number;
}

/**
 * Run a reconciliation pass across all active challenges that have an MT5
 * account, comparing the live server state (via the provider) against what we
 * have stored locally.
 *
 * - Gateway provider: pulls real balance/equity from the MT5 Manager API.
 * - Simulated provider: performs an internal consistency check between the
 *   stored account balance and the latest recorded trading metrics (no live
 *   server), so the dashboard still surfaces drift.
 *
 * Every account is written to `mt5_reconciliation` as an audit trail.
 */
export async function runReconciliation(
  db: Db,
  provider: MT5Provider,
  opts: { tolerance?: number; accountId?: number } = {},
): Promise<ReconciliationSummary> {
  const tolerance = opts.tolerance ?? 0.01;
  const challenges = opts.accountId
    ? db.select().from(userChallenges)
        .where(and(
          eq(userChallenges.mt5AccountId, opts.accountId),
          eq(userChallenges.status, "active"),
        ))
        .all()
    : getActiveChallenges(db);

  const summary: ReconciliationSummary = {
    total: challenges.length,
    matched: 0,
    mismatch: 0,
    unavailable: 0,
    source: provider.mode,
    tolerance,
  };

  for (const challenge of challenges) {
    const mt5Id = challenge.mt5AccountId;
    if (!mt5Id) {
      summary.unavailable++;
      continue;
    }
    const account = db.select().from(mt5Accounts).where(eq(mt5Accounts.id, mt5Id)).get();
    if (!account) {
      summary.unavailable++;
      continue;
    }

    const login = account.login;
    let serverBalance = account.balance;
    let serverEquity = account.equity;
    let status: "matched" | "mismatch" | "unavailable" = "matched";
    let detail = "local snapshot";

    if (provider.mode === "gateway") {
      try {
        const info = await provider.getAccountInfo(login);
        serverBalance = info.balance;
        serverEquity = info.equity;
        detail = "live server snapshot";
      } catch (err) {
        status = "unavailable";
        detail = err instanceof Error ? err.message : "gateway unreachable";
        summary.unavailable++;
        writeEntry(db, challenge.id, mt5Id, login, {
          status,
          serverBalance,
          serverEquity,
          localBalance: account.balance,
          localEquity: account.equity,
          difference: 0,
          detail,
          source: provider.mode,
          tolerance,
        });
        continue;
      }
    } else {
      // Simulated: cross-check the account balance against the latest metrics.
      const latest = db.select().from(tradingMetrics)
        .where(eq(tradingMetrics.challengeId, challenge.id))
        .orderBy(desc(tradingMetrics.recordedAt))
        .limit(1).get();
      if (latest) {
        serverBalance = latest.balance;
        serverEquity = latest.equity;
      }
      detail = "latest metrics snapshot";
    }

    const diffBalance = Math.abs(serverBalance - account.balance);
    const diffEquity = Math.abs(serverEquity - account.equity);
    const within = diffBalance <= tolerance && diffEquity <= tolerance;

    if (within) {
      status = "matched";
      summary.matched++;
    } else {
      status = "mismatch";
      summary.mismatch++;
    }

    writeEntry(db, challenge.id, mt5Id, login, {
      status,
      serverBalance,
      serverEquity,
      localBalance: account.balance,
      localEquity: account.equity,
      difference: Math.round((serverBalance - account.balance) * 100) / 100,
      detail,
      source: provider.mode,
      tolerance,
    });
  }

  return summary;
}

/** Recent reconciliation history for the admin UI. */
export function getReconciliationHistory(
  db: Db,
  opts: { limit?: number } = {},
) {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 25));
  return db
    .select()
    .from(mt5Reconciliation)
    .orderBy(desc(mt5Reconciliation.recordedAt))
    .limit(limit)
    .all();
}

function writeEntry(
  db: Db,
  challengeId: number,
  mt5AccountId: number,
  login: string,
  data: {
    status: string;
    serverBalance: number;
    serverEquity: number;
    localBalance: number;
    localEquity: number;
    difference: number;
    detail: string;
    source: string;
    tolerance: number;
  },
): void {
  try {
    db.insert(mt5Reconciliation).values({
      challengeId,
      mt5AccountId,
      login,
      status: data.status,
      serverBalance: data.serverBalance,
      serverEquity: data.serverEquity,
      localBalance: data.localBalance,
      localEquity: data.localEquity,
      difference: data.difference,
      tolerance: data.tolerance,
      source: data.source,
      detail: data.detail,
      recordedAt: Date.now(),
    }).run();
  } catch (e) {
    console.error("[MT5] Failed to record reconciliation entry:", e);
  }
}

/** Latest reconciliation run metadata (for the admin status panel). */
export function getReconciliationStatus(db: Db) {
  const last = db.select().from(mt5Reconciliation).orderBy(desc(mt5Reconciliation.recordedAt)).limit(1).get();
  if (!last) return null;
  const countRow = db.select({ cnt: sql<number>`COUNT(*)` }).from(mt5Reconciliation).get();
  return {
    lastRunAt: last.recordedAt,
    lastStatus: last.status,
    totalEntries: Number(countRow?.cnt ?? 0),
  };
}
