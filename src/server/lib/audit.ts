/* eslint-disable @typescript-eslint/no-explicit-any */
import { auditLogs, users } from "../schema";
import { eq, desc } from "drizzle-orm";

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
 * Attach "last changed by" metadata to a settings list by reading the most
 * recent settings.* audit entry per key (entity `setting`, entityId = key).
 *
 * Every settings mutation route (seed.ts, users.ts, payments.ts) writes an
 * audit entry, so the audit trail is the single source of truth for who last
 * touched each config — regardless of which route saved it. Entries joined
 * with the acting user so reviewers see a name, with a flag when that user's
 * account has since been deleted.
 */
export function attachSettingsLastChanged(
  db: any,
  settingsList: Array<Record<string, any> & { key: string }>,
): Array<Record<string, any>> {
  const latest = new Map<string, Record<string, any>>();
  try {
    const rows = db
      .select({ log: auditLogs, userName: users.name, userEmail: users.email })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(eq(auditLogs.entity, "setting"))
      .orderBy(desc(auditLogs.timestamp))
      .all();

    for (const { log, userName, userEmail } of rows) {
      const key = String(log.entityId ?? "");
      if (key && !latest.has(key)) {
        // First row per key is the most recent (rows are ordered desc)
        latest.set(key, {
          lastChangedUserId: log.userId ?? null,
          lastChangedBy: userName || null,
          lastChangedByEmail: userEmail || null,
          lastChangedAt: log.timestamp ?? null,
          lastChangedAction: log.action ?? null,
          lastChangedUserDeleted: !userName && !userEmail,
        });
      }
    }
  } catch (e) {
    console.warn("[Audit] Failed to attach settings last-changed metadata:", e);
  }

  return settingsList.map((s) => {
    const meta = latest.get(String(s.key ?? ""));
    return meta ? { ...s, ...meta } : s;
  });
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
