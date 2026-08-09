/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { Hono } from "hono";
import { buildTestApp, cleanupTestDb, signUp } from "./setup";

// Fail fast: shorten the Resend send timeout for tests. Must be set before the
// email module loads (it is read at import time inside buildTestApp).
process.env.EMAIL_SEND_TIMEOUT_MS = "100";
// No RESEND_API_KEY env by default — tests set it explicitly when needed.
delete process.env.RESEND_API_KEY;

// Mock the Resend SDK so tests never hit the real API; behavior is controlled
// per test through sendMock.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

describe("test-email routes", () => {
  let app: Hono;
  let adminCookie: string;

  beforeAll(async () => {
    app = await buildTestApp();

    const { status, cookie } = await signUp(app, {
      name: "Admin",
      email: "admin@test.com",
      password: "Admin@123456",
    });
    expect(status).toBe(201);

    const promote = await app.request("/api/auth/promote-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ userId: 1 }),
    });
    expect(promote.status).toBe(200);

    adminCookie = cookie;
  });

  afterAll(() => {
    delete process.env.EMAIL_SEND_TIMEOUT_MS;
    cleanupTestDb();
  });

  it("requires auth on /status and /send-test", async () => {
    expect((await app.request("/api/test-email/status")).status).toBe(401);
    const res = await app.request("/api/test-email/send-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "probe@example.com" }),
    });
    expect(res.status).toBe(401);
  });

  it("reports apiKeyConfigured false when no key is set", async () => {
    const res = await app.request("/api/test-email/status", {
      headers: { Cookie: adminCookie },
    });
    const body: any = await res.json();
    expect(res.status).toBe(200);
    expect(body.apiKeyConfigured).toBe(false);
    expect(body.source).toBe("none");
  });

  it("returns a JSON 500 (not a hang) when no key is configured", async () => {
    const res = await app.request("/api/test-email/send-test", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ to: "probe@example.com" }),
    });
    const body: any = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toMatch(/RESEND_API_KEY|Failed to send email/i);
  });

  it("sends successfully with a one-off key", async () => {
    sendMock.mockResolvedValueOnce({ data: { id: "email-1" }, error: null });
    const res = await app.request("/api/test-email/send-test", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ to: "probe@example.com", apiKey: "re_test_fake" }),
    });
    const body: any = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("surfaces the Resend error message when the API rejects the send", async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: { message: "Invalid api key" } });
    const res = await app.request("/api/test-email/send-test", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ to: "probe@example.com", apiKey: "re_test_fake" }),
    });
    const body: any = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toMatch(/Invalid api key/);
  });

  it("fails fast with a timeout reason when Resend hangs", async () => {
    // A promise that never settles — only the send timeout can end the request.
    sendMock.mockImplementationOnce(() => new Promise(() => {}));
    const started = Date.now();
    const res = await app.request("/api/test-email/send-test", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ to: "probe@example.com", apiKey: "re_test_fake" }),
    });
    const elapsed = Date.now() - started;
    const body: any = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toMatch(/timed out|timeout/i);
    expect(elapsed).toBeLessThan(3_000);
  });
});
