import { test, expect, devices } from "@playwright/test";
import { ensureSeeded, signInAdminFast } from "./helpers";

// ═══════════════════════════════════════════════════════════════
// 7. Responsive viewports — mobile and desktop layouts stay intact
// ═══════════════════════════════════════════════════════════════

async function assertNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflows = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - window.innerWidth;
  });
  // Allow a tiny tolerance for sub-pixel rounding; anything bigger means a
  // fixed-width element is forcing a horizontal scrollbar on mobile.
  expect(overflows).toBeLessThanOrEqual(1);
}

test.describe("7. Responsive viewports", () => {
  test.beforeAll(async ({ request }) => {
    await ensureSeeded(request);
  });

  test("mobile: landing and admin render without horizontal overflow", async ({ browser, request }) => {
    const context = await browser.newContext({ ...devices["iPhone 12"] });
    const page = await context.newPage();

    await page.goto("/");
    await expect(page.getByText(/Get Funded to/).first()).toBeVisible({ timeout: 15_000 });
    await assertNoHorizontalOverflow(page);

    const cookie = await ensureSeeded(request);
    await page.context().addCookies([{ name: "afc_session", value: cookie, domain: "localhost", path: "/" }]);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin Overview" })).toBeVisible({ timeout: 15_000 });
    await assertNoHorizontalOverflow(page);

    await context.close();
  });

  test("desktop: wide viewport shows the full admin KPI grid", async ({ page, request }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAdminFast(page, request);
    await expect(page.getByText("Total Users", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Total Paid Out", { exact: true }).first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });
});
