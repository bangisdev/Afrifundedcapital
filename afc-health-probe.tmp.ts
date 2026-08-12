/**
 * afc-health-probe.tmp.ts — definitive backend reachability probe.
 * Navigates the browser to the app origin (same-origin fetches, no CORS),
 * then polls /api/health via page.evaluate AND via page.request (which
 * bypasses CORS entirely). Reports what a real browser session actually gets.
 *
 * Run: bunx tsx afc-health-probe.tmp.ts
 */
import { chromium } from "@playwright/test";

const ORIGIN = "https://beige-crews-rescue.freebuff.dev";

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleMsgs: string[] = [];
  page.on("console", (m) => consoleMsgs.push(`[console.${m.type()}] ${m.text().slice(0, 120)}`));
  page.on("pageerror", (e) => consoleMsgs.push(`[pageerror] ${String(e).slice(0, 200)}`));

  const nav = await page.goto(ORIGIN, { waitUntil: "domcontentloaded", timeout: 45_000 });
  console.log("[nav]", nav?.status());

  // Same-origin fetch from the loaded SPA page
  const sameOrigin = await page.evaluate(async (origin) => {
    const r = await fetch(`${origin}/api/health`, { cache: "no-store" });
    return { status: r.status, body: (await r.text().catch(() => "")).slice(0, 120) };
  }, ORIGIN);
  console.log("[same-origin fetch]", JSON.stringify(sameOrigin));

  // CORS-bypassing request from the same context
  const viaRequest = await page.request.get(`${ORIGIN}/api/health`);
  console.log("[page.request]", viaRequest.status(), (await viaRequest.text().catch(() => "")).slice(0, 120));

  // Also hit digest-status, the endpoint the card depends on
  const ds = await page.request.get(`${ORIGIN}/api/challenges/admin/digest-status`);
  console.log("[digest-status via request]", ds.status(), (await ds.text().catch(() => "")).slice(0, 200));

  // And the SPA shell itself once more for contrast
  const shell = await page.request.get(`${ORIGIN}/`);
  console.log("[root via request]", shell.status());

  console.log("[console]", JSON.stringify(consoleMsgs.slice(0, 8)));
  await browser.close();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
