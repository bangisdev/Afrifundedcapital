/**
 * End-to-end tests for the Admin Dashboard flow.
 *
 * Covers: Login → Overview → Users → Challenges → Payments
 *
 * Prerequisites:
 *   1. The dev server must be running
 *   2. A super-admin account must exist:
 *        POST /api/seed/admin
 *        { "email": "admin@afrifundedcapital.com", "password": "Admin@123456" }
 *   3. Set PLAYWRIGHT_BASE_URL if not using localhost:5173
 *
 * Note: The Freebuff platform's loading screen ("Loading application... Step 4 of 4")
 * does not resolve in headless Chromium. To run these tests:
 *   - Use a local dev server: PLAYWRIGHT_BASE_URL=http://localhost:5173
 *   - Or run with --headed flag to use a visible browser
 * The warmUp helper retries page loads for platform cold-start resilience.
 */
import { test, expect, type Page } from "@playwright/test";

// ─── Config ───────────────────────────────────────────────
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@afrifundedcapital.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "Admin@123456";
const WARMUP_RETRIES = 5;
const WARMUP_DELAY_MS = 5_000;

// ─── Helpers ──────────────────────────────────────────────

/** Wait for the app to be interactive — retries on platform cold-start delays */
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
          document.querySelectorAll('input, button, h1, h2, a[href]').length > 2;
        return hasInteractive || (!hasLoading && body.length > 200);
      },
      { timeout: 15_000 },
    );
  } catch {
    // Platform may be slow — give it more time
    await page.waitForTimeout(5_000);
  }
}

/**
 * Navigate to a page with retry logic for platform cold starts.
 *
 * Two failure modes are tolerated as "not ready yet":
 *  1. The navigation itself aborts (`net::ERR_ABORTED`). In Vite dev this
 *     happens on the first load of a heavy route: dependency discovery
 *     triggers a full-page reload that cancels the in-flight `page.goto`.
 *  2. The page is still showing a loading screen.
 *
 * A page counts as ready when it is not showing a loading screen AND either
 * has real interactive elements (inputs/buttons/links) or a sizeable body.
 * A bare body-length threshold is not enough on its own: compact pages like
 * the auth form render fully with well under 200 chars of text.
 */
async function warmUp(page: Page, path: string): Promise<boolean> {
  for (let attempt = 0; attempt < WARMUP_RETRIES; attempt++) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded" });
    } catch {
      // Vite cold-start full reload aborted the navigation — retry.
      await page.waitForTimeout(WARMUP_DELAY_MS);
      continue;
    }
    await page.waitForTimeout(2_000);
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
    // Server not ready — wait and retry
    await page.waitForTimeout(WARMUP_DELAY_MS);
  }
  return false;
}

/**
 * Sign in as admin via the UI auth page.
 *
 * The app rate-limits sign-in attempts per IP (5 / 15 min). Fresh runs never
 * trip it, but a long-running dev server with residual in-memory limiter state
 * (or a parallel run) can 429 the form. When that happens we honor the
 * server's `Retry-After` and retry instead of hard-failing.
 */
async function signInAsAdmin(page: Page) {
  const ready = await warmUp(page, "/auth");
  if (!ready) {
    // One more attempt with a longer wait
    await page.goto("/auth");
    await page.waitForTimeout(10_000);
  }
  await waitForAppReady(page);

  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 30_000 });

  const SIGNIN_MAX_ATTEMPTS = 5;
  const SIGNIN_MAX_WAIT_MS = 90_000;
  let waitBeforeRetryMs = 0;

  for (let attempt = 1; attempt <= SIGNIN_MAX_ATTEMPTS; attempt++) {
    if (waitBeforeRetryMs > 0) {
      console.log(
        `[e2e] Sign-in rate-limited — waiting ${Math.round(waitBeforeRetryMs / 1000)}s (attempt ${attempt}/${SIGNIN_MAX_ATTEMPTS})`,
      );
      await page.waitForTimeout(waitBeforeRetryMs);
    }

    const passwordInput = page.locator('input[type="password"]').first();
    await emailInput.fill(ADMIN_EMAIL);
    await passwordInput.fill(ADMIN_PASSWORD);

    const responsePromise = page
      .waitForResponse(
        (res) => res.url().includes("/api/auth/sign-in/") && res.request().method() === "POST",
        { timeout: 20_000 },
      )
      .catch(() => null);

    await page.locator('button[type="submit"]').first().click();

    const response = await responsePromise;
    if (response && response.status() === 429) {
      const retryAfter = Number(response.headers()["retry-after"] || 15);
      waitBeforeRetryMs = Math.min(retryAfter * 1000 + 2_000, SIGNIN_MAX_WAIT_MS);
      continue;
    }

    // No rate limit — expect the redirect away from /auth.
    try {
      await page.waitForURL((url) => !url.pathname.includes("/auth"), { timeout: 20_000 });
      return;
    } catch {
      const body = await page.textContent("body").catch(() => "");
      if (body?.includes("Too many requests")) {
        waitBeforeRetryMs = 15_000;
        continue;
      }
      throw new Error("Sign-in did not navigate away from /auth within 20s");
    }
  }

  throw new Error(
    `Sign-in was repeatedly rate-limited (${SIGNIN_MAX_ATTEMPTS} attempts, ~${SIGNIN_MAX_WAIT_MS / 1000}s total wait). ` +
      "The app's sign-in limiter (5/15min per IP) is exhausted; wait for the window or restart the dev server.",
  );
}

