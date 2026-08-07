# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> 1. Authentication >> signed-out users are sent to /auth with a returnTo deep link
- Location: e2e/auth.spec.ts:12:3

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/auth\?returnTo=%2Fdashboard%2Ftrading/
Received string:  "http://localhost:5174/dashboard/trading"
Timeout: 15000ms

Call log:
  - Expect "toHaveURL" with timeout 15000ms
    21 × locator resolved to <html lang="en" class="dark">…</html>
       - unexpected value "http://localhost:5174/dashboard/trading"
    - waiting for "http://localhost:5174/dashboard/trading" navigation to finish...
    - navigated to "http://localhost:5174/dashboard/trading"
    2 × locator resolved to <html lang="en">…</html>
      - unexpected value "http://localhost:5174/dashboard/trading"

```

# Page snapshot

```yaml
- generic [ref=f1e2]:
  - generic [ref=f1e6]:
    - generic [ref=f1e7]:
      - img "Logo" [ref=f1e9] [cursor=pointer]
      - generic [ref=f1e10]: Welcome Back
      - generic [ref=f1e11]: Sign in to your account
    - generic [ref=f1e13]:
      - textbox "name@example.com" [ref=f1e18]
      - textbox "Password" [ref=f1e23]
      - generic [ref=f1e24]:
        - checkbox "Remember me" [ref=f1e25] [cursor=pointer]
        - checkbox
        - generic [ref=f1e26] [cursor=pointer]: Remember me
      - button "Sign In" [ref=f1e27] [cursor=pointer]
    - generic [ref=f1e29]:
      - text: Don't have an account?
      - button "Sign up" [ref=f1e30] [cursor=pointer]
  - region "Notifications alt+T"
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import { ADMIN_EMAIL, ADMIN_PASSWORD, ensureSeeded } from "./helpers";
  3  | 
  4  | // ═══════════════════════════════════════════════════════════════
  5  | // 1. Authentication — sign-up, sign-in, session persistence, sign-out
  6  | // ═══════════════════════════════════════════════════════════════
  7  | test.describe("1. Authentication", () => {
  8  |   test.beforeAll(async ({ request }) => {
  9  |     await ensureSeeded(request);
  10 |   });
  11 | 
  12 |   test("signed-out users are sent to /auth with a returnTo deep link", async ({ page }) => {
  13 |     await page.goto("/dashboard/trading");
  14 |     // The returnTo query value is percent-encoded by the router.
> 15 |     await expect(page).toHaveURL(/\/auth\?returnTo=%2Fdashboard%2Ftrading/);
     |                        ^ Error: expect(page).toHaveURL(expected) failed
  16 |     await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
  17 |   });
  18 | 
  19 |   test("sign-up creates an account and lands on the dashboard", async ({ page }) => {
  20 |     const email = `e2e-${Date.now()}@afrifundedcapital.com`;
  21 |     await page.goto("/auth");
  22 |     await page.getByText("Sign up", { exact: true }).click();
  23 |     await page.getByPlaceholder("Full name").fill("E2E Trader");
  24 |     await page.getByPlaceholder("name@example.com").fill(email);
  25 |     await page.getByPlaceholder("Password (min 6 characters)").fill("E2ePass!234");
  26 |     await page.getByRole("button", { name: "Create Account" }).click();
  27 | 
  28 |     // Fresh accounts are redirected to onboarding; either way they land in the
  29 |     // authenticated dashboard area.
  30 |     await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  31 | 
  32 |     // The session cookie persists across reloads.
  33 |     await page.reload();
  34 |     await expect(page).toHaveURL(/\/dashboard/);
  35 |   });
  36 | 
  37 |   test("wrong password is rejected with a visible error", async ({ page }) => {
  38 |     await page.goto("/auth");
  39 |     await page.getByPlaceholder("name@example.com").fill(ADMIN_EMAIL);
  40 |     await page.getByPlaceholder("Password", { exact: true }).fill("DefinitelyWrong!1");
  41 |     await page.getByRole("button", { name: "Sign In" }).click();
  42 |     await expect(page.getByText(/invalid email or password/i)).toBeVisible({ timeout: 15_000 });
  43 |   });
  44 | 
  45 |   test("admin signs in through the UI and signs out again", async ({ page }) => {
  46 |     await page.goto("/auth");
  47 |     await page.getByPlaceholder("name@example.com").fill(ADMIN_EMAIL);
  48 |     await page.getByPlaceholder("Password", { exact: true }).fill(ADMIN_PASSWORD);
  49 |     await page.getByRole("button", { name: "Sign In" }).click();
  50 |     await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  51 | 
  52 |     await page.getByText("Sign Out", { exact: true }).click();
  53 |     // Signed out users can no longer see the protected dashboard.
  54 |     await expect(page).toHaveURL(/\/auth|\/$/, { timeout: 20_000 });
  55 |   });
  56 | });
  57 | 
```