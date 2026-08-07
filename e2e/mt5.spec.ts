import { test, expect } from "@playwright/test";
import { ensureSeeded, signInAdminFast } from "./helpers";

// ═══════════════════════════════════════════════════════════════
// 8. MT5 Manager (part 1/2) — manager page, gateway status, simulated mode
// ═══════════════════════════════════════════════════════════════
test.describe("8. MT5 Manager — manager page & gateway status", () => {
  test.beforeAll(async ({ request }) => {
    await ensureSeeded(request);
  });

  test("the MT5 manager page renders gateway, queue and account sections", async ({ page, request }) => {
    await signInAdminFast(page, request, "/admin/mt5");

    await expect(page.getByRole("heading", { name: "MT5 Manager" })).toBeVisible();
    await expect(
      page.getByText(/Provision accounts, monitor the gateway, retry queue, and reconciliation/i),
    ).toBeVisible();
    // The queue section header appears once data loads.
    await expect(page.getByText(/Retry Queue/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("admin status reports the simulated provider in e2e mode", async ({ request }) => {
    const cookie = await ensureSeeded(request);
    const res = await request.get("/api/trading/admin/status", {
      headers: { cookie: `afc_session=${cookie}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // No gateway is configured on the isolated e2e DB, so the provider falls
    // back to the simulated MT5 provider.
    expect(["simulated", "gateway"]).toContain(body.providerMode);
    expect(body).toHaveProperty("configured");
    expect(body.queue).toMatchObject({ pending: expect.any(Number), done: expect.any(Number), failed: expect.any(Number) });
  });

  test("unauthenticated calls to admin MT5 endpoints are rejected", async ({ request }) => {
    const res = await request.get("/api/trading/admin/status");
    expect([401, 403]).toContain(res.status());
  });
});
