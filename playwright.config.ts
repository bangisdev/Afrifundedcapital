import { defineConfig } from "@playwright/test";

/**
 * Playwright config for the AfriFundedCapital e2e suite.
 *
 * The suite boots ITS OWN app server on port 5174 (never touching the
 * platform/preview server on 5173) with:
 *   - E2E_TESTING=1  → rate limiters + account lockout disabled, MT5 scheduler
 *                      timers shortened (first pass ~3s, queue 4s, sync 8s),
 *                      and the test-only scheduler/e2e hooks enabled.
 *   - DB_PATH        → an isolated SQLite file under .e2e/, wiped on every
 *                      run, so tests are deterministic and never mutate the
 *                      real ./afrifundedcapital.db.
 *
 * Two server modes:
 *   - Default (dev):   `vite --port 5174` — the same on-demand compile the
 *                      preview uses. Chunks that exercise dev-only routes
 *                      (test-email, admin secrets) require this.
 *   - E2E_PROD=1:      `bun run build && bun run server.ts` — the production
 *                      Hono server serving the built SPA. No on-demand
 *                      compilation, so it fits comfortably in memory-capped
 *                      containers where Vite's dep optimizer can spike past
 *                      the cgroup budget and get OOM-killed mid-compile.
 *                      The digest + violations chunks run fine on it.
 *
 * Chunks are selected with `--grep "N. Section"` (see package.json scripts).
 * The heaviest chunks (MT5, scheduler, audit) are split across multiple spec
 * files so `--workers=2` actually parallelizes them (one file per worker).
 */

const PORT = 5174;
const BASE_URL = `http://localhost:${PORT}`;
const E2E_DB = ".e2e/afrifundedcapital.e2e.db";

// Memory budget for the ~2GB cgroup this suite runs in:
//   - taskset -c 0-2 caps the dev server to 3 CPUs. The host exposes 48 cores
//     and Vite's dep optimizer spawns one esbuild worker per core; on first
//     admin-chunk compile it discovers uncached deps (jspdf, qrcode,
//     react-day-picker, ...) and re-bundles ALL deps in parallel, spiking
//     2GB+ and getting OOM-killed mid-compile ("[WebServer] Killed",
//     ERR_CONNECTION_RESET on every module request). Fewer CPUs collapse the
//     spike so the one-time re-optimization completes and node_modules/.vite
//     stays populated for later runs.
//   - GOMEMLIMIT bounds the Go heap of the esbuild service inside that
//     re-bundle (esbuild respects GOMEMLIMIT since 0.19), so a single worker
//     cannot balloon past the budget either.
//   - NODE_OPTIONS caps vite's own JS heap: Node sizes it from the HOST's
//     total RAM while the cgroup allows only ~2GB.
const devServerCommand = [
  "mkdir -p .e2e",
  `rm -f ${E2E_DB} ${E2E_DB}-wal ${E2E_DB}-shm`,
  `E2E_TESTING=1 DB_PATH=${E2E_DB} NODE_OPTIONS=--max-old-space-size=1024 GOMEMLIMIT=768MiB taskset -c 0-2 vite --port ${PORT} --strictPort`,
].join(" && ");

const prodServerCommand = [
  "mkdir -p .e2e",
  `rm -f ${E2E_DB} ${E2E_DB}-wal ${E2E_DB}-shm`,
  "bun run build",
  `E2E_TESTING=1 DB_PATH=${E2E_DB} PORT=${PORT} bun run server.ts`,
].join(" && ");

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Spec files are independent; a file's tests run serially. Workers fan out
  // across files — that's what lets the sharded chunks use --workers=2.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Pinned locally: auto-detecting too many workers on a shared container can
  // exhaust memory and crash browser tabs ("Target crashed"). CI jobs use
  // --workers=1, heavy chunks --workers=2.
  workers: process.env.CI ? 1 : 3,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Container-tuned browser footprint: the cgroup caps total RAM at 2GB
    // (app server + this runner + Chromium share it), so headless Chromium
    // runs with zygote off (fewer per-process mappings) and without the
    // shared-memory sandbox (host /dev/shm is tiny in containers).
    launchOptions: {
      args: ["--no-zygote", "--disable-dev-shm-usage", "--disable-gpu"],
    },
  },
  webServer: {
    // Fresh DB per run: wipe any previous e2e sqlite files, then boot the app
    // server in E2E mode. Playwright manages this process's lifecycle.
    command: process.env.E2E_PROD === "1" ? prodServerCommand : devServerCommand,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
