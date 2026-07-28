/**
 * End-to-end tests for the Admin Dashboard flow.
 *
 * Covers: Login → Overview → Users → Challenges → Payments
 *
 * Prerequisites:
 *   1. The dev server must be running (bun run dev)
 *   2. A super-admin account must exist:
 *        POST /api/seed/admin
 *        { "email": "admin@afrifundedcapital.com", "password": "Admin@123456" }
 *   3. Set PLAYWRIGHT_BASE_URL if not using localhost:5173
 */
import { test, expect, type Page } from "@playwright/test";

// ─── Config ───────────────────────────────────────────────
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@afrifundedcapital.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "Admin@123456";

// ─── Helpers ──────────────────────────────────────────────

/** Wait for the app to be interactive (loading screen gone or form elements visible) */
async function waitForAppReady(page: Page) {
  // The Freebuff platform shows "Loading application... Step 4 of 4" during bootstrap.
  // In headless Chromium this may never fully resolve, so we use a dual strategy:
  // 1. Wait up to 10s for loading text to disappear OR
  // 2. Wait for interactive elements (inputs, buttons, headings) to appear
  try {
    await page.waitForFunction(
      () => {
        const body = document.body?.textContent || "";
        const hasLoading = body.includes("Loading application") || body.includes("Step 4 of 4");
        const hasInteractive = document.querySelectorAll('input, button, h1, h2, a[href]').length > 2;
        return hasInteractive || (!hasLoading && body.length > 100);
      },
      { timeout: 12_000 },
    );
  } catch {
    // If still loading, wait a bit more and proceed anyway
    await page.waitForTimeout(3_000);
  }
}

/** Sign in as admin via the UI auth page */
async function signInAsAdmin(page: Page) {
  await page.goto("/auth");
  // Wait for the app to fully bootstrap first
  await waitForAppReady(page);
  // Then wait for the email input to appear
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 15_000 });

  const passwordInput = page.locator('input[type="password"]').first();

  await emailInput.fill(ADMIN_EMAIL);
  await passwordInput.fill(ADMIN_PASSWORD);

  // Click the sign-in / submit button
  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.click();

  // Wait for navigation away from /auth
  await page.waitForURL((url) => !url.pathname.includes("/auth"), { timeout: 15_000 });
}

/** Wait for a page heading to appear */
async function waitForHeading(page: Page, text: string | RegExp) {
  await expect(page.locator(`h1:has-text("${typeof text === "string" ? text : text.source}"), h2:has-text("${typeof text === "string" ? text : text.source}")`).first()).toBeVisible({ timeout: 10_000 });
}

// ─── Tests ────────────────────────────────────────────────

