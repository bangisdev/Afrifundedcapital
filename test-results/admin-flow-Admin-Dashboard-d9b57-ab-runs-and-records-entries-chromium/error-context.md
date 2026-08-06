# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-flow.spec.ts >> Admin Dashboard E2E Flow >> 8. MT5 Manager >> reconciliation tab runs and records entries
- Location: e2e/admin-flow.spec.ts:402:5

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('body')
Timeout: 25000ms
Expected pattern: /Reconciliation: \d+ checked/
Received string:  "
  AfriFundedCapitalDashboardUsersChallengesPaymentsPayoutsKYCAffiliatesCouponsSupportCertificatesMT5NotificationsReportsAudit LogsSettingsSign OutAdmin11Toggle themeSuper AdminMT5 ManagerProvision accounts, monitor the gateway, retry queue, and reconciliation Create AccountSimulated ProviderNo gateway configured — sync uses simulated data. Configure below to go live.0 queued0 failedLast reconcile: 8/5/2026, 7:08:43 PM Accounts Connector Retry Queue  Reconciliation14Total Accounts14Active0Suspended$138,160.91Combined BalanceAll StatusActiveSuspendedInactive#AFC925205AfriFundedCapital-Demo · Super AdminBalance: $5,000Active#AFC822026AfriFundedCapital-Demo · Super AdminBalance: $5,000Active#AFC305283AfriFundedCapital-Demo · Super AdminBalance: $6,921.85Active#AFC220592AfriFundedCapital-Demo · Super AdminBalance: $4,998.58Active#AFC972235AfriFundedCapital-Demo · Super AdminBalance: $3,680.88Active#AFC995047AfriFundedCapital-Demo · Super AdminBalance: $4,971.2Active#AFC-100009AfriFundedCapital-Demo · Super AdminBalance: $10,000Active#AFC-200009AfriFundedCapital-Demo · Super AdminBalance: $25,000Active#AFC-300009AfriFundedCapital-Demo · Super AdminBalance: $50,000Active#AFC155608AfriFundedCapital-Demo · Shamsiya MagajiBalance: $5,000ActiveShowing 10 of 14 accounts · Page 1 of 210 / page25 / page50 / page Prev1 / 2Next·······
"

Call log:
  - Expect "toContainText" with timeout 25000ms
  - waiting for locator('body')
    - locator resolved to <body>…</body>
    - unexpected value "
  AfriFundedCapitalDashboardUsersChallengesPaymentsPayoutsKYCAffiliatesCouponsSupportCertificatesMT5NotificationsReportsAudit LogsSettingsSign OutAdmin11Toggle themeSuper AdminMT5 ManagerProvision accounts, monitor the gateway, retry queue, and reconciliationSimulated ProviderNo gateway configured — sync uses simulated data. Configure below to go live.0 queued0 failedLast reconcile: 8/5/2026, 1:56:18 PM Accounts Connector Retry Queue  ReconciliationReconciliationLast run: 8/5/2026, 1:56:18 PM · 18 entries recordedRun Reconciliationmatched#AFC305283 · diff +0server $5,000 vs local $5,000 · simulated8/5/2026, 1:56:18 PMmatched#AFC220592 · diff +0server $5,000 vs local $5,000 · simulated8/5/2026, 1:56:18 PMmatched#AFC995047 · diff +0server $4,971.2 vs local $4,971.2 · simulated8/5/2026, 1:56:18 PMmatched#AFC155608 · diff +0server $5,000 vs local $5,000 · simulated8/5/2026, 1:56:18 PMmatched#AFC768149 · diff +0server $4,955.83 vs local $4,955.83 · simulated8/5/2026, 1:56:18 PMmatched#AFC172799 · diff +0server $4,946.53 vs local $4,946.53 · simulated8/5/2026, 1:56:18 PMmatched#AFC125335 · diff +0server $5,000 vs local $5,000 · simulated8/5/2026, 1:56:18 PMmatched#AFC972235 · diff +0server $5,000 vs local $5,000 · simulated8/5/2026, 1:12:49 PMmatched#AFC995047 · diff +0server $5,000 vs local $5,000 · simulated8/5/2026, 1:12:49 PMmatched#AFC155608 · diff +0server $5,000 vs local $5,000 · simulated8/5/2026, 1:12:49 PMmatched#AFC768149 · diff +0server $4,985.09 vs local $4,985.09 · simulated8/5/2026, 1:12:49 PMmatched#AFC172799 · diff +0server $4,969.92 vs local $4,969.92 · simulated8/5/2026, 1:12:49 PMmatched#AFC125335 · diff +0server $5,000 vs local $5,000 · simulated8/5/2026, 1:12:49 PMmatched#AFC995047 · diff +0server $5,000 vs local $5,000 · simulated8/5/2026, 1:06:31 PMmatched#AFC155608 · diff +0server $5,000 vs local $5,000 · simulated8/5/2026, 1:06:31 PMmatched#AFC768149 · diff +0server $4,985.09 vs local $4,985.09 · simulated8/5/2026, 1:06:31 PMmatched#AFC172799 · diff +0server $4,969.92 vs local $4,969.92 · simulated8/5/2026, 1:06:31 PMmatched#AFC125335 · diff +0server $5,000 vs local $5,000 · simulated8/5/2026, 1:06:31 PM
  



