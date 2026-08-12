import { expect, test } from "@playwright/test";

import {
  adminGet,
  ensureSeeded,
  getAuditEntries,
  signInAdminFast,
} from "./helpers";

/**
 * 14. Weekly violation digest — manual send from the admin overview
 * ═══════════════════════════════════════════════════════════════
 *
 * Drives the REAL "Send digest now" button on the Admin Overview card:
 *   - The click POSTs to /api/challenges/admin/digest-send, which runs the
 *     same pipeline as the weekly scheduler tick (aggregate → one email per
 *     admin → record last-sent when ≥1 delivered → audit entry).
 *   - Under the Playwright web server (E2E_TESTING=1) the email transport is
 *     the in-memory fake in src/server/lib/email.ts, so the success path —
 *     delivered toast, card flipping to "Last sent just now", digest-status
 *     returning a timestamp — is exercised deterministically without network
 *     or credentials. The scheduler's first auto-tick is pushed far out in
 *     e2e mode, so the manual button is the only way a digest fires here.
 *   - The audit trail stamps a violation_digest.sent entry with the delivery
 *     counts, matching the reset/repurchase audit pattern.
 */
test.describe("14. Weekly violation digest — manual send from the admin overview", () => {
  let cookie = "";

  test.beforeAll(async ({ request }) => {
    cookie = await ensureSeeded(request);
  });

  test.beforeEach(async () => {
    test.setTimeout(240_000);
  });

  test("'Send digest now' delivers the digest, flips the card, and stamps the audit trail", async ({
    page,
    request,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
    });
    page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 300)));

    await signInAdminFast(page, request, "/admin");

    // First request to the admin route triggers an on-demand Vite compile —
    // wait for the mount signal (the page heading) before asserting on the
    // digest card below it.
    await expect(page.getByRole("heading", { name: "Admin Overview" })).toBeVisible({
      timeout: 90_000,
    });
    console.log("[console errors after mount]", JSON.stringify(consoleErrors.slice(0, 8)));
    await expect(page.getByText("Weekly Violation Digest")).toBeVisible({ timeout: 20_000 });

    // The digest has never gone out in the fresh e2e DB — the card says so
    // once the status query resolves (loading state is hidden first).
    await expect(page.getByText("Never sent yet")).toBeVisible({ timeout: 20_000 });

    const sendButton = page.getByRole("button", { name: /Send digest now/i });
    await expect(sendButton).toBeVisible();

    // Click and capture the exact API response the button gets.
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/challenges/admin/digest-send") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await sendButton.click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const body = await response.json();

    // The pipeline ran against the e2e DB and the fake transport delivered.
    expect(body.success).toBe(true);
    expect(body.sent).toBeGreaterThanOrEqual(1);
    expect(body.admins).toBeGreaterThanOrEqual(1);
    expect(body.sentAt).toBeTruthy();
    expect(body.message).toMatch(/^Digest sent to \d+\/\d+ admin\(s\)$/);

    // The delivered toast is captured (sonner).
    await expect(page.locator("[data-sonner-toast]")).toContainText(
      /Digest sent to \d+\/\d+ admin\(s\)/,
      { timeout: 15_000 },
    );

    // The card flips to the fresh timestamp (within the same minute).
    await expect(page.getByText("Last sent just now")).toBeVisible({ timeout: 15_000 });

    // The status endpoint now reports the recorded send.
    const status = await adminGet(request, cookie, "/api/challenges/admin/digest-status");
    expect(status.lastSentAt).toBeTruthy();
    expect(status.lastSentAt).toBeCloseTo(body.sentAt, -3); // same second

    // The audit trail carries the delivery counts.
    const audits = await getAuditEntries(request, cookie, "violation_digest.sent");
    expect(audits.length).toBeGreaterThanOrEqual(1);
    const latest = audits[0];
    expect(latest.details.sent).toBeGreaterThanOrEqual(1);
    expect(latest.details.admins).toBeGreaterThanOrEqual(1);
    expect(typeof latest.details.violations).toBe("number");
  });
});
