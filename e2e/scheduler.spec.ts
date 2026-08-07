import { test, expect } from "@playwright/test";
import { adminGet, adminPost, createDemoPurchase, ensureSeeded, signInAdminFast } from "./helpers";

// ═══════════════════════════════════════════════════════════════
// 10. MT5 Background Scheduler (part 1/2) — the retry queue drains on its
// own. With E2E_TESTING=1 the scheduler fires its first pass ~3s after boot
// and the queue pass every 4s, so a job enqueued by the test hook is picked
// up without any manual trigger.
// ═══════════════════════════════════════════════════════════════
test.describe("10. MT5 Background Scheduler — automatic queue drain", () => {
  test("a sync job enqueued via the e2e hook is drained by the scheduler", async ({ page, request }) => {
    const cookie = await ensureSeeded(request);
    const { challengeId } = await createDemoPurchase(request, cookie, {
      templateName: "Two-Step Evaluation",
      sizeLabel: "$25,000",
    });

    const setup = await adminPost(request, cookie, "/api/trading/admin/scheduler/e2e-setup", {
      enqueue: true,
    });
    expect(setup.enqueued).toBe(true);
    // The hook targets the caller's most recent active challenge; if another
    // worker created one in the meantime, use the challenge the hook actually
    // set up for the post-sync assertions.
    const syncedChallengeId = setup.challengeId ?? challengeId;

    // The scheduler processes the queue every 4s in e2e mode — wait for it.
    await expect
      .poll(
        async () => {
          const q = await adminGet(request, cookie, "/api/trading/admin/queue");
          return q.stats;
        },
        { timeout: 45_000, intervals: [2_000, 3_000, 4_000] },
      )
      .toMatchObject({ pending: 0, done: 1 });

    // The drained job actually synced the challenge (metrics exist again).
    const metrics = await adminGet(request, cookie, `/api/trading/challenge/${syncedChallengeId}/metrics`);
    expect(metrics).toBeTruthy();
    expect(metrics.balance).toBeGreaterThan(0);

    // The admin MT5 page reflects the drained queue.
    await signInAdminFast(page, request);
    await page.goto("/admin/mt5");
    await expect(page.getByText(/queued/i).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: /Retry Queue/ }).click();
    await expect(page.getByText("Done", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  });
});
