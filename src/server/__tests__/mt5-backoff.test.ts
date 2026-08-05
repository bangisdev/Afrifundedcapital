/**
 * MT5 retry-queue backoff schedule unit tests.
 *
 * The retry queue uses exponential backoff (base * 2^failures, capped at 1h)
 * before re-attempting a failed job. Coverage:
 *
 *   1. The schedule math itself (`backoffDelayMs`) — doubling, one-hour cap,
 *      negative clamping, custom base.
 *   2. `processSyncQueue` honoring the window: a failed job is skipped while
 *      it is still cooling down, becomes eligible at the window edge, and is
 *      retried at each doubling step until `maxRetries` is exhausted.
 *   3. `ignoreBackoff` bypassing the cooldown window.
 *
 * Jobs use the `sync` action against a bare MT5 account with no bound
 * challenge, which makes the queue throw deterministically ("No active
 * challenge ...") so every attempt fails in a controlled way. Time is mocked
 * with Vitest fake timers limited to `Date` so no real timers are involved.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb, getTestSqlite, cleanupTestDb } from "./setup";
import { settings, mt5SyncQueue } from "../schema";
import { MT5_CONFIG_SETTING } from "../lib/mt5/config";
import { getMT5Provider } from "../lib/mt5";
import {
  enqueueSyncJob,
  processSyncQueue,
  backoffDelayMs,
  getQueueEntries,
} from "../lib/mt5/retry-queue";

const BASE_DELAY_MS = 30_000;
const ONE_HOUR_MS = 60 * 60 * 1000;

let userId: number;
let T0: number;

beforeAll(() => {
  // Create the shared test DB before any time mocking so migrations run on
  // real timers, then seed a real user for the MT5 account fixtures.
  getTestDb();
  const sqlite = getTestSqlite();
  const res = sqlite
    .prepare(
      "INSERT INTO users (name, email, email_verified, role, created_at, updated_at) VALUES ('Backoff Tester', 'backoff-tester@test.com', 1, 'user', ?, ?)",
    )
    .run(Date.now(), Date.now());
  userId = Number(res.lastInsertRowid);
});

afterAll(() => {
  cleanupTestDb();
});

beforeEach(() => {
  T0 = 1_700_000_000_000; // arbitrary fixed instant
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);

  const sqlite = getTestSqlite();
  sqlite.prepare("DELETE FROM mt5_sync_queue").run();
  sqlite.prepare("DELETE FROM user_challenges").run();
  sqlite.prepare("DELETE FROM mt5_accounts").run();
  const db = getTestDb();
  db.delete(settings).where(eq(settings.key, MT5_CONFIG_SETTING)).run();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Insert a bare MT5 account with no bound challenge (so `sync` jobs fail). */
function seedAccount(login: string): number {
  const sqlite = getTestSqlite();
  const res = sqlite
    .prepare(
      `INSERT INTO mt5_accounts (user_id, login, password, investor_password, server, "group", leverage, balance, equity, currency, created_at) VALUES (?, ?, 'pw', 'inv', 'Test', 'DEMO\\AFC', 100, 10000, 10000, 'NGN', ?)`,
    )
    .run(userId, login, T0);
  return Number(res.lastInsertRowid);
}

/** The single pending job (tests in this file operate on exactly one job). */
function currentJob() {
  return getTestDb().select().from(mt5SyncQueue).get();
}

// ═══════════════════════════════════════════════════════════════
//  SCHEDULE MATH
// ═══════════════════════════════════════════════════════════════

describe("backoffDelayMs exponential schedule", () => {
  it("returns the base delay for the first attempt", () => {
    expect(backoffDelayMs(0)).toBe(BASE_DELAY_MS);
  });

  it("doubles the delay for each additional failure", () => {
    expect(backoffDelayMs(1)).toBe(BASE_DELAY_MS * 2);
    expect(backoffDelayMs(2)).toBe(BASE_DELAY_MS * 4);
    expect(backoffDelayMs(3)).toBe(BASE_DELAY_MS * 8);
    expect(backoffDelayMs(4)).toBe(BASE_DELAY_MS * 16);
  });

  it("caps the delay at one hour", () => {
    // 30s * 2^6 = 1_920_000 (< 1h) is still uncapped; 30s * 2^7 hits the cap.
    expect(backoffDelayMs(6)).toBe(BASE_DELAY_MS * 64);
    expect(backoffDelayMs(7)).toBe(ONE_HOUR_MS);
    expect(backoffDelayMs(20)).toBe(ONE_HOUR_MS);
    expect(backoffDelayMs(1_000)).toBe(ONE_HOUR_MS);
  });

  it("clamps negative retry counts to the base delay", () => {
    expect(backoffDelayMs(-3)).toBe(BASE_DELAY_MS);
    expect(backoffDelayMs(-10)).toBe(BASE_DELAY_MS);
  });

  it("honors a custom base delay", () => {
    expect(backoffDelayMs(1, 1_000)).toBe(2_000);
    expect(backoffDelayMs(3, 1_000)).toBe(8_000);
  });
});

