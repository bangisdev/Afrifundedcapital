import { test, expect } from "@playwright/test";
import { adminGet, adminPost, createDemoPurchase, ensureSeeded } from "./helpers";

// ═══════════════════════════════════════════════════════════════
// 10. MT5 Background Scheduler (part 2/2) — the periodic sync pass.
// The e2e hook makes a challenge stale (no metrics, zeroed balance) and the
// scheduler's sync pass (every 8s in e2e mode) pulls fresh data from the
// simulated provider without any manual trigger.
// ═══════════════════════════════════════════════════════════════
test.describe("10. MT5 Background Scheduler — sync pass", () => {
  test("a stale challenge is re-synced automatically by the scheduler", async ({ request }) => {
    const cookie = await ensureSeeded(request);
    const { challengeId } = await createDemoPurchase(request, cookie, {
      templateName: "One-Step Challenge",
      sizeLabel: "$50,000",
    });

    const setup = await adminPost(request, cookie, "/api/trading/admin/scheduler/e2e-setup", {
      enqueue: false,
    });
    expect(setup.enqueued).toBe(false);
    const syncedChallengeId = setup.challengeId ?? challengeId;

    // Immediately after setup the challenge has no metrics.
    const before = await adminGet(request, cookie, `/api/trading/challenge/${syncedChallengeId}/metrics`);
    expect(before).toBeNull();

    // The sync pass (8s cadence) restores metrics on its own.
    await expect
      .poll(
        async () => {
          const m = await adminGet(request, cookie, `/api/trading/challenge/${syncedChallengeId}/metrics`);
          return m ? m.balance : null;
        },
        { timeout: 45_000, intervals: [2_000, 3_000, 4_000] },
      )
      .toBeGreaterThan(0);

    // The account row now carries a lastSyncAt timestamp.
    const accounts = await adminGet(request, cookie, "/api/trading/admin/mt5?pageSize=50");
    const account = accounts.items.find((a: any) => a.id === setup.mt5AccountId) || accounts.items[0];
    expect(account.lastSyncAt).toBeTruthy();
  });
});
