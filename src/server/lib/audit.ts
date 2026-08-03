/* eslint-disable @typescript-eslint/no-explicit-any */
import { auditLogs } from "../schema";

// Field/key names that must never be stored in the audit trail in plaintext:
// payment gateway secrets, webhook hashes, API keys, passwords, tokens.
const SENSITIVE_FIELD = /secret|password|token|hash|api[_ -]?key|private/i;
const SENSITIVE_VALUE_KEYS = new Set(["secretKey", "secretHash", "secret_key", "secret_hash"]);

function maskSecret(value: unknown): unknown {
  if (value === null || value === undefined || value === "") return "";
  const s = String(value);
  if (s.length <= 4) return "••••••";
  return `••••••${s.slice(-4)}`;
}

/**
 * Redact a setting value before persisting it to the audit log.
 *
 * Config edits are the most sensitive admin actions (payment keys, webhook
 * hashes, payout thresholds), so secrets must never appear in the trail:
 * - Object configs (e.g. flutterwave_config) get their secret fields masked
 *   while non-secret fields (publicKey, isEnabled) stay visible for review.
 * - Scalar values are masked entirely when the setting key itself looks
 *   sensitive (e.g. flw_secret_key, resend_api_key).
 * - Plain values (payout thresholds, feature flags) are stored in full.
 */
export function redactSetting(key: string, value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_VALUE_KEYS.has(k) || SENSITIVE_FIELD.test(k) ? maskSecret(v) : v;
    }
    return out;
  }
  if (SENSITIVE_FIELD.test(key)) return maskSecret(value);
  return value;
}

/**
 * Write an audit log entry for an admin/compliance action.
 *
 * Never throws — audit failures must never break the primary business action.
 * Wrap callers in try/catch as a belt-and-suspenders measure.
 */
export function writeAuditLog(
  db: any,
  entry: {
    userId: number;
    action: string;
    entity: string;
    entityId: string | number;
    details?: Record<string, unknown>;
    ipAddress?: string;
  },
): void {
  try {
    db.insert(auditLogs)
      .values({
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: String(entry.entityId),
        details: entry.details ? JSON.stringify(entry.details) : null,
        ipAddress: entry.ipAddress || null,
        timestamp: Date.now(),
      })
      .run();
  } catch (e) {
    console.warn("[Audit] Failed to write audit log:", e);
  }
}
