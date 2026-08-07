# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: audit-payments.spec.ts >> 11. Purchase label & audit trail — payments table >> payment lifecycle events write labeled audit entries (completed → refunded → resumed)
- Location: e2e/audit-payments.spec.ts:35:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "successful"
Received: "ok"
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import {
  3  |   adminGet,
  4  |   adminPost,
  5  |   createDemoPurchase,
  6  |   ensureSeeded,
  7  |   getAuditEntries,
  8  |   getTemplates,
  9  |   getTemplateSizes,
  10 |   signInAdminFast,
  11 | } from "./helpers";
  12 | 
  13 | // ═══════════════════════════════════════════════════════════════
  14 | // 11. Purchase label & audit trail (part 1/2) — the purchase label on the
  15 | // admin payments table, and payment lifecycle audit entries
  16 | // (payment.completed / refunded / resumed), each stamped with the label.
  17 | // ═══════════════════════════════════════════════════════════════
  18 | test.describe("11. Purchase label & audit trail — payments table", () => {
  19 |   test("the admin payments table shows the purchase label on each transaction", async ({ page, request }) => {
  20 |     const cookie = await ensureSeeded(request);
  21 |     const { label } = await createDemoPurchase(request, cookie, {
  22 |       templateName: "Two-Step Evaluation",
  23 |       sizeLabel: "$25,000",
  24 |     });
  25 | 
  26 |     await signInAdminFast(page, request);
  27 |     await page.goto("/admin/payments");
  28 | 
  29 |     await expect(page.getByText(label, { exact: true })).toBeVisible({ timeout: 15_000 });
  30 |     // The label is stamped on the transaction row (not just the raw reference).
  31 |     const row = page.locator("tr", { hasText: /^DEMO-/ }).first();
  32 |     await expect(row).toContainText(label);
  33 |   });
  34 | 
  35 |   test("payment lifecycle events write labeled audit entries (completed → refunded → resumed)", async ({ request }) => {
  36 |     const cookie = await ensureSeeded(request);
  37 | 
  38 |     // 1) Initiate a real pending payment, then complete it through the webhook
  39 |     //    pipeline (the same path Flutterwave would use) — this writes the
  40 |     //    payment.completed audit entry with the purchase label.
  41 |     const templates = await getTemplates(request);
  42 |     const template = templates.find((t) => t.name === "One-Step Challenge") || templates[0];
  43 |     const sizes = await getTemplateSizes(request, template.id);
  44 |     const size = sizes.find((s) => s.label === "$25,000") || sizes[0];
  45 | 
  46 |     const initiated = await adminPost(request, cookie, "/api/payments/initiate", {
  47 |       amount: 5000,
  48 |       templateId: template.id,
  49 |       accountSizeId: size.id,
  50 |       description: "E2E Webhook Purchase",
  51 |     });
  52 |     expect(initiated.paymentId).toBeTruthy();
  53 | 
  54 |     const webhook = await adminPost(request, cookie, "/api/payments/admin/test-webhook", {
  55 |       paymentId: initiated.paymentId,
  56 |     });
  57 |     expect(webhook.usedPayment).toBe(true);
> 58 |     expect(webhook.webhookStatus).toBe("successful");
     |                                   ^ Error: expect(received).toBe(expected) // Object.is equality
  59 | 
  60 |     // 2) Refund it — payment.refunded audit entry.
  61 |     await adminPost(request, cookie, `/api/payments/admin/${initiated.paymentId}/refund`);
  62 |     // 3) Resume it — payment.resumed audit entry.
  63 |     await adminPost(request, cookie, `/api/payments/admin/${initiated.paymentId}/resume`);
  64 | 
  65 |     // The payment row carries the purchase label in the admin list.
  66 |     const payments = await adminGet(request, cookie, "/api/payments/admin/all?pageSize=50");
  67 |     const row = (payments.payments || []).find((p: any) => p.id === initiated.paymentId);
  68 |     expect(row).toBeTruthy();
  69 |     expect(row.challengeLabel).toMatch(/One-Step Challenge · \$25,000/);
  70 | 
  71 |     // All three lifecycle actions were audited with the label stamped on.
  72 |     const completed = await getAuditEntries(request, cookie, "payment.completed");
  73 |     const completedEntry = completed.find((e: any) => e.entityId === String(initiated.paymentId));
  74 |     expect(completedEntry, "expected a payment.completed audit entry").toBeTruthy();
  75 |     expect(completedEntry.details.challengeLabel).toMatch(/One-Step Challenge · \$25,000/);
  76 | 
  77 |     const refunded = await getAuditEntries(request, cookie, "payment.refunded");
  78 |     const refundedEntry = refunded.find((e: any) => e.entityId === String(initiated.paymentId));
  79 |     expect(refundedEntry, "expected a payment.refunded audit entry").toBeTruthy();
  80 |     expect(refundedEntry.details.challengeLabel).toMatch(/One-Step Challenge · \$25,000/);
  81 | 
  82 |     const resumed = await getAuditEntries(request, cookie, "payment.resumed");
  83 |     const resumedEntry = resumed.find((e: any) => e.entityId === String(initiated.paymentId));
  84 |     expect(resumedEntry, "expected a payment.resumed audit entry").toBeTruthy();
  85 |     expect(resumedEntry.details.challengeLabel).toMatch(/One-Step Challenge · \$25,000/);
  86 |   });
  87 | });
  88 | 
```