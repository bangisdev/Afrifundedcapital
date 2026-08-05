# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-flow.spec.ts >> Admin Dashboard E2E Flow >> 3. User Management >> displays user search input
- Location: e2e/admin-flow.spec.ts:213:5

# Error details

```
TimeoutError: page.waitForURL: Timeout 20000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e6]:
    - generic [ref=e7]:
      - img "Logo" [ref=e9] [cursor=pointer]
      - generic [ref=e10]: Welcome Back
      - generic [ref=e11]: Sign in to your account
    - generic [ref=e13]:
      - textbox "name@example.com" [ref=e18]: admin@afrifundedcapital.com
      - textbox "Password" [ref=e23]: Admin@123456
      - generic [ref=e24]:
        - checkbox "Remember me" [ref=e25] [cursor=pointer]
        - checkbox
        - generic [ref=e26] [cursor=pointer]: Remember me
      - generic [ref=e27]: Too many requests. Please try again later.
      - button "Sign In" [ref=e31] [cursor=pointer]
    - generic [ref=e33]:
      - text: Don't have an account?
      - button "Sign up" [ref=e34] [cursor=pointer]
  - region "Notifications alt+T"
```

# Test source

```ts
  12  |  *
  13  |  * Note: The Freebuff platform's loading screen ("Loading application... Step 4 of 4")
  14  |  * does not resolve in headless Chromium. To run these tests:
  15  |  *   - Use a local dev server: PLAYWRIGHT_BASE_URL=http://localhost:5173
  16  |  *   - Or run with --headed flag to use a visible browser
  17  |  * The warmUp helper retries page loads for platform cold-start resilience.
  18  |  */
  19  | import { test, expect, type Page } from "@playwright/test";
  20  | 
  21  | // ─── Config ───────────────────────────────────────────────
  22  | const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@afrifundedcapital.com";
  23  | const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "Admin@123456";
  24  | const WARMUP_RETRIES = 5;
  25  | const WARMUP_DELAY_MS = 5_000;
  26  | 
  27  | // ─── Helpers ──────────────────────────────────────────────
  28  | 
  29  | /** Wait for the app to be interactive — retries on platform cold-start delays */
  30  | async function waitForAppReady(page: Page) {
  31  |   try {
  32  |     await page.waitForFunction(
  33  |       () => {
  34  |         const body = document.body?.textContent || "";
  35  |         const hasLoading =
  36  |           body.includes("Loading application") ||
  37  |           body.includes("Step 4 of 4") ||
  38  |           body.includes("taking longer than usual");
  39  |         const hasInteractive =
  40  |           document.querySelectorAll('input, button, h1, h2, a[href]').length > 2;
  41  |         return hasInteractive || (!hasLoading && body.length > 200);
  42  |       },
  43  |       { timeout: 15_000 },
  44  |     );
  45  |   } catch {
  46  |     // Platform may be slow — give it more time
  47  |     await page.waitForTimeout(5_000);
  48  |   }
  49  | }
  50  | 
  51  | /**
  52  |  * Navigate to a page with retry logic for platform cold starts.
  53  |  *
  54  |  * Two failure modes are tolerated as "not ready yet":
  55  |  *  1. The navigation itself aborts (`net::ERR_ABORTED`). In Vite dev this
  56  |  *     happens on the first load of a heavy route: dependency discovery
  57  |  *     triggers a full-page reload that cancels the in-flight `page.goto`.
  58  |  *  2. The page is still showing a loading screen.
  59  |  *
  60  |  * A page counts as ready when it is not showing a loading screen AND either
  61  |  * has real interactive elements (inputs/buttons/links) or a sizeable body.
  62  |  * A bare body-length threshold is not enough on its own: compact pages like
  63  |  * the auth form render fully with well under 200 chars of text.
  64  |  */
  65  | async function warmUp(page: Page, path: string): Promise<boolean> {
  66  |   for (let attempt = 0; attempt < WARMUP_RETRIES; attempt++) {
  67  |     try {
  68  |       await page.goto(path, { waitUntil: "domcontentloaded" });
  69  |     } catch {
  70  |       // Vite cold-start full reload aborted the navigation — retry.
  71  |       await page.waitForTimeout(WARMUP_DELAY_MS);
  72  |       continue;
  73  |     }
  74  |     await page.waitForTimeout(2_000);
  75  |     const body = await page.textContent("body").catch(() => "");
  76  |     const interactive = await page
  77  |       .locator("input, button, a[href], select, textarea")
  78  |       .count()
  79  |       .catch(() => 0);
  80  |     const isReady =
  81  |       !!body &&
  82  |       !body.includes("taking longer than usual") &&
  83  |       !body.includes("Loading application") &&
  84  |       (body.length > 200 || interactive > 0);
  85  |     if (isReady) return true;
  86  |     // Server not ready — wait and retry
  87  |     await page.waitForTimeout(WARMUP_DELAY_MS);
  88  |   }
  89  |   return false;
  90  | }
  91  | 
  92  | /** Sign in as admin via the UI auth page */
  93  | async function signInAsAdmin(page: Page) {
  94  |   const ready = await warmUp(page, "/auth");
  95  |   if (!ready) {
  96  |     // One more attempt with a longer wait
  97  |     await page.goto("/auth");
  98  |     await page.waitForTimeout(10_000);
  99  |   }
  100 |   await waitForAppReady(page);
  101 | 
  102 |   const emailInput = page.locator('input[type="email"]').first();
  103 |   await emailInput.waitFor({ state: "visible", timeout: 30_000 });
  104 | 
  105 |   const passwordInput = page.locator('input[type="password"]').first();
  106 |   await emailInput.fill(ADMIN_EMAIL);
  107 |   await passwordInput.fill(ADMIN_PASSWORD);
  108 | 
  109 |   const submitBtn = page.locator('button[type="submit"]').first();
  110 |   await submitBtn.click();
  111 | 
> 112 |   await page.waitForURL((url) => !url.pathname.includes("/auth"), { timeout: 20_000 });
      |              ^ TimeoutError: page.waitForURL: Timeout 20000ms exceeded.
  113 | }
  114 | 
  115 | // ─── Tests ────────────────────────────────────────────────
  116 | 
  117 | test.describe("Admin Dashboard E2E Flow", () => {
  118 |   test.describe.configure({ mode: "serial" });
  119 | 
  120 |   // ─── 1. Authentication ────────────────────────────────
  121 |   test.describe("1. Authentication", () => {
  122 |     test("loads the landing page", async ({ page }) => {
  123 |       const ready = await warmUp(page, "/");
  124 |       expect(ready).toBeTruthy();
  125 |       const text = await page.textContent("body");
  126 |       expect(text?.length).toBeGreaterThan(100);
  127 |     });
  128 | 
  129 |     test("navigates to auth page", async ({ page }) => {
  130 |       const ready = await warmUp(page, "/auth");
  131 |       expect(ready).toBeTruthy();
  132 |       await waitForAppReady(page);
  133 |       await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 30_000 });
  134 |       await expect(page.locator('input[type="password"]').first()).toBeVisible();
  135 |     });
  136 | 
  137 |     test("shows validation error for empty credentials", async ({ page }) => {
  138 |       await warmUp(page, "/auth");
  139 |       await waitForAppReady(page);
  140 |       await page.locator('input[type="email"]').first().waitFor({ state: "visible", timeout: 30_000 });
  141 | 
  142 |       const submitBtn = page.locator('button[type="submit"]').first();
  143 |       await submitBtn.click();
  144 |       await page.waitForTimeout(1_000);
  145 |       expect(page.url()).toContain("/auth");
  146 |     });
  147 | 
  148 |     test("signs in as admin successfully", async ({ page }) => {
  149 |       await signInAsAdmin(page);
  150 |       const url = page.url();
  151 |       const isDashboard = url.includes("/dashboard") || url.includes("/admin");
  152 |       expect(isDashboard).toBeTruthy();
  153 |     });
  154 |   });
  155 | 
  156 |   // ─── 2. Admin Overview ────────────────────────────────
  157 |   test.describe("2. Admin Overview", () => {
  158 |     test.beforeEach(async ({ page }) => {
  159 |       await signInAsAdmin(page);
  160 |     });
  161 | 
  162 |     test("loads the admin overview page", async ({ page }) => {
  163 |       await warmUp(page, "/admin");
  164 |       await waitForAppReady(page);
  165 | 
  166 |       const body = await page.textContent("body");
  167 |       const hasAdminContent =
  168 |         body?.includes("Overview") || body?.includes("Admin") || body?.includes("Total Users");
  169 |       expect(hasAdminContent).toBeTruthy();
  170 |     });
  171 | 
  172 |     test("displays stat cards on overview", async ({ page }) => {
  173 |       await warmUp(page, "/admin");
  174 |       await waitForAppReady(page);
  175 | 
  176 |       const body = await page.textContent("body");
  177 |       const hasStats =
  178 |         body?.includes("Total Users") || body?.includes("Revenue") || body?.includes("Challenges");
  179 |       expect(hasStats).toBeTruthy();
  180 |     });
  181 | 
  182 |     test("shows navigation sidebar", async ({ page }) => {
  183 |       await warmUp(page, "/admin");
  184 |       await waitForAppReady(page);
  185 | 
  186 |       const nav = page.locator("nav, [role='navigation'], aside, .sidebar").first();
  187 |       if (await nav.isVisible()) {
  188 |         const navText = await nav.textContent();
  189 |         expect(navText?.length).toBeGreaterThan(10);
  190 |       }
  191 |     });
  192 |   });
  193 | 
  194 |   // ─── 3. User Management ───────────────────────────────
  195 |   test.describe("3. User Management", () => {
  196 |     test.beforeEach(async ({ page }) => {
  197 |       await signInAsAdmin(page);
  198 |     });
  199 | 
  200 |     test("navigates to user management page", async ({ page }) => {
  201 |       await warmUp(page, "/admin");
  202 |       await waitForAppReady(page);
  203 | 
  204 |       const usersLink = page.locator("a:has-text('Users'), button:has-text('Users')").first();
  205 |       if (await usersLink.isVisible()) {
  206 |         await usersLink.click();
  207 |         await page.waitForTimeout(2_000);
  208 |       }
  209 |       const body = await page.textContent("body");
  210 |       expect(body?.includes("User") || body?.includes("Manage")).toBeTruthy();
  211 |     });
  212 | 
```