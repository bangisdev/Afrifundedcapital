/**
 * AfriFundedCapital — Admin Flow E2E suite.
 *
 * Drives the real UI in Chromium: landing → auth → admin overview → user
 * management → challenges → payments → cross-page navigation → responsive
 * viewports → MT5 manager (accounts, connector, retry queue, reconciliation)
 * → client trading metrics → MT5 background scheduler (retry-queue drain +
 * daily sync pass firing on their own).
 *
 * How it runs:
 *   - `playwright.config.ts` auto-boots `bun run dev` (with `E2E_TESTING=1`,
 *     which disables the auth rate limiter / account lockout for the run) and
 *     reuses an already-listening server on the port when one exists.
 *   - `e2e/global-setup.ts` seeds the super admin + demo data once per run.
 *   - The suite signs in through the real `/auth` page so it exercises the
 *     app's actual password auth flow.
 *
 * Run locally:            bun test:e2e
 * Point at a server:      PLAYWRIGHT_BASE_URL=http://localhost:5173 bun test:e2e
 * Single section:         bun test:e2e -- --grep "3. User Management"
 * Per-section presets:    bun run test:e2e:<section> — one preset per numbered
 *                         section (auth, overview, users, challenges, payments,
 *                         nav, responsive, mt5, trading, scheduler, audit), so
 *                         CI can run each chunk under its own shorter timeout.
 * CI:                     .github/workflows/e2e-matrix.yml runs the 11 presets
 *                         as a parallel GitHub Actions matrix, one job per
 *                         chunk, each with its own timeout-minutes budget. The
 *                         heavy chunks (mt5, scheduler, audit) are sharded x 2
 *                         (--shard=1/2, 2/2) so each half runs on its own
 *                         runner — the config needs fullyParallel: true for
 *                         per-test sharding; workers stays 1, so every
 *                         single-shard run is still deterministic.
 */
import { test, expect, type Page } from "@playwright/test";

// ─── Config ───────────────────────────────────────────────
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@afrifundedcapital.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "Admin@123456";
const WARMUP_RETRIES = 5;
const WARMUP_DELAY_MS = 5_000;
// Hard ceiling for a single warmUp call so a bad server state fails the test
// fast instead of spinning until the test-level timeout.
const WARMUP_MAX_MS = 40_000;

// ─── Helpers ──────────────────────────────────────────────

/** Wait for the app to be interactive — retries on slow cold starts. */
async function waitForAppReady(page: Page) {
  try {
    await page.waitForFunction(
      () => {
        const body = document.body?.textContent || "";
        const hasLoading =
          body.includes("Loading application") ||
          body.includes("Step 4 of 4") ||
          body.includes("taking longer than usual");
        const hasInteractive =
          document.querySelectorAll("input, button, h1, h2, a[href]").length > 2;
        return hasInteractive || (!hasLoading && body.length > 200);
      },
      { timeout: 15_000 },
    );
  } catch {
    // The app may still be starting up — give it more time.
    await page.waitForTimeout(5_000);
  }
}

/**
 * Navigate to a page with retry logic for cold starts.
 *
 * Two failure modes are tolerated as "not ready yet":
 *  1. The navigation itself aborts (`net::ERR_ABORTED`) — Vite dependency
 *     discovery can trigger a full-page reload that cancels an in-flight
 *     `page.goto`.
 *  2. The page is still showing a loading screen.
 *
 * A page counts as ready when it is not showing a loading screen AND either
 * has real interactive elements (inputs/buttons/links) or a sizeable body.
 */
async function warmUp(page: Page, path: string): Promise<boolean> {
  const deadline = Date.now() + WARMUP_MAX_MS;
  for (let attempt = 0; attempt < WARMUP_RETRIES && Date.now() < deadline; attempt++) {
    if (page.isClosed()) return false;
    try {
      await page.goto(path, { waitUntil: "domcontentloaded", timeout: 15_000 });
    } catch {
      // Cold-start full reload aborted the navigation — retry.
      if (page.isClosed()) return false;
      await page.waitForTimeout(WARMUP_DELAY_MS);
      continue;
    }
    if (page.isClosed()) return false;
    await page.waitForTimeout(2_000);
    if (page.isClosed()) return false;
    const body = await page.textContent("body").catch(() => "");
    const interactive = await page
      .locator("input, button, a[href], select, textarea")
      .count()
      .catch(() => 0);
    const isReady =
      !!body &&
      !body.includes("taking longer than usual") &&
      !body.includes("Loading application") &&
      (body.length > 200 || interactive > 0);
    if (isReady) return true;
    await page.waitForTimeout(WARMUP_DELAY_MS);
  }
  return false;
}

