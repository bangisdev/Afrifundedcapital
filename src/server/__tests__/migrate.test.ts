import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../migrate";

function columnNames(db: Database.Database): string[] {
  return (db.prepare("PRAGMA table_info(challenge_templates)").all() as Array<{ name: string }>).map((c) => c.name);
}

/** Original deployed challenge_templates schema (pre news-blackout columns). */
const LEGACY_TEMPLATE_DDL = `CREATE TABLE challenge_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  profit_target REAL NOT NULL,
  daily_drawdown REAL NOT NULL,
  max_drawdown REAL NOT NULL,
  max_leverage INTEGER NOT NULL,
  min_trading_days INTEGER NOT NULL,
  max_trading_days INTEGER,
  max_position_size REAL,
  consistency_target REAL,
  allow_weekend_holding INTEGER DEFAULT 0,
  allow_news_trading INTEGER DEFAULT 1,
  allow_ea_trading INTEGER DEFAULT 1,
  allow_copy_trading INTEGER DEFAULT 0,
  price REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  duration_days INTEGER NOT NULL,
  reset_fee REAL,
  extension_fee REAL,
  scaling_plan TEXT,
  max_account_size REAL,
  created_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);`;

describe("migrate: news blackout columns", () => {
  it("adds them to a pre-existing challenge_templates table (guarded ALTER)", () => {
    const db = new Database(":memory:");
    db.exec(LEGACY_TEMPLATE_DDL);
    runMigrations(db);
    const cols = columnNames(db);
    expect(cols).toContain("news_blackout_before_minutes");
    expect(cols).toContain("news_blackout_after_minutes");
    db.close();
  });

  it("includes them on a fresh database (CREATE TABLE path)", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    const cols = columnNames(db);
    expect(cols).toContain("news_blackout_before_minutes");
    expect(cols).toContain("news_blackout_after_minutes");
    db.close();
  });

  it("is idempotent — re-running leaves the table intact", () => {
    const db = new Database(":memory:");
    db.exec(LEGACY_TEMPLATE_DDL);
    runMigrations(db);
    runMigrations(db);
    const cols = columnNames(db);
    expect(cols).toContain("news_blackout_before_minutes");
    expect(cols).toContain("news_blackout_after_minutes");
    db.close();
  });
});
