import { test, expect } from "@playwright/test";
import {
  adminGet,
  adminPost,
  createDemoPurchase,
  ensureSeeded,
  getAuditEntries,
  getTemplates,
  getTemplateSizes,
  signInAdminFast,
} from "./helpers";

// ═══════════════════════════════════════════════════════════════
// 11. Purchase label & audit trail (part 1/2) — the purchase label on the
// admin payments table, and payment lifecycle audit entries
// (payment.completed / refunded / resumed), each stamped with the label.
// ═══════════════════════════════════════════════════════════════
test.describe("11. Purchase label & audit trail — payments table", () => {
  test("the admin payments table shows the purchase label on each transaction", async ({ page, request }) => {
    const cookie = await ensureSeeded(request);
    const { label } = await createDemoPurchase(request, cookie, {
      templateName: "Two-Step Evaluation",
      sizeLabel: "$25,000",
    });

    await signInAdminFast(page, request, "/admin/payments");

    // Several seeded rows share the label (one per purchase) — assert the first.
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    // The label is stamped on the transaction row (not just the raw reference).
    const row = page.locator("tr").filter({ hasText: label }).first();
    await expect(row).toContainText(label);
  });

  test("payment lifecycle events write labeled audit entries (completed → refunded → resumed)", async ({ request }) => {
    const cookie = await ensureSeeded(request);

    // 1) Initiate a real pending payment, then complete it through the webhook
    //    pipeline (the same path Flutterwave would use) — this writes the
    //    payment.completed audit entry with the purchase label.
    const templates = await getTemplates(request);
    const template = templates.find((t) => t.name === "One-Step Challenge") || templates[0];
    const sizes = await getTemplateSizes(request, template.id);
    const size = sizes.find((s) => s.label === "$25,000") || sizes[0];

    const initiated = await adminPost(request, cookie, "/api/payments/initiate", {
      amount: 5000,
      templateId: template.id,
      accountSizeId: size.id,
      description: "E2E Webhook Purchase",
    });
    expect(initiated.paymentId).toBeTruthy();

    const webhook = await adminPost(request, cookie, "/api/payments/admin/test-webhook", {
      paymentId: initiated.paymentId,
    });
    expect(webhook.usedPayment).toBe(true);
    expect(webhook.webhookStatus).toBe("ok");

    // 2) Refund it — payment.refunded audit entry.
    await adminPost(request, cookie, `/api/payments/admin/${initiated.paymentId}/refund`);
    // 3) Resume it — payment.resumed audit entry.
    await adminPost(request, cookie, `/api/payments/admin/${initiated.paymentId}/resume`);

    // The payment row carries the purchase label in the admin list.
    const payments = await adminGet(request, cookie, "/api/payments/admin/all?pageSize=50");
    const row = (payments.payments || []).find((p) => p.id === initiated.paymentId);
    expect(row).toBeTruthy();
    expect(row.challengeLabel).toMatch(/One-Step Challenge · \$25,000/);

    // All three lifecycle actions were audited with the label stamped on.
    const completed = await getAuditEntries(request, cookie, "payment.completed");
    const completedEntry = completed.find((e) => e.entityId === String(initiated.paymentId));
    expect(completedEntry, "expected a payment.completed audit entry").toBeTruthy();
    expect(completedEntry.details.challengeLabel).toMatch(/One-Step Challenge · \$25,000/);

    const refunded = await getAuditEntries(request, cookie, "payment.refunded");
    const refundedEntry = refunded.find((e) => e.entityId === String(initiated.paymentId));
    expect(refundedEntry, "expected a payment.refunded audit entry").toBeTruthy();
    expect(refundedEntry.details.challengeLabel).toMatch(/One-Step Challenge · \$25,000/);

    const resumed = await getAuditEntries(request, cookie, "payment.resumed");
    const resumedEntry = resumed.find((e) => e.entityId === String(initiated.paymentId));
    expect(resumedEntry, "expected a payment.resumed audit entry").toBeTruthy();
    expect(resumedEntry.details.challengeLabel).toMatch(/One-Step Challenge · \$25,000/);
  });
});
