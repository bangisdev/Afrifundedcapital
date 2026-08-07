# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: responsive.spec.ts >> 7. Responsive viewports >> mobile: landing and admin render without horizontal overflow
- Location: e2e/responsive.spec.ts:30:3

# Error details

```
Error: page.evaluate: Execution context was destroyed, most likely because of a navigation
```

# Page snapshot

```yaml
- generic [ref=f1e2]:
  - generic [ref=f1e3]: Loading…
  - region "Notifications alt+T"
```

# Test source

```ts
  1  | import { test, expect, devices } from "@playwright/test";
  2  | import { ensureSeeded, signInAdminFast } from "./helpers";
  3  | 
  4  | // ═══════════════════════════════════════════════════════════════
  5  | // 7. Responsive viewports — mobile and desktop layouts stay intact
  6  | // ═══════════════════════════════════════════════════════════════
  7  | 
  8  | async function assertNoHorizontalOverflow(page: import("@playwright/test").Page) {
  9  |   // Poll instead of a single evaluate: the SPA can still be navigating when
  10 |   // the check runs (which destroys the execution context and throws), and
  11 |   // expect.poll retries until the layout settles.
  12 |   await expect
  13 |     .poll(() =>
> 14 |       page.evaluate(() => {
     |            ^ Error: page.evaluate: Execution context was destroyed, most likely because of a navigation
  15 |         const doc = document.documentElement;
  16 |         return doc.scrollWidth - window.innerWidth;
  17 |       }),
  18 |       { timeout: 15_000 },
  19 |     )
  20 |     // Allow a tiny tolerance for sub-pixel rounding; anything bigger means a
  21 |     // fixed-width element is forcing a horizontal scrollbar on mobile.
  22 |     .toBeLessThanOrEqual(1);
  23 | }
  24 | 
  25 | test.describe("7. Responsive viewports", () => {
  26 |   test.beforeAll(async ({ request }) => {
  27 |     await ensureSeeded(request);
  28 |   });
  29 | 
  30 |   test("mobile: landing and admin render without horizontal overflow", async ({ browser, request }) => {
  31 |     const context = await browser.newContext({ ...devices["iPhone 12"] });
  32 |     const page = await context.newPage();
  33 | 
  34 |     await page.goto("/");
  35 |     await expect(page.getByText(/Get Funded to/).first()).toBeVisible({ timeout: 15_000 });
  36 |     await assertNoHorizontalOverflow(page);
  37 | 
  38 |     const cookie = await ensureSeeded(request);
  39 |     await page.context().addCookies([{ name: "afc_session", value: cookie, domain: "localhost", path: "/" }]);
  40 |     await page.goto("/admin");
  41 |     await expect(page.getByRole("heading", { name: "Admin Overview" })).toBeVisible({ timeout: 15_000 });
  42 |     await assertNoHorizontalOverflow(page);
  43 | 
  44 |     await context.close();
  45 |   });
  46 | 
  47 |   test("desktop: wide viewport shows the full admin KPI grid", async ({ page, request }) => {
  48 |     await page.setViewportSize({ width: 1440, height: 900 });
  49 |     await signInAdminFast(page, request);
  50 |     await expect(page.getByText("Total Users", { exact: true }).first()).toBeVisible();
  51 |     await expect(page.getByText("Total Paid Out", { exact: true }).first()).toBeVisible();
  52 |     await assertNoHorizontalOverflow(page);
  53 |   });
  54 | });
  55 | 
```