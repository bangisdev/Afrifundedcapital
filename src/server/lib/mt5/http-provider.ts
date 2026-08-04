import type { Db } from "../../db";
import {
  type MT5Provider,
  type MT5AccountInfo,
  type MT5TradeRecord,
  type MT5SyncResult,
  type MT5GatewayConfig,
  type ChallengeRow,
  type SyncMetrics,
  MT5_GATEWAY_PATHS,
} from "./types";
import { computeMetricsFromGateway } from "./metrics";

/** Error type used to distinguish transient (retryable) failures. */
export class MT5GatewayError extends Error {
  readonly retryable: boolean;
  readonly status?: number;

  constructor(message: string, retryable: boolean, status?: number) {
    super(message);
    this.name = "MT5GatewayError";
    this.retryable = retryable;
    this.status = status;
  }
}

/** Sleep helper. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Timeout-aware fetch with AbortController. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Real MT5 Manager API connector.
 *
 * The MT5 Manager API ships as a native C++ library (MTManagerAPI) that speaks
 * a proprietary binary protocol over TCP with Diffie-Hellman key exchange and
 * Blowfish payload encryption. Node/Bun cannot load that DLL directly, so the
 * production-standard pattern is a small self-hosted gateway service that wraps
 * the Manager API and exposes a JSON/REST contract (see MT5_GATEWAY_PATHS).
 *
 * This provider:
 *  - Talks to one of several base URLs (failover: tries each in order).
 *  - Applies a per-request timeout.
 *  - Retries transient failures (network/timeout/5xx) with exponential backoff.
 *  - Never persists or exposes the manager password in API responses.
 */
export class HttpMT5Provider implements MT5Provider {
  readonly mode = "gateway" as const;
  readonly configured: boolean;
  private db: Db;
  private cfg: MT5GatewayConfig;

  constructor(db: Db, cfg: MT5GatewayConfig) {
    this.db = db;
    this.cfg = cfg;
    this.configured = cfg.enabled && cfg.baseUrls.length > 0 && Boolean(cfg.apiKey);
  }

  private async request(
    method: string,
    path: string,
    opts: {
      body?: unknown;
      timeoutMs?: number;
      retries?: number;
    } = {},
  ): Promise<{ ok: boolean; status: number; data: unknown }> {
    const cfg = this.cfg;
    const timeoutMs = opts.timeoutMs ?? cfg.requestTimeoutMs;
    const maxAttempts = opts.retries ?? cfg.maxRetries;
    const bases = cfg.baseUrls.length > 0 ? cfg.baseUrls : ["http://localhost:8443"];
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Failover: try every base URL, then retry the whole set with backoff.
      for (const base of bases) {
        const url = `${base.replace(/\/$/, "")}${path}`;
        try {
          const res = await fetchWithTimeout(
            url,
            {
              method,
              headers,
              body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
            },
            timeoutMs,
          );
          const text = await res.text();
          let data: unknown = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch {
            data = text;
          }

          if (res.ok) {
            return { ok: true, status: res.status, data };
          }

          const retryable =
            res.status >= 500 ||
            res.status === 408 ||
            res.status === 429 ||
            res.status === 0;

          if (retryable) {
            lastError = new MT5GatewayError(
              `Gateway ${res.status} on ${url}: ${text.slice(0, 200)}`,
              true,
              res.status,
            );
            // Continue to next base URL / retry
          } else {
            return {
              ok: false,
              status: res.status,
              data,
            };
          }
        } catch (err) {
          const isAbort = err instanceof Error && err.name === "AbortError";
          lastError = new MT5GatewayError(
            isAbort
              ? `Gateway timeout after ${timeoutMs}ms on ${url}`
              : `Gateway unreachable: ${url} — ${err instanceof Error ? err.message : String(err)}`,
            true,
          );
        }
      }

      // Exponential backoff before the next attempt round.
      if (attempt < maxAttempts - 1) {
        await sleep(cfg.retryBaseDelayMs * 2 ** attempt);
      }
    }

