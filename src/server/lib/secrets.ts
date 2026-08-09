/**
 * Runtime-managed gateway secrets (AfriFundedCapital).
 *
 * Gateway API keys (Flutterwave, Resend, …) can be updated from Admin →
 * Settings without touching the deployment environment. Updates are stored in
 * the `settings` table under `secret_override:<NAME>` keys, encrypted at rest
 * with AES-256-GCM, and take effect immediately for every consumer.
 *
 * Resolution order (per secret name):
 *   1. Encrypted DB override (admin-managed) — takes precedence so a revoked
 *      environment key can be replaced in-app without a redeploy.
 *   2. Environment variable (`FLW_SECRET_KEY`, `FLW_SECRET_HASH`,
 *      `RESEND_API_KEY`, …) — the deployment-level source of truth.
 *
 * The AES master key is derived (SHA-256, domain-separated) from
 * `APP_SECRETS_KEY` only — `JWT_PRIVATE_KEY` is itself one of the managed
 * secrets, so it can never be used to encrypt the store (that would be
 * circular). If `APP_SECRETS_KEY` is not set, an ephemeral per-process key is
 * used and the UI is told via `isEncryptionKeyed()` so admins know overrides
 * will not survive a restart.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { getDb, type Db } from "../db";
import { settings } from "../schema";
import { eq } from "drizzle-orm";

/**
 * The env-var names admins can manage from the Settings page.
 *
 * Covers the payment gateways (Flutterwave, Paystack, Resend), the SMTP relay
 * password, and the MT5 Manager API gateway bearer token. These names are
 * mirrored by the secret-leak guards (scripts/check-secrets.sh + .gitleaks.toml).
 */
export const SECRET_NAMES = [
  "FLW_SECRET_KEY",
  "FLW_SECRET_HASH",
  "RESEND_API_KEY",
  "PAYSTACK_SECRET_KEY",
  "SMTP_PASSWORD",
  "MT5_GATEWAY_API_KEY",
  "MT5_MANAGER_PASSWORD",
  "JWT_PRIVATE_KEY",
] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

export const SECRET_OVERRIDE_PREFIX = "secret_override:";

export interface SecretStatus {
  name: string;
  configured: boolean;
  source: "env" | "db" | "none";
  /** Masked value (last 4 chars only) — the raw secret never leaves the server. */
  masked: string;
}

// ─── Master key ────────────────────────────────────────────────
let _masterKey: Buffer | null | undefined; // undefined = not yet computed

function masterKey(): Buffer {
  if (_masterKey) return _masterKey;
  const source = process.env.APP_SECRETS_KEY || "";
  if (!source) {
    // Ephemeral fallback: overrides still work for this process but will not
    // survive a restart. The admin UI surfaces this via isEncryptionKeyed().
    _masterKey = randomBytes(32);
    console.warn(
      "[Secrets] No APP_SECRETS_KEY set — secret overrides are encrypted with an ephemeral key and will NOT survive a restart. Set APP_SECRETS_KEY in the Keys/API keys tab.",
    );
  } else {
    _masterKey = createHash("sha256").update(`afc:secret-store:v1:${source}`).digest();
  }
  return _masterKey;
}

/** True when a stable master key is available (overrides persist across restarts). */
export function isEncryptionKeyed(): boolean {
  return !!process.env.APP_SECRETS_KEY;
}

// ─── AES-256-GCM helpers ───────────────────────────────────────
interface EncryptedPayload {
  v: 1;
  iv: string; // base64
  tag: string; // base64
  data: string; // base64
}

function encrypt(plain: string): string {
  const key = masterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const payload: EncryptedPayload = {
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: enc.toString("base64"),
  };
  return JSON.stringify(payload);
}

function decrypt(payload: string): string {
  const parsed = JSON.parse(payload) as EncryptedPayload;
  if (parsed.v !== 1) throw new Error("Unsupported secret payload version");
  const key = masterKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(parsed.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

// ─── Override store ────────────────────────────────────────────
function readOverride(name: string, db?: Db): string | null {
  try {
    const _db = db ?? getDb();
    const row = _db
      .select()
      .from(settings)
      .where(eq(settings.key, SECRET_OVERRIDE_PREFIX + name))
      .get();
    if (row?.value) {
      const value = decrypt(row.value);
      if (value) return value;
    }
  } catch (e) {
    console.warn(`[Secrets] Failed to decrypt override for ${name}:`, e);
  }
  return null;
}

/** True when the settings key is a secret override (used to exclude them from generic settings APIs). */
export function isSecretOverrideKey(key: string): boolean {
  return key.startsWith(SECRET_OVERRIDE_PREFIX);
}

/**
 * Resolve a gateway secret at runtime: admin DB override first (so a revoked
 * env key can be replaced in-app), then the environment variable.
 */
export function getSecret(name: string, db?: Db): string {
  const override = readOverride(name, db);
  if (override) return override;
  return process.env[name] || "";
}

/** Store an admin-provided value as the encrypted override for a secret. */
export function setSecretOverride(name: string, value: string, db?: Db): void {
  const _db = db ?? getDb();
  const key = SECRET_OVERRIDE_PREFIX + name;
  const payload = encrypt(value);
  const existing = _db.select().from(settings).where(eq(settings.key, key)).get();
  if (existing) {
    _db.update(settings).set({ value: payload, group: "secrets" }).where(eq(settings.key, key)).run();
  } else {
    _db.insert(settings)
      .values({ key, value: payload, group: "secrets", description: `Runtime-managed secret override for ${name}` })
      .run();
  }
}

/** Remove the override so the environment variable takes effect again. */
export function clearSecretOverride(name: string, db?: Db): void {
  const _db = db ?? getDb();
  _db.delete(settings).where(eq(settings.key, SECRET_OVERRIDE_PREFIX + name)).run();
}

/** Whether an admin override currently exists for the secret (regardless of env). */
export function hasSecretOverride(name: string): boolean {
  return readOverride(name) !== null;
}

/** Status for a single managed secret — source, configured flag, masked value. */
export function getSecretStatus(name: string): SecretStatus {
  let value = "";
  let source: SecretStatus["source"] = "none";

  const override = readOverride(name);
  if (override) {
    value = override;
    source = "db";
  } else {
    const env = process.env[name] || "";
    if (env) {
      value = env;
      source = "env";
    }
  }

  return {
    name,
    configured: !!value,
    source,
    masked: value ? `••••••${value.slice(-4)}` : "",
  };
}

/** Status for every managed secret (drives the Admin → Settings badges). */
export function listSecretStatuses(): SecretStatus[] {
  return SECRET_NAMES.map((name) => getSecretStatus(name));
}
