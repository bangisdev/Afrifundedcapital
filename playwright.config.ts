import { defineConfig } from "@playwright/test";

/**
 * Playwright config for the AfriFundedCapital e2e suite.
 *
 * The suite boots its OWN Vite dev server on port 5174 (never touching the
 * platform/preview server on 5173) with:
 *   - E2E_TESTING=1  → rate limiters + account lockout disabled, MT5 scheduler
 *                      timers shortened (first pass ~3s, queue 4s, sync 8s),
 *                      and the test-only scheduler/e2e hooks enabled.
 *   - DB_PATH        → an isolated SQLite file under .e2e/, wiped on every
 *                      run, so tests are deterministic and never mutate the
 *                      real ./afrifundedcapital.db.
 *
 * Chunks are selected with `--grep "N. Section"` (see package.json scripts).
 * The heaviest chunks (MT5, scheduler, audit) are split across multiple spec
 * files so `--workers=2` actually parallelizes them (one file per worker).
 */

const PORT = 5174;
const BASE_URL = `http://localhost:${PORT}`;
const E2E_DB = ".e2e/afrifundedcapital.e2e.db";

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
  },
  webServer: {
    // Fresh DB per run: wipe any previous e2e sqlite files, then boot the
    // app server in E2E mode. Playwright manages this process's lifecycle.
    command: [
      "mkdir -p .e2e",
      `rm -f ${E2E_DB} ${E2E_DB}-wal ${E2E_DB}-shm`,
      `E2E_TESTING=1 DB_PATH=${E2E_DB} vite --port ${PORT} --strictPort`,
    ].join(" && "),
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
