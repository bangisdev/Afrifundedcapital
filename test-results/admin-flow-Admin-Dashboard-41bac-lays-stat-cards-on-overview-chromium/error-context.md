# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-flow.spec.ts >> Admin Dashboard E2E Flow >> 2. Admin Overview >> displays stat cards on overview
- Location: e2e/admin-flow.spec.ts:172:5

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: page.waitForTimeout: Target page, context or browser has been closed
```

# Page snapshot

```yaml
- generic [ref=f1e2]:
  - generic [ref=f1e3]:
    - complementary [ref=f1e4]:
      - generic [ref=f1e5]:
        - generic [ref=f1e6]: AfriFundedCapital
        - button [ref=f1e7] [cursor=pointer]
      - navigation [ref=f1e8]:
        - button "Overview" [ref=f1e9] [cursor=pointer]
        - button "Challenges" [ref=f1e16] [cursor=pointer]
        - button "Trading" [ref=f1e20] [cursor=pointer]
        - button "Wallet" [ref=f1e25] [cursor=pointer]
        - button "Payouts" [ref=f1e30] [cursor=pointer]
        - button "Notifications" [ref=f1e34] [cursor=pointer]
        - button "Affiliate" [ref=f1e39] [cursor=pointer]
        - button "Certificates" [ref=f1e46] [cursor=pointer]
        - button "Support" [ref=f1e51] [cursor=pointer]
        - button "Profile" [ref=f1e55] [cursor=pointer]
      - generic [ref=f1e61]:
        - button "Admin" [ref=f1e62] [cursor=pointer]
        - button "Sign Out" [ref=f1e67] [cursor=pointer]
    - generic [ref=f1e72]:
      - banner [ref=f1e73]:
        - button "Dashboard" [ref=f1e75] [cursor=pointer]
        - generic [ref=f1e76]:
          - button "3" [ref=f1e78] [cursor=pointer]
          - button "Toggle theme" [ref=f1e80] [cursor=pointer]
          - generic [ref=f1e82]: Super Admin
      - main [ref=f1e83]:
        - generic [ref=f1e84]:
          - generic [ref=f1e86]:
            - generic [ref=f1e91]:
              - paragraph [ref=f1e92]: Finish setting up your profile
              - paragraph [ref=f1e93]: Add your trading experience and contact details to get personalized challenge recommendations.
              - generic [ref=f1e94]:
                - button "Complete Setup" [ref=f1e95] [cursor=pointer]
                - button "Dismiss" [ref=f1e96] [cursor=pointer]
            - button [ref=f1e97] [cursor=pointer]
          - generic [ref=f1e101]:
            - generic [ref=f1e102]:
              - heading "Overview" [level=1] [ref=f1e103]
              - paragraph [ref=f1e104]: Welcome to your AfriFundedCapital dashboard
            - button "New Challenge" [ref=f1e105] [cursor=pointer]
          - generic [ref=f1e106]:
            - button "Active Challenges 2" [ref=f1e107] [cursor=pointer]:
              - generic [ref=f1e108]: Active Challenges
              - generic [ref=f1e113]: "2"
            - button "Funded Accounts 3" [ref=f1e114] [cursor=pointer]:
              - generic [ref=f1e115]: Funded Accounts
              - generic [ref=f1e121]: "3"
            - button "Wallet Balance 0 NGN" [ref=f1e122] [cursor=pointer]:
              - generic [ref=f1e123]: Wallet Balance
              - generic [ref=f1e129]: 0 NGN
            - button "Total Challenges 5" [ref=f1e130] [cursor=pointer]:
              - generic [ref=f1e131]: Total Challenges
              - generic [ref=f1e137]: "5"
          - generic [ref=f1e138]:
            - heading "Your Challenges" [level=2] [ref=f1e139]
            - generic [ref=f1e140]:
              - 'button "Challenge #3 $5,000 — active" [ref=f1e141] [cursor=pointer]':
                - generic [ref=f1e142]:
                  - generic [ref=f1e143]: "Challenge #3"
                  - generic [ref=f1e144]: $5,000 — active
              - 'button "Challenge #2 $5,000 — active" [ref=f1e147] [cursor=pointer]':
                - generic [ref=f1e148]:
                  - generic [ref=f1e149]: "Challenge #2"
                  - generic [ref=f1e150]: $5,000 — active
              - 'button "Challenge #6 $10,000 — funded" [ref=f1e153] [cursor=pointer]':
                - generic [ref=f1e154]:
                  - generic [ref=f1e155]: "Challenge #6"
                  - generic [ref=f1e156]: $10,000 — funded
              - 'button "Challenge #7 $25,000 — funded" [ref=f1e159] [cursor=pointer]':
                - generic [ref=f1e160]:
                  - generic [ref=f1e161]: "Challenge #7"
                  - generic [ref=f1e162]: $25,000 — funded
              - 'button "Challenge #8 $50,000 — funded" [ref=f1e165] [cursor=pointer]':
                - generic [ref=f1e166]:
                  - generic [ref=f1e167]: "Challenge #8"
                  - generic [ref=f1e168]: $50,000 — funded
  - region "Notifications alt+T"
