# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-flow.spec.ts >> Admin Dashboard E2E Flow >> 7. Responsive viewports >> renders landing page on a mobile viewport
- Location: e2e/admin-flow.spec.ts:335:5

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 100
Received:   10
```

# Test source

```ts
  239 |       await waitForAppReady(page);
  240 |       const search = page.locator('input[placeholder*="Search"]').first();
  241 |       await expect(search).toBeVisible({ timeout: 20_000 });
  242 |     });
  243 | 
  244 |     test("shows user rows or an empty state", async ({ page }) => {
  245 |       await warmUp(page, "/admin/users");
  246 |       await waitForAppReady(page);
  247 |       // Seeded demo users have emails in their rows; an empty table shows the
  248 |       // "No users found" placeholder instead. Auto-retries past the spinner.
  249 |       await expect(page.locator("body")).toContainText(/@|No users found/, { timeout: 20_000 });
  250 |     });
  251 |   });
  252 | 
  253 |   // ─── 4. Challenges ────────────────────────────────────
  254 |   test.describe("4. Challenges", () => {
  255 |     test.describe.configure({ mode: "serial" });
  256 |     test.beforeEach(async ({ page }) => {
  257 |       await signInAsAdmin(page);
  258 |     });
  259 | 
  260 |     test("loads the challenges management page", async ({ page }) => {
  261 |       await warmUp(page, "/admin/challenges");
  262 |       await waitForAppReady(page);
  263 |       await expect(page.getByRole("heading", { name: "Challenge Management" })).toBeVisible({
  264 |         timeout: 20_000,
  265 |       });
  266 |     });
  267 | 
  268 |     test("lists challenge templates", async ({ page }) => {
  269 |       await warmUp(page, "/admin/challenges");
  270 |       await waitForAppReady(page);
  271 |       await expect(page.locator("body")).toContainText(
  272 |         /Two-Step|One-Step|Instant Funding|No challenges/,
  273 |         { timeout: 20_000 },
  274 |       );
  275 |     });
  276 |   });
  277 | 
  278 |   // ─── 5. Payments ──────────────────────────────────────
  279 |   test.describe("5. Payments", () => {
  280 |     test.describe.configure({ mode: "serial" });
  281 |     test.beforeEach(async ({ page }) => {
  282 |       await signInAsAdmin(page);
  283 |     });
  284 | 
  285 |     test("loads the payments page", async ({ page }) => {
  286 |       await warmUp(page, "/admin/payments");
  287 |       await waitForAppReady(page);
  288 |       await expect(page.getByRole("heading", { name: /Payments/i })).toBeVisible({
  289 |         timeout: 20_000,
  290 |       });
  291 |     });
  292 | 
  293 |     test("shows payments search input", async ({ page }) => {
  294 |       await warmUp(page, "/admin/payments");
  295 |       await waitForAppReady(page);
  296 |       const search = page.locator('input[placeholder*="Search"]').first();
  297 |       await expect(search).toBeVisible({ timeout: 20_000 });
  298 |     });
  299 |   });
  300 | 
  301 |   // ─── 6. Cross-page navigation ─────────────────────────
  302 |   test.describe("6. Cross-page navigation", () => {
  303 |     test.describe.configure({ mode: "serial" });
  304 |     test.beforeEach(async ({ page }) => {
  305 |       await signInAsAdmin(page);
  306 |     });
  307 | 
  308 |     test("navigates between admin sections via the sidebar", async ({ page }) => {
  309 |       await warmUp(page, "/admin");
  310 |       await waitForAppReady(page);
  311 |       const nav = page.locator("aside nav");
  312 | 
  313 |       await nav.locator("button", { hasText: "Users" }).first().click();
  314 |       await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("/admin/users");
  315 | 
  316 |       await nav.locator("button", { hasText: "Payments" }).first().click();
  317 |       await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("/admin/payments");
  318 | 
  319 |       await nav.locator("button", { hasText: "KYC" }).first().click();
  320 |       await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("/admin/kyc");
  321 | 
  322 |       await nav.locator("button", { hasText: "Dashboard" }).first().click();
  323 |       await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("/admin");
  324 |       await expect(page.locator("body")).toContainText(/Admin Overview|Total Users/, {
  325 |         timeout: 20_000,
  326 |       });
  327 |     });
  328 |   });
  329 | 
  330 |   // ─── 7. Responsive viewports ──────────────────────────
  331 |   test.describe("7. Responsive viewports", () => {
  332 |     test.describe.configure({ mode: "serial" });
  333 |     test.use({ viewport: { width: 390, height: 844 } });
  334 | 
  335 |     test("renders landing page on a mobile viewport", async ({ page }) => {
  336 |       const ready = await warmUp(page, "/");
  337 |       expect(ready).toBeTruthy();
  338 |       const text = await page.textContent("body");
> 339 |       expect(text?.length).toBeGreaterThan(100);
      |                            ^ Error: expect(received).toBeGreaterThan(expected)
  340 |     });
  341 | 
  342 |     test("renders auth page on a mobile viewport", async ({ page }) => {
  343 |       await warmUp(page, "/auth");
  344 |       await waitForAppReady(page);
  345 |       await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 30_000 });
  346 |       await expect(page.locator('button[type="submit"]').first()).toBeVisible();
  347 |     });
  348 |   });
  349 | 
  350 |   // ─── 8. MT5 Manager (admin) ──────────────────────────
  351 |   test.describe("8. MT5 Manager", () => {
  352 |     test.beforeEach(async ({ page }) => {
  353 |       await signInAsAdmin(page);
  354 |     });
  355 | 
  356 |     test("navigates to the MT5 manager page", async ({ page }) => {
  357 |       await warmUp(page, "/admin");
  358 |       await waitForAppReady(page);
  359 |       const nav = page.locator("aside nav");
  360 |       await nav.locator("button", { hasText: "MT5" }).first().click();
  361 |       await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("/admin/mt5");
  362 |       await expect(page.getByRole("heading", { name: "MT5 Manager" })).toBeVisible({ timeout: 20_000 });
  363 |     });
  364 | 
  365 |     test("shows the provider status banner", async ({ page }) => {
  366 |       await warmUp(page, "/admin/mt5");
  367 |       await waitForAppReady(page);
  368 |       // No gateway is configured in the e2e env, so the simulated provider is
  369 |       // active and the banner surfaces queue/reconciliation counts.
  370 |       await expect(page.locator("body")).toContainText(/Simulated Provider|Live MT5 Gateway/, {
  371 |         timeout: 20_000,
  372 |       });
  373 |       await expect(page.locator("body")).toContainText(/queued|failed|No reconciliation yet/, {
  374 |         timeout: 20_000,
  375 |       });
  376 |     });
  377 | 
  378 |     test("displays account stat cards and account rows", async ({ page }) => {
  379 |       await warmUp(page, "/admin/mt5");
  380 |       await waitForAppReady(page);
  381 |       await expect(page.locator("body")).toContainText(/Total Accounts|Active|Suspended|Combined Balance/, {
  382 |         timeout: 20_000,
  383 |       });
  384 |       // Bulk seed provisions funded MT5 accounts for the admin (logins start
  385 |       // with "AFC"), so rows render — or the empty state if seeding was skipped.
  386 |       await expect(page.locator("body")).toContainText(/#AFC|No MT5 accounts found/, {
  387 |         timeout: 20_000,
  388 |       });
  389 |       const search = page.locator('input[placeholder*="Search"]').first();
  390 |       await expect(search).toBeVisible({ timeout: 20_000 });
  391 |     });
  392 | 
  393 |     test("connector tab reports gateway status and runs a test connection", async ({ page }) => {
  394 |       await warmUp(page, "/admin/mt5");
  395 |       await waitForAppReady(page);
  396 |       await page.getByRole("tab", { name: /Connector/ }).click();
  397 |       await expect(page.locator("body")).toContainText(/Gateway Status|Not configured|Configured/, {
  398 |         timeout: 20_000,
  399 |       });
  400 |       await page.getByRole("button", { name: /Test Connection/ }).click();
  401 |       // The simulated provider answers with ok:true and a message that names
  402 |       // the simulated fallback — proof the button round-trips to the server.
  403 |       await expect(page.locator("body")).toContainText(/No MT5 gateway configured/, {
  404 |         timeout: 20_000,
  405 |       });
  406 |     });
  407 | 
  408 |     test("retry queue tab shows stats and controls", async ({ page }) => {
  409 |       await warmUp(page, "/admin/mt5");
  410 |       await waitForAppReady(page);
  411 |       await page.getByRole("tab", { name: /Retry Queue/ }).click();
  412 |       await expect(page.locator("body")).toContainText(/Pending|Done|Failed|Total Jobs/, {
  413 |         timeout: 20_000,
  414 |       });
  415 |       await expect(page.getByRole("button", { name: /Process Queue Now/ })).toBeVisible({
  416 |         timeout: 20_000,
  417 |       });
  418 |       await expect(page.getByRole("button", { name: /Retry All Failed/ })).toBeVisible();
  419 |       // Queue is empty on a fresh seed; jobs render once syncs have failed.
  420 |       await expect(page.locator("body")).toContainText(/Queue is empty|Attempts:/, {
  421 |         timeout: 20_000,
  422 |       });
  423 |     });
  424 | 
  425 |     test("reconciliation tab runs and records entries", async ({ page }) => {
  426 |       await warmUp(page, "/admin/mt5");
  427 |       await waitForAppReady(page);
  428 |       await page.getByRole("tab", { name: /Reconciliation/ }).click();
  429 |       await expect(page.getByRole("button", { name: /Run Reconciliation/ })).toBeVisible({
  430 |         timeout: 20_000,
  431 |       });
  432 |       await page.getByRole("button", { name: /Run Reconciliation/ }).click();
  433 |       // The run POSTs to the server; the summary toast is the server's response.
  434 |       await expect(page.locator("body")).toContainText(/Reconciliation: \d+ checked/, {
  435 |         timeout: 25_000,
  436 |       });
  437 |       // The mutation now invalidates only the reconciliation + status queries,
  438 |       // but re-opening the tab keeps the assertion robust against any Vite
  439 |       // dev-server reload resetting the SPA mid-run.
```