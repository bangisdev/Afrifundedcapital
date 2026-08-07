import { test, expect, devices } from "@playwright/test";
import { ensureSeeded, signInAdminFast } from "./helpers";

// ═══════════════════════════════════════════════════════════════
// 7. Responsive viewports — mobile and desktop layouts stay intact
// ═══════════════════════════════════════════════════════════════

/**
 * Navigate to an authed route with cold-start tolerance. The Vite dev server
 * can interrupt the first navigation with a full-page reload (dependency
 * discovery); retry with domcontentloaded until the page stays put.
 */
async function gotoWithColdStartTolerance(page: import("@playwright/test").Page, path: string) {
  const deadline = Date.now() + 30_000;
  for (let attempt = 0; attempt < 5 && Date.now() < deadline; attempt++) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded", timeout: 15_000 });
      await expect(page).toHaveURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), {
        timeout: 15_000,
      });
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const interrupted =
        msg.includes("interrupted by another navigation") ||
        msg.includes("net::ERR_ABORTED") ||
        msg.includes("Execution context was destroyed");
      if (!interrupted) throw err;
      await page.waitForTimeout(2_000);
    }
  }
  throw new Error(`navigation to ${path} kept getting interrupted by cold-start reloads`);
}

async function assertNoHorizontalOverflow(page: import("@playwright/test").Page) {
  // The Vite dev server can trigger a cold-start full-page reload shortly after
  // first paint (dependency discovery), which destroys the evaluate context.
  // Retry until the layout is stable instead of failing on the first shot.
  const deadline = Date.now() + 20_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const overflows = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth - window.innerWidth;
      });
      // Allow a tiny tolerance for sub-pixel rounding; anything bigger means a
      // fixed-width element is forcing a horizontal scrollbar on mobile.
      expect(overflows).toBeLessThanOrEqual(1);
      return;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const navigated =
        msg.includes("Execution context was destroyed") ||
        msg.includes("net::ERR_ABORTED") ||
        msg.includes("Target closed");
      if (!navigated && msg.includes("toBeLessThanOrEqual")) {
        // A genuine overflow — fail fast with the measured value.
        throw err;
      }
      await page.waitForTimeout(1_000);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("page kept navigating during the horizontal-overflow check");
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
    await gotoWithColdStartTolerance(page, "/admin");
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
