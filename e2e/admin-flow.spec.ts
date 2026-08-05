/**
 * AfriFundedCapital — Admin Flow E2E suite.
 *
 * Drives the real UI in Chromium: landing → auth → admin overview → user
 * management → challenges → payments → cross-page navigation → responsive
 * viewports.
 *
 * How it runs:
 *   - `playwright.config.ts` auto-boots `bun run dev` (with `E2E_TESTING=1`,
 *     which disables the auth rate limiter / account lockout for the run) and
 *     reuses an already-listening server on the port when one exists.
 *   - `e2e/global-setup.ts` seeds the super admin + demo data once per run.
 *   - The suite signs in through the real `/auth` page so it exercises the
 *     app's actual password auth flow.
 *
 * Run locally:            bun test:e2e
 * Point at a server:      PLAYWRIGHT_BASE_URL=http://localhost:5173 bun test:e2e
 * Single section:         bun test:e2e -- --grep "3. User Management"
 */
import { test, expect, type Page } from "@playwright/test";

// ─── Config ───────────────────────────────────────────────
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@afrifundedcapital.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "Admin@123456";
const WARMUP_RETRIES = 5;
const WARMUP_DELAY_MS = 5_000;
// Hard ceiling for a single warmUp call so a bad server state fails the test
// fast instead of spinning until the test-level timeout.
const WARMUP_MAX_MS = 40_000;

// ─── Helpers ──────────────────────────────────────────────

/** Wait for the app to be interactive — retries on slow cold starts. */
async function waitForAppReady(page: Page) {
  try {
    await page.waitForFunction(
      () => {
        const body = document.body?.textContent || "";
        const hasLoading =
          body.includes("Loading application") ||
          body.includes("Step 4 of 4") ||
          body.includes("taking longer than usual");
        const hasInteractive =
          document.querySelectorAll("input, button, h1, h2, a[href]").length > 2;
        return hasInteractive || (!hasLoading && body.length > 200);
      },
      { timeout: 15_000 },
    );
  } catch {
    // The app may still be starting up — give it more time.
    await page.waitForTimeout(5_000);
  }
}

/**
 * Navigate to a page with retry logic for cold starts.
 *
 * Two failure modes are tolerated as "not ready yet":
 *  1. The navigation itself aborts (`net::ERR_ABORTED`) — Vite dependency
 *     discovery can trigger a full-page reload that cancels an in-flight
 *     `page.goto`.
 *  2. The page is still showing a loading screen.
 *
 * A page counts as ready when it is not showing a loading screen AND either
 * has real interactive elements (inputs/buttons/links) or a sizeable body.
 */
async function warmUp(page: Page, path: string): Promise<boolean> {
  const deadline = Date.now() + WARMUP_MAX_MS;
  for (let attempt = 0; attempt < WARMUP_RETRIES && Date.now() < deadline; attempt++) {
    if (page.isClosed()) return false;
    try {
      await page.goto(path, { waitUntil: "domcontentloaded", timeout: 15_000 });
    } catch {
      // Cold-start full reload aborted the navigation — retry.
      if (page.isClosed()) return false;
      await page.waitForTimeout(WARMUP_DELAY_MS);
      continue;
    }
    if (page.isClosed()) return false;
    await page.waitForTimeout(2_000);
    if (page.isClosed()) return false;
    const body = await page.textContent("body").catch(() => "");
    const interactive = await page
      .locator("input, button, a[href], select, textarea")
      .count()
      .catch(() => 0);
    const isReady =
      !!body &&
      !body.includes("taking longer than usual") &&
      !body.includes("Loading application") &&
      (body.length > 200 || interactive > 0);
    if (isReady) return true;
    await page.waitForTimeout(WARMUP_DELAY_MS);
  }
  return false;
}

/** Sign in as admin through the real /auth page. */
async function signInAsAdmin(page: Page) {
  const ready = await warmUp(page, "/auth");
  if (!ready) {
    await page.goto("/auth");
    await page.waitForTimeout(10_000);
  }
  await waitForAppReady(page);

  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 30_000 });

  const passwordInput = page.locator('input[type="password"]').first();
  await emailInput.fill(ADMIN_EMAIL);
  await passwordInput.fill(ADMIN_PASSWORD);

  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.click();

  // On success the app navigates away from /auth. Poll instead of a single
  // wait so a slow navigation can't flake, and the failure shows the URL.
  await expect
    .poll(() => page.url(), { timeout: 25_000 })
    .not.toContain("/auth");
}