"
    - waiting for "http://localhost:5173/admin/mt5" navigation to finish...
    - navigated to "http://localhost:5173/admin/mt5"
    2 × locator resolved to <body>…</body>
      - unexpected value "
  
  



"
    2 × locator resolved to <body>…</body>
      - unexpected value "
  Loading…
  



"
    47 × locator resolved to <body>…</body>
       - unexpected value "
  AfriFundedCapitalDashboardUsersChallengesPaymentsPayoutsKYCAffiliatesCouponsSupportCertificatesMT5NotificationsReportsAudit LogsSettingsSign OutAdmin11Toggle themeSuper AdminMT5 ManagerProvision accounts, monitor the gateway, retry queue, and reconciliation Create AccountSimulated ProviderNo gateway configured — sync uses simulated data. Configure below to go live.0 queued0 failedLast reconcile: 8/5/2026, 7:08:43 PM Accounts Connector Retry Queue  Reconciliation14Total Accounts14Active0Suspended$138,160.91Combined BalanceAll StatusActiveSuspendedInactive#AFC925205AfriFundedCapital-Demo · Super AdminBalance: $5,000Active#AFC822026AfriFundedCapital-Demo · Super AdminBalance: $5,000Active#AFC305283AfriFundedCapital-Demo · Super AdminBalance: $6,921.85Active#AFC220592AfriFundedCapital-Demo · Super AdminBalance: $4,998.58Active#AFC972235AfriFundedCapital-Demo · Super AdminBalance: $3,680.88Active#AFC995047AfriFundedCapital-Demo · Super AdminBalance: $4,971.2Active#AFC-100009AfriFundedCapital-Demo · Super AdminBalance: $10,000Active#AFC-200009AfriFundedCapital-Demo · Super AdminBalance: $25,000Active#AFC-300009AfriFundedCapital-Demo · Super AdminBalance: $50,000Active#AFC155608AfriFundedCapital-Demo · Shamsiya MagajiBalance: $5,000ActiveShowing 10 of 14 accounts · Page 1 of 210 / page25 / page50 / page Prev1 / 2Next 
  



"

```

```yaml
- complementary:
  - text: AfriFundedCapital
  - button
  - navigation:
    - button "Dashboard"
    - button "Users"
    - button "Challenges"
    - button "Payments"
    - button "Payouts"
    - button "KYC"
    - button "Affiliates"
    - button "Coupons"
    - button "Support"
    - button "Certificates"
    - button "MT5"
    - button "Notifications"
    - button "Reports"
    - button "Audit Logs"
    - button "Settings"
  - button "Sign Out"
- banner:
  - button "Admin"
  - button "11"
  - button "Toggle theme"
  - text: Super Admin
- main:
  - heading "MT5 Manager" [level=1]
  - paragraph: Provision accounts, monitor the gateway, retry queue, and reconciliation
  - button "Create Account"
  - text: "Simulated Provider No gateway configured — sync uses simulated data. Configure below to go live. 0 queued 0 failed Last reconcile: 8/5/2026, 7:08:43 PM"
  - tablist:
    - tab "Accounts" [selected]
    - tab "Connector"
    - tab "Retry Queue"
    - tab "Reconciliation"
  - tabpanel "Accounts":
    - text: 14 Total Accounts 14 Active 0 Suspended $138,160.91 Combined Balance
    - textbox "Search by login, server, user name, or email..."
    - combobox:
      - option "All Status" [selected]
      - option "Active"
      - option "Suspended"
      - option "Inactive"
    - text: "#AFC925205 AfriFundedCapital-Demo · Super Admin Balance: $5,000 Active #AFC822026 AfriFundedCapital-Demo · Super Admin Balance: $5,000 Active #AFC305283 AfriFundedCapital-Demo · Super Admin Balance: $6,921.85 Active #AFC220592 AfriFundedCapital-Demo · Super Admin Balance: $4,998.58 Active #AFC972235 AfriFundedCapital-Demo · Super Admin Balance: $3,680.88 Active #AFC995047 AfriFundedCapital-Demo · Super Admin Balance: $4,971.2 Active #AFC-100009 AfriFundedCapital-Demo · Super Admin Balance: $10,000 Active #AFC-200009 AfriFundedCapital-Demo · Super Admin Balance: $25,000 Active #AFC-300009 AfriFundedCapital-Demo · Super Admin Balance: $50,000 Active #AFC155608 AfriFundedCapital-Demo · Shamsiya Magaji Balance: $5,000 Active Showing 10 of 14 accounts · Page 1 of 2"
    - combobox "Rows per page":
      - option "10 / page" [selected]
      - option "25 / page"
      - option "50 / page"
    - button "Prev" [disabled]
    - text: 1 / 2
    - button "Next"
