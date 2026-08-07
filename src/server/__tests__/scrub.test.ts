/**
 * Security regression test for the boot-time secret scrub.
 *
 * API keys and gateway secrets must never live in the settings table — the DB
 * files previously ended up in git history, which is how the Resend key was
 * exposed. `scrubStoredSecrets` (called at the end of `runMigrations`) removes
 * any legacy secret fields from existing rows.
 */
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { runMigrations, scrubStoredSecrets } from "../migrate";

function insertSetting(
  db: Database.Database,
  key: string,
  value: Record<string, unknown>,
): void {
  db.prepare('INSERT INTO settings (key, value, "group") VALUES (?, ?, ?)').run(
    key,
    JSON.stringify(value),
    "test",
  );
}

describe("scrubStoredSecrets", () => {
  it("removes secret fields from settings rows but keeps non-secret config", () => {
    const db = new Database(":memory:");
    runMigrations(db);

    insertSetting(db, "resend_config", {
      apiKey: "re_1234567890abcdefghij",
      fromEmail: "x@y.com",
      enabled: true,
    });
    insertSetting(db, "flutterwave_config", {
      publicKey: "FLWPUBK-123",
      secretKey: "FLWSECK-1234567890abcdef",
      secretHash: "hash",
      isEnabled: true,
    });

    scrubStoredSecrets(db);

    const resend = JSON.parse(
      (db.prepare("SELECT value FROM settings WHERE key = 'resend_config'").get() as { value: string }).value,
    ) as Record<string, unknown>;
    expect(resend.apiKey).toBeUndefined();
    expect(resend.fromEmail).toBe("x@y.com");
    expect(resend.enabled).toBe(true);

    const flw = JSON.parse(
      (db.prepare("SELECT value FROM settings WHERE key = 'flutterwave_config'").get() as { value: string }).value,
    ) as Record<string, unknown>;
    expect(flw.secretKey).toBeUndefined();
    expect(flw.secretHash).toBeUndefined();
    expect(flw.publicKey).toBe("FLWPUBK-123");
    expect(flw.isEnabled).toBe(true);
  });

  it("leaves non-secret settings untouched", () => {
    const db = new Database(":memory:");
    runMigrations(db);

    insertSetting(db, "payout_thresholds", {
      minPayout: 5000,
      maxPayout: 500000,
      currency: "NGN",
    });

    scrubStoredSecrets(db);

    const row = db.prepare("SELECT value FROM settings WHERE key = 'payout_thresholds'").get() as {
      value: string;
    };
    const parsed = JSON.parse(row.value) as Record<string, unknown>;
    expect(parsed.minPayout).toBe(5000);
    expect(parsed.currency).toBe("NGN");
  });
});