```

# Test source

```ts
  1   | /**
  2   |  * AfriFundedCapital — Admin Flow E2E suite.
  3   |  *
  4   |  * Drives the real UI in Chromium: landing → auth → admin overview → user
  5   |  * management → challenges → payments → cross-page navigation → responsive
  6   |  * viewports.
  7   |  *
  8   |  * How it runs:
  9   |  *   - `playwright.config.ts` auto-boots `bun run dev` (with `E2E_TESTING=1`,
  10  |  *     which disables the auth rate limiter / account lockout for the run) and
  11  |  *     reuses an already-listening server on the port when one exists.
  12  |  *   - `e2e/global-setup.ts` seeds the super admin + demo data once per run.
  13  |  *   - The suite signs in through the real `/auth` page so it exercises the
  14  |  *     app's actual password auth flow.
  15  |  *
  16  |  * Run locally:            bun test:e2e
  17  |  * Point at a server:      PLAYWRIGHT_BASE_URL=http://localhost:5173 bun test:e2e
  18  |  * Single section:         bun test:e2e -- --grep "3. User Management"
  19  |  */
  20  | import { test, expect, type Page } from "@playwright/test";
  21  | 
  22  | // ─── Config ───────────────────────────────────────────────
  23  | const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@afrifundedcapital.com";
  24  | const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "Admin@123456";
  25  | const WARMUP_RETRIES = 5;
  26  | const WARMUP_DELAY_MS = 5_000;
  27  | 
  28  | // ─── Helpers ──────────────────────────────────────────────
  29  | 
  30  | /** Wait for the app to be interactive — retries on slow cold starts. */
  31  | async function waitForAppReady(page: Page) {
  32  |   try {
  33  |     await page.waitForFunction(
  34  |       () => {
  35  |         const body = document.body?.textContent || "";
  36  |         const hasLoading =
  37  |           body.includes("Loading application") ||
  38  |           body.includes("Step 4 of 4") ||
  39  |           body.includes("taking longer than usual");
  40  |         const hasInteractive =
  41  |           document.querySelectorAll("input, button, h1, h2, a[href]").length > 2;
  42  |         return hasInteractive || (!hasLoading && body.length > 200);
  43  |       },
  44  |       { timeout: 15_000 },
  45  |     );
  46  |   } catch {
  47  |     // The app may still be starting up — give it more time.
  48  |     await page.waitForTimeout(5_000);
  49  |   }
  50  | }
  51  | 
  52  | /**
  53  |  * Navigate to a page with retry logic for cold starts.
  54  |  *
  55  |  * Two failure modes are tolerated as "not ready yet":
  56  |  *  1. The navigation itself aborts (`net::ERR_ABORTED`) — Vite dependency
  57  |  *     discovery can trigger a full-page reload that cancels an in-flight
  58  |  *     `page.goto`.
  59  |  *  2. The page is still showing a loading screen.
  60  |  *
  61  |  * A page counts as ready when it is not showing a loading screen AND either
  62  |  * has real interactive elements (inputs/buttons/links) or a sizeable body.
  63  |  */
  64  | async function warmUp(page: Page, path: string): Promise<boolean> {
  65  |   for (let attempt = 0; attempt < WARMUP_RETRIES; attempt++) {
  66  |     try {
  67  |       await page.goto(path, { waitUntil: "domcontentloaded" });
  68  |     } catch {
  69  |       // Cold-start full reload aborted the navigation — retry.
> 70  |       await page.waitForTimeout(WARMUP_DELAY_MS);
      |                  ^ Error: page.waitForTimeout: Target page, context or browser has been closed
  71  |       continue;
  72  |     }
  73  |     await page.waitForTimeout(2_000);
  74  |     const body = await page.textContent("body").catch(() => "");
  75  |     const interactive = await page
  76  |       .locator("input, button, a[href], select, textarea")
  77  |       .count()
  78  |       .catch(() => 0);
  79  |     const isReady =
  80  |       !!body &&
  81  |       !body.includes("taking longer than usual") &&
  82  |       !body.includes("Loading application") &&
  83  |       (body.length > 200 || interactive > 0);
  84  |     if (isReady) return true;
  85  |     await page.waitForTimeout(WARMUP_DELAY_MS);
  86  |   }
  87  |   return false;
  88  | }
  89  | 
  90  | /** Sign in as admin through the real /auth page. */
  91  | async function signInAsAdmin(page: Page) {
  92  |   const ready = await warmUp(page, "/auth");
  93  |   if (!ready) {
  94  |     await page.goto("/auth");
  95  |     await page.waitForTimeout(10_000);
  96  |   }
  97  |   await waitForAppReady(page);
  98  | 
  99  |   const emailInput = page.locator('input[type="email"]').first();
  100 |   await emailInput.waitFor({ state: "visible", timeout: 30_000 });
  101 | 
  102 |   const passwordInput = page.locator('input[type="password"]').first();
  103 |   await emailInput.fill(ADMIN_EMAIL);
  104 |   await passwordInput.fill(ADMIN_PASSWORD);
  105 | 
  106 |   const submitBtn = page.locator('button[type="submit"]').first();
  107 |   await submitBtn.click();
  108 | 
  109 |   // On success the app navigates away from /auth. Poll instead of a single
  110 |   // wait so a slow navigation can't flake, and the failure shows the URL.
  111 |   await expect
  112 |     .poll(() => page.url(), { timeout: 25_000 })
  113 |     .not.toContain("/auth");
  114 | }
  115 | 
  116 | // ─── Suite ────────────────────────────────────────────────
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
  142 |       // Both fields are `required`, so the browser blocks the submit
  143 |       // client-side and no sign-in request leaves the page.
  144 |       const submitBtn = page.locator('button[type="submit"]').first();
  145 |       await submitBtn.click();
  146 |       await page.waitForTimeout(1_000);
  147 |       expect(page.url()).toContain("/auth");
  148 |     });
  149 | 
  150 |     test("signs in as admin successfully", async ({ page }) => {
  151 |       await signInAsAdmin(page);
  152 |       const url = page.url();
  153 |       const isDashboard = url.includes("/dashboard") || url.includes("/admin");
  154 |       expect(isDashboard).toBeTruthy();
  155 |     });
  156 |   });
  157 | 
  158 |   // ─── 2. Admin Overview ────────────────────────────────
  159 |   test.describe("2. Admin Overview", () => {
  160 |     test.beforeEach(async ({ page }) => {
  161 |       await signInAsAdmin(page);
  162 |     });
  163 | 
  164 |     test("loads the admin overview page", async ({ page }) => {
  165 |       await warmUp(page, "/admin");
  166 |       await waitForAppReady(page);
  167 |       await expect(page.locator("body")).toContainText(/Admin Overview|Total Users|Revenue/, {
  168 |         timeout: 20_000,
  169 |       });
  170 |     });
```