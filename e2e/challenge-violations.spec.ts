/* eslint-disable @typescript-eslint/no-explicit-any -- e2e specs work with dynamic JSON response shapes */
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import {
  ensureSeeded,
  signInAdminApi,
  injectSessionCookie,
  adminGet,
  adminPost,
  getAuditEntries,
} from "./helpers";

/**
 * Robust admin navigation: inject the session cookie, then warm the SPA with
 * retries. A Vite cold-start full reload can abort the first goto or leave
 * the page on a "Failed to fetch dynamically imported module" error while
 * dependency discovery rebuilds the module graph — the retry loop (same
 * pattern as admin-flow.spec.ts's `warmUp`) waits it out instead of failing
 * the first flake. The root page is visited first so the entry graph
 * compiles before the (much larger) admin layout is requested.
 */
async function warmUpAdmin(page: Page, request: APIRequestContext, path: string): Promise<void> {
  const cookie = await signInAdminApi(request);
  await injectSessionCookie(page, cookie);
  // Prewarm the entry graph (landing page) so the admin chunk request that
  // follows isn't the very first compilation the dev server does.
  await page.goto("/").catch(() => {});
  const deadline = Date.now() + 150_000;
  for (let attempt = 0; attempt < 15 && Date.now() < deadline; attempt++) {
    if (page.isClosed()) break;
    try {
      await page.goto(path, { waitUntil: "domcontentloaded", timeout: 20_000 });
    } catch {
      // Cold-start reload aborted the navigation — retry.
      if (page.isClosed()) break;
      await page.waitForTimeout(8_000);
      continue;
    }
    await page.waitForTimeout(2_000);
    if (page.isClosed()) break;
    const body = await page.textContent("body").catch(() => "");
    const interactive = await page
      .locator("input, button, a[href], select, textarea")
      .count()
      .catch(() => 0);
    const ready =
      !!body &&
      !body.includes("Loading application") &&
      !body.includes("taking longer than usual") &&
      !body.includes("Failed to fetch dynamically imported module") &&
      (body.length > 200 || interactive > 0);
    if (ready) return;
    await page.waitForTimeout(8_000);
  }
  throw new Error(`failed to warm ${path} (url: ${page.url()})`);
}

/**
 * ═══════════════════════════════════════════════════════════════
 * 13. Challenge violations — admin alerting, digest, reset & repurchase
 * ═══════════════════════════════════════════════════════════════
 *
 * Covers the ops side of the MT5 rule engine:
 *   - A gateway-sourced violation flips the challenge, stores the breach,
 *     alerts every admin (bell + email template), and stamps the audit trail.
 *   - The admin Challenges page renders the violations digest (summary stats,
 *     trader identity, breach chips) with Reset / Repurchase actions.
 *   - Reset restarts the same challenge at phase 1 with a clean account.
 *   - Repurchase issues a brand-new active challenge for the same template.
 *
 * Violations are seeded through the test-only e2e hook
 * (POST /api/trading/admin/violations/e2e-setup), which drives the REAL
 * sync → rule-engine → notification pipeline with a gateway-sourced snapshot
 * that breaches the template's max drawdown (the hook 404s unless the server
 * runs with E2E_TESTING=1, which the Playwright web server always sets).
 */
