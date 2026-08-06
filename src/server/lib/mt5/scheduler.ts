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
 * E2E mode (`E2E_TESTING=1`, set by the Playwright web server): the timers are
 * shortened to a few seconds and the simulated provider is allowed to drive
 * the loop, so the e2e suite can observe the queue drain and the sync pass
 * firing on their own — see `e2e/admin-flow.spec.ts` section 10 and the
 * `POST /api/trading/admin/scheduler/e2e-setup` test hook. Production and
 * normal dev traffic keep the production cadence and simulated no-op.
 *
 * Started once per process by the entrypoints (dev Vite plugin and the
 * production `server.ts`). The module-level flag keeps it idempotent.
 */

const E2E_TESTING = process.env.E2E_TESTING === "1";
const INITIAL_DELAY_MS = E2E_TESTING ? 3_000 : 20_000; // first pass shortly after boot
const QUEUE_INTERVAL_MS = E2E_TESTING ? 4_000 : 5 * 60 * 1000; // retry queue: 4s in e2e, 5 min in prod
const SYNC_INTERVAL_MS = E2E_TESTING ? 8_000 : 60 * 60 * 1000; // sync check: 8s in e2e, hourly in prod

let started = false;

export function startMT5Scheduler(db: Db): void {
  if (started) return;
  started = true;

  const runQueuePass = async (): Promise<void> => {
    try {
      const provider = getMT5Provider(db);
      // Prod: no-op without a live gateway. E2E: let the simulated provider
      // drive the loop so the drain is observable in the Playwright suite.
      if (!provider.configured && !E2E_TESTING) return;
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
      if (!provider.configured && !E2E_TESTING) return;
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
