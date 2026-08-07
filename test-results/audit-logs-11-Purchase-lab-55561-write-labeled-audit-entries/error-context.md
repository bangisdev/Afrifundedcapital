# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: audit-logs.spec.ts >> 11. Purchase label & audit trail — audit log chips & lifecycle >> challenge lifecycle transitions write labeled audit entries
- Location: e2e/audit-logs.spec.ts:17:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "Two-Step Evaluation · $25,000"
Received: undefined
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import {
  3  |   adminPost,
  4  |   adminPut,
  5  |   createDemoPurchase,
  6  |   ensureSeeded,
  7  |   getAuditEntries,
  8  |   signInAdminFast,
  9  | } from "./helpers";
  10 | 
  11 | // ═══════════════════════════════════════════════════════════════
  12 | // 11. Purchase label & audit trail (part 2/2) — challenge lifecycle audit
  13 | // entries (phase_passed / funded / violated / expired) stamped with the
  14 | // purchase label, and the quick-filter chips that surface them.
  15 | // ═══════════════════════════════════════════════════════════════
  16 | test.describe("11. Purchase label & audit trail — audit log chips & lifecycle", () => {
  17 |   test("challenge lifecycle transitions write labeled audit entries", async ({ request }) => {
  18 |     const cookie = await ensureSeeded(request);
  19 |     const { label, challengeId } = await createDemoPurchase(request, cookie, {
  20 |       templateName: "Two-Step Evaluation",
  21 |       sizeLabel: "$25,000",
  22 |     });
  23 | 
  24 |     // Drive the challenge through its whole lifecycle via the admin status API.
  25 |     const phases: Array<[string, string]> = [
  26 |       ["phase_1_passed", "challenge.phase_passed"],
  27 |       ["funded", "challenge.funded"],
  28 |       ["violated", "challenge.violated"],
  29 |       ["expired", "challenge.expired"],
  30 |     ];
  31 | 
  32 |     for (const [status, action] of phases) {
  33 |       const res = await adminPut(request, cookie, `/api/challenges/admin/${challengeId}/status`, {
  34 |         status,
  35 |       });
  36 |       expect(res.newStatus).toBe(status);
  37 | 
  38 |       const entries = await getAuditEntries(request, cookie, action);
  39 |       const mine = entries.find((e: any) => e.entityId === String(challengeId));
  40 |       expect(mine, `expected an audit entry for ${action}`).toBeTruthy();
  41 |       // Every lifecycle entry is stamped with the challenge label.
> 42 |       expect(mine.details.challengeLabel).toBe(label);
     |                                           ^ Error: expect(received).toBe(expected) // Object.is equality
  43 |     }
  44 |   });
  45 | 
  46 |   test("audit log chips render and filter the lifecycle + payment actions", async ({ page, request }) => {
  47 |     const cookie = await ensureSeeded(request);
  48 |     const { label, challengeId } = await createDemoPurchase(request, cookie, {
  49 |       templateName: "Two-Step Evaluation",
  50 |       sizeLabel: "$25,000",
  51 |     });
  52 | 
  53 |     await adminPut(request, cookie, `/api/challenges/admin/${challengeId}/status`, { status: "phase_1_passed" });
  54 |     await adminPut(request, cookie, `/api/challenges/admin/${challengeId}/status`, { status: "funded" });
  55 |     await adminPut(request, cookie, `/api/challenges/admin/${challengeId}/status`, { status: "violated" });
  56 |     await adminPut(request, cookie, `/api/challenges/admin/${challengeId}/status`, { status: "expired" });
  57 | 
  58 |     await signInAdminFast(page, request);
  59 |     await page.goto("/admin/audit-logs");
  60 | 
  61 |     // All quick-filter chips render.
  62 |     for (const chip of ["Phase Passed", "Funded", "Violated", "Expired", "Completed", "Refunded", "Resumed"]) {
  63 |       await expect(page.getByRole("button", { name: chip })).toBeVisible();
  64 |     }
  65 | 
  66 |     // The lifecycle entries render with their raw actions.
  67 |     await expect(page.getByText("challenge.phase_passed")).toBeVisible({ timeout: 15_000 });
  68 |     await expect(page.getByText("challenge.funded")).toBeVisible();
  69 |     await expect(page.getByText("challenge.violated")).toBeVisible();
  70 |     await expect(page.getByText("challenge.expired")).toBeVisible();
  71 | 
  72 |     // The purchase label is surfaced on the entries (DetailsLine rendering).
  73 |     await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  74 | 
  75 |     // Tapping a chip filters the list to exactly that lifecycle action.
  76 |     await page.getByRole("button", { name: "Violated" }).click();
  77 |     await expect(page.getByText("challenge.violated")).toBeVisible();
  78 |     await expect(page.getByText("challenge.funded", { exact: true })).toHaveCount(0, { timeout: 15_000 });
  79 | 
  80 |     await page.getByRole("button", { name: "Phase Passed" }).click();
  81 |     await expect(page.getByText("challenge.phase_passed")).toBeVisible();
  82 |     await expect(page.getByText("challenge.violated", { exact: true })).toHaveCount(0, { timeout: 15_000 });
  83 |   });
  84 | });
  85 | 
```