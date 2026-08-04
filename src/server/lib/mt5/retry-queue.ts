import type { Db } from "../../db";
import { mt5SyncQueue } from "../../schema";
import { eq, desc, and, lt, sql } from "drizzle-orm";
import type { MT5Provider } from "./types";
import { syncChallenge, getChallengeByMt5Account } from "./sync-service";

export type QueueStatus = "pending" | "done" | "failed";

export interface EnqueueInput {
  mt5AccountId: number;
  action: string;
  payload?: Record<string, unknown>;
  maxRetries?: number;
}

/** Add a job to the retry queue. */
export function enqueueSyncJob(db: Db, input: EnqueueInput): number {
  const res = db.insert(mt5SyncQueue).values({
    mt5AccountId: input.mt5AccountId,
    action: input.action,
    status: "pending",
    payload: input.payload ? JSON.stringify(input.payload) : null,
    retryCount: 0,
    maxRetries: input.maxRetries ?? 3,
    createdAt: Date.now(),
  }).returning({ id: mt5SyncQueue.id }).get();
  return res.id;
}

/** Aggregate queue stats. */
export function getQueueStats(db: Db) {
  const rows = db
    .select({ status: mt5SyncQueue.status, cnt: sql<number>`COUNT(*)` })
    .from(mt5SyncQueue)
    .groupBy(mt5SyncQueue.status)
    .all();
  const byStatus: Record<string, number> = { pending: 0, done: 0, failed: 0 };
  for (const r of rows) {
    byStatus[r.status] = Number(r.cnt ?? 0);
  }
  const lastEntry = db.select().from(mt5SyncQueue).orderBy(desc(mt5SyncQueue.createdAt)).limit(1).get();
  return {
    pending: byStatus.pending ?? 0,
    done: byStatus.done ?? 0,
    failed: byStatus.failed ?? 0,
    total: (byStatus.pending ?? 0) + (byStatus.done ?? 0) + (byStatus.failed ?? 0),
    lastJobAt: lastEntry?.createdAt ?? null,
  };
}

/** Recent queue entries for the admin UI (paginated). */
export function getQueueEntries(
  db: Db,
  opts: { status?: string; page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const where = opts.status
    ? eq(mt5SyncQueue.status, opts.status)
    : sql`1 = 1`;

  const totalRow = db.select({ cnt: sql<number>`COUNT(*)` }).from(mt5SyncQueue).where(where).get();
  const total = Number(totalRow?.cnt ?? 0);

  const items = db
    .select()
    .from(mt5SyncQueue)
    .where(where)
    .orderBy(desc(mt5SyncQueue.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Backoff delay before the next attempt for a job with `retryCount` previous
 * failures: base * 2^n, capped at 1 hour.
 */
function backoffDelayMs(retryCount: number, baseMs = 30_000): number {
  return Math.min(60 * 60 * 1000, baseMs * 2 ** Math.max(0, retryCount));
}

export interface ProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  remaining: number;
  errors: string[];
}

/**
 * Process eligible pending jobs.
 *
 * A job is eligible when it hasn't been attempted yet, or enough time has
 * elapsed since its last attempt (exponential backoff). Each execution may
 * fail; failures increment retryCount and the job is re-queued until
 * maxRetries, at which point it is marked `failed`.
 */
export async function processSyncQueue(
  db: Db,
  provider: MT5Provider,
  opts: { ignoreBackoff?: boolean; limit?: number } = {},
): Promise<ProcessResult> {
  const now = Date.now();
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const pending = db
    .select()
    .from(mt5SyncQueue)
    .where(eq(mt5SyncQueue.status, "pending"))
    .orderBy(desc(mt5SyncQueue.createdAt))
    .limit(limit)
    .all();

  const result: ProcessResult = { processed: 0, succeeded: 0, failed: 0, remaining: 0, errors: [] };

  for (const job of pending) {
    // Respect backoff unless explicitly bypassed.
    if (!opts.ignoreBackoff && job.retryCount > 0 && job.processedAt) {
      const nextAllowed = job.processedAt + backoffDelayMs(job.retryCount);
      if (now < nextAllowed) continue;
    }

    result.processed++;

    try {
      await executeJob(db, provider, job);
      db.update(mt5SyncQueue).set({
        status: "done",
        processedAt: Date.now(),
        error: null,
      }).where(eq(mt5SyncQueue.id, job.id)).run();
      result.succeeded++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Queue job failed";
      const newRetry = job.retryCount + 1;
      if (newRetry >= job.maxRetries) {
        db.update(mt5SyncQueue).set({
          status: "failed",
          error: message,
          retryCount: newRetry,
          processedAt: Date.now(),
        }).where(eq(mt5SyncQueue.id, job.id)).run();
        result.failed++;
      } else {
        db.update(mt5SyncQueue).set({
          error: message,
          retryCount: newRetry,
          processedAt: Date.now(),
        }).where(eq(mt5SyncQueue.id, job.id)).run();
        result.errors.push(`job#${job.id} retry ${newRetry}/${job.maxRetries}: ${message}`);
      }
    }
  }

  const remainingRow = db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(mt5SyncQueue)
    .where(and(eq(mt5SyncQueue.status, "pending"), lt(mt5SyncQueue.retryCount, mt5SyncQueue.maxRetries)))
    .get();
  result.remaining = Number(remainingRow?.cnt ?? 0);
  return result;
}

/** Reset a failed job back to pending (admin "retry now"). */
export function retryJob(db: Db, jobId: number): boolean {
  const job = db.select().from(mt5SyncQueue).where(eq(mt5SyncQueue.id, jobId)).get();
  if (!job) return false;
  db.update(mt5SyncQueue).set({
    status: "pending",
    error: null,
    retryCount: 0,
  }).where(eq(mt5SyncQueue.id, jobId)).run();
  return true;
}

/** Reset all failed jobs back to pending. */
export function retryAllFailed(db: Db): number {
  const res = db.update(mt5SyncQueue)
    .set({ status: "pending", error: null, retryCount: 0 })
    .where(eq(mt5SyncQueue.status, "failed"))
    .run();
  return res.changes;
}

/** Execute a single queue job against the provider. */
async function executeJob(
  db: Db,
  provider: MT5Provider,
  job: typeof mt5SyncQueue.$inferSelect,
): Promise<void> {
  switch (job.action) {
    case "sync": {
      const challenge = getChallengeByMt5Account(db, job.mt5AccountId);
      if (!challenge) {
        throw new Error(`No active challenge for MT5 account #${job.mt5AccountId}`);
      }
      const outcome = await syncChallenge(db, provider, challenge);
      if (!outcome.synced && outcome.error) {
        throw new Error(outcome.error);
      }
      if (!outcome.synced && outcome.reason === "already_synced") {
        // Not an error — nothing to do.
      }
      return;
    }
    case "suspend": {
      await provider.suspendAccount(String(job.mt5AccountId));
      return;
    }
    case "activate": {
      await provider.activateAccount(String(job.mt5AccountId));
      return;
    }
    default:
      throw new Error(`Unknown queue action: ${job.action}`);
  }
}
