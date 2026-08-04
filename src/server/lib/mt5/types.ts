import type { tradingMetrics, userChallenges, mt5Accounts } from "../../schema";

/** Metric columns populated by the daily sync (everything except FK/timestamp columns). */
export type SyncMetrics = Omit<
  typeof tradingMetrics.$inferInsert,
  "id" | "mt5AccountId" | "challengeId" | "recordedAt"
>;

export type ChallengeRow = typeof userChallenges.$inferSelect;
export type Mt5AccountRow = typeof mt5Accounts.$inferSelect;

/** Account snapshot returned by the MT5 Manager API gateway. */
export interface MT5AccountInfo {
  login: string;
  group: string;
  leverage: number;
  balance: number;
  equity: number;
  margin: number;
  marginFree: number;
  credit: number;
  floatingPL: number;
  openPositions: number;
  serverTime: number; // epoch ms
  currency: string;
}

/** A single closed trade / deal as returned by the gateway. */
export interface MT5TradeRecord {
  ticket: number;
  login: string;
  symbol: string;
  action: "buy" | "sell";
  volume: number;
  priceOpen: number;
  priceClose: number;
  profit: number;
  commission: number;
  swap: number;
  openedAt: number; // epoch ms
  closedAt: number; // epoch ms
}

/** Result of a daily sync for one challenge. */
export interface MT5SyncResult {
  metrics: SyncMetrics;
  accountUpdate: { balance: number; equity: number };
  source: "gateway" | "simulated";
  raw?: MT5AccountInfo;
}

/** Persistent gateway connection settings (stored encrypted-ish in the settings table). */
export interface MT5GatewayConfig {
  enabled: boolean;
  /** One or more gateway base URLs for failover, e.g. https://mt5-gw-1.internal:8443 */
  baseUrls: string[];
  /** Shared API key the gateway requires (Authorization: Bearer). */
  apiKey: string;
  /** MT5 manager account used to log into the Manager API. */
  managerLogin: string;
  /** MT5 manager password — stored in the DB, never returned to the client. */
  managerPassword: string;
  /** Default group new accounts are assigned to. */
  group: string;
  /** Default leverage for new accounts. */
  leverage: number;
  /** Server display name (e.g. "AfriFundedCapital-Live"). */
  serverName: string;
  /** Timeout for each gateway request (ms). */
  requestTimeoutMs: number;
  /** Max attempts per operation (includes the first attempt). */
  maxRetries: number;
  /** Retry base delay (ms) — exponential backoff 2^n * baseDelay. */
  retryBaseDelayMs: number;
  /** Reconciliation tolerance — |server - local| under this is considered matched. */
  reconciliationTolerance: number;
}

export const DEFAULT_MT5_CONFIG: MT5GatewayConfig = {
  enabled: false,
  baseUrls: [],
  apiKey: "",
  managerLogin: "",
  managerPassword: "",
  group: "DEMO\\AFC",
  leverage: 100,
  serverName: "AfriFundedCapital-Live",
  requestTimeoutMs: 15_000,
  maxRetries: 3,
  retryBaseDelayMs: 1_000,
  reconciliationTolerance: 0.01,
};

/**
 * MT5 Provider — the seam between the app and the MT5 Manager API.
 *
 * Two implementations exist:
 *  - `HttpMT5Provider`  — real connector that talks to a self-hosted gateway
 *    service wrapping the official MT5 Manager API (the standard bridging
 *    pattern, since the Manager API is a binary/C++ protocol).
 *  - `SimulatedMT5Provider` — deterministic fallback used when no gateway is
 *    configured, so demos and tests keep working.
 */
export interface MT5Provider {
  readonly mode: "gateway" | "simulated";
  readonly configured: boolean;

  /** Ping the underlying connection. Simulated always succeeds. */
  ping(): Promise<{ ok: boolean; latencyMs: number; message: string }>;

  /** Create a trading account on the MT5 server. Returns the assigned login. */
  createAccount(input: {
    name: string;
    email: string;
    balance: number;
    leverage: number;
    group: string;
    password: string;
    investorPassword: string;
  }): Promise<{ login: string; server: string }>;

  /** Fetch the current account snapshot from the MT5 server. */
  getAccountInfo(login: string): Promise<MT5AccountInfo>;

  /** Fetch closed trades between `from` and `to` (epoch ms). */
  getTradeHistory(login: string, from: number, to: number): Promise<MT5TradeRecord[]>;

  /**
   * Produce the daily metrics + account update for one challenge.
   * `previousMetrics` is the last stored record (for continuity), or null.
   */
  syncDaily(
    challenge: ChallengeRow,
    previousMetrics: SyncMetrics | null,
  ): Promise<MT5SyncResult>;

  /** Suspend / activate / change passwords on the live account. */
  suspendAccount(login: string): Promise<void>;
  activateAccount(login: string): Promise<void>;
  changePassword(login: string, password: string): Promise<void>;
  changeInvestorPassword(login: string, password: string): Promise<void>;
}

/** Mapped gateway endpoint contract (documented, versioned). */
export const MT5_GATEWAY_PATHS = {
  health: "/health",
  login: "/auth/connect", // POST { managerLogin, managerPassword }
  account: "/accounts/:login", // GET
  createAccount: "/accounts", // POST
  history: "/accounts/:login/history", // GET ?from&to
  suspend: "/accounts/:login/suspend", // POST
  activate: "/accounts/:login/activate", // POST
  password: "/accounts/:login/password", // PUT { password }
  investorPassword: "/accounts/:login/investor-password", // PUT { password }
} as const;
