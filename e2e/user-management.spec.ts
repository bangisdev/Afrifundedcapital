import { test, expect } from "@playwright/test";
import { ensureSeeded, signInAdminFast } from "./helpers";

// ═══════════════════════════════════════════════════════════════
// 3. User Management — list, search, and detail navigation
// ═══════════════════════════════════════════════════════════════
test.describe("3. User Management", () => {
  test.beforeAll(async ({ request }) => {
    await ensureSeeded(request);
  });

  test("lists the seeded demo users", async ({ page, request }) => {
    await signInAdminFast(page, request, "/admin/users");

    await expect(page.getByText("Adebayo Okonkwo")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("adebayo@test.com")).toBeVisible();
  });

  test("search narrows the user table", async ({ page, request }) => {
    await signInAdminFast(page, request, "/admin/users");

    const search = page.getByPlaceholder("Search by name, email, phone, or referral code...");
    await expect(search).toBeVisible();
    await search.fill("Chioma");

    await expect(page.getByText("Chioma Nwosu")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Adebayo Okonkwo")).toHaveCount(0, { timeout: 15_000 });
  });

  test("KYC status badges render for seeded users", async ({ page, request }) => {
    await signInAdminFast(page, request, "/admin/users");

    await expect(page.getByText("Adebayo Okonkwo")).toBeVisible({ timeout: 15_000 });
    // Approved seed users carry an approved KYC badge somewhere in the row.
    const row = page.locator("tr", { hasText: "Adebayo Okonkwo" }).first();
    await expect(row).toContainText(/approved/i);
  });
});
