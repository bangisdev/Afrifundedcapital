import type { Db } from "../../db";
import { settings } from "../../schema";
import { eq } from "drizzle-orm";
import { getSecret } from "../secrets";
import {
  type MT5GatewayConfig,
  DEFAULT_MT5_CONFIG,
} from "./types";

/** Settings-table key that holds the gateway config (JSON string). */
export const MT5_CONFIG_SETTING = "mt5_config";

/**
 * Parse the stored JSON config with full defaults — never throws.
 *
 * The gateway `apiKey` is resolved through the runtime secret store (admin
 * override, then `MT5_GATEWAY_API_KEY` env var) so it is never persisted as
 * plaintext in the settings table. A legacy `apiKey` stored in the JSON before
 * the secret store existed is kept as a final fallback so existing installs
 * keep working untouched.
 */
export function getMT5Config(db: Db): MT5GatewayConfig {
  try {
    const row = db.select().from(settings).where(eq(settings.key, MT5_CONFIG_SETTING)).get();
    if (!row) return {
      ...DEFAULT_MT5_CONFIG,
      apiKey: getSecret("MT5_GATEWAY_API_KEY", db),
      managerPassword: getSecret("MT5_MANAGER_PASSWORD", db),
    };
    const parsed = JSON.parse(row.value) as Partial<MT5GatewayConfig>;
    return {
      ...DEFAULT_MT5_CONFIG,
      ...parsed,
      // Secret store first (encrypted override > env), legacy JSON as fallback.
      apiKey: getSecret("MT5_GATEWAY_API_KEY", db) || parsed.apiKey || "",
      managerPassword: getSecret("MT5_MANAGER_PASSWORD", db) || parsed.managerPassword || "",
      baseUrls: Array.isArray(parsed.baseUrls) ? parsed.baseUrls.filter(Boolean) : [],
    };
  } catch {
    return { ...DEFAULT_MT5_CONFIG };
  }
}

/** True when a gateway is enabled and has at least one reachable-looking base URL. */
export function isMT5GatewayConfigured(db: Db): boolean {
  const cfg = getMT5Config(db);
  return cfg.enabled && cfg.baseUrls.length > 0 && Boolean(cfg.apiKey);
}

/** Redacted view of the config — never leaks the password or full API key. */
export function redactMT5Config(cfg: MT5GatewayConfig) {
  return {
    enabled: cfg.enabled,
    baseUrls: cfg.baseUrls,
    apiKeyLast4: cfg.apiKey ? cfg.apiKey.slice(-4) : "",
    hasApiKey: Boolean(cfg.apiKey),
    managerLogin: cfg.managerLogin,
    hasManagerPassword: Boolean(cfg.managerPassword),
    group: cfg.group,
    leverage: cfg.leverage,
    serverName: cfg.serverName,
    requestTimeoutMs: cfg.requestTimeoutMs,
    maxRetries: cfg.maxRetries,
    retryBaseDelayMs: cfg.retryBaseDelayMs,
    reconciliationTolerance: cfg.reconciliationTolerance,
  };
}
