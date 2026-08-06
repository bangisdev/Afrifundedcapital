import { defineConfig, devices } from "@playwright/test";

// ─── Config ───────────────────────────────────────────────
// Defaults to the local Vite dev server. Override with PLAYWRIGHT_BASE_URL
// to point the suite at any running instance (e.g. the Freebuff preview).
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  // fullyParallel: true enables per-test sharding (Playwright otherwise shards
  // by FILE, which is a silent no-op for this single-file suite — every shard
  // beyond 1 would run zero tests and exit 0). workers stays at 1, so local
  // and single-shard runs are still fully sequential and deterministic;
  // sharded CI jobs split the heavy sections' tests across parallel runners.
  fullyParallel: true,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  globalSetup: "./e2e/global-setup.ts",

  // Auto-boot the app for the run. With reuseExistingServer: true an
  // already-listening server on the port (e.g. the Freebuff preview) is
  // reused instead, so the suite works in both setups.
  webServer: {
    command: "bun run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      ...(process.env as Record<string, string>),
      // Opt into the e2e escape hatch: disables the auth rate limiter and
      // account lockout so the serial suite's many sign-ins stay deterministic.
      E2E_TESTING: "1",
    },
  },
});