/** Sign in as admin through the real /auth page. */
async function signInAsAdmin(page: Page) {
  // A Vite cold-start full reload can wipe the form between fill and click,
  // which would silently leave the app on /auth. Retry the whole sign-in a
  // few times; each attempt re-warms the page so the inputs exist.
  const deadline = Date.now() + 90_000;
  for (let attempt = 0; attempt < 4 && Date.now() < deadline; attempt++) {
    const ready = await warmUp(page, "/auth");
    if (!ready) {
      await page.goto("/auth").catch(() => {});
      await page.waitForTimeout(10_000);
    }
    await waitForAppReady(page);

    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.waitFor({ state: "visible", timeout: 30_000 }).catch(() => null);
    const passwordInput = page.locator('input[type="password"]').first();
    await emailInput.fill(ADMIN_EMAIL).catch(() => {});
    await passwordInput.fill(ADMIN_PASSWORD).catch(() => {});

    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click().catch(() => {});

    // On success the app navigates away from /auth. Poll instead of a single
    // wait so a slow navigation can't flake; retry the attempt if a reload
    // bounced us back to the form.
    try {
      await expect
        .poll(() => page.url(), { timeout: 25_000 })
        .not.toContain("/auth");
      return;
    } catch {
      if (page.isClosed()) return;
      await page.waitForTimeout(2_000);
    }
  }
  throw new Error(`sign-in did not leave /auth after retries (url: ${page.url()})`);
}

