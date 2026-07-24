import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { runMigrations } from "./migrate";

// Database file path — stored in project root
const DB_PATH = process.env.DB_PATH || "./afrifundedcapital.db";

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let migrationsRun = false;

export function getDb() {
  if (!dbInstance) {
    const sqlite = new Database(DB_PATH);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    if (!migrationsRun) {
      runMigrations(sqlite);
      migrationsRun = true;
    }
    dbInstance = drizzle(sqlite, { schema });
  }
  return dbInstance;
}

// Initialize database and run migrations on startup
export function initDatabase() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  runMigrations(sqlite);
  migrationsRun = true;
  return drizzle(sqlite, { schema });
}

export function getSqlite(): Database.Database {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}
