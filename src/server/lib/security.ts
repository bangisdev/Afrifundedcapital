/**
 * Security primitives for auth hardening — TOTP (RFC 6238), 2FA backup
 * codes, and the short-lived sign-in challenge store.
 *
 * Implemented with Node's `crypto` only (no extra dependency): HMAC-SHA1 with
 * a 30-second period and 6-digit codes, plus a ±1-step window to tolerate
 * minor clock drift.
 */
import { createHmac, createHash, randomBytes } from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

// ─── Base32 ─────────────────────────────────────────────

export function generateBase32Secret(length = 20): string {
  const bytes = randomBytes(length);
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// ─── TOTP ──────────────────────────────────────────────

function totpAtCounter(secret: string, counter: bigint): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(counter);
  const key = base32Decode(secret);
  if (key.length === 0) return "";
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return (code % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, "0");
}

/** Current TOTP code for a base32 secret (used by tests and the UI flow). */
export function generateTotp(secret: string): string {
  const counter = BigInt(Math.floor(Date.now() / (TOTP_PERIOD_SECONDS * 1000)));
  return totpAtCounter(secret, counter);
}

/** Verify a 6-digit code with a ±window step tolerance (default ±1 = 90s). */
export function verifyTotp(secret: string, code: string, window = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const current = BigInt(Math.floor(Date.now() / (TOTP_PERIOD_SECONDS * 1000)));
  for (let w = -window; w <= window; w++) {
    if (totpAtCounter(secret, current + BigInt(w)) === code) return true;
  }
  return false;
}

/** otpauth:// URI for authenticator apps (e.g. Google Authenticator). */
export function buildOtpauthUrl(secret: string, email: string): string {
  const issuer = "AfriFundedCapital";
  const label = `${issuer}:${email}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
}

// ─── Backup codes ──────────────────────────────────────

/** Generate single-use backup codes (only ever returned to the user once). */
export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () =>
    randomBytes(6).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10),
  );
}

/** Hash a backup code before persisting (SHA-256; codes are high-entropy). */
export function hashBackupCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * Check a submitted code against stored hashes. When it matches, the hash is
 * removed (single use). Returns true on match; mutates `hashes` on success.
 */
export function consumeBackupCode(code: string, hashes: string[]): boolean {
  const clean = code.trim().toUpperCase().replace(/\s+/g, "");
  const idx = hashes.findIndex((h) => h === hashBackupCode(clean));
  if (idx === -1) return false;
  hashes.splice(idx, 1);
  return true;
}

// ─── 2FA sign-in challenge store ───────────────────────
// Single-process in-memory store (the Hono app is one process). A challenge
// is minted after a successful password check when 2FA is enabled, then
// consumed by /2fa/verify within 5 minutes.

interface TwoFactorChallenge {
  userId: number;
  expiresAt: number;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const twoFactorChallenges = new Map<string, TwoFactorChallenge>();

// Periodic cleanup of expired challenges
setInterval(() => {
  const now = Date.now();
  for (const [token, challenge] of twoFactorChallenges) {
    if (challenge.expiresAt <= now) twoFactorChallenges.delete(token);
  }
}, 5 * 60 * 1000);

export function createTwoFactorChallenge(userId: number): { token: string; expiresAt: number } {
  const token = randomBytes(24).toString("hex");
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  twoFactorChallenges.set(token, { userId, expiresAt });
  return { token, expiresAt };
}

/** Returns the userId for a valid (unexpired) challenge, or null. */
export function consumeTwoFactorChallenge(token: string): number | null {
  const challenge = twoFactorChallenges.get(token);
  if (!challenge || challenge.expiresAt <= Date.now()) {
    twoFactorChallenges.delete(token);
    return null;
  }
  twoFactorChallenges.delete(token);
  return challenge.userId;
}
