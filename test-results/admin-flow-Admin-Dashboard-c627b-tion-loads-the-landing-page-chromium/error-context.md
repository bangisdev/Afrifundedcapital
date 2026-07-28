# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-flow.spec.ts >> Admin Dashboard E2E Flow >> 1. Authentication >> loads the landing page
- Location: e2e/admin-flow.spec.ts:97:5

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Page snapshot

```yaml
- generic [ref=f4e36]:
  - generic [ref=f4e37]: Loading application...
  - generic [ref=f4e38]: Step 4 of 4
```

# Test source

```ts
  1   | /**
  2   |  * End-to-end tests for the Admin Dashboard flow.
  3   |  *
  4   |  * Covers: Login → Overview → Users → Challenges → Payments
  5   |  *
  6   |  * Prerequisites:
  7   |  *   1. The dev server must be running
  8   |  *   2. A super-admin account must exist:
  9   |  *        POST /api/seed/admin
  10  |  *        { "email": "admin@afrifundedcapital.com", "password": "Admin@123456" }
  11  |  *   3. Set PLAYWRIGHT_BASE_URL if not using localhost:5173
  12  |  *
  13  |  * Note: The Freebuff platform may show "Server is taking longer than usual"
  14  |  * during cold starts. The warmUp helper retries page loads until the app
  15  |  * is fully available.
  16  |  */
  17  | import { test, expect, type Page } from "@playwright/test";
  18  | 
  19  | // ─── Config ───────────────────────────────────────────────
  20  | const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@afrifundedcapital.com";
  21  | const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "Admin@123456";
  22  | const WARMUP_RETRIES = 5;
  23  | const WARMUP_DELAY_MS = 5_000;
  24  | 
  25  | // ─── Helpers ──────────────────────────────────────────────
  26  | 
  27  | /** Wait for the app to be interactive — retries on platform cold-start delays */
  28  | async function waitForAppReady(page: Page) {
  29  |   try {
  30  |     await page.waitForFunction(
  31  |       () => {
  32  |         const body = document.body?.textContent || "";
  33  |         const hasLoading =
  34  |           body.includes("Loading application") ||
  35  |           body.includes("Step 4 of 4") ||
  36  |           body.includes("taking longer than usual");
  37  |         const hasInteractive =
  38  |           document.querySelectorAll('input, button, h1, h2, a[href]').length > 2;
  39  |         return hasInteractive || (!hasLoading && body.length > 200);
  40  |       },
  41  |       { timeout: 15_000 },
  42  |     );
  43  |   } catch {
  44  |     // Platform may be slow — give it more time
  45  |     await page.waitForTimeout(5_000);
  46  |   }
  47  | }
  48  | 
  49  | /** Navigate to a page with retry logic for platform cold starts */
  50  | async function warmUp(page: Page, path: string): Promise<boolean> {
  51  |   for (let attempt = 0; attempt < WARMUP_RETRIES; attempt++) {
  52  |     await page.goto(path, { waitUntil: "domcontentloaded" });
  53  |     await page.waitForTimeout(2_000);
  54  |     const body = await page.textContent("body").catch(() => "");
  55  |     const isReady =
  56  |       body &&
  57  |       body.length > 200 &&
  58  |       !body.includes("taking longer than usual") &&
  59  |       !body.includes("Loading application");
  60  |     if (isReady) return true;
  61  |     // Server not ready — wait and retry
  62  |     await page.waitForTimeout(WARMUP_DELAY_MS);
  63  |   }
  64  |   return false;
  65  | }
  66  | 
  67  | /** Sign in as admin via the UI auth page */
  68  | async function signInAsAdmin(page: Page) {
  69  |   const ready = await warmUp(page, "/auth");
  70  |   if (!ready) {
  71  |     // One more attempt with a longer wait
  72  |     await page.goto("/auth");
  73  |     await page.waitForTimeout(10_000);
  74  |   }
  75  |   await waitForAppReady(page);
  76  | 
  77  |   const emailInput = page.locator('input[type="email"]').first();
  78  |   await emailInput.waitFor({ state: "visible", timeout: 30_000 });
  79  | 
  80  |   const passwordInput = page.locator('input[type="password"]').first();
  81  |   await emailInput.fill(ADMIN_EMAIL);
  82  |   await passwordInput.fill(ADMIN_PASSWORD);
  83  | 
  84  |   const submitBtn = page.locator('button[type="submit"]').first();
  85  |   await submitBtn.click();
  86  | 
  87  |   await page.waitForURL((url) => !url.pathname.includes("/auth"), { timeout: 20_000 });
  88  | }
  89  | 
  90  | // ─── Tests ────────────────────────────────────────────────
  91  | 
  92  | test.describe("Admin Dashboard E2E Flow", () => {
  93  |   test.describe.configure({ mode: "serial" });
  94  | 
  95  |   // ─── 1. Authentication ────────────────────────────────
  96  |   test.describe("1. Authentication", () => {
  97  |     test("loads the landing page", async ({ page }) => {
  98  |       const ready = await warmUp(page, "/");
> 99  |       expect(ready).toBeTruthy();
      |                     ^ Error: expect(received).toBeTruthy()
  100 |       const text = await page.textContent("body");
  101 |       expect(text?.length).toBeGreaterThan(100);
  102 |     });
  103 | 
  104 |     test("navigates to auth page", async ({ page }) => {
  105 |       const ready = await warmUp(page, "/auth");
  106 |       expect(ready).toBeTruthy();
  107 |       await waitForAppReady(page);
  108 |       await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 30_000 });
  109 |       await expect(page.locator('input[type="password"]').first()).toBeVisible();
  110 |     });
  111 | 
  112 |     test("shows validation error for empty credentials", async ({ page }) => {
  113 |       await warmUp(page, "/auth");
  114 |       await waitForAppReady(page);
  115 |       await page.locator('input[type="email"]').first().waitFor({ state: "visible", timeout: 30_000 });
  116 | 
  117 |       const submitBtn = page.locator('button[type="submit"]').first();
  118 |       await submitBtn.click();
  119 |       await page.waitForTimeout(1_000);
  120 |       expect(page.url()).toContain("/auth");
  121 |     });
  122 | 
  123 |     test("signs in as admin successfully", async ({ page }) => {
  124 |       await signInAsAdmin(page);
  125 |       const url = page.url();
  126 |       const isDashboard = url.includes("/dashboard") || url.includes("/admin");
  127 |       expect(isDashboard).toBeTruthy();
  128 |     });
  129 |   });
  130 | 
  131 |   // ─── 2. Admin Overview ────────────────────────────────
  132 |   test.describe("2. Admin Overview", () => {
  133 |     test.beforeEach(async ({ page }) => {
  134 |       await signInAsAdmin(page);
  135 |     });
  136 | 
  137 |     test("loads the admin overview page", async ({ page }) => {
  138 |       await warmUp(page, "/admin");
  139 |       await waitForAppReady(page);
  140 | 
  141 |       const body = await page.textContent("body");
  142 |       const hasAdminContent =
  143 |         body?.includes("Overview") || body?.includes("Admin") || body?.includes("Total Users");
  144 |       expect(hasAdminContent).toBeTruthy();
  145 |     });
  146 | 
  147 |     test("displays stat cards on overview", async ({ page }) => {
  148 |       await warmUp(page, "/admin");
  149 |       await waitForAppReady(page);
  150 | 
  151 |       const body = await page.textContent("body");
  152 |       const hasStats =
  153 |         body?.includes("Total Users") || body?.includes("Revenue") || body?.includes("Challenges");
  154 |       expect(hasStats).toBeTruthy();
  155 |     });
  156 | 
  157 |     test("shows navigation sidebar", async ({ page }) => {
  158 |       await warmUp(page, "/admin");
  159 |       await waitForAppReady(page);
  160 | 
  161 |       const nav = page.locator("nav, [role='navigation'], aside, .sidebar").first();
  162 |       if (await nav.isVisible()) {
  163 |         const navText = await nav.textContent();
  164 |         expect(navText?.length).toBeGreaterThan(10);
  165 |       }
  166 |     });
  167 |   });
  168 | 
  169 |   // ─── 3. User Management ───────────────────────────────
  170 |   test.describe("3. User Management", () => {
  171 |     test.beforeEach(async ({ page }) => {
  172 |       await signInAsAdmin(page);
  173 |     });
  174 | 
  175 |     test("navigates to user management page", async ({ page }) => {
  176 |       await warmUp(page, "/admin");
  177 |       await waitForAppReady(page);
  178 | 
  179 |       const usersLink = page.locator("a:has-text('Users'), button:has-text('Users')").first();
  180 |       if (await usersLink.isVisible()) {
  181 |         await usersLink.click();
  182 |         await page.waitForTimeout(2_000);
  183 |       }
  184 |       const body = await page.textContent("body");
  185 |       expect(body?.includes("User") || body?.includes("Manage")).toBeTruthy();
  186 |     });
  187 | 
  188 |     test("displays user search input", async ({ page }) => {
  189 |       await warmUp(page, "/admin");
  190 |       await waitForAppReady(page);
  191 | 
  192 |       const usersLink = page.locator("a:has-text('Users'), button:has-text('Users')").first();
  193 |       if (await usersLink.isVisible()) {
  194 |         await usersLink.click();
  195 |         await page.waitForTimeout(2_000);
  196 |       }
  197 |       const searchInput = page.locator('input[placeholder*="Search" i], input[type="search"]').first();
  198 |       if (await searchInput.isVisible()) {
  199 |         await expect(searchInput).toBeVisible();
```