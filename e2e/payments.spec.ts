import { test, expect } from "@playwright/test";
import { createDemoPurchase, ensureSeeded, signInAdminFast } from "./helpers";

// ═══════════════════════════════════════════════════════════════
// 5. Payments — admin payments table renders transactions with labels
// ═══════════════════════════════════════════════════════════════
test.describe("5. Payments", () => {
  test.beforeAll(async ({ request }) => {
    await ensureSeeded(request);
  });

  test("a completed purchase appears in the admin payments table with its purchase label", async ({ page, request }) => {
    const cookie = await ensureSeeded(request);
    const { label } = await createDemoPurchase(request, cookie, {
      templateName: "Two-Step Evaluation",
      sizeLabel: "$25,000",
    });

    await signInAdminFast(page, request, "/admin/payments");

    // The purchase label (challenge name · account size) is stamped on the row.
    await expect(page.getByText(label, { exact: true })).toBeVisible({ timeout: 15_000 });
    // The demo reference is visible alongside it.
    await expect(page.getByText(/^DEMO-/).first()).toBeVisible();
  });

  test("the payments list API returns challengeName and challengeLabel", async ({ request }) => {
    const cookie = await ensureSeeded(request);
    await createDemoPurchase(request, cookie, {
      templateName: "One-Step Challenge",
      sizeLabel: "$50,000",
    });

    const data = await request
      .get("/api/payments/admin/all?pageSize=50")
      .then((r) => r.json());
    const rows = data.payments || [];
    const withLabel = rows.find((p) => p.challengeLabel?.includes("One-Step Challenge"));
    expect(withLabel).toBeTruthy();
    expect(withLabel.challengeLabel).toMatch(/One-Step Challenge · \$50,000/);
    expect(withLabel.challengeName).toBe("One-Step Challenge");
    expect(withLabel.status).toBe("completed");
  });
});
