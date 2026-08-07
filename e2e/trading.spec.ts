import { test, expect } from "@playwright/test";
import { createDemoPurchase, ensureSeeded, signInAdminFast } from "./helpers";

// ═══════════════════════════════════════════════════════════════
// 9. Trading metrics — seeded demo metrics surface in the dashboard
// ═══════════════════════════════════════════════════════════════
test.describe("9. Trading metrics", () => {
  test("seed-demo populates 60 days of metrics for a challenge", async ({ request }) => {
    const cookie = await ensureSeeded(request);
    const { challengeId } = await createDemoPurchase(request, cookie, {
      templateName: "Two-Step Evaluation",
      sizeLabel: "$25,000",
    });

    const res = await request.post("/api/trading/seed-demo", {
      headers: { cookie: `afc_session=${cookie}` },
      data: { challengeId },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.seeded).toBe(true);

    const history = await request.get(`/api/trading/challenge/${challengeId}/history`, {
      headers: { cookie: `afc_session=${cookie}` },
    });
    expect(history.status()).toBe(200);
    const rows = await history.json();
    expect(rows.length).toBeGreaterThanOrEqual(30);

    const latest = await request.get(`/api/trading/challenge/${challengeId}/metrics`, {
      headers: { cookie: `afc_session=${cookie}` },
    });
    const metrics = await latest.json();
    expect(metrics).toBeTruthy();
    expect(metrics.balance).toBeGreaterThan(0);
  });

  test("the trading dashboard renders account balance and equity cards", async ({ page, request }) => {
    const cookie = await ensureSeeded(request);
    const { challengeId } = await createDemoPurchase(request, cookie, {
      templateName: "Two-Step Evaluation",
      sizeLabel: "$25,000",
    });
    await request.post("/api/trading/seed-demo", {
      headers: { cookie: `afc_session=${cookie}` },
      data: { challengeId },
    });

    await signInAdminFast(page, request, "/dashboard/trading");

    await expect(page.getByText("Total Balance").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Total Equity").first()).toBeVisible();
    await expect(page.getByText("MT5 Accounts").first()).toBeVisible();
    await expect(page.getByText(/Account #AFC/)).toBeVisible({ timeout: 15_000 });
  });
});