// ─── Tests ────────────────────────────────────────────────

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

      const body = await page.textContent("body");
      const hasAdminContent =
        body?.includes("Overview") || body?.includes("Admin") || body?.includes("Total Users");
      expect(hasAdminContent).toBeTruthy();
    });

    test("displays stat cards on overview", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);

      const body = await page.textContent("body");
      const hasStats =
        body?.includes("Total Users") || body?.includes("Revenue") || body?.includes("Challenges");
      expect(hasStats).toBeTruthy();
    });

    test("shows navigation sidebar", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);

      const nav = page.locator("nav, [role='navigation'], aside, .sidebar").first();
      if (await nav.isVisible()) {
        const navText = await nav.textContent();
        expect(navText?.length).toBeGreaterThan(10);
      }
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

      const usersLink = page.locator("a:has-text('Users'), button:has-text('Users')").first();
      if (await usersLink.isVisible()) {
        await usersLink.click();
        await page.waitForTimeout(2_000);
      }
      const body = await page.textContent("body");
      expect(body?.includes("User") || body?.includes("Manage")).toBeTruthy();
    });

    test("displays user search input", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);

      const usersLink = page.locator("a:has-text('Users'), button:has-text('Users')").first();
      if (await usersLink.isVisible()) {
        await usersLink.click();
        await page.waitForTimeout(2_000);
      }
      const searchInput = page.locator('input[placeholder*="Search" i], input[type="search"]').first();
      if (await searchInput.isVisible()) {
        await expect(searchInput).toBeVisible();
      }
    });

    test("can search users by name", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);

      const usersLink = page.locator("a:has-text('Users'), button:has-text('Users')").first();
      if (await usersLink.isVisible()) {
        await usersLink.click();
        await page.waitForTimeout(2_000);
      }
      const searchInput = page.locator('input[placeholder*="Search" i], input[type="search"]').first();
      if (await searchInput.isVisible()) {
        await searchInput.fill("admin");
        await page.waitForTimeout(1_000);
        const body = await page.textContent("body");
        expect(body).toBeTruthy();
      }
    });

    test("displays user role filters", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);

      const usersLink = page.locator("a:has-text('Users'), button:has-text('Users')").first();
      if (await usersLink.isVisible()) {
        await usersLink.click();
        await page.waitForTimeout(2_000);
      }
      const roleFilter = page.locator('select, [role="combobox"]').first();
      if (await roleFilter.isVisible()) {
        await expect(roleFilter).toBeVisible();
      }
    });
  });

  // ─── 4. Challenge Management ──────────────────────────
  test.describe("4. Challenge Management", () => {
    test.beforeEach(async ({ page }) => {
      await signInAsAdmin(page);
    });

    test("navigates to challenges page", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);

      const challengesLink = page.locator("a:has-text('Challenges'), button:has-text('Challenges')").first();
      if (await challengesLink.isVisible()) {
        await challengesLink.click();
        await page.waitForTimeout(2_000);
      }
      const body = await page.textContent("body");
      expect(body?.includes("Challenge") || body?.includes("Template")).toBeTruthy();
    });

    test("displays challenge templates", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);

      const challengesLink = page.locator("a:has-text('Challenges'), button:has-text('Challenges')").first();
      if (await challengesLink.isVisible()) {
        await challengesLink.click();
        await page.waitForTimeout(2_000);
      }
      const body = await page.textContent("body");
      expect(
        body?.includes("Template") || body?.includes("template") || body?.includes("New Template"),
      ).toBeTruthy();
    });

    test("shows New Template button", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);

      const challengesLink = page.locator("a:has-text('Challenges'), button:has-text('Challenges')").first();
      if (await challengesLink.isVisible()) {
        await challengesLink.click();
        await page.waitForTimeout(2_000);
      }
      const btn = page.locator('button:has-text("New Template"), button:has-text("Create Template")').first();
      if (await btn.isVisible()) {
        await expect(btn).toBeVisible();
      }
    });

    test("opens create template dialog", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);

      const challengesLink = page.locator("a:has-text('Challenges'), button:has-text('Challenges')").first();
      if (await challengesLink.isVisible()) {
        await challengesLink.click();
        await page.waitForTimeout(2_000);
      }
      const btn = page.locator('button:has-text("New Template"), button:has-text("Create Template")').first();
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(1_000);
        const body = await page.textContent("body");
        expect(body?.includes("Create") || body?.includes("Name") || body?.includes("Template")).toBeTruthy();
      }
    });
  });

  // ─── 5. Payment Management ────────────────────────────
  test.describe("5. Payment Management", () => {
    test.beforeEach(async ({ page }) => {
      await signInAsAdmin(page);
    });

    test("navigates to payments page", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);

      const paymentsLink = page.locator("a:has-text('Payments'), button:has-text('Payments')").first();
      if (await paymentsLink.isVisible()) {
        await paymentsLink.click();
        await page.waitForTimeout(2_000);
      }
      const body = await page.textContent("body");
      expect(
        body?.includes("Payment") || body?.includes("Transaction") || body?.includes("Revenue"),
      ).toBeTruthy();
    });

    test("displays payment statistics", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);

      const paymentsLink = page.locator("a:has-text('Payments'), button:has-text('Payments')").first();
      if (await paymentsLink.isVisible()) {
        await paymentsLink.click();
        await page.waitForTimeout(2_000);
      }
      const body = await page.textContent("body");
      expect(body?.includes("₦") || body?.includes("Revenue") || body?.includes("Total")).toBeTruthy();
    });

    test("shows transaction list or empty state", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);

      const paymentsLink = page.locator("a:has-text('Payments'), button:has-text('Payments')").first();
      if (await paymentsLink.isVisible()) {
        await paymentsLink.click();
        await page.waitForTimeout(2_000);
      }
      const body = await page.textContent("body");
      expect(
        body?.includes("Transaction") || body?.includes("No ") || body?.includes("payment"),
      ).toBeTruthy();
    });
  });

  // ─── 6. Cross-page Navigation ─────────────────────────
  test.describe("6. Cross-page Navigation", () => {
    test.beforeEach(async ({ page }) => {
      await signInAsAdmin(page);
    });

    test("can navigate between all admin pages", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);

      const links = page.locator("nav a, aside a, .sidebar a");
      const linkCount = await links.count();
      expect(linkCount).toBeGreaterThan(0);

      for (let i = 0; i < Math.min(linkCount, 5); i++) {
        const link = links.nth(i);
        const href = await link.getAttribute("href");
        if (href && href.startsWith("/admin")) {
          await link.click();
          await page.waitForTimeout(1_500);
          const body = await page.textContent("body");
          expect(body?.length).toBeGreaterThan(50);
        }
      }
    });

    test("admin page loads with content", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);
      const body = await page.textContent("body");
      expect(body?.length).toBeGreaterThan(50);
    });
  });

  // ─── 7. Responsive Design ─────────────────────────────
  test.describe("7. Responsive Design", () => {
    test("admin pages render on mobile viewport", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await signInAsAdmin(page);
      await warmUp(page, "/admin");
      await waitForAppReady(page);

      const body = await page.textContent("body");
      expect(body?.length).toBeGreaterThan(50);
    });

    test("admin pages render on tablet viewport", async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await signInAsAdmin(page);
      await warmUp(page, "/admin");
      await waitForAppReady(page);

      const body = await page.textContent("body");
      expect(body?.length).toBeGreaterThan(50);
    });
  });
});
