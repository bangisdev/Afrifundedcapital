import { test, expect, type Page } from "@playwright/test";
import { ensureSeeded, signInAdminFast } from "./helpers";

// ═══════════════════════════════════════════════════════════════
// 6. Cross-page navigation — every admin section loads without a crash
// ═══════════════════════════════════════════════════════════════

const ADMIN_SECTIONS: Array<[string, string | null]> = [
  ["/admin", "Admin Overview"],
  ["/admin/users", "Search by name, email, phone, or referral code..."],
  ["/admin/payments", null],
  ["/admin/payouts", null],
  ["/admin/kyc", null],
  ["/admin/affiliates", null],
  ["/admin/coupons", null],
  ["/admin/support", null],
  ["/admin/certificates", null],
  ["/admin/mt5", "MT5 Manager"],
  ["/admin/notifications", null],
  ["/admin/reports", null],
  ["/admin/audit-logs", null],
  ["/admin/settings", null],
];

async function assertSectionRenders(page: Page, path: string, anchor: string | null = null) {
  await page.goto(path);
  await expect(page).toHaveURL(path, { timeout: 20_000 });
  // The admin shell (sidebar with Sign Out) always renders when the app is
  // healthy; a page crash replaces the whole tree with the error boundary.
  await expect(page.getByText("Sign Out", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Preview runtime error")).toHaveCount(0);
  if (anchor) {
    await expect(page.getByText(anchor, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  }
}

test.describe("6. Cross-page navigation", () => {
  test.beforeAll(async ({ request }) => {
    await ensureSeeded(request);
  });

  test("every admin section loads without crashing", async ({ page, request }) => {
    await signInAdminFast(page, request);
    for (const [path, anchor] of ADMIN_SECTIONS) {
      await assertSectionRenders(page, path, anchor);
    }
  });

  test("sidebar links navigate between sections", async ({ page, request }) => {
    await signInAdminFast(page, request);

    await page.getByText("Users", { exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/users/, { timeout: 15_000 });

    await page.getByText("Audit Logs", { exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/audit-logs/, { timeout: 15_000 });

    await page.getByText("MT5", { exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/mt5/, { timeout: 15_000 });

    await page.getByText("Dashboard", { exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin$/, { timeout: 15_000 });
  });
});