    throw (
      lastError ??
      new MT5GatewayError("MT5 gateway request failed", true)
    );
  }

  private json<T>(res: { ok: boolean; status: number; data: unknown }): T {
    return res.data as T;
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number; message: string }> {
    const started = Date.now();
    try {
      const res = await this.request("GET", MT5_GATEWAY_PATHS.health, {
        retries: 1,
        timeoutMs: Math.min(this.cfg.requestTimeoutMs, 5_000),
      });
      return {
        ok: res.ok && res.status === 200,
        latencyMs: Date.now() - started,
        message: res.ok ? "Gateway reachable" : `Gateway responded with status ${res.status}`,
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: err instanceof Error ? err.message : "Gateway unreachable",
      };
    }
  }

  async createAccount(input: {
    name: string;
    email: string;
    balance: number;
    leverage: number;
    group: string;
    password: string;
    investorPassword: string;
  }): Promise<{ login: string; server: string }> {
    const res = await this.request("POST", MT5_GATEWAY_PATHS.createAccount, {
      body: {
        name: input.name,
        email: input.email,
        balance: input.balance,
        leverage: input.leverage,
        group: input.group,
        password: input.password,
        investorPassword: input.investorPassword,
        managerLogin: this.cfg.managerLogin,
        managerPassword: this.cfg.managerPassword,
      },
    });
    const data = this.json<{ login?: string | number; server?: string }>(res);
    if (!res.ok || data.login === undefined) {
      throw new MT5GatewayError(
        `Account creation failed: ${JSON.stringify(data).slice(0, 200)}`,
        res.status === 500,
        res.status,
      );
    }
    return {
      login: String(data.login),
      server: data.server ?? this.cfg.serverName,
    };
  }

  async getAccountInfo(login: string): Promise<MT5AccountInfo> {
    const path = MT5_GATEWAY_PATHS.account.replace(":login", login);
    const res = await this.request("GET", path);
    const data = this.json<MT5AccountInfo | { error?: string }>(res);
    if (!res.ok || !data || typeof (data as MT5AccountInfo).balance !== "number") {
      throw new MT5GatewayError(
        `Failed to read account ${login}: ${JSON.stringify(data).slice(0, 200)}`,
        res.status === 500,
        res.status,
      );
    }
    return data as MT5AccountInfo;
  }

  async getTradeHistory(
    login: string,
    from: number,
    to: number,
  ): Promise<MT5TradeRecord[]> {
    const path =
      MT5_GATEWAY_PATHS.history.replace(":login", login) +
      `?from=${from}&to=${to}`;
    const res = await this.request("GET", path);
    const data = this.json<{ trades?: MT5TradeRecord[] } | MT5TradeRecord[]>(res);
    if (!res.ok) {
      throw new MT5GatewayError(
        `Failed to read history for ${login}: ${JSON.stringify(data).slice(0, 200)}`,
        res.status === 500,
        res.status,
      );
    }
    if (Array.isArray(data)) return data as MT5TradeRecord[];
    return ((data as { trades?: MT5TradeRecord[] }).trades ?? []) as MT5TradeRecord[];
  }

  async syncDaily(
    challenge: ChallengeRow,
    previousMetrics: SyncMetrics | null,
  ): Promise<MT5SyncResult> {
    const login = String(challenge.mt5AccountId ? challenge.mt5AccountId : challenge.id);
    // Pull real data from the MT5 server via the gateway.
    const accountInfo = await this.getAccountInfo(login);
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const trades = await this.getTradeHistory(login, challenge.startedAt ?? dayAgo, Date.now());
    const result = computeMetricsFromGateway(challenge, accountInfo, trades, previousMetrics);
    return {
      ...result,
      source: "gateway",
      raw: accountInfo,
    };
  }

  async suspendAccount(login: string): Promise<void> {
    const path = MT5_GATEWAY_PATHS.suspend.replace(":login", login);
    await this.request("POST", path, { body: {} });
  }

  async activateAccount(login: string): Promise<void> {
    const path = MT5_GATEWAY_PATHS.activate.replace(":login", login);
    await this.request("POST", path, { body: {} });
  }

  async changePassword(login: string, password: string): Promise<void> {
    const path = MT5_GATEWAY_PATHS.password.replace(":login", login);
    await this.request("PUT", path, { body: { password } });
  }

  async changeInvestorPassword(login: string, password: string): Promise<void> {
    const path = MT5_GATEWAY_PATHS.investorPassword.replace(":login", login);
    await this.request("PUT", path, { body: { password } });
  }
}
