import { describe, it, expect, vi, afterEach } from "vitest";
import { api, readResponseBody, errorMessageOf, ApiError } from "@/lib/api";

/** Minimal Response stand-in with a JSON body. */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/**
 * Minimal Response stand-in with a plain-text body — what a reverse proxy
 * returns as `Service unavailable` (503) while the app server is restarting.
 * `json()` throws exactly like the real fetch would.
 */
function textResponse(text: string, status = 503): Response {
  return {
    ok: false,
    status,
    json: async () => {
      throw new SyntaxError(
        `Unexpected token 'S', "${text}" is not valid JSON`,
      );
    },
    text: async () => text,
  } as unknown as Response;
}

describe("readResponseBody", () => {
  it("parses JSON bodies", async () => {
    await expect(readResponseBody(jsonResponse({ success: true }))).resolves.toEqual({
      success: true,
    });
  });

  it("falls back to the raw text for non-JSON bodies (proxy 503 pages) instead of throwing", async () => {
    await expect(readResponseBody(textResponse("Service unavailable"))).resolves.toEqual({
      error: "Service unavailable",
    });
  });

  it("returns {} for empty bodies", async () => {
    const res = {
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
      text: async () => "",
    } as unknown as Response;
    await expect(readResponseBody(res)).resolves.toEqual({});
  });
});

describe("errorMessageOf", () => {
  it("prefers the server's error field", () => {
    expect(errorMessageOf({ error: "Invalid credentials" }, 401)).toBe("Invalid credentials");
  });

  it("falls back to the message field", () => {
    expect(errorMessageOf({ message: "Email address is required" }, 400)).toBe(
      "Email address is required",
    );
  });

  it("maps proxy 503 pages to a friendly message", () => {
    expect(errorMessageOf({ error: "Service unavailable" }, 503)).toMatch(
      /temporarily unavailable/,
    );
  });

  it("returns a generic message when the body carries no detail", () => {
    expect(errorMessageOf({}, 500)).toBe("Request failed (HTTP 500)");
  });
});

describe("api request helper", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("throws a friendly ApiError on a plain-text 503 instead of a JSON SyntaxError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse("Service unavailable")));
    const err = (await api.get("/test").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ApiError");
    expect(err.status).toBe(503);
    expect(err.message).toMatch(/temporarily unavailable/);
  });

  it("parses JSON on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ success: true })));
    await expect(api.post("/test", { a: 1 })).resolves.toEqual({ success: true });
  });
});
