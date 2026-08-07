import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, ensureSeeded } from "./helpers";

// ═══════════════════════════════════════════════════════════════
// 1. Authentication — sign-up, sign-in, session persistence, sign-out
// ═══════════════════════════════════════════════════════════════
test.describe("1. Authentication", () => {
  test.beforeAll(async ({ request }) => {
    await ensureSeeded(request);
  });

  test("signed-out users are sent to /auth with a returnTo deep link", async ({ page }) => {
    await page.goto("/dashboard/trading");
    // The returnTo query value is percent-encoded by the router.
    await expect(page).toHaveURL(/\/auth\?returnTo=%2Fdashboard%2Ftrading/);
    await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
  });

  test("sign-up creates an account and lands on the dashboard", async ({ page }) => {
    const email = `e2e-${Date.now()}@afrifundedcapital.com`;
    await page.goto("/auth");
    await page.getByText("Sign up", { exact: true }).click();
    await page.getByPlaceholder("Full name").fill("E2E Trader");
    await page.getByPlaceholder("name@example.com").fill(email);
    await page.getByPlaceholder("Password (min 6 characters)").fill("E2ePass!234");
    await page.getByRole("button", { name: "Create Account" }).click();

    // Fresh accounts are redirected to onboarding; either way they land in the
    // authenticated dashboard area.
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    // The session cookie persists across reloads.
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("wrong password is rejected with a visible error", async ({ page }) => {
    await page.goto("/auth");
    await page.getByPlaceholder("name@example.com").fill(ADMIN_EMAIL);
    await page.getByPlaceholder("Password", { exact: true }).fill("DefinitelyWrong!1");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible({ timeout: 15_000 });
  });

  test("admin signs in through the UI and signs out again", async ({ page }) => {
    await page.goto("/auth");
    await page.getByPlaceholder("name@example.com").fill(ADMIN_EMAIL);
    await page.getByPlaceholder("Password", { exact: true }).fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    await page.getByText("Sign Out", { exact: true }).click();
    // Signed out users can no longer see the protected dashboard.
    await expect(page).toHaveURL(/\/auth|\/$/, { timeout: 20_000 });
  });
});
