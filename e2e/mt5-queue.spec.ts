import { test, expect } from "@playwright/test";
import { adminGet, adminPost, createDemoPurchase, ensureSeeded, signInAdminFast } from "./helpers";

// ═══════════════════════════════════════════════════════════════
// 8. MT5 Manager (part 2/2) — account provisioning & retry queue ops.
// Split from part 1 so the chunk can run on 2 Playwright workers.
// ═══════════════════════════════════════════════════════════════
test.describe("8. MT5 Manager — retry queue & account provisioning", () => {
  test("a demo purchase provisions an MT5 account visible in admin", async ({ page, request }) => {
    const cookie = await ensureSeeded(request);
    await createDemoPurchase(request, cookie, {
      templateName: "Two-Step Evaluation",
      sizeLabel: "$25,000",
    });

    const data = await adminGet(request, cookie, "/api/trading/admin/mt5?pageSize=50");
    expect(data.stats.total).toBeGreaterThanOrEqual(1);
    expect(data.items.length).toBeGreaterThanOrEqual(1);
    const account = data.items[0];
    expect(account.login).toMatch(/^AFC/);
    expect(account.balance).toBeGreaterThan(0);

    await signInAdminFast(page, request);
    await page.goto("/admin/mt5");
    await expect(page.getByText(account.login)).toBeVisible({ timeout: 15_000 });
  });

  test("retry-queue jobs can be processed manually by an admin", async ({ request }) => {
    const cookie = await ensureSeeded(request);
    await createDemoPurchase(request, cookie, {
      templateName: "One-Step Challenge",
      sizeLabel: "$10,000",
    });

    const setup = await adminPost(request, cookie, "/api/trading/admin/scheduler/e2e-setup", {
      enqueue: true,
    });
    expect(setup.success).toBe(true);
    expect(setup.enqueued).toBe(true);
    expect(setup.queueJobId).toBeTruthy();

    const before = await adminGet(request, cookie, "/api/trading/admin/queue");
    expect(before.stats.pending).toBeGreaterThanOrEqual(1);

    // Manually drain the queue (the background scheduler also drains it, but
    // this asserts the admin control surface works end to end).
    const processed = await adminPost(request, cookie, "/api/trading/admin/queue/process", {
      ignoreBackoff: true,
      limit: 50,
    });
    expect(processed.succeeded).toBeGreaterThanOrEqual(1);

    const after = await adminGet(request, cookie, "/api/trading/admin/queue");
    expect(after.stats.pending).toBe(0);
    expect(after.stats.done).toBeGreaterThanOrEqual(1);
  });
});
