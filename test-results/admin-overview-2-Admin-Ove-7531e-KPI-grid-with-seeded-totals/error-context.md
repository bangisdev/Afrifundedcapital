# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-overview.spec.ts >> 2. Admin Overview >> renders the KPI grid with seeded totals
- Location: e2e/admin-overview.spec.ts:12:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Admin Overview' })
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByRole('heading', { name: 'Admin Overview' })
    - waiting for "http://localhost:5174/admin" navigation to finish...
    - navigated to "http://localhost:5174/admin"

```

# Page snapshot

```yaml
- generic [ref=f1e2]:
  - generic [ref=f1e3]:
    - complementary [ref=f1e4]:
      - generic [ref=f1e5]:
        - generic [ref=f1e6]: AfriFundedCapital
        - button [ref=f1e7] [cursor=pointer]
      - navigation [ref=f1e8]:
        - button "Dashboard" [ref=f1e9] [cursor=pointer]
        - button "Users" [ref=f1e16] [cursor=pointer]
        - button "Challenges" [ref=f1e23] [cursor=pointer]
        - button "Payments" [ref=f1e27] [cursor=pointer]
        - button "Payouts" [ref=f1e32] [cursor=pointer]
        - button "KYC" [ref=f1e36] [cursor=pointer]
        - button "Affiliates" [ref=f1e40] [cursor=pointer]
        - button "Coupons" [ref=f1e46] [cursor=pointer]
        - button "Support" [ref=f1e52] [cursor=pointer]
        - button "Certificates" [ref=f1e56] [cursor=pointer]
        - button "MT5" [ref=f1e61] [cursor=pointer]
        - button "Notifications" [ref=f1e66] [cursor=pointer]
        - button "Reports" [ref=f1e71] [cursor=pointer]
        - button "Audit Logs" [ref=f1e76] [cursor=pointer]
        - button "Settings" [ref=f1e80] [cursor=pointer]
      - button "Sign Out" [ref=f1e86] [cursor=pointer]
    - generic [ref=f1e91]:
      - banner [ref=f1e92]:
        - button "Admin" [ref=f1e94] [cursor=pointer]
        - generic [ref=f1e95]:
          - button [ref=f1e97] [cursor=pointer]
          - button "Toggle theme" [ref=f1e98] [cursor=pointer]
          - generic [ref=f1e100]: Super Admin
      - main [ref=f1e101]:
        - generic [ref=f1e102]:
          - generic [ref=f1e103]:
            - generic [ref=f1e104]:
              - heading "Admin Overview" [level=1] [ref=f1e105]
              - paragraph [ref=f1e106]: Platform statistics and analytics
            - button "Seed All Demo Data" [ref=f1e107] [cursor=pointer]
          - generic [ref=f1e108]:
            - generic [ref=f1e109]:
              - generic [ref=f1e110]: Total Users
              - generic [ref=f1e118]: "0"
            - generic [ref=f1e119]:
              - generic [ref=f1e120]: Total Challenges
              - generic [ref=f1e125]: "0"
            - generic [ref=f1e126]:
              - generic [ref=f1e127]: Revenue
              - generic [ref=f1e132]: ₦0
            - generic [ref=f1e133]:
              - generic [ref=f1e134]: Active Challenges
              - generic [ref=f1e140]: "0"
          - generic [ref=f1e141]:
            - generic [ref=f1e142]:
              - generic [ref=f1e143]: Funded Accounts
              - generic [ref=f1e149]: "0"
            - generic [ref=f1e150]:
              - generic [ref=f1e151]: Completed Payments
              - generic [ref=f1e156]: "0"
            - generic [ref=f1e157]:
              - generic [ref=f1e158]: Total Paid Out
              - generic [ref=f1e164]: ₦0
            - generic [ref=f1e165]:
              - generic [ref=f1e166]: Pending Payouts
              - generic [ref=f1e171]: "0"
  - region "Notifications alt+T"
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import { ensureSeeded, signInAdminFast } from "./helpers";
  3  | 
  4  | // ═══════════════════════════════════════════════════════════════
  5  | // 2. Admin Overview — KPI grid against seeded data
  6  | // ═══════════════════════════════════════════════════════════════
  7  | test.describe("2. Admin Overview", () => {
  8  |   test.beforeAll(async ({ request }) => {
  9  |     await ensureSeeded(request);
  10 |   });
  11 | 
  12 |   test("renders the KPI grid with seeded totals", async ({ page, request }) => {
  13 |     await signInAdminFast(page, request);
> 14 |     await expect(page.getByRole("heading", { name: "Admin Overview" })).toBeVisible();
     |                                                                         ^ Error: expect(locator).toBeVisible() failed
  15 |     await expect(page.getByText("Platform statistics and analytics")).toBeVisible();
  16 | 
  17 |     for (const label of ["Total Users", "Total Challenges", "Revenue", "Total Paid Out"]) {
  18 |       await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  19 |     }
  20 |   });
  21 | 
  22 |   test("the overview reflects the seeded demo users", async ({ page, request }) => {
  23 |     await signInAdminFast(page, request);
  24 |     // The "Total Users" stat card should show at least the admin + 8 demo users.
  25 |     await expect(page.getByText("Total Users").first()).toBeVisible();
  26 |     const card = page.locator("div").filter({ hasText: /^Total Users/ }).first();
  27 |     await expect(card).toContainText(/\d+/);
  28 |   });
  29 | });
  30 | 
```