- region "Notifications alt+T"
```

# Test source

```ts
  311 | 
  312 |     test("renders landing page on a mobile viewport", async ({ page }) => {
  313 |       const ready = await warmUp(page, "/");
  314 |       expect(ready).toBeTruthy();
  315 |       const text = await page.textContent("body");
  316 |       expect(text?.length).toBeGreaterThan(100);
  317 |     });
  318 | 
  319 |     test("renders auth page on a mobile viewport", async ({ page }) => {
  320 |       await warmUp(page, "/auth");
  321 |       await waitForAppReady(page);
  322 |       await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 30_000 });
  323 |       await expect(page.locator('button[type="submit"]').first()).toBeVisible();
  324 |     });
  325 |   });
  326 | 
  327 |   // ─── 8. MT5 Manager (admin) ──────────────────────────
  328 |   test.describe("8. MT5 Manager", () => {
  329 |     test.beforeEach(async ({ page }) => {
  330 |       await signInAsAdmin(page);
  331 |     });
  332 | 
  333 |     test("navigates to the MT5 manager page", async ({ page }) => {
  334 |       await warmUp(page, "/admin");
  335 |       await waitForAppReady(page);
  336 |       const nav = page.locator("aside nav");
  337 |       await nav.locator("button", { hasText: "MT5" }).first().click();
  338 |       await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("/admin/mt5");
  339 |       await expect(page.getByRole("heading", { name: "MT5 Manager" })).toBeVisible({ timeout: 20_000 });
  340 |     });
  341 | 
  342 |     test("shows the provider status banner", async ({ page }) => {
  343 |       await warmUp(page, "/admin/mt5");
  344 |       await waitForAppReady(page);
  345 |       // No gateway is configured in the e2e env, so the simulated provider is
  346 |       // active and the banner surfaces queue/reconciliation counts.
  347 |       await expect(page.locator("body")).toContainText(/Simulated Provider|Live MT5 Gateway/, {
  348 |         timeout: 20_000,
  349 |       });
  350 |       await expect(page.locator("body")).toContainText(/queued|failed|No reconciliation yet/, {
  351 |         timeout: 20_000,
  352 |       });
  353 |     });
  354 | 
  355 |     test("displays account stat cards and account rows", async ({ page }) => {
  356 |       await warmUp(page, "/admin/mt5");
  357 |       await waitForAppReady(page);
  358 |       await expect(page.locator("body")).toContainText(/Total Accounts|Active|Suspended|Combined Balance/, {
  359 |         timeout: 20_000,
  360 |       });
  361 |       // Bulk seed provisions funded MT5 accounts for the admin (logins start
  362 |       // with "AFC"), so rows render — or the empty state if seeding was skipped.
  363 |       await expect(page.locator("body")).toContainText(/#AFC|No MT5 accounts found/, {
  364 |         timeout: 20_000,
  365 |       });
  366 |       const search = page.locator('input[placeholder*="Search"]').first();
  367 |       await expect(search).toBeVisible({ timeout: 20_000 });
  368 |     });
  369 | 
  370 |     test("connector tab reports gateway status and runs a test connection", async ({ page }) => {
  371 |       await warmUp(page, "/admin/mt5");
  372 |       await waitForAppReady(page);
  373 |       await page.getByRole("tab", { name: /Connector/ }).click();
  374 |       await expect(page.locator("body")).toContainText(/Gateway Status|Not configured|Configured/, {
  375 |         timeout: 20_000,
  376 |       });
  377 |       await page.getByRole("button", { name: /Test Connection/ }).click();
  378 |       // The simulated provider answers with ok:true and a message that names
  379 |       // the simulated fallback — proof the button round-trips to the server.
  380 |       await expect(page.locator("body")).toContainText(/No MT5 gateway configured/, {
  381 |         timeout: 20_000,
  382 |       });
  383 |     });
  384 | 
  385 |     test("retry queue tab shows stats and controls", async ({ page }) => {
  386 |       await warmUp(page, "/admin/mt5");
  387 |       await waitForAppReady(page);
  388 |       await page.getByRole("tab", { name: /Retry Queue/ }).click();
  389 |       await expect(page.locator("body")).toContainText(/Pending|Done|Failed|Total Jobs/, {
  390 |         timeout: 20_000,
  391 |       });
  392 |       await expect(page.getByRole("button", { name: /Process Queue Now/ })).toBeVisible({
  393 |         timeout: 20_000,
  394 |       });
  395 |       await expect(page.getByRole("button", { name: /Retry All Failed/ })).toBeVisible();
  396 |       // Queue is empty on a fresh seed; jobs render once syncs have failed.
  397 |       await expect(page.locator("body")).toContainText(/Queue is empty|Attempts:/, {
  398 |         timeout: 20_000,
  399 |       });
  400 |     });
  401 | 
  402 |     test("reconciliation tab runs and records entries", async ({ page }) => {
  403 |       await warmUp(page, "/admin/mt5");
  404 |       await waitForAppReady(page);
  405 |       await page.getByRole("tab", { name: /Reconciliation/ }).click();
  406 |       await expect(page.getByRole("button", { name: /Run Reconciliation/ })).toBeVisible({
  407 |         timeout: 20_000,
  408 |       });
  409 |       await page.getByRole("button", { name: /Run Reconciliation/ }).click();
  410 |       // The run POSTs to the server; the summary toast is the server's response.
> 411 |       await expect(page.locator("body")).toContainText(/Reconciliation: \d+ checked/, {
      |                                          ^ Error: expect(locator).toContainText(expected) failed
  412 |         timeout: 25_000,
  413 |       });
  414 |       // The mutation now invalidates only the reconciliation + status queries,
  415 |       // but re-opening the tab keeps the assertion robust against any Vite
  416 |       // dev-server reload resetting the SPA mid-run.
  417 |       await page.getByRole("tab", { name: /Reconciliation/ }).click();
  418 |       await expect(page.locator("body")).toContainText(
  419 |         /matched|mismatch|No reconciliation entries yet/,
  420 |         { timeout: 25_000 },
  421 |       );
  422 |     });
  423 |   });
  424 | 
  425 |   // ─── 9. Trading metrics (client dashboard) ───────────
  426 |   test.describe("9. Trading metrics", () => {
  427 |     test.beforeEach(async ({ page }) => {
  428 |       await signInAsAdmin(page);
  429 |     });
  430 | 
  431 |     test("loads the trading page with metric cards", async ({ page }) => {
  432 |       await warmUp(page, "/dashboard/trading");
  433 |       await waitForAppReady(page);
  434 |       await expect(page.getByRole("heading", { name: "Trading" })).toBeVisible({ timeout: 20_000 });
  435 |       await expect(page.locator("body")).toContainText(
  436 |         /Total Balance|Total Equity|Active Challenges|MT5 Accounts/,
  437 |         { timeout: 20_000 },
  438 |       );
  439 |       await expect(page.getByRole("button", { name: /Sync Now/ })).toBeVisible();
  440 |     });
  441 | 
  442 |     test("shows MT5 account cards with balances", async ({ page }) => {
  443 |       await warmUp(page, "/dashboard/trading");
  444 |       await waitForAppReady(page);
  445 |       // Seeded funded accounts render as cards with balance/equity/leverage.
  446 |       await expect(page.locator("body")).toContainText(/Account #|No MT5 accounts yet/, {
  447 |         timeout: 20_000,
  448 |       });
  449 |       await expect(page.locator("body")).toContainText(/Balance|Equity|Leverage/, {
  450 |         timeout: 20_000,
  451 |       });
  452 |     });
  453 | 
  454 |     test("offers demo data generation when no metrics are recorded", async ({ page }) => {
  455 |       await warmUp(page, "/dashboard/trading");
  456 |       await waitForAppReady(page);
  457 |       // Either the metrics empty-state with its generator is shown, or charts
  458 |       // render if demo data was already seeded by a previous run.
  459 |       await expect(page.locator("body")).toContainText(
  460 |         /No trading metrics recorded yet|Performance Charts/,
  461 |         { timeout: 25_000 },
  462 |       );
  463 |       const generate = page.getByRole("button", { name: /Generate Demo Data/ });
  464 |       if (await generate.isVisible().catch(() => false)) {
  465 |         await generate.click();
  466 |         // Seeding fires a toast + confirmation line under the button.
  467 |         await expect(page.locator("body")).toContainText(/Demo data generated|Generating/, {
  468 |           timeout: 25_000,
  469 |         });
  470 |       }
  471 |     });
  472 |   });
  473 | });
  474 | 
```