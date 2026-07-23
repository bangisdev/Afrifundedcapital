/* eslint-disable @typescript-eslint/no-explicit-any */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily MT5 metrics sync — runs every day at 00:00 UTC
crons.daily(
  "daily-mt5-sync",
  {
    hourUTC: 0,
    minuteUTC: 0,
  },
  (internal as any).sync.dailyMt5Sync,
);

// Sync queue processor — runs every hour to process pending queue items
crons.interval(
  "sync-queue-processor",
  {
    hours: 1,
  },
  (internal as any).sync.processSyncQueue,
);

export default crons;
