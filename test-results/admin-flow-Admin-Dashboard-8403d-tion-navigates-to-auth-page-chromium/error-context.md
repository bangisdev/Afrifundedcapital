# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-flow.spec.ts >> Admin Dashboard E2E Flow >> 1. Authentication >> navigates to auth page
- Location: e2e/admin-flow.spec.ts:86:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('input[type="email"]').first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for locator('input[type="email"]').first()

```

```yaml
- text: Server is taking longer than usual Sorry for the inconvenience. High load is delaying startup.
```

# Test source

```ts
  1   | /**
  2   |  * End-to-end tests for the Admin Dashboard flow.
  3   |  *
  4   |  * Covers: Login → Overview → Users → Challenges → Payments
  5   |  *
  6   |  * Prerequisites:
  7   |  *   1. The dev server must be running (bun run dev)
  8   |  *   2. A super-admin account must exist:
  9   |  *        POST /api/seed/admin
  10  |  *        { "email": "admin@afrifundedcapital.com", "password": "Admin@123456" }
  11  |  *   3. Set PLAYWRIGHT_BASE_URL if not using localhost:5173
  12  |  */
  13  | import { test, expect, type Page } from "@playwright/test";
  14  | 
  15  | // ─── Config ───────────────────────────────────────────────
  16  | const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@afrifundedcapital.com";
  17  | const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "Admin@123456";
  18  | 
  19  | // ─── Helpers ──────────────────────────────────────────────
  20  | 
  21  | /** Wait for the app to be interactive (loading screen gone or form elements visible) */
  22  | async function waitForAppReady(page: Page) {
  23  |   // The Freebuff platform shows "Loading application... Step 4 of 4" during bootstrap.
  24  |   // In headless Chromium this may never fully resolve, so we use a dual strategy:
  25  |   // 1. Wait up to 10s for loading text to disappear OR
  26  |   // 2. Wait for interactive elements (inputs, buttons, headings) to appear
  27  |   try {
  28  |     await page.waitForFunction(
  29  |       () => {
  30  |         const body = document.body?.textContent || "";
  31  |         const hasLoading = body.includes("Loading application") || body.includes("Step 4 of 4");
  32  |         const hasInteractive = document.querySelectorAll('input, button, h1, h2, a[href]').length > 2;
  33  |         return hasInteractive || (!hasLoading && body.length > 100);
  34  |       },
  35  |       { timeout: 12_000 },
  36  |     );
  37  |   } catch {
  38  |     // If still loading, wait a bit more and proceed anyway
  39  |     await page.waitForTimeout(3_000);
  40  |   }
  41  | }
  42  | 
  43  | /** Sign in as admin via the UI auth page */
  44  | async function signInAsAdmin(page: Page) {
  45  |   await page.goto("/auth");
  46  |   // Wait for the app to fully bootstrap first
  47  |   await waitForAppReady(page);
  48  |   // Then wait for the email input to appear
  49  |   const emailInput = page.locator('input[type="email"]').first();
  50  |   await emailInput.waitFor({ state: "visible", timeout: 15_000 });
  51  | 
  52  |   const passwordInput = page.locator('input[type="password"]').first();
  53  | 
  54  |   await emailInput.fill(ADMIN_EMAIL);
  55  |   await passwordInput.fill(ADMIN_PASSWORD);
  56  | 
  57  |   // Click the sign-in / submit button
  58  |   const submitBtn = page.locator('button[type="submit"]').first();
  59  |   await submitBtn.click();
  60  | 
  61  |   // Wait for navigation away from /auth
  62  |   await page.waitForURL((url) => !url.pathname.includes("/auth"), { timeout: 15_000 });
  63  | }
  64  | 
  65  | /** Wait for a page heading to appear */
  66  | async function waitForHeading(page: Page, text: string | RegExp) {
  67  |   await expect(page.locator(`h1:has-text("${typeof text === "string" ? text : text.source}"), h2:has-text("${typeof text === "string" ? text : text.source}")`).first()).toBeVisible({ timeout: 10_000 });
  68  | }
  69  | 
  70  | // ─── Tests ────────────────────────────────────────────────
  71  | 
  72  | test.describe("Admin Dashboard E2E Flow", () => {
  73  |   test.describe.configure({ mode: "serial" });
  74  | 
  75  |   // ─── 1. Authentication ────────────────────────────────
  76  |   test.describe("1. Authentication", () => {
  77  |     test("loads the landing page", async ({ page }) => {
  78  |       await page.goto("/");
  79  |       // Should show the brand name or hero content
  80  |       await expect(page.locator("body")).toBeVisible();
  81  |       // Page should not be blank
  82  |       const text = await page.textContent("body");
  83  |       expect(text?.length).toBeGreaterThan(100);
  84  |     });
  85  | 
  86  |     test("navigates to auth page", async ({ page }) => {
  87  |       await page.goto("/auth");
  88  |       await waitForAppReady(page);
  89  |       // Should show login form elements
> 90  |       await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 15_000 });
      |                                                                 ^ Error: expect(locator).toBeVisible() failed
  91  |       await expect(page.locator('input[type="password"]').first()).toBeVisible();
  92  |     });
  93  | 
  94  |     test("shows validation error for empty credentials", async ({ page }) => {
  95  |       await page.goto("/auth");
  96  |       await waitForAppReady(page);
  97  |       await page.locator('input[type="email"]').first().waitFor({ state: "visible", timeout: 15_000 });
  98  | 
  99  |       const submitBtn = page.locator('button[type="submit"]').first();
  100 |       await submitBtn.click();
  101 | 
  102 |       // Should stay on auth page (no navigation)
  103 |       await page.waitForTimeout(1000);
  104 |       expect(page.url()).toContain("/auth");
  105 |     });
  106 | 
  107 |     test("signs in as admin successfully", async ({ page }) => {
  108 |       await signInAsAdmin(page);
  109 |       // Should be redirected to dashboard or admin
  110 |       const url = page.url();
  111 |       const isDashboard = url.includes("/dashboard") || url.includes("/admin");
  112 |       expect(isDashboard).toBeTruthy();
  113 |     });
  114 |   });
  115 | 
  116 |   // ─── 2. Admin Overview ────────────────────────────────
  117 |   test.describe("2. Admin Overview", () => {
  118 |     test.beforeEach(async ({ page }) => {
  119 |       await signInAsAdmin(page);
  120 |     });
  121 | 
  122 |     test("loads the admin overview page", async ({ page }) => {
  123 |       await page.goto("/admin");
  124 |       await waitForAppReady(page);
  125 |       await page.waitForTimeout(2000);
  126 | 
  127 |       // Should show admin content (stat cards, heading, etc.)
  128 |       const body = await page.textContent("body");
  129 |       expect(body).toBeTruthy();
  130 |       // Check for admin-specific content
  131 |       const hasAdminContent = body?.includes("Overview") || body?.includes("Admin") || body?.includes("Total Users");
  132 |       expect(hasAdminContent).toBeTruthy();
  133 |     });
  134 | 
  135 |     test("displays stat cards on overview", async ({ page }) => {
  136 |       await page.goto("/admin");
  137 |       await waitForAppReady(page);
  138 |       await page.waitForTimeout(2000);
  139 | 
  140 |       // Look for stat card labels
  141 |       const body = await page.textContent("body");
  142 |       const hasStats = body?.includes("Total Users") || body?.includes("Revenue") || body?.includes("Challenges");
  143 |       expect(hasStats).toBeTruthy();
  144 |     });
  145 | 
  146 |     test("shows navigation sidebar", async ({ page }) => {
  147 |       await page.goto("/admin");
  148 |       await waitForAppReady(page);
  149 |       await page.waitForTimeout(2000);
  150 | 
  151 |       // Sidebar should have navigation links
  152 |       const nav = page.locator("nav, [role='navigation'], aside, .sidebar").first();
  153 |       if (await nav.isVisible()) {
  154 |         const navText = await nav.textContent();
  155 |         expect(navText?.length).toBeGreaterThan(10);
  156 |       }
  157 |     });
  158 |   });
  159 | 
  160 |   // ─── 3. User Management ───────────────────────────────
  161 |   test.describe("3. User Management", () => {
  162 |     test.beforeEach(async ({ page }) => {
  163 |       await signInAsAdmin(page);
  164 |     });
  165 | 
  166 |     test("navigates to user management page", async ({ page }) => {
  167 |       await page.goto("/admin");
  168 |       await waitForAppReady(page);
  169 |       await page.waitForTimeout(2000);
  170 | 
  171 |       // Look for Users link in sidebar and click it
  172 |       const usersLink = page.locator("a:has-text('Users'), button:has-text('Users')").first();
  173 |       if (await usersLink.isVisible()) {
  174 |         await usersLink.click();
  175 |         await page.waitForTimeout(2000);
  176 |       }
  177 | 
  178 |       // Check page content
  179 |       const body = await page.textContent("body");
  180 |       const hasUserContent = body?.includes("User") || body?.includes("Manage");
  181 |       expect(hasUserContent).toBeTruthy();
  182 |     });
  183 | 
  184 |     test("displays user search input", async ({ page }) => {
  185 |       await page.goto("/admin");
  186 |       await waitForAppReady(page);
  187 |       await page.waitForTimeout(2000);
  188 | 
  189 |       // Try to find Users link and navigate
  190 |       const usersLink = page.locator("a:has-text('Users'), button:has-text('Users')").first();
```