/**
 * AfriFundedCapital — Playwright global setup.
 *
 * Runs once before the suite and guarantees:
 *   1. A super admin exists (`POST /api/seed/admin` — idempotent; a 409 for
 *      an existing admin is treated as success).
 *   2. Demo data is seeded (templates, users, challenges, payments) so the
 *      admin pages render realistic content. Best-effort — the suite asserts
 *      on UI chrome that renders with or without data.
 */
import { chromium } from "@playwright/test";
import type { FullConfig } from "@playwright/test";

const DEFAULT_BASE = "http://localhost:5173";

export default async function globalSetup(_config: FullConfig) {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || DEFAULT_BASE;
  const email = process.env.E2E_ADMIN_EMAIL || "admin@afrifundedcapital.com";
  const password = process.env.E2E_ADMIN_PASSWORD || "Admin@123456";

  // 1. Ensure the super admin exists.
  const seedRes = await fetch(`${baseURL}/api/seed/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: "Super Admin" }),
  });
  if (seedRes.status !== 201 && seedRes.status !== 409) {
    throw new Error(
      `[e2e/global-setup] Failed to seed admin (${seedRes.status}): ${(await seedRes.text()).slice(0, 300)}`,
    );
  }
  console.log(`[e2e/global-setup] Super admin ready (${email})`);

  // 2. Sign in via the real API to obtain a session cookie for seeding.
  const signInRes = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!signInRes.ok) {
    console.warn(`[e2e/global-setup] Sign-in for seeding failed (${signInRes.status}) — skipping demo data`);
    return;
  }
  const setCookie = signInRes.headers.get("set-cookie");
  const cookie = setCookie ? setCookie.split(";")[0] : "";

  // 3. Verify the server is actually running with E2E_TESTING=1 before the
  //    suite starts. Playwright reuses an already-listening server on the port
  //    (`reuseExistingServer`), which may not have the flag — without it the
  //    auth rate limiter is active and the MT5 scheduler e2e hook 404s, which
  //    turns into confusing mid-suite failures. Fail fast with an actionable
  //    message instead.
  try {
    const probe = await fetch(`${baseURL}/api/trading/admin/scheduler/e2e-setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ enqueue: false }),
    });
    if (!probe.ok) {
      throw new Error(
        `server answered ${probe.status} (expected 200) — it is not running with E2E_TESTING=1. ` +
          `Stop any dev server on the port and let Playwright boot its own, or point ` +
          `PLAYWRIGHT_BASE_URL at a server started with E2E_TESTING=1.`,
      );
    }
    console.log("[e2e/global-setup] E2E server verified (E2E_TESTING active)");
  } catch (err) {
    throw new Error(
      `[e2e/global-setup] MT5 scheduler e2e hook unavailable: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  // 4. Warm the app's route chunks in a real browser. Vite's first-load
  // dependency optimization triggers full-page reloads that abort in-flight
  // navigations; doing it once here (pre-suite) keeps the tests from hitting
  // that reload storm on heavy lazy routes like /admin.
  if (cookie) {
    try {
      await warmBrowserRoutes(baseURL, cookie);
    } catch (err) {
      console.warn(`[e2e/global-setup] Browser warmup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 5. Best-effort demo data seed. Failures are warnings, not fatal.
  try {
    const bulkRes = await fetch(`${baseURL}/api/seed/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({}),
    });
    const text = await bulkRes.text();
    if (!bulkRes.ok) {
      console.warn(`[e2e/global-setup] Bulk seed skipped (${bulkRes.status}): ${text.slice(0, 200)}`);
    } else {
      console.log(`[e2e/global-setup] Demo data seeded: ${text.slice(0, 160)}`);
    }
  } catch (err) {
    console.warn(`[e2e/global-setup] Bulk seed error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 6. Create an ACTIVE demo challenge with an MT5 account for the admin.
  // The bulk seed creates funded accounts, but the MT5 reconciliation engine
  // and the trading sync only process status === "active" challenges — so this
  // guarantees the admin MT5 page (retry queue, reconciliation history) and
  // the Trading page have live data to render. Idempotent: every run creates
  // one more demo challenge, which the suite tolerates.
  try {
    const templatesRes = await fetch(`${baseURL}/api/challenges/templates`, {
      headers: { Cookie: cookie },
    });
    const templates = (await templatesRes.json()) as Array<{ id: number }>;
    const template = templates[0];
    if (template) {
      const sizesRes = await fetch(`${baseURL}/api/challenges/templates/${template.id}/sizes`, {
        headers: { Cookie: cookie },
      });
      const sizes = (await sizesRes.json()) as Array<{ id: number }>;
      if (sizes.length > 0) {
        const demoRes = await fetch(`${baseURL}/api/challenges/demo-purchase`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ templateId: template.id, accountSizeId: sizes[0].id }),
        });
        const demoText = await demoRes.text();
        if (!demoRes.ok) {
          console.warn(`[e2e/global-setup] Demo challenge skipped (${demoRes.status}): ${demoText.slice(0, 160)}`);
        } else {
          console.log(`[e2e/global-setup] Active demo challenge: ${demoText.slice(0, 160)}`);
        }
      }
    }
  } catch (err) {
    console.warn(`[e2e/global-setup] Demo challenge error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Visit every heavy route once with a real browser so Vite pre-transforms the
 * lazy chunks (admin pages pull in a lot: recharts, tables, dialogs…). Uses the
 * seeded admin session cookie so the authenticated admin pages render too.
 */
async function warmBrowserRoutes(baseURL: string, cookieValue: string) {
  const hostname = new URL(baseURL).hostname;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: "afc_session",
        value: cookieValue,
        domain: hostname,
        path: "/",
      },
    ]);
    const page = await context.newPage();
    for (const path of [
      "/", "/auth", "/admin", "/admin/users", "/admin/payments", "/admin/challenges", "/admin/kyc",
      "/admin/mt5", "/dashboard/trading",
    ]) {
      try {
        await page.goto(`${baseURL}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
        // Give the route time to fetch data + settle before the next visit.
        await page.waitForTimeout(800);
        console.log(`[e2e/global-setup] Warm visit: ${path}`);
      } catch (err) {
        console.warn(
          `[e2e/global-setup] Warm visit to ${path} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    await page.close();
    await context.close();
  } finally {
    await browser.close();
  }
}