// ─── Suite ────────────────────────────────────────────────
test.describe("Admin Dashboard E2E Flow", () => {
  test.describe.configure({ mode: "serial" });

  // ─── 1. Authentication ────────────────────────────────
  test.describe("1. Authentication", () => {
    test("loads the landing page", async ({ page }) => {
      const ready = await warmUp(page, "/");
      expect(ready).toBeTruthy();
      const text = await page.textContent("body");
      expect(text?.length).toBeGreaterThan(100);
    });

    test("navigates to auth page", async ({ page }) => {
      const ready = await warmUp(page, "/auth");
      expect(ready).toBeTruthy();
      await waitForAppReady(page);
      await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('input[type="password"]').first()).toBeVisible();
    });

    test("shows validation error for empty credentials", async ({ page }) => {
      await warmUp(page, "/auth");
      await waitForAppReady(page);
      await page.locator('input[type="email"]').first().waitFor({ state: "visible", timeout: 30_000 });

      // Both fields are `required`, so the browser blocks the submit
      // client-side and no sign-in request leaves the page.
      const submitBtn = page.locator('button[type="submit"]').first();
      await submitBtn.click();
      await page.waitForTimeout(1_000);
      expect(page.url()).toContain("/auth");
    });

    test("signs in as admin successfully", async ({ page }) => {
      await signInAsAdmin(page);
      const url = page.url();
      const isDashboard = url.includes("/dashboard") || url.includes("/admin");
      expect(isDashboard).toBeTruthy();
    });
  });

  // ─── 2. Admin Overview ────────────────────────────────
  test.describe("2. Admin Overview", () => {
    test.beforeEach(async ({ page }) => {
      await signInAsAdmin(page);
    });

    test("loads the admin overview page", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);
      await expect(page.locator("body")).toContainText(/Admin Overview|Total Users|Revenue/, {
        timeout: 20_000,
      });
    });

    test("displays stat cards on overview", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);
      await expect(page.locator("body")).toContainText(/Total Users|Revenue|Challenges/, {
        timeout: 20_000,
      });
    });

    test("shows navigation sidebar", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);
      const nav = page.locator("aside nav").first();
      await expect(nav).toBeVisible({ timeout: 15_000 });
      const navText = await nav.textContent();
      expect(navText?.length).toBeGreaterThan(10);
    });
  });

  // ─── 3. User Management ───────────────────────────────
  test.describe("3. User Management", () => {
    test.beforeEach(async ({ page }) => {
      await signInAsAdmin(page);
    });

    test("navigates to user management page", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);
      const usersNav = page.locator("aside nav button", { hasText: "Users" }).first();
      await usersNav.click();
      await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("/admin/users");
      // The page shows a spinner until its data query resolves, so wait for
      // the heading instead of reading the body once.
      await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible({
        timeout: 20_000,
      });
    });

    test("displays user search input", async ({ page }) => {
      await warmUp(page, "/admin/users");
      await waitForAppReady(page);
      const search = page.locator('input[placeholder*="Search"]').first();
      await expect(search).toBeVisible({ timeout: 20_000 });
    });

    test("shows user rows or an empty state", async ({ page }) => {
      await warmUp(page, "/admin/users");
      await waitForAppReady(page);
      // Seeded demo users have emails in their rows; an empty table shows the
      // "No users found" placeholder instead. Auto-retries past the spinner.
      await expect(page.locator("body")).toContainText(/@|No users found/, { timeout: 20_000 });
    });
  });

  // ─── 4. Challenges ────────────────────────────────────
  test.describe("4. Challenges", () => {
    test.beforeEach(async ({ page }) => {
      await signInAsAdmin(page);
    });

    test("loads the challenges management page", async ({ page }) => {
      await warmUp(page, "/admin/challenges");
      await waitForAppReady(page);
      await expect(page.getByRole("heading", { name: "Challenge Management" })).toBeVisible({
        timeout: 20_000,
      });
    });

    test("lists challenge templates", async ({ page }) => {
      await warmUp(page, "/admin/challenges");
      await waitForAppReady(page);
      await expect(page.locator("body")).toContainText(
        /Two-Step|One-Step|Instant Funding|No challenges/,
        { timeout: 20_000 },
      );
    });
  });

  // ─── 5. Payments ──────────────────────────────────────
  test.describe("5. Payments", () => {
    test.beforeEach(async ({ page }) => {
      await signInAsAdmin(page);
    });

    test("loads the payments page", async ({ page }) => {
      await warmUp(page, "/admin/payments");
      await waitForAppReady(page);
      await expect(page.getByRole("heading", { name: /Payments/i })).toBeVisible({
        timeout: 20_000,
      });
    });

    test("shows payments search input", async ({ page }) => {
      await warmUp(page, "/admin/payments");
      await waitForAppReady(page);
      const search = page.locator('input[placeholder*="Search"]').first();
      await expect(search).toBeVisible({ timeout: 20_000 });
    });
  });

  // ─── 6. Cross-page navigation ─────────────────────────
  test.describe("6. Cross-page navigation", () => {
    test.beforeEach(async ({ page }) => {
      await signInAsAdmin(page);
    });

    test("navigates between admin sections via the sidebar", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);
      const nav = page.locator("aside nav");

      await nav.locator("button", { hasText: "Users" }).first().click();
      await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("/admin/users");

      await nav.locator("button", { hasText: "Payments" }).first().click();
      await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("/admin/payments");

      await nav.locator("button", { hasText: "KYC" }).first().click();
      await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("/admin/kyc");

      await nav.locator("button", { hasText: "Dashboard" }).first().click();
      await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("/admin");
      await expect(page.locator("body")).toContainText(/Admin Overview|Total Users/, {
        timeout: 20_000,
      });
    });
  });

  // ─── 7. Responsive viewports ──────────────────────────
  test.describe("7. Responsive viewports", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("renders landing page on a mobile viewport", async ({ page }) => {
      const ready = await warmUp(page, "/");
      expect(ready).toBeTruthy();
      const text = await page.textContent("body");
      expect(text?.length).toBeGreaterThan(100);
    });

    test("renders auth page on a mobile viewport", async ({ page }) => {
      await warmUp(page, "/auth");
      await waitForAppReady(page);
      await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('button[type="submit"]').first()).toBeVisible();
    });
  });
});