// ═══════════════════════════════════════════════════════════════
//  QUEUE BEHAVIOR
// ═══════════════════════════════════════════════════════════════

describe("processSyncQueue backoff gating", () => {
  it("attempts a fresh job immediately (no backoff before the first failure)", async () => {
    const db = getTestDb();
    const accountId = seedAccount("BKOFF-NOCOOL");
    enqueueSyncJob(db, { mt5AccountId: accountId, action: "sync", maxRetries: 3 });

    const result = await processSyncQueue(db, getMT5Provider(db));
    // No challenge bound → the sync job fails, but is re-queued (retryCount 1).
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.remaining).toBe(1);

    expect(currentJob()?.retryCount).toBe(1);
    expect(currentJob()?.processedAt).toBe(T0);
    expect(currentJob()?.status).toBe("pending");
  });

  it("skips a failed job while it is still inside its backoff window", async () => {
    const db = getTestDb();
    const accountId = seedAccount("BKOFF-WINDOW");
    enqueueSyncJob(db, { mt5AccountId: accountId, action: "sync", maxRetries: 3 });

    // First attempt (immediately) fails → retryCount 1, processedAt = T0.
    await processSyncQueue(db, getMT5Provider(db), { ignoreBackoff: true });
    expect(currentJob()?.retryCount).toBe(1);

    // Still inside the 60s window (T0 + 30s) → the queue must skip it.
    vi.setSystemTime(T0 + 30_000);
    const cooling = await processSyncQueue(db, getMT5Provider(db));
    expect(cooling.processed).toBe(0);
    expect(cooling.remaining).toBe(1);
    expect(currentJob()?.retryCount).toBe(1); // untouched during cooldown

    // At the exact window edge (T0 + 60s) → eligible again.
    vi.setSystemTime(T0 + 60_000);
    const retried = await processSyncQueue(db, getMT5Provider(db));
    expect(retried.processed).toBe(1);
    expect(currentJob()?.retryCount).toBe(2);
  });

  it("retries at each doubling step and fails the job after maxRetries", async () => {
    const db = getTestDb();
    const accountId = seedAccount("BKOFF-EXHAUST");
    enqueueSyncJob(db, { mt5AccountId: accountId, action: "sync", maxRetries: 3 });

    // T0: first attempt fails → retryCount 1.
    await processSyncQueue(db, getMT5Provider(db), { ignoreBackoff: true });

    // T0 + 60s (2x base): attempt 2 fails → retryCount 2 (still re-queued).
    vi.setSystemTime(T0 + 60_000);
    const r2 = await processSyncQueue(db, getMT5Provider(db));
    expect(r2.processed).toBe(1);
    expect(r2.failed).toBe(0);

    // T0 + 180s (4x base since the last attempt): attempt 3 fails → maxRetries
    // exhausted → the job transitions to `failed`.
    vi.setSystemTime(T0 + 180_000);
    const r3 = await processSyncQueue(db, getMT5Provider(db));
    expect(r3.processed).toBe(1);
    expect(r3.failed).toBe(1);
    expect(r3.remaining).toBe(0);

    const failed = getQueueEntries(db, { status: "failed" });
    expect(failed.items).toHaveLength(1);
    expect(failed.items[0].error).toContain("No active challenge");
    expect(failed.items[0].retryCount).toBe(3);
  });

  it("ignoreBackoff bypasses the cooldown window", async () => {
    const db = getTestDb();
    const accountId = seedAccount("BKOFF-FORCE");
    enqueueSyncJob(db, { mt5AccountId: accountId, action: "sync", maxRetries: 5 });

    // First failure at T0 → retryCount 1.
    await processSyncQueue(db, getMT5Provider(db), { ignoreBackoff: true });

    // Inside the window, ignoreBackoff forces an immediate retry.
    vi.setSystemTime(T0 + 5_000);
    const forced = await processSyncQueue(db, getMT5Provider(db), { ignoreBackoff: true });
    expect(forced.processed).toBe(1);
    expect(currentJob()?.retryCount).toBe(2);
  });
});
