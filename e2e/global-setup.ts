/**
 * Playwright global setup — runs once before the e2e suite.
 *
 * Ensures the super-admin account exists by calling the seed endpoint.
 * This is idempotent: if the admin already exists the API returns 409,
 * which we treat as success.
 */
import { request } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@afrifundedcapital.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "Admin@123456";

export default async function globalSetup(): Promise<void> {
  const ctx = await request.newContext({ baseURL: BASE_URL });

  try {
    const res = await ctx.post("/api/seed/admin", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });

    if (res.ok()) {
      const body = (await res.json()) as { message?: string };
      console.log(`[e2e] Seeded super-admin ${ADMIN_EMAIL}: ${body.message ?? "ok"}`);
    } else if (res.status() === 409) {
      console.log(`[e2e] Super-admin ${ADMIN_EMAIL} already exists — reusing it.`);
    } else {
      const text = await res.text();
      console.warn(`[e2e] Seed returned ${res.status()}: ${text.slice(0, 300)}`);
    }
  } finally {
    await ctx.dispose();
  }
}
