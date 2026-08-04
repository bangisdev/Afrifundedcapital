import type { Db } from "../../db";
import { getMT5Provider } from "./index";
import { getActiveChallenges, syncChallenge } from "./sync-service";
import { processSyncQueue } from "./retry-queue";

/**
 * Background scheduler for the MT5 connector.
 *
 * Replaces the old "manual only" daily sync: once the app boots, this loop
 * periodically (1) drains the retry queue with exponential backoff and (2)
 * runs a daily sync pass for every active challenge that hasn't synced in the
 * last 23 hours (the dedup window in `syncChallenge`).
 *
 * The scheduler only acts when a real gateway is configured. In simulated
 * mode it is a no-op so demo data only moves when a user/admin explicitly
 * triggers a sync.
 *
 * Started once per process by the entrypoints (dev Vite plugin and the
 * production `server.ts`). The module-level flag keeps it idempotent.
 */

const INITIAL_DELAY_MS = 20_000; // first pass shortly after boot
const QUEUE_INTERVAL_MS = 5 * 60 * 1000; // retry queue: every 5 minutes
const SYNC_INTERVAL_MS = 60 * 60 * 1000; // daily sync check: every hour

let started = false;

export function startMT5Scheduler(db: Db): void {
  if (started) return;
  started = true;

  const runQueuePass = async (): Promise<void> => {
    try {
      const provider = getMT5Provider(db);
      if (!provider.configured) return;
      const result = await processSyncQueue(db, provider, { limit: 50 });
      if (result.failed > 0 || result.remaining > 0) {
        console.warn(
          `[MT5] Queue pass: ${result.processed} processed, ${result.succeeded} ok, ` +
            `${result.failed} failed, ${result.remaining} remaining (${provider.mode})`,
        );
      }
    } catch (err) {
      console.error("[MT5] Queue processing error:", err);
    }
  };

  const runSyncPass = async (): Promise<void> => {
    try {
      const provider = getMT5Provider(db);
      if (!provider.configured) return;
      const challenges = getActiveChallenges(db);
      let synced = 0;
      for (const challenge of challenges) {
        const outcome = await syncChallenge(db, provider, challenge);
        if (outcome.synced) synced++;
      }
      if (synced > 0) {
        console.log(`[MT5] Daily sync pass: ${synced}/${challenges.length} challenge(s) synced (${provider.mode})`);
      }
    } catch (err) {
      console.error("[MT5] Daily sync error:", err);
    }
  };

  setTimeout(() => {
    void runSyncPass();
    void runQueuePass();
  }, INITIAL_DELAY_MS);

  setInterval(() => void runQueuePass(), QUEUE_INTERVAL_MS);
  setInterval(() => void runSyncPass(), SYNC_INTERVAL_MS);
}
