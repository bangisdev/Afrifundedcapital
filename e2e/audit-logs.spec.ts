import { test, expect } from "@playwright/test";
import {
  adminPost,
  adminPut,
  createDemoPurchase,
  ensureSeeded,
  getAuditEntries,
  signInAdminFast,
} from "./helpers";

// ═══════════════════════════════════════════════════════════════
// 11. Purchase label & audit trail (part 2/2) — challenge lifecycle audit
// entries (phase_passed / funded / violated / expired) stamped with the
// purchase label, and the quick-filter chips that surface them.
// ═══════════════════════════════════════════════════════════════
test.describe("11. Purchase label & audit trail — audit log chips & lifecycle", () => {
  test("challenge lifecycle transitions write labeled audit entries", async ({ request }) => {
    const cookie = await ensureSeeded(request);
    const { label, challengeId } = await createDemoPurchase(request, cookie, {
      templateName: "Two-Step Evaluation",
      sizeLabel: "$25,000",
    });

    // Drive the challenge through its whole lifecycle via the admin status API.
    const phases: Array<[string, string]> = [
      ["phase_1_passed", "challenge.phase_passed"],
      ["funded", "challenge.funded"],
      ["violated", "challenge.violated"],
      ["expired", "challenge.expired"],
    ];

    for (const [status, action] of phases) {
      const res = await adminPut(request, cookie, `/api/challenges/admin/${challengeId}/status`, {
        status,
      });
      expect(res.newStatus).toBe(status);

      const entries = await getAuditEntries(request, cookie, action);
      const mine = entries.find((e: any) => e.entityId === String(challengeId));
      expect(mine, `expected an audit entry for ${action}`).toBeTruthy();
      // Every lifecycle entry is stamped with the challenge label.
      expect(mine.details.challengeLabel).toBe(label);
    }
  });

  test("audit log chips render and filter the lifecycle + payment actions", async ({ page, request }) => {
    const cookie = await ensureSeeded(request);
    const { label, challengeId } = await createDemoPurchase(request, cookie, {
      templateName: "Two-Step Evaluation",
      sizeLabel: "$25,000",
    });

    await adminPut(request, cookie, `/api/challenges/admin/${challengeId}/status`, { status: "phase_1_passed" });
    await adminPut(request, cookie, `/api/challenges/admin/${challengeId}/status`, { status: "funded" });
    await adminPut(request, cookie, `/api/challenges/admin/${challengeId}/status`, { status: "violated" });
    await adminPut(request, cookie, `/api/challenges/admin/${challengeId}/status`, { status: "expired" });

    await signInAdminFast(page, request);
    await page.goto("/admin/audit-logs");

    // All quick-filter chips render.
    for (const chip of ["Phase Passed", "Funded", "Violated", "Expired", "Completed", "Refunded", "Resumed"]) {
      await expect(page.getByRole("button", { name: chip })).toBeVisible();
    }

    // The lifecycle entries render with their raw actions.
    await expect(page.getByText("challenge.phase_passed")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("challenge.funded")).toBeVisible();
    await expect(page.getByText("challenge.violated")).toBeVisible();
    await expect(page.getByText("challenge.expired")).toBeVisible();

    // The purchase label is surfaced on the entries (DetailsLine rendering).
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();

    // Tapping a chip filters the list to exactly that lifecycle action.
    await page.getByRole("button", { name: "Violated" }).click();
    await expect(page.getByText("challenge.violated")).toBeVisible();
    await expect(page.getByText("challenge.funded", { exact: true })).toHaveCount(0, { timeout: 15_000 });

    await page.getByRole("button", { name: "Phase Passed" }).click();
    await expect(page.getByText("challenge.phase_passed")).toBeVisible();
    await expect(page.getByText("challenge.violated", { exact: true })).toHaveCount(0, { timeout: 15_000 });
  });
});
