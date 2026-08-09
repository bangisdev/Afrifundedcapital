const API_BASE = "";

export class ApiError extends Error {
  status: number;

  constructor(
    status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Tolerant response-body reader: prefers JSON, but never crashes on a
 * plain-text body — e.g. a reverse proxy's `Service unavailable` 503 page
 * served while the app server is restarting. Falls back to
 * `{ error: <raw text> }` so callers can surface a meaningful message instead
 * of a raw `SyntaxError: Unexpected token 'S', "Service unavailable" ...`.
 */
export async function readResponseBody(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    /* not JSON (empty body, proxy error page, ...) — read as text below */
  }
  try {
    const text = await res.text();
    return text.trim() ? { error: text.trim() } : {};
  } catch {
    return {};
  }
}

/**
 * Human-readable message for a failed response: prefers the server's JSON
 * `error` / `message`, then the raw body text, with friendlier wording for
 * reverse-proxy 502/503 pages ("Service unavailable").
 */
export function errorMessageOf(body: any, status: number): string {
  const raw =
    typeof body?.error === "string"
      ? body.error
      : typeof body?.message === "string"
        ? body.message
        : "";
  if (/service unavailable/i.test(raw) || (status >= 502 && status <= 503)) {
    return "The server is temporarily unavailable — please try again in a moment.";
  }
  if (raw.trim()) return raw;
  return `Request failed (HTTP ${status})`;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method,
    headers,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await readResponseBody(res);
    throw new ApiError(res.status, errorMessageOf(err, res.status));
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return (await readResponseBody(res)) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
