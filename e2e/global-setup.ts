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

  // 3. Best-effort demo data seed. Failures are warnings, not fatal.
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
}
