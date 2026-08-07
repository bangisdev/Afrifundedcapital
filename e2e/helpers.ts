import { expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Shared helpers for the AfriFundedCapital e2e suite.
 *
 * Everything here is idempotent: the seed endpoints skip work that already
 * ran, so any chunk can call ensureSeeded() and the suite stays fast and
 * stable — including when several workers share one server.
 */

export const ADMIN_EMAIL = "admin@afrifundedcapital.com";
export const ADMIN_PASSWORD = "Admin@123456";
export const ADMIN_NAME = "Super Admin";

/** Parse the `afc_session` value out of a Set-Cookie response header. */
export function cookieFromResponse(res: { headers(): Record<string, string> }): string {
  const setCookie = res.headers()["set-cookie"] || "";
  const match = setCookie.match(/(?:^|,\s*)afc_session=([^;,\s]+)/);
  expect(match, "expected an afc_session cookie in the response").toBeTruthy();
  return match![1];
}

/** Create the bootstrap super admin (no-op when one already exists). */
export async function bootstrapAdmin(request: APIRequestContext): Promise<void> {
  const res = await request.post("/api/seed/admin", {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, name: ADMIN_NAME },
  });
  // 409 = "Super admin already exists" — that's fine, ensureSeeded is
  // idempotent and several tests/chunks may run against the same server.
  expect([200, 201, 409]).toContain(res.status());
}

/** Sign in as the super admin over the API and return the session cookie. */
export async function signInAdminApi(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/auth/sign-in/email", {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(res.status()).toBe(200);
  return cookieFromResponse(res);
}

/** Idempotent bootstrap: admin + challenge templates/sizes + 8 demo users. */
export async function ensureSeeded(request: APIRequestContext): Promise<string> {
  await bootstrapAdmin(request);
  const cookie = await signInAdminApi(request);
  const headers = { cookie: `afc_session=${cookie}` };
  const bulk = await request.post("/api/seed/bulk", { headers });
  expect([200, 201]).toContain(bulk.status());
  const users = await request.post("/api/seed/users", { headers });
  expect([200, 201]).toContain(users.status());
  return cookie;
}

/** Admin helper: POST as the admin and assert success. */
export async function adminPost(
  request: APIRequestContext,
  cookie: string,
  path: string,
  data: Record<string, unknown> = {},
): Promise<any> {
  const res = await request.post(path, {
    headers: { cookie: `afc_session=${cookie}` },
    data,
  });
  expect(res.status(), `POST ${path} → ${res.status()} ${await res.text().catch(() => "")}`).toBe(200);
  return res.json();
}

/** Admin helper: PUT and assert success. */
export async function adminPut(
  request: APIRequestContext,
  cookie: string,
  path: string,
  data: Record<string, unknown> = {},
): Promise<any> {
  const res = await request.put(path, {
    headers: { cookie: `afc_session=${cookie}` },
    data,
  });
  expect(res.status(), `PUT ${path} → ${res.status()} ${await res.text().catch(() => "")}`).toBe(200);
  return res.json();
}

/** Admin helper: GET with cookie; returns parsed JSON. */
export async function adminGet(
  request: APIRequestContext,
  cookie: string,
  path: string,
): Promise<any> {
  const res = await request.get(path, { headers: { cookie: `afc_session=${cookie}` } });
  expect(res.status(), `GET ${path} → ${res.status()}`).toBe(200);
  return res.json();
}

/** Sign in as the super admin through the real auth UI. */
export async function signInAdminUi(page: Page): Promise<void> {
  await page.goto("/auth");
  await page.getByPlaceholder("name@example.com").fill(ADMIN_EMAIL);
  await page.getByPlaceholder("Password", { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}

/** Inject an API-obtained session cookie into a browser context. */
export async function injectSessionCookie(page: Page, cookie: string): Promise<void> {
  await page.context().addCookies([
    { name: "afc_session", value: cookie, domain: "localhost", path: "/" },
  ]);
}

/** Sign in via API and land the page on an authenticated route. */
export async function signInAdminFast(page: Page, request: APIRequestContext): Promise<void> {
  const cookie = await signInAdminApi(request);
  await injectSessionCookie(page, cookie);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin/, { timeout: 20_000 });
}

/** Fetch challenge templates, returning [{ id, name, type }...]. */
export async function getTemplates(request: APIRequestContext): Promise<any[]> {
  const res = await request.get("/api/challenges/templates");
  expect(res.status()).toBe(200);
  return res.json();
}

/** Fetch the account sizes for a template, returning [{ id, label, size, price }...]. */
export async function getTemplateSizes(
  request: APIRequestContext,
  templateId: number,
): Promise<any[]> {
  const res = await request.get(`/api/challenges/templates/${templateId}/sizes`);
  expect(res.status()).toBe(200);
  return res.json();
}

/**
 * Create a completed demo purchase (payment + active challenge + MT5 account)
 * for the admin user via POST /api/challenges/demo-purchase. Returns
 * { paymentId, challengeId, label } where label is the exact purchase label
 * rendered on the admin payments table (e.g. "Two-Step Evaluation · $25,000").
 */
export async function createDemoPurchase(
  request: APIRequestContext,
  cookie: string,
  opts: { templateName?: string; sizeLabel?: string } = {},
): Promise<{ paymentId: number; challengeId: number; label: string }> {
  const templates = await getTemplates(request);
  const template =
    templates.find((t) => t.name === opts.templateName) || templates[0];
  const sizes = await getTemplateSizes(request, template.id);
  const size =
    sizes.find((s) => s.label === opts.sizeLabel) ||
    sizes.find((s) => s.label === "$25,000") ||
    sizes[0];

  const res = await request.post("/api/challenges/demo-purchase", {
    headers: { cookie: `afc_session=${cookie}` },
    data: { templateId: template.id, accountSizeId: size.id },
  });
  expect(res.status(), `demo-purchase → ${res.status()} ${await res.text().catch(() => "")}`).toBe(200);
  const body = await res.json();
  const challengeId = body.challengeId;
  const label = `${template.name} · $${Number(size.size).toLocaleString("en-US")}`;

  // demo-purchase doesn't return the payment id — resolve it from the admin
  // payments list (matched by description, which is unique per purchase).
  const payments = await adminGet(request, cookie, "/api/payments/admin/all?pageSize=50");
  const rows = Array.isArray(payments) ? payments : payments.payments || [];
  const payment = rows.find(
    (p: any) =>
      p.description === `Demo: ${template.name} — ${size.label}` ||
      (p.templateId === template.id && p.accountSizeId === size.id && p.status === "completed"),
  );
  expect(payment, `expected a payment for ${label} in the admin list`).toBeTruthy();
  return { paymentId: payment.id, challengeId, label };
}

/** Audit-log entries for a given action (newest first). */
export async function getAuditEntries(
  request: APIRequestContext,
  cookie: string,
  action: string,
): Promise<any[]> {
  const data = await adminGet(request, cookie, `/api/users/audit-logs?action=${encodeURIComponent(action)}&pageSize=50`);
  return data.logs || [];
}