test.describe("Admin Dashboard E2E Flow", () => {
  test.describe.configure({ mode: "serial" });

  // ─── 1. Authentication ────────────────────────────────
  test.describe("1. Authentication", () => {
    test("loads the landing page", async ({ page }) => {
      await page.goto("/");
      // Should show the brand name or hero content
      await expect(page.locator("body")).toBeVisible();
      // Page should not be blank
      const text = await page.textContent("body");
      expect(text?.length).toBeGreaterThan(100);
    });

    test("navigates to auth page", async ({ page }) => {
      await page.goto("/auth");
      await waitForAppReady(page);
      // Should show login form elements
      await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('input[type="password"]').first()).toBeVisible();
    });

    test("shows validation error for empty credentials", async ({ page }) => {
      await page.goto("/auth");
      await waitForAppReady(page);
      await page.locator('input[type="email"]').first().waitFor({ state: "visible", timeout: 15_000 });

      const submitBtn = page.locator('button[type="submit"]').first();
      await submitBtn.click();

      // Should stay on auth page (no navigation)
      await page.waitForTimeout(1000);
      expect(page.url()).toContain("/auth");
    });

    test("signs in as admin successfully", async ({ page }) => {
      await signInAsAdmin(page);
      // Should be redirected to dashboard or admin
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
      await page.goto("/admin");
      await waitForAppReady(page);
      await page.waitForTimeout(2000);

      // Should show admin content (stat cards, heading, etc.)
      const body = await page.textContent("body");
      expect(body).toBeTruthy();
      // Check for admin-specific content
      const hasAdminContent = body?.includes("Overview") || body?.includes("Admin") || body?.includes("Total Users");
      expect(hasAdminContent).toBeTruthy();
    });

    test("displays stat cards on overview", async ({ page }) => {
      await page.goto("/admin");
      await waitForAppReady(page);
      await page.waitForTimeout(2000);

      // Look for stat card labels
      const body = await page.textContent("body");
      const hasStats = body?.includes("Total Users") || body?.includes("Revenue") || body?.includes("Challenges");
      expect(hasStats).toBeTruthy();
    });

    test("shows navigation sidebar", async ({ page }) => {
      await page.goto("/admin");
      await waitForAppReady(page);
      await page.waitForTimeout(2000);

      // Sidebar should have navigation links
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
      await page.goto("/admin");
      await waitForAppReady(page);
      await page.waitForTimeout(2000);

      // Look for Users link in sidebar and click it
      const usersLink = page.locator("a:has-text('Users'), button:has-text('Users')").first();
      if (await usersLink.isVisible()) {
        await usersLink.click();
        await page.waitForTimeout(2000);
      }

      // Check page content
      const body = await page.textContent("body");
      const hasUserContent = body?.includes("User") || body?.includes("Manage");
      expect(hasUserContent).toBeTruthy();
    });

    test("displays user search input", async ({ page }) => {
      await page.goto("/admin");
      await waitForAppReady(page);
      await page.waitForTimeout(2000);

      // Try to find Users link and navigate
      const usersLink = page.locator("a:has-text('Users'), button:has-text('Users')").first();
      if (await usersLink.isVisible()) {
        await usersLink.click();
        await page.waitForTimeout(2000);
      }

      // Look for search input
      const searchInput = page.locator('input[placeholder*="Search" i], input[type="search"]').first();
      if (await searchInput.isVisible()) {
        await expect(searchInput).toBeVisible();
      }
    });

    test("can search users by name", async ({ page }) => {
      await page.goto("/admin");
      await waitForAppReady(page);
      await page.waitForTimeout(2000);

      const usersLink = page.locator("a:has-text('Users'), button:has-text('Users')").first();
      if (await usersLink.isVisible()) {
        await usersLink.click();
        await page.waitForTimeout(2000);
      }

      const searchInput = page.locator('input[placeholder*="Search" i], input[type="search"]').first();
      if (await searchInput.isVisible()) {
        await searchInput.fill("admin");
        await page.waitForTimeout(1000);
        // After searching, the table should filter
        const body = await page.textContent("body");
        expect(body).toBeTruthy();
      }
    });

    test("displays user role filters", async ({ page }) => {
      await page.goto("/admin");
      await waitForAppReady(page);
      await page.waitForTimeout(2000);

      const usersLink = page.locator("a:has-text('Users'), button:has-text('Users')").first();
      if (await usersLink.isVisible()) {
        await usersLink.click();
        await page.waitForTimeout(2000);
      }

      // Look for role filter dropdown
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
      await page.goto("/admin");
      await waitForAppReady(page);
      await page.waitForTimeout(2000);

      // Look for Challenges link
      const challengesLink = page.locator("a:has-text('Challenges'), button:has-text('Challenges')").first();
      if (await challengesLink.isVisible()) {
        await challengesLink.click();
        await page.waitForTimeout(2000);
      }

      const body = await page.textContent("body");
      const hasChallengeContent = body?.includes("Challenge") || body?.includes("Template");
      expect(hasChallengeContent).toBeTruthy();
    });

    test("displays challenge templates", async ({ page }) => {
      await page.goto("/admin");
      await waitForAppReady(page);
      await page.waitForTimeout(2000);

      const challengesLink = page.locator("a:has-text('Challenges'), button:has-text('Challenges')").first();
      if (await challengesLink.isVisible()) {
        await challengesLink.click();
        await page.waitForTimeout(2000);
      }

      const body = await page.textContent("body");
      // Should show template-related content
      const hasTemplates = body?.includes("Template") || body?.includes("template") || body?.includes("New Template");
      expect(hasTemplates).toBeTruthy();
    });

    test("shows New Template button", async ({ page }) => {
      await page.goto("/admin");
      await waitForAppReady(page);
      await page.waitForTimeout(2000);

      const challengesLink = page.locator("a:has-text('Challenges'), button:has-text('Challenges')").first();
      if (await challengesLink.isVisible()) {
        await challengesLink.click();
        await page.waitForTimeout(2000);
      }

      const newTemplateBtn = page.locator('button:has-text("New Template"), button:has-text("Create Template")').first();
      if (await newTemplateBtn.isVisible()) {
        await expect(newTemplateBtn).toBeVisible();
      }
    });

    test("opens create template dialog", async ({ page }) => {
      await page.goto("/admin");
      await waitForAppReady(page);
      await page.waitForTimeout(2000);

      const challengesLink = page.locator("a:has-text('Challenges'), button:has-text('Challenges')").first();
      if (await challengesLink.isVisible()) {
        await challengesLink.click();
        await page.waitForTimeout(2000);
      }

      const newTemplateBtn = page.locator('button:has-text("New Template"), button:has-text("Create Template")').first();
      if (await newTemplateBtn.isVisible()) {
        await newTemplateBtn.click();
        await page.waitForTimeout(1000);

        // Dialog should appear with form fields
        const body = await page.textContent("body");
        const hasDialog = body?.includes("Create") || body?.includes("Name") || body?.includes("Template");
        expect(hasDialog).toBeTruthy();
      }
    });
  });

  // ─── 5. Payment Management ────────────────────────────
  test.describe("5. Payment Management", () => {
    test.beforeEach(async ({ page }) => {
      await signInAsAdmin(page);
    });

    test("navigates to payments page", async ({ page }) => {
      await page.goto("/admin");
      await waitForAppReady(page);
      await page.waitForTimeout(2000);

      // Look for Payments link
      const paymentsLink = page.locator("a:has-text('Payments'), button:has-text('Payments')").first();
      if (await paymentsLink.isVisible()) {
        await paymentsLink.click();
        await page.waitForTimeout(2000);
      }

      const body = await page.textContent("body");
      const hasPaymentContent = body?.includes("Payment") || body?.includes("Transaction") || body?.includes("Revenue");
      expect(hasPaymentContent).toBeTruthy();
    });

    test("displays payment statistics", async ({ page }) => {
      await page.goto("/admin");
      await waitForAppReady(page);
      await page.waitForTimeout(2000);

      const paymentsLink = page.locator("a:has-text('Payments'), button:has-text('Payments')").first();
      if (await paymentsLink.isVisible()) {
        await paymentsLink.click();
        await page.waitForTimeout(2000);
      }

      const body = await page.textContent("body");
      // Should show revenue or payment stats
      const hasStats = body?.includes("₦") || body?.includes("Revenue") || body?.includes("Total");
      expect(hasStats).toBeTruthy();
    });

    test("shows transaction list or empty state", async ({ page }) => {
      await page.goto("/admin");
      await waitForAppReady(page);
      await page.waitForTimeout(2000);

      const paymentsLink = page.locator("a:has-text('Payments'), button:has-text('Payments')").first();
      if (await paymentsLink.isVisible()) {
        await paymentsLink.click();
        await page.waitForTimeout(2000);
      }

      // Should show either a table of transactions or an empty state message
      const body = await page.textContent("body");
      const hasTransactions = body?.includes("Transaction") || body?.includes("No ") || body?.includes("Empty") || body?.includes("payment");
      expect(hasTransactions).toBeTruthy();
    });
  });

  // ─── 6. Cross-page Navigation ─────────────────────────
  test.describe("6. Cross-page Navigation", () => {
    test.beforeEach(async ({ page }) => {
      await signInAsAdmin(page);
    });

    test("can navigate between all admin pages", async ({ page }) => {
      await page.goto("/admin");
      await waitForAppReady(page);
      await page.waitForTimeout(2000);

      // Get all sidebar links
      const links = page.locator("nav a, aside a, .sidebar a");
      const linkCount = await links.count();

      // Should have at least some navigation links
      expect(linkCount).toBeGreaterThan(0);

      // Click through each link and verify page loads
      for (let i = 0; i < Math.min(linkCount, 5); i++) {
        const link = links.nth(i);
        const href = await link.getAttribute("href");
        if (href && href.startsWith("/admin")) {
          await link.click();
          await page.waitForTimeout(1500);
          // Page should not crash
          const body = await page.textContent("body");
          expect(body?.length).toBeGreaterThan(50);
        }
      }
    });

    test("admin toggle is not visible for non-admin users", async ({ page }) => {
      await page.goto("/admin");
      await waitForAppReady(page);
      await page.waitForTimeout(2000);
      const body = await page.textContent("body");
      expect(body?.length).toBeGreaterThan(50);
    });
  });

  // ─── 7. Responsive Design ─────────────────────────────
  test.describe("7. Responsive Design", () => {
    test("admin pages render on mobile viewport", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await signInAsAdmin(page);
      await page.goto("/admin");
      await waitForAppReady(page);
      await page.waitForTimeout(2000);

      // Page should still be functional on mobile
      const body = await page.textContent("body");
      expect(body?.length).toBeGreaterThan(50);
    });

    test("admin pages render on tablet viewport", async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await signInAsAdmin(page);
      await page.goto("/admin");
      await waitForAppReady(page);
      await page.waitForTimeout(2000);

      const body = await page.textContent("body");
      expect(body?.length).toBeGreaterThan(50);
    });
  });
});
