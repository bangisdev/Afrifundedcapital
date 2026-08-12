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

/**
 * Dev-mode module prewarm (best-effort, never throws).
 *
 * The suite's web server is Vite dev mode. The FIRST browser request for a
 * heavy route (e.g. /admin → AdminDashboard → every admin page) forces an
 * on-demand compile of that module graph. In the ~2GB cgroup sandbox that
 * compile + Chromium + the runner can exceed the budget and the OOM killer
 * reaps Vite mid-compile ("[vite] server connection lost", ERR_CONNECTION_RESET
 * on every module request → blank page).
 *
 * To avoid compiling anything while a browser is open, we crawl the entry +
 * admin module graphs here via plain HTTP (no browser). By the time Chromium
 * launches, every module is transformed and cached, so the heavy chunks just
 * stream from Vite's cache. Skipped entirely in E2E_PROD mode (static files).
 */
async function prewarmDevServer(baseURL: string): Promise<void> {
  const entries = [
    "/",
    "/src/main.tsx",
    "/src/App.tsx",
    "/src/pages/admin/AdminDashboard.tsx",
    "/src/pages/auth/Auth.tsx",
  ];

  const visited = new Set<string>();
  const queue: string[] = [];
  const enqueue = (raw: string) => {
    if (!raw || raw.startsWith("http")) return;
    if (visited.has(raw)) return;
    visited.add(raw);
    queue.push(raw);
  };

  entries.forEach(enqueue);

  const importRe =
    /(?:from\s*|import\s*\()["']([^"']+)["']|import\s*["']([^"']+)["']/g;
  const srcRe = /src=["']([^"']+)["']/g;
  const stop = Date.now() + 150_000;
  let fetched = 0;
  let failed = 0;

  const worker = async () => {
    while (queue.length > 0) {
      if (Date.now() > stop) return;
      const url = queue.shift()!;
      try {
        const res = await fetch(baseURL + url, { signal: AbortSignal.timeout(30_000) });
        fetched++;
        if (!res.ok) continue;
        const ct = res.headers.get("content-type") || "";
        const text = await res.text();
        if (!/javascript|text\/html/.test(ct)) continue;
        for (const m of text.matchAll(importRe)) {
          const spec = m[1] || m[2];
          if (!spec) continue;
          if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(spec)) continue; // external scheme
          if (spec.startsWith(".") || spec.startsWith("/")) enqueue(spec);
        }
        if (/text\/html/.test(ct)) {
          for (const m of text.matchAll(srcRe)) enqueue(m[1]);
        }
      } catch {
        failed++;
      }
    }
  };

  await Promise.all(Array.from({ length: 4 }, worker));
  console.log(
    `[global-setup] prewarm done: ${fetched} modules fetched, ${failed} failed, ` +
      `${queue.length} left in queue`,
  );
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

  // 4) Dev mode: pre-compile the entry + admin module graphs over plain HTTP
  //    so no heavy Vite compile happens while Chromium is open. Prod mode
  //    serves static files and has nothing to prewarm.
  if (process.env.E2E_PROD !== "1") {
    await prewarmDevServer(baseURL);
  }
}
