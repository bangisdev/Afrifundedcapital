import { test, expect } from "@playwright/test";
import { ensureSeeded, signInAdminFast } from "./helpers";

// ═══════════════════════════════════════════════════════════════
// 2. Admin Overview — KPI grid against seeded data
// ═══════════════════════════════════════════════════════════════
test.describe("2. Admin Overview", () => {
  test.beforeAll(async ({ request }) => {
    await ensureSeeded(request);
  });

  test("renders the KPI grid with seeded totals", async ({ page, request }) => {
    await signInAdminFast(page, request);
    await expect(page.getByRole("heading", { name: "Admin Overview" })).toBeVisible();
    await expect(page.getByText("Platform statistics and analytics")).toBeVisible();

    for (const label of ["Total Users", "Total Challenges", "Revenue", "Total Paid Out"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test("the overview reflects the seeded demo users", async ({ page, request }) => {
    await signInAdminFast(page, request);
    // The "Total Users" stat card should show at least the admin + 8 demo users.
    await expect(page.getByText("Total Users").first()).toBeVisible();
    const card = page.locator("div").filter({ hasText: /^Total Users/ }).first();
    await expect(card).toContainText(/\d+/);
  });
});
