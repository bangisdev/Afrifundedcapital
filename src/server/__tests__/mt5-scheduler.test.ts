/**
 * MT5 background scheduler unit tests.
 *
 * The scheduler is a thin timer-driven loop over the provider seam, retry
 * queue, and sync service. These tests drive it with Vitest fake timers and
 * fully mocked dependencies so we can assert exactly when (and whether) the
 * scheduler touches the queue / syncs challenges. Coverage:
 *
 *   1. start idempotency — the module-level guard registers timers once
 *   2. gateway-only guard — no-op in simulated mode, active when configured
 *   3. tick error handling — errors are caught, logged, and the loop recovers
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { Db } from "../db";
import type { MT5Provider, ChallengeRow } from "../lib/mt5/types";
import type { ProcessResult } from "../lib/mt5/retry-queue";
import type { SyncOutcome } from "../lib/mt5/sync-service";

vi.mock("../lib/mt5/retry-queue", () => ({
  processSyncQueue: vi.fn(),
}));

vi.mock("../lib/mt5/sync-service", () => ({
  getActiveChallenges: vi.fn(),
  syncChallenge: vi.fn(),
}));

vi.mock("../lib/mt5/index", () => ({
  getMT5Provider: vi.fn(),
}));

const INITIAL_DELAY_MS = 20_000;
const QUEUE_INTERVAL_MS = 5 * 60 * 1000;
const SYNC_INTERVAL_MS = 60 * 60 * 1000;

const EMPTY_PROCESS_RESULT: ProcessResult = {
  processed: 0,
  succeeded: 0,
  failed: 0,
  remaining: 0,
  errors: [],
};

type QueuePassFn = (
  db: Db,
  provider: MT5Provider,
  opts?: { ignoreBackoff?: boolean; limit?: number },
) => Promise<ProcessResult>;
type GetActiveFn = (db: Db) => ChallengeRow[];
type SyncChallengeFn = (db: Db, provider: MT5Provider, challenge: ChallengeRow) => Promise<SyncOutcome>;
type ProviderFn = (db: Db) => MT5Provider;

let startMT5Scheduler: (db: Db) => void;
let processSyncQueue: Mock<QueuePassFn>;
let getActiveChallenges: Mock<GetActiveFn>;
let syncChallenge: Mock<SyncChallengeFn>;
let getMT5Provider: Mock<ProviderFn>;

function fakeProvider(configured: boolean): MT5Provider {
  return { configured, mode: configured ? "gateway" : "simulated" } as unknown as MT5Provider;
}

function makeChallenge(id: number): ChallengeRow {
  return { id, status: "active" } as unknown as ChallengeRow;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();

  // Re-import after the registry reset so the module-level `started` guard
  // starts fresh; the mocked deps resolve to the same shared instances.
  const scheduler = await import("../lib/mt5/scheduler");
  const retryQueue = await import("../lib/mt5/retry-queue");
  const syncService = await import("../lib/mt5/sync-service");
  const index = await import("../lib/mt5/index");

  startMT5Scheduler = scheduler.startMT5Scheduler;
  processSyncQueue = vi.mocked(retryQueue.processSyncQueue);
  getActiveChallenges = vi.mocked(syncService.getActiveChallenges);
  syncChallenge = vi.mocked(syncService.syncChallenge);
  getMT5Provider = vi.mocked(index.getMT5Provider);

  // Mock instances are shared across tests — reset call history + state.
  processSyncQueue.mockReset();
  getActiveChallenges.mockReset();
  syncChallenge.mockReset();
  getMT5Provider.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════
//  START IDEMPOTENCY
// ═══════════════════════════════════════════════════════════════

describe("startMT5Scheduler start idempotency", () => {
  it("registers one initial timeout and two recurring intervals on first start", () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    startMT5Scheduler({} as unknown as Db);

    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy.mock.calls[0]?.[1]).toBe(INITIAL_DELAY_MS);
    expect(setIntervalSpy).toHaveBeenCalledTimes(2);
    expect(setIntervalSpy.mock.calls[0]?.[1]).toBe(QUEUE_INTERVAL_MS);
    expect(setIntervalSpy.mock.calls[1]?.[1]).toBe(SYNC_INTERVAL_MS);
  });

  it("does not register extra timers when started repeatedly", () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    startMT5Scheduler({} as unknown as Db);
    startMT5Scheduler({} as unknown as Db);
    startMT5Scheduler({} as unknown as Db);

    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledTimes(2);
  });
});

// ═══════════════════════════════════════════════════════════════
//  GATEWAY-ONLY GUARD
// ═══════════════════════════════════════════════════════════════

describe("startMT5Scheduler gateway-only guard", () => {
  it("stays dormant in simulated mode: no queue processing and no syncs", async () => {
    getMT5Provider.mockReturnValue(fakeProvider(false));
    processSyncQueue.mockResolvedValue(EMPTY_PROCESS_RESULT);
    getActiveChallenges.mockReturnValue([]);

    startMT5Scheduler({} as unknown as Db);

    // Initial pass (20s) plus several queue intervals — all must be no-ops.
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS + 3 * QUEUE_INTERVAL_MS);

    expect(getMT5Provider).toHaveBeenCalled();
    expect(processSyncQueue).not.toHaveBeenCalled();
    expect(getActiveChallenges).not.toHaveBeenCalled();
    expect(syncChallenge).not.toHaveBeenCalled();
  });

  it("does not act before the initial delay elapses", async () => {
    getMT5Provider.mockReturnValue(fakeProvider(true));
    processSyncQueue.mockResolvedValue(EMPTY_PROCESS_RESULT);
    getActiveChallenges.mockReturnValue([]);

    startMT5Scheduler({} as unknown as Db);
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS - 1);

    expect(getMT5Provider).not.toHaveBeenCalled();
    expect(processSyncQueue).not.toHaveBeenCalled();
    expect(getActiveChallenges).not.toHaveBeenCalled();
  });

  it("processes the queue and syncs active challenges when a gateway is configured", async () => {
    const db = {} as unknown as Db;
    const provider = fakeProvider(true);
    const challenge = makeChallenge(7);
    getMT5Provider.mockReturnValue(provider);
    processSyncQueue.mockResolvedValue(EMPTY_PROCESS_RESULT);
    getActiveChallenges.mockReturnValue([challenge]);
    syncChallenge.mockResolvedValue({ synced: true, source: "gateway" });
    const logSpy = vi.spyOn(console, "log");

    startMT5Scheduler(db);
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS);

    expect(processSyncQueue).toHaveBeenCalledTimes(1);
    expect(processSyncQueue).toHaveBeenCalledWith(db, provider, { limit: 50 });
    expect(getActiveChallenges).toHaveBeenCalledTimes(1);
    expect(syncChallenge).toHaveBeenCalledTimes(1);
    expect(syncChallenge).toHaveBeenCalledWith(db, provider, challenge);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[MT5] Daily sync pass: 1/1"));
  });

  it("logs a warning when a queue pass leaves failed or remaining jobs", async () => {
    getMT5Provider.mockReturnValue(fakeProvider(true));
    processSyncQueue.mockResolvedValue({
      processed: 3,
      succeeded: 1,
      failed: 2,
      remaining: 1,
      errors: [],
    });
    getActiveChallenges.mockReturnValue([]);
    const warnSpy = vi.spyOn(console, "warn");

    startMT5Scheduler({} as unknown as Db);
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain(
      "[MT5] Queue pass: 3 processed, 1 ok, 2 failed, 1 remaining (gateway)",
    );
  });
});

// ═══════════════════════════════════════════════════════════════
//  TICK ERROR HANDLING
// ═══════════════════════════════════════════════════════════════

describe("startMT5Scheduler tick error handling", () => {
  it("catches and logs queue processing errors without crashing", async () => {
    getMT5Provider.mockReturnValue(fakeProvider(true));
    processSyncQueue.mockRejectedValue(new Error("gateway timeout"));
    getActiveChallenges.mockReturnValue([]);
    const errorSpy = vi.spyOn(console, "error");

    startMT5Scheduler({} as unknown as Db);
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toContain("[MT5] Queue processing error:");
    const err = errorSpy.mock.calls[0]?.[1];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("gateway timeout");
  });

  it("recovers on the next queue interval after a failed tick", async () => {
    getMT5Provider.mockReturnValue(fakeProvider(true));
    processSyncQueue
      .mockRejectedValueOnce(new Error("gateway timeout"))
      .mockResolvedValue(EMPTY_PROCESS_RESULT);
    getActiveChallenges.mockReturnValue([]);
    const errorSpy = vi.spyOn(console, "error");

    startMT5Scheduler({} as unknown as Db);
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS); // initial pass → queue fails
    expect(processSyncQueue).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(QUEUE_INTERVAL_MS); // next tick → succeeds
    expect(processSyncQueue).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledTimes(1); // still only the one failure
  });

  it("catches and logs daily sync errors without crashing", async () => {
    getMT5Provider.mockReturnValue(fakeProvider(true));
    processSyncQueue.mockResolvedValue(EMPTY_PROCESS_RESULT);
    getActiveChallenges.mockReturnValue([makeChallenge(1)]);
    syncChallenge.mockRejectedValue(new Error("provider down"));
    const errorSpy = vi.spyOn(console, "error");

    startMT5Scheduler({} as unknown as Db);
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS);

    expect(syncChallenge).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toContain("[MT5] Daily sync error:");
    expect((errorSpy.mock.calls[0]?.[1] as Error).message).toBe("provider down");
  });

  it("recovers on the next hourly sync pass after a challenge throws", async () => {
    getMT5Provider.mockReturnValue(fakeProvider(true));
    processSyncQueue.mockResolvedValue(EMPTY_PROCESS_RESULT);
    getActiveChallenges
      .mockReturnValueOnce([makeChallenge(1)])
      .mockReturnValueOnce([makeChallenge(2)]);
    syncChallenge
      .mockRejectedValueOnce(new Error("provider down"))
      .mockResolvedValue({ synced: true, source: "gateway" });
    const errorSpy = vi.spyOn(console, "error");
    const logSpy = vi.spyOn(console, "log");

    startMT5Scheduler({} as unknown as Db);
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS); // first pass → ch1 throws
    expect(syncChallenge).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS); // hourly pass → ch2 syncs
    expect(syncChallenge).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[MT5] Daily sync pass: 1/1"));
  });
});