test.describe("13. Challenge violations — alerting, digest & recovery", () => {
  test.beforeAll(async ({ request }) => {
    await ensureSeeded(request);
  });

  // The UI tests boot the admin SPA under a shared, memory-constrained dev
  // server; give them a generous budget for the first Vite compilations.
  test.beforeEach(async () => {
    test.setTimeout(240_000);
  });

  test("a gateway-sourced violation alerts admins, stores the breach, and is audited", async ({ request }) => {
    const cookie = await ensureSeeded(request);

    // Seed a real hard violation through the rule-engine pipeline.
    const setup = await adminPost(request, cookie, "/api/trading/admin/violations/e2e-setup");
    expect(setup.success).toBe(true);
    expect(setup.status).toBe("violated");
    expect(setup.challengeId).toBeTruthy();

    // The stored breach records the max_drawdown rule that fired.
    const codes = (setup.violations || []).map((v: any) => v.code);
    expect(codes).toContain("max_drawdown");
    // The same notification loop that emails admins wrote bell entries — the
    // owner is the admin in e2e, so they see both the trader copy and the
    // ops alert ("Trader Challenge Violated").
    expect(setup.adminViolationAlerts).toBeGreaterThanOrEqual(1);

    // /admin/all reflects the violated challenge with its parsed violations.
    const all = await adminGet(request, cookie, "/api/challenges/admin/all?sortBy=createdAt&sortOrder=desc");
    const row = (all as any[]).find((c: any) => c.id === setup.challengeId);
    expect(row).toBeTruthy();
    expect(row.status).toBe("violated");
    expect(JSON.parse(row.violations).some((v: any) => v.code === "max_drawdown")).toBe(true);

    // Admin notifications API carries the challenge_violation entries.
    const notifs = await adminGet(request, cookie, "/api/notifications/my?type=challenge_violation&pageSize=25");
    expect(notifs.notifications.length).toBeGreaterThanOrEqual(1);
    expect(
      notifs.notifications.some((n: any) => n.title === "Trader Challenge Violated"),
    ).toBe(true);

    // The lifecycle audit entry is stamped with the violation details.
    const entries = await getAuditEntries(request, cookie, "challenge.violated");
    const entry = entries.find((e: any) => String(e.entityId) === String(setup.challengeId));
    expect(entry, "expected a challenge.violated audit entry").toBeTruthy();
    expect(entry.details?.challengeLabel).toMatch(/· \$/);
  });

  test("the admin challenges page renders the violations digest with breach chips and actions", async ({ page, request }) => {
    const cookie = await ensureSeeded(request);
    await adminPost(request, cookie, "/api/trading/admin/violations/e2e-setup");

    await warmUpAdmin(page, request, "/admin/challenges");
    await expect(page.getByRole("heading", { name: "Challenge Management" })).toBeVisible({ timeout: 30_000 });

    // Open the digest tab — its label carries the live count.
    await page.getByRole("button", { name: /Violations \(\d+\)/ }).click();

    // Summary stats render.
    await expect(page.getByText("Total Violations")).toBeVisible();
    await expect(page.getByText("Traders Affected")).toBeVisible();

    // A digest card shows the breached rule chip ("Max drawdown") with the
    // trader identity and both recovery actions.
    const card = page.locator(".card-subtle", { hasText: "Max drawdown" }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText("violated");
    await expect(card.getByRole("button", { name: "Reset", exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "Repurchase", exact: true })).toBeVisible();
  });

  test("reset from the digest restarts the same challenge with a clean account", async ({ page, request }) => {
    const cookie = await ensureSeeded(request);
    const setup = await adminPost(request, cookie, "/api/trading/admin/violations/e2e-setup");
    expect(setup.status).toBe("violated");

    await warmUpAdmin(page, request, "/admin/challenges");
    await expect(page.getByRole("heading", { name: "Challenge Management" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /Violations \(\d+\)/ }).click();

    // The newest violation is ours (digest sorts by updatedAt desc) — reset it.
    const card = page.locator(".card-subtle", { hasText: "Max drawdown" }).first();
    await expect(card.getByRole("button", { name: "Reset", exact: true })).toBeVisible({ timeout: 15_000 });
    await card.getByRole("button", { name: "Reset", exact: true }).click();
    await page.getByRole("button", { name: "Reset Challenge" }).click();

    // Server-side: the same challenge is active again, violations cleared.
    await expect
      .poll(
        async () => {
          const all = await adminGet(request, cookie, "/api/challenges/admin/all?sortBy=createdAt&sortOrder=desc");
          const row = (all as any[]).find((c: any) => c.id === setup.challengeId);
          return row?.status;
        },
        { timeout: 15_000, message: "reset should flip the challenge back to active" },
      )
      .toBe("active");

    const all = await adminGet(request, cookie, "/api/challenges/admin/all?sortBy=createdAt&sortOrder=desc");
    const row = (all as any[]).find((c: any) => c.id === setup.challengeId);
    expect(row.violations).toBeNull();

    // The admin action is audited with the label.
    const entries = await getAuditEntries(request, cookie, "challenge.reset");
    expect(entries.some((e: any) => String(e.entityId) === String(setup.challengeId))).toBe(true);
  });

  test("repurchase from the digest issues a fresh active challenge for the trader", async ({ page, request }) => {
    const cookie = await ensureSeeded(request);
    const setup = await adminPost(request, cookie, "/api/trading/admin/violations/e2e-setup");
    expect(setup.status).toBe("violated");

    await warmUpAdmin(page, request, "/admin/challenges");
    await expect(page.getByRole("heading", { name: "Challenge Management" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /Violations \(\d+\)/ }).click();

    const card = page.locator(".card-subtle", { hasText: "Max drawdown" }).first();
    await expect(card.getByRole("button", { name: "Repurchase", exact: true })).toBeVisible({ timeout: 15_000 });
    await card.getByRole("button", { name: "Repurchase", exact: true }).click();
    await page.getByRole("button", { name: "Create New Challenge" }).click();

    // A brand-new active challenge exists for the same template, distinct id.
    await expect
      .poll(
        async () => {
          const all = await adminGet(request, cookie, "/api/challenges/admin/all?sortBy=createdAt&sortOrder=desc");
          const reissue = (all as any[]).find(
            (c: any) => c.id !== setup.challengeId && c.status === "active" && c.accountSize === setup.accountSize,
          );
          return reissue ? reissue.id : null;
        },
        { timeout: 15_000, message: "repurchase should create a fresh active challenge" },
      )
      .not.toBeNull();

    // The reissue is audited with the label and the new challenge id.
    const entries = await getAuditEntries(request, cookie, "challenge.repurchased");
    const entry = entries.find((e: any) => String(e.entityId) === String(setup.challengeId));
    expect(entry, "expected a challenge.repurchased audit entry").toBeTruthy();
    expect(entry.details?.newChallengeId).toBeTruthy();
    expect(entry.details?.challengeLabel).toMatch(/· \$/);
  });
});