// ─── Suite ────────────────────────────────────────────────
test.describe("Admin Dashboard E2E Flow", () => {
  // NOT globally serial: the heavy sections (8. MT5 Manager, 10. Scheduler,
  // 11. Purchase label & audit trail) are left non-serial so their tests can
  // be split across parallel CI shards. Every test is self-contained (each
  // signs in fresh via beforeEach), so sections stay deterministic either way.

  // ─── 1. Authentication ────────────────────────────────
  test.describe("1. Authentication", () => {
    test.describe.configure({ mode: "serial" });
    test("loads the landing page", async ({ page }) => {
      const ready = await warmUp(page, "/");
      expect(ready).toBeTruthy();
      const text = await page.textContent("body");
      expect(text?.length).toBeGreaterThan(100);
    });

    test("navigates to auth page", async ({ page }) => {
      const ready = await warmUp(page, "/auth");
      expect(ready).toBeTruthy();
      await waitForAppReady(page);
      await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('input[type="password"]').first()).toBeVisible();
    });

    test("shows validation error for empty credentials", async ({ page }) => {
      await warmUp(page, "/auth");
      await waitForAppReady(page);
      await page.locator('input[type="email"]').first().waitFor({ state: "visible", timeout: 30_000 });

      // Both fields are `required`, so the browser blocks the submit
      // client-side and no sign-in request leaves the page.
      const submitBtn = page.locator('button[type="submit"]').first();
      await submitBtn.click();
      await page.waitForTimeout(1_000);
      expect(page.url()).toContain("/auth");
    });

    test("signs in as admin successfully", async ({ page }) => {
      await signInAsAdmin(page);
      const url = page.url();
      const isDashboard = url.includes("/dashboard") || url.includes("/admin");
      expect(isDashboard).toBeTruthy();
    });
  });

  // ─── 2. Admin Overview ────────────────────────────────
  test.describe("2. Admin Overview", () => {
    test.describe.configure({ mode: "serial" });
    test.beforeEach(async ({ page }) => {
      await signInAsAdmin(page);
    });

    test("loads the admin overview page", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);
      await expect(page.locator("body")).toContainText(/Admin Overview|Total Users|Revenue/, {
        timeout: 20_000,
      });
    });

    test("displays stat cards on overview", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);
      await expect(page.locator("body")).toContainText(/Total Users|Revenue|Challenges/, {
        timeout: 20_000,
      });
    });

    test("shows navigation sidebar", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);
      const nav = page.locator("aside nav").first();
      await expect(nav).toBeVisible({ timeout: 15_000 });
      const navText = await nav.textContent();
      expect(navText?.length).toBeGreaterThan(10);
    });
  });

  // ─── 3. User Management ───────────────────────────────
  test.describe("3. User Management", () => {
    test.describe.configure({ mode: "serial" });
    test.beforeEach(async ({ page }) => {
      await signInAsAdmin(page);
    });

    test("navigates to user management page", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);
      const usersNav = page.locator("aside nav button", { hasText: "Users" }).first();
      await usersNav.click();
      await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("/admin/users");
      // The page shows a spinner until its data query resolves, so wait for
      // the heading instead of reading the body once.
      await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible({
        timeout: 20_000,
      });
    });

    test("displays user search input", async ({ page }) => {
      await warmUp(page, "/admin/users");
      await waitForAppReady(page);
      const search = page.locator('input[placeholder*="Search"]').first();
      await expect(search).toBeVisible({ timeout: 20_000 });
    });

    test("shows user rows or an empty state", async ({ page }) => {
      await warmUp(page, "/admin/users");
      await waitForAppReady(page);
      // Seeded demo users have emails in their rows; an empty table shows the
      // "No users found" placeholder instead. Auto-retries past the spinner.
      await expect(page.locator("body")).toContainText(/@|No users found/, { timeout: 20_000 });
    });
  });

  // ─── 4. Challenges ────────────────────────────────────
  test.describe("4. Challenges", () => {
    test.describe.configure({ mode: "serial" });
    test.beforeEach(async ({ page }) => {
      await signInAsAdmin(page);
    });

    test("loads the challenges management page", async ({ page }) => {
      await warmUp(page, "/admin/challenges");
      await waitForAppReady(page);
      await expect(page.getByRole("heading", { name: "Challenge Management" })).toBeVisible({
        timeout: 20_000,
      });
    });

    test("lists challenge templates", async ({ page }) => {
      await warmUp(page, "/admin/challenges");
      await waitForAppReady(page);
      await expect(page.locator("body")).toContainText(
        /Two-Step|One-Step|Instant Funding|No challenges/,
        { timeout: 20_000 },
      );
    });
  });

  // ─── 5. Payments ──────────────────────────────────────
  test.describe("5. Payments", () => {
    test.describe.configure({ mode: "serial" });
    test.beforeEach(async ({ page }) => {
      await signInAsAdmin(page);
    });

    test("loads the payments page", async ({ page }) => {
      await warmUp(page, "/admin/payments");
      await waitForAppReady(page);
      await expect(page.getByRole("heading", { name: /Payments/i })).toBeVisible({
        timeout: 20_000,
      });
    });

    test("shows payments search input", async ({ page }) => {
      await warmUp(page, "/admin/payments");
      await waitForAppReady(page);
      const search = page.locator('input[placeholder*="Search"]').first();
      await expect(search).toBeVisible({ timeout: 20_000 });
    });
  });

  // ─── 6. Cross-page navigation ─────────────────────────
  test.describe("6. Cross-page navigation", () => {
    test.describe.configure({ mode: "serial" });
    test.beforeEach(async ({ page }) => {
      await signInAsAdmin(page);
    });

    test("navigates between admin sections via the sidebar", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);
      const nav = page.locator("aside nav");

      await nav.locator("button", { hasText: "Users" }).first().click();
      await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("/admin/users");

      await nav.locator("button", { hasText: "Payments" }).first().click();
      await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("/admin/payments");

      await nav.locator("button", { hasText: "KYC" }).first().click();
      await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("/admin/kyc");

      await nav.locator("button", { hasText: "Dashboard" }).first().click();
      await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("/admin");
      await expect(page.locator("body")).toContainText(/Admin Overview|Total Users/, {
        timeout: 20_000,
      });
    });
  });

  // ─── 7. Responsive viewports ──────────────────────────
  test.describe("7. Responsive viewports", () => {
    test.describe.configure({ mode: "serial" });
    test.use({ viewport: { width: 390, height: 844 } });

    test("renders landing page on a mobile viewport", async ({ page }) => {
      const ready = await warmUp(page, "/");
      expect(ready).toBeTruthy();
      // Poll for real content: a cold-start Vite reload can briefly leave the
      // body at just "Loading…" right after warmUp returns, and expect.poll
      // waits for the actual landing page to finish mounting.
      await expect
        .poll(async () => (await page.textContent("body").catch(() => ""))?.length ?? 0, {
          timeout: 20_000,
        })
        .toBeGreaterThan(100);
    });

    test("renders auth page on a mobile viewport", async ({ page }) => {
      await warmUp(page, "/auth");
      await waitForAppReady(page);
      await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('button[type="submit"]').first()).toBeVisible();
    });
  });

  // ─── 8. MT5 Manager (admin) ──────────────────────────
  test.describe("8. MT5 Manager", () => {
    test.beforeEach(async ({ page }) => {
      await signInAsAdmin(page);
    });

    test("navigates to the MT5 manager page", async ({ page }) => {
      await warmUp(page, "/admin");
      await waitForAppReady(page);
      const nav = page.locator("aside nav");
      await nav.locator("button", { hasText: "MT5" }).first().click();
      await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("/admin/mt5");
      await expect(page.getByRole("heading", { name: "MT5 Manager" })).toBeVisible({ timeout: 20_000 });
    });

    test("shows the provider status banner", async ({ page }) => {
      await warmUp(page, "/admin/mt5");
      await waitForAppReady(page);
      // No gateway is configured in the e2e env, so the simulated provider is
      // active and the banner surfaces queue/reconciliation counts.
      await expect(page.locator("body")).toContainText(/Simulated Provider|Live MT5 Gateway/, {
        timeout: 20_000,
      });
      await expect(page.locator("body")).toContainText(/queued|failed|No reconciliation yet/, {
        timeout: 20_000,
      });
    });

    test("displays account stat cards and account rows", async ({ page }) => {
      await warmUp(page, "/admin/mt5");
      await waitForAppReady(page);
      await expect(page.locator("body")).toContainText(/Total Accounts|Active|Suspended|Combined Balance/, {
        timeout: 20_000,
      });
      // Bulk seed provisions funded MT5 accounts for the admin (logins start
      // with "AFC"), so rows render — or the empty state if seeding was skipped.
      await expect(page.locator("body")).toContainText(/#AFC|No MT5 accounts found/, {
        timeout: 20_000,
      });
      const search = page.locator('input[placeholder*="Search"]').first();
      await expect(search).toBeVisible({ timeout: 20_000 });
    });

    test("connector tab reports gateway status and runs a test connection", async ({ page }) => {
      await warmUp(page, "/admin/mt5");
      await waitForAppReady(page);
      await page.getByRole("tab", { name: /Connector/ }).click();
      await expect(page.locator("body")).toContainText(/Gateway Status|Not configured|Configured/, {
        timeout: 20_000,
      });
      await page.getByRole("button", { name: /Test Connection/ }).click();
      // The simulated provider answers with ok:true and a message that names
      // the simulated fallback — proof the button round-trips to the server.
      await expect(page.locator("body")).toContainText(/No MT5 gateway configured/, {
        timeout: 20_000,
      });
    });

    test("retry queue tab shows stats and controls", async ({ page }) => {
      await warmUp(page, "/admin/mt5");
      await waitForAppReady(page);
      await page.getByRole("tab", { name: /Retry Queue/ }).click();
      await expect(page.locator("body")).toContainText(/Pending|Done|Failed|Total Jobs/, {
        timeout: 20_000,
      });
      await expect(page.getByRole("button", { name: /Process Queue Now/ })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByRole("button", { name: /Retry All Failed/ })).toBeVisible();
      // Queue is empty on a fresh seed; jobs render once syncs have failed.
      await expect(page.locator("body")).toContainText(/Queue is empty|Attempts:/, {
        timeout: 20_000,
      });
    });

    test("reconciliation tab runs and records entries", async ({ page }) => {
      await warmUp(page, "/admin/mt5");
      await waitForAppReady(page);
      await page.getByRole("tab", { name: /Reconciliation/ }).click();
      await expect(page.getByRole("button", { name: /Run Reconciliation/ })).toBeVisible({
        timeout: 20_000,
      });
      await page.getByRole("button", { name: /Run Reconciliation/ }).click();
      // The run POSTs to the server; the summary toast is the server's response.
      await expect(page.locator("body")).toContainText(/Reconciliation: \d+ checked/, {
        timeout: 25_000,
      });
      // The mutation now invalidates only the reconciliation + status queries,
      // but re-opening the tab keeps the assertion robust against any Vite
      // dev-server reload resetting the SPA mid-run.
      await page.getByRole("tab", { name: /Reconciliation/ }).click();
      await expect(page.locator("body")).toContainText(
        /matched|mismatch|No reconciliation entries yet/,
        { timeout: 25_000 },
      );
    });
  });

  // ─── 9. Trading metrics (client dashboard) ───────────
  test.describe("9. Trading metrics", () => {
    test.describe.configure({ mode: "serial" });
    test.beforeEach(async ({ page }) => {
      await signInAsAdmin(page);
    });

    test("loads the trading page with metric cards", async ({ page }) => {
      await warmUp(page, "/dashboard/trading");
      await waitForAppReady(page);
      await expect(page.getByRole("heading", { name: "Trading" })).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("body")).toContainText(
        /Total Balance|Total Equity|Active Challenges|MT5 Accounts/,
        { timeout: 20_000 },
      );
      await expect(page.getByRole("button", { name: /Sync Now/ })).toBeVisible();
    });

    test("shows MT5 account cards with balances", async ({ page }) => {
      await warmUp(page, "/dashboard/trading");
      await waitForAppReady(page);
      // Seeded funded accounts render as cards with balance/equity/leverage.
      await expect(page.locator("body")).toContainText(/Account #|No MT5 accounts yet/, {
        timeout: 20_000,
      });
      await expect(page.locator("body")).toContainText(/Balance|Equity|Leverage/, {
        timeout: 20_000,
      });
    });

    test("offers demo data generation when no metrics are recorded", async ({ page }) => {
      await warmUp(page, "/dashboard/trading");
      await waitForAppReady(page);
      // Either the metrics empty-state with its generator is shown, or charts
      // render if demo data was already seeded by a previous run.
      await expect(page.locator("body")).toContainText(
        /No trading metrics recorded yet|Performance Charts/,
        { timeout: 25_000 },
      );
      const generate = page.getByRole("button", { name: /Generate Demo Data/ });
      if (await generate.isVisible().catch(() => false)) {
        await generate.click();
        // Seeding fires a toast + confirmation line under the button.
        await expect(page.locator("body")).toContainText(/Demo data generated|Generating/, {
          timeout: 25_000,
        });
      }
    });
  });

  // ─── 10. MT5 Background Scheduler ────────────────────
  //
  // Proves the background loop in `src/server/lib/mt5/scheduler.ts` fires on
  // its own in dev/e2e mode (E2E_TESTING=1 shortens the timers to seconds and
  // lets the simulated provider drive the loop). The tests seed the exact
  // conditions via the E2E-only `POST /api/trading/admin/scheduler/e2e-setup`
  // hook, then assert the queue drains and stale challenges get synced WITHOUT
  // clicking "Process Queue Now", "Sync Now", or "Run Reconciliation".
  test.describe("10. MT5 Background Scheduler", () => {
    test.beforeEach(async ({ page }) => {
      await signInAsAdmin(page);
    });

    test("retry-queue drain: the background loop processes pending sync jobs", async ({ page }) => {
      // Seed: enqueue a pending "sync" job for an active challenge. Only the
      // scheduler's queue pass (every ~4s in e2e mode) can drain it.
      const setupRes = await page.request.post("/api/trading/admin/scheduler/e2e-setup", {
        data: { enqueue: true },
      });
      expect(setupRes.ok()).toBeTruthy();
      const setup = await setupRes.json();
      expect(setup.enqueued).toBe(true);
      const jobId = setup.queueJobId as number;
      expect(jobId).toBeTruthy();

      // Poll the server until the background loop drains the job to "done".
      await expect
        .poll(
          async () => {
            const res = await page.request.get("/api/trading/admin/queue");
            const data = (await res.json()) as { items: Array<{ id: number; status: string }> };
            const job = data.items?.find((j) => j.id === jobId);
            return job ? job.status : "missing";
          },
          { timeout: 60_000, message: "background queue pass should drain the enqueued job" },
        )
        .toBe("done");

      // UI reflection: the Retry Queue tab renders the drained job with the
      // `done` badge (fresh fetch on tab mount).
      await warmUp(page, "/admin/mt5");
      await waitForAppReady(page);
      await page.getByRole("tab", { name: /Retry Queue/ }).click();
      const jobRow = page
        .locator(".card-subtle", { hasText: `MT5 #${setup.mt5AccountId}` })
        .first();
      await expect(jobRow).toBeVisible({ timeout: 20_000 });
      await expect(jobRow).toContainText(/done/i, { timeout: 20_000 });
      await expect(page.locator("body")).toContainText(/Pending|Done|Failed|Total Jobs/, {
        timeout: 20_000,
      });
    });

    test("daily sync pass: the background loop syncs stale active challenges", async ({ page }) => {
      // Seed: re-stale an active challenge and zero its account balance, with
      // NO queue job — only the interval sync pass (every ~8s in e2e mode)
      // can write fresh data for it.
      const setupRes = await page.request.post("/api/trading/admin/scheduler/e2e-setup", {
        data: { enqueue: false },
      });
      expect(setupRes.ok()).toBeTruthy();
      const setup = await setupRes.json();
      expect(setup.enqueued).toBe(false);
      const login = setup.login as string;
      expect(login).toBeTruthy();

      // Poll the server until the sync pass writes a fresh balance and a
      // lastSyncAt for the previously-stale account.
      await expect
        .poll(
          async () => {
            const res = await page.request.get("/api/trading/admin/mt5?page=1&pageSize=100");
            const data = (await res.json()) as {
              items: Array<{ login: string; balance: number; lastSyncAt: number | null }>;
            };
            const acc = data.items?.find((a) => a.login === login);
            if (!acc) return false;
            return acc.balance > 0 && !!acc.lastSyncAt;
          },
          { timeout: 60_000, message: "background sync pass should sync the stale challenge" },
        )
        .toBe(true);

      // UI reflection: the Accounts tab row for the login shows the synced
      // balance (no longer $0) — the fresh data the scheduler wrote.
      await warmUp(page, "/admin/mt5");
      await waitForAppReady(page);
      const accountRow = page
        .locator(".card-subtle", { hasText: `#${login}` })
        .first();
      await expect(accountRow).toBeVisible({ timeout: 20_000 });
      await expect(accountRow).not.toContainText("Balance: $0", { timeout: 20_000 });
    });
  });

  // ─── 11. Purchase label & audit trail ────────────────
  //
  // Asserts the purchase label ("Two-Step Evaluation · $50,000") surfaces in
  // the admin payments table (server-side join of template + account size)
  // and that the audit-log quick filters + lifecycle entries render with the
  // same label stamped on them. Data is seeded deterministically through the
  // admin demo-purchase API so assertions don't depend on seed ordering.
  test.describe("11. Purchase label & audit trail", () => {
    test.beforeEach(async ({ page }) => {
      await signInAsAdmin(page);
    });

    test("shows the purchase label on the admin payments table", async ({ page }) => {
      // Deterministic purchase: Two-Step Evaluation + $50,000 size, so the
      // payment row carries templateId/accountSizeId (→ challengeLabel join).
      const templatesRes = await page.request.get("/api/challenges/templates");
      const templates = (await templatesRes.json()) as Array<{ id: number; name: string }>;
      const twoStep = templates.find((t) => t.name.includes("Two-Step"));
      if (!twoStep) throw new Error("Two-Step template not found");
      const sizesRes = await page.request.get(`/api/challenges/templates/${twoStep.id}/sizes`);
      const sizes = (await sizesRes.json()) as Array<{ id: number; label: string }>;
      const size50k = sizes.find((s) => s.label === "$50,000");
      if (!size50k) throw new Error("$50,000 size not found");
      const buyRes = await page.request.post("/api/challenges/demo-purchase", {
        data: { templateId: twoStep.id, accountSizeId: size50k.id },
      });
      expect(buyRes.ok()).toBeTruthy();

      await warmUp(page, "/admin/payments");
      await waitForAppReady(page);
      await expect(page.getByRole("heading", { name: /Payments/i })).toBeVisible({ timeout: 20_000 });
      // Newest payment first — the freshly created row shows the joined label.
      await expect(page.locator("tbody").first()).toContainText("Two-Step Evaluation · $50,000", {
        timeout: 20_000,
      });
    });

    test("renders the challenge & payment lifecycle filter chips", async ({ page }) => {
      await warmUp(page, "/admin/audit-logs");
      await waitForAppReady(page);

      // exact: true — getByRole name matching is substring by default, so
      // "Funded" would otherwise also match the "Refunded" chip.
      for (const label of ["Phase Passed", "Funded", "Violated", "Expired"]) {
        await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible({ timeout: 20_000 });
      }
      for (const label of ["Completed", "Refunded", "Resumed"]) {
        await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible({ timeout: 20_000 });
      }

      // Toggle behavior: one click activates the chip, a second clears it.
      const chip = page.getByRole("button", { name: "Phase Passed", exact: true });
      await chip.click();
      await expect(chip).toHaveAttribute("aria-pressed", "true");
      await chip.click();
      await expect(chip).toHaveAttribute("aria-pressed", "false");
    });

    test("stamps challenge lifecycle audit entries with the purchase label", async ({ page }) => {
      // Seed a known challenge, then advance it through the admin status API —
      // the route writes a challenge.phase_passed entry with the label.
      const templatesRes = await page.request.get("/api/challenges/templates");
      const templates = (await templatesRes.json()) as Array<{ id: number; name: string }>;
      const twoStep = templates.find((t) => t.name.includes("Two-Step"));
      if (!twoStep) throw new Error("Two-Step template not found");
      const sizesRes = await page.request.get(`/api/challenges/templates/${twoStep.id}/sizes`);
      const sizes = (await sizesRes.json()) as Array<{ id: number; label: string }>;
      const size50k = sizes.find((s) => s.label === "$50,000") || sizes[0];
      const buyRes = await page.request.post("/api/challenges/demo-purchase", {
        data: { templateId: twoStep.id, accountSizeId: size50k!.id },
      });
      expect(buyRes.ok()).toBeTruthy();
      const { challengeId } = (await buyRes.json()) as { challengeId: number };
      expect(challengeId).toBeTruthy();

      const statusRes = await page.request.put(`/api/challenges/admin/${challengeId}/status`, {
        data: { status: "phase_1_passed" },
      });
      expect(statusRes.ok()).toBeTruthy();

      // Server-side: the audit trail entry exists and carries the label.
      const logsRes = await page.request.get(
        "/api/users/audit-logs?action=challenge.phase_passed&pageSize=25",
      );
      const logs = (await logsRes.json()) as {
        logs: Array<{ id: number; entityId: string; details: string }>;
      };
      const entry = logs.logs?.find((l) => String(l.entityId) === String(challengeId));
      expect(entry).toBeTruthy();
      expect(entry!.details).toContain("Two-Step Evaluation · $50,000");

      // UI reflection: the entry renders with the action and the label.
      await warmUp(page, "/admin/audit-logs");
      await waitForAppReady(page);
      await expect(page.locator("body")).toContainText("challenge.phase_passed", { timeout: 20_000 });
      await expect(page.locator("body")).toContainText("Two-Step Evaluation · $50,000", {
        timeout: 20_000,
      });
    });
  });
});
