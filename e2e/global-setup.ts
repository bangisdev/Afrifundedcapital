import type { FullConfig } from "@playwright/test";
import { request } from "@playwright/test";

/**
 * One-time-per-run seeding, run before any test file.
 *
 * admin-flow.spec.ts signs in through the real /auth UI, which requires the
 * super admin to exist before the first test fires. Specs that use
 * ensureSeeded() would otherwise race each other to bootstrap it. Seeding here
 * makes every chunk deterministic regardless of which specs it contains.
 *
 * All calls are idempotent (the seed endpoints skip work that already ran), so
 * this is safe even when a chunk also calls ensureSeeded() in its specs.
 */

const ADMIN_EMAIL = "admin@afrifundedcapital.com";
const ADMIN_PASSWORD = "Admin@123456";
const ADMIN_NAME = "Super Admin";

function sessionCookieFrom(headers: Record<string, string>): string | null {
  const setCookie = headers["set-cookie"] || "";
  const match = setCookie.match(/(?:^|,\s*)afc_session=([^;,\s]+)/);
  return match ? match[1] : null;
}

export default async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects[0]?.use?.baseURL || "http://localhost:5174";
  const ctx = await request.newContext({ baseURL });

  try {
    // 1) Bootstrap the super admin (409 = already exists — fine).
    const admin = await ctx.post("/api/seed/admin", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, name: ADMIN_NAME },
    });
    if (![200, 201, 409].includes(admin.status())) {
      throw new Error(`global-setup: seed/admin → ${admin.status()}`);
    }

    // 2) Sign in to obtain a session cookie for the seed endpoints.
    const signIn = await ctx.post("/api/auth/sign-in/email", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    if (signIn.status() !== 200) {
      throw new Error(`global-setup: sign-in → ${signIn.status()}`);
    }
    const cookie = sessionCookieFrom(signIn.headers());
    if (!cookie) throw new Error("global-setup: no session cookie in sign-in response");
    const headers = { cookie: `afc_session=${cookie}` };

    // 3) Challenge templates/sizes + demo users.
    const bulk = await ctx.post("/api/seed/bulk", { headers });
    if (![200, 201].includes(bulk.status())) {
      throw new Error(`global-setup: seed/bulk → ${bulk.status()}`);
    }
    const users = await ctx.post("/api/seed/users", { headers });
    if (![200, 201].includes(users.status())) {
      throw new Error(`global-setup: seed/users → ${users.status()}`);
    }
  } finally {
    await ctx.dispose();
  }
}
