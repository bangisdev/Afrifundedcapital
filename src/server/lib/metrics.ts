/**
 * Prometheus metrics for AfriFundedCapital — dependency-free (hand-rolled
 * text format, no prom-client).
 *
 * Two kinds of signals:
 *   • In-process counters (HTTP requests, MT5 sync runs, payment webhooks)
 *     — bumped by middleware/handlers, snapshotted at scrape time.
 *   • DB gauges (MT5 queue depth, payment status counts, challenge/account
 *     totals) — re-derived from SQLite on every scrape, so they never go
 *     stale between restarts.
 *
 * Exposed (unauthenticated) at GET /api/metrics (dev + prod) and GET /metrics
 * (prod). Aggregates only — no emails, names, keys, or per-user data.
 *
 * NOTE: this module deliberately does NOT import from `./mt5/*` (except the
 * cycle-free config module): retry-queue and reconciliation import
 * sync-service, which imports this module for its counters — importing them
 * here would create a circular dependency.
 */
import type { Context, Next } from "hono";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  users,
  payments,
  userChallenges,
  mt5Accounts,
  mt5SyncQueue,
  mt5Reconciliation,
} from "../schema";
import { isMT5GatewayConfigured } from "./mt5/config";

const START_TIME = Date.now();

// ─── In-process counters ─────────────────────────────────────
const httpRequests = new Map<string, number>(); // key: method|route|status
const syncRuns = new Map<string, number>(); // key: outcome (synced|error|skipped)
const paymentWebhooks = new Map<string, number>(); // key: provider|event
let syncDurationSumMs = 0;
let syncDurationLastMs = 0;

const bump = (m: Map<string, number>, key: string) => m.set(key, (m.get(key) ?? 0) + 1);

export function recordHttpRequest(method: string, route: string, status: number): void {
  bump(httpRequests, `${method}|${route}|${status}`);
}

export function recordSyncOutcome(outcome: "synced" | "error" | "skipped"): void {
  bump(syncRuns, outcome);
}

export function recordSyncDuration(ms: number): void {
  syncDurationSumMs += ms;
  syncDurationLastMs = ms;
}

export function recordPaymentWebhook(provider: string, event: string): void {
  bump(paymentWebhooks, `${provider}|${event}`);
}

/** Resets in-process counters (test helper). */
export function resetMetrics(): void {
  httpRequests.clear();
  syncRuns.clear();
  paymentWebhooks.clear();
  syncDurationSumMs = 0;
  syncDurationLastMs = 0;
}

/**
 * Hono middleware: counts every request by method, matched route, and status.
 * routePath is bounded (the matched pattern, e.g. `/api/users/:id`); anything
 * that doesn't look like an API route (static assets, unmatched 404 noise from
 * scanners) is bucketed as `other` so cardinality can't explode.
 */
export const metricsMiddleware = async (c: Context, next: Next): Promise<void> => {
  await next();
  try {
    let route = (c.req as { routePath?: string }).routePath || c.req.path;
    const segments = route.split("/").length;
    if (!route.startsWith("/api/") || segments > 12) route = "other";
    recordHttpRequest(c.req.method, route, c.res.status);
  } catch {
    /* metrics are non-critical */
  }
};

// ─── Helpers ─────────────────────────────────────────────────

function esc(value: string | number): string {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

const lines: string[] = [];
let lastFamily = "";

function metric(
  family: string,
  name: string,
  value: number | string,
  labels?: Record<string, string | number>,
  type = "gauge",
  help = "",
): void {
  if (family !== lastFamily) {
    lines.push(`# HELP ${family} ${help}`);
    lines.push(`# TYPE ${family} ${type}`);
    lastFamily = family;
  }
  const labelStr = labels
    ? `{${Object.entries(labels)
        .map(([k, v]) => `${k}="${esc(v)}"`)
        .join(",")}}`
    : "";
  lines.push(`${name}${labelStr} ${value}`);
}

function fmtTimestamp(ms: number | null | undefined): string {
  return ms ? String(Math.floor(ms / 1000)) : "0";
}

// ─── Emitter ─────────────────────────────────────────────────

/** Renders the full Prometheus text exposition. Safe to call per scrape. */
export function emitMetrics(): string {
  lines.length = 0;
  lastFamily = "";
  const db = getDb();
  const now = Date.now();
  const STALE_AFTER_MS = 23 * 60 * 60 * 1000;

  // ── Process / app ──────────────────────────────────────────
  metric("afc_up", "afc_up", 1, undefined, "gauge", "Whether the app is up.");
  metric("afc_process_start_time_seconds", "afc_process_start_time_seconds", Math.floor(START_TIME / 1000), undefined, "gauge", "Process start time (unix seconds).");
  metric("afc_process_uptime_seconds", "afc_process_uptime_seconds", Math.floor((now - START_TIME) / 1000), undefined, "gauge", "Seconds since process start.");
  const mem = process.memoryUsage?.();
  metric("afc_process_memory_bytes", "afc_process_memory_bytes", mem?.rss ?? 0, undefined, "gauge", "Resident set size in bytes.");

  // ── HTTP ───────────────────────────────────────────────────
  const httpFamily = "afc_http_requests_total";
  for (const [key, count] of [...httpRequests.entries()].sort()) {
    const [method, route, status] = key.split("|");
    metric(httpFamily, httpFamily, count, { method, route, status }, "counter", "HTTP requests by method, route, and status.");
  }

  // ── MT5: retry queue ───────────────────────────────────────
  const queueRows = db
    .select({ status: mt5SyncQueue.status, cnt: sql<number>`COUNT(*)` })
    .from(mt5SyncQueue)
    .groupBy(mt5SyncQueue.status)
    .all();
  const queueByStatus: Record<string, number> = {};
  let queueTotal = 0;
  for (const row of queueRows) {
    queueByStatus[row.status] = Number(row.cnt ?? 0);
    queueTotal += Number(row.cnt ?? 0);
  }
  const lastQueueRow = db
    .select({ at: mt5SyncQueue.createdAt })
    .from(mt5SyncQueue)
    .orderBy(sql`created_at DESC`)
    .limit(1)
    .get();
  metric("afc_mt5_queue_depth", "afc_mt5_queue_depth", queueByStatus.pending ?? 0, { status: "pending" }, "gauge", "MT5 sync queue depth by status.");
  metric("afc_mt5_queue_depth", "afc_mt5_queue_depth", queueByStatus.failed ?? 0, { status: "failed" }, "gauge");
  metric("afc_mt5_queue_depth", "afc_mt5_queue_depth", queueByStatus.done ?? 0, { status: "done" }, "gauge");
  metric("afc_mt5_queue_total", "afc_mt5_queue_total", queueTotal, undefined, "gauge", "Total MT5 sync queue entries.");
  metric("afc_mt5_queue_last_job_timestamp_seconds", "afc_mt5_queue_last_job_timestamp_seconds", fmtTimestamp(lastQueueRow?.at ?? null), undefined, "gauge", "Timestamp of the last queue entry.");

  // ── MT5: sync runs (in-process) ────────────────────────────
  const syncFamily = "afc_mt5_sync_runs_total";
  for (const outcome of ["synced", "error", "skipped"] as const) {
    metric(syncFamily, syncFamily, syncRuns.get(outcome) ?? 0, { outcome }, "counter", "MT5 sync runs by outcome.");
  }
  metric("afc_mt5_sync_duration_seconds_total", "afc_mt5_sync_duration_seconds_total", (syncDurationSumMs / 1000).toFixed(3), undefined, "counter", "Cumulative MT5 sync duration in seconds.");
  metric("afc_mt5_sync_last_duration_seconds", "afc_mt5_sync_last_duration_seconds", (syncDurationLastMs / 1000).toFixed(3), undefined, "gauge", "Duration of the most recent sync in seconds.");

  // ── MT5: provider + freshness ──────────────────────────────
  const lastSyncRow = db.select({ at: mt5Accounts.lastSyncAt }).from(mt5Accounts).orderBy(sql`last_sync_at DESC`).limit(1).get();
  metric("afc_mt5_last_sync_timestamp_seconds", "afc_mt5_last_sync_timestamp_seconds", fmtTimestamp(lastSyncRow?.at ?? null), undefined, "gauge", "Most recent MT5 account sync timestamp.");

  const staleRow = db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(mt5Accounts)
    .where(sql`${mt5Accounts.isActive} = 1 AND ${mt5Accounts.isSuspended} = 0 AND (${mt5Accounts.lastSyncAt} IS NULL OR ${mt5Accounts.lastSyncAt} < ${now - STALE_AFTER_MS})`)
    .get();
  metric("afc_mt5_stale_accounts", "afc_mt5_stale_accounts", Number(staleRow?.cnt ?? 0), undefined, "gauge", "Active MT5 accounts not synced in the last 23h.");

  const gatewayConfigured = isMT5GatewayConfigured(db);
  metric("afc_mt5_gateway_configured", "afc_mt5_gateway_configured", gatewayConfigured ? 1 : 0, undefined, "gauge", "Whether a live MT5 gateway is configured.");
  metric("afc_mt5_provider_mode", "afc_mt5_provider_mode", 1, { mode: gatewayConfigured ? "gateway" : "simulated" }, "gauge", "Active MT5 provider mode (1 for the reported mode).");

  // ── MT5: challenges + accounts ─────────────────────────────
  const activeChallenges = db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(userChallenges)
    .where(sql`${userChallenges.status} IN ('active', 'phase_1_passed', 'phase_2_passed', 'funded')`)
    .get();
  metric("afc_challenges_active", "afc_challenges_active", Number(activeChallenges?.cnt ?? 0), undefined, "gauge", "Active/passed/funded challenges.");
  const violatedChallenges = db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(userChallenges)
    .where(eq(userChallenges.status, "violated"))
    .get();
  metric("afc_challenges_violated", "afc_challenges_violated", Number(violatedChallenges?.cnt ?? 0), undefined, "gauge", "Violated challenges.");

  const accountRows = db
    .select({ isActive: mt5Accounts.isActive, isSuspended: mt5Accounts.isSuspended })
    .from(mt5Accounts)
    .all();
  const byAccountStatus = {
    active: accountRows.filter((a) => a.isActive && !a.isSuspended).length,
    suspended: accountRows.filter((a) => a.isSuspended).length,
    inactive: accountRows.filter((a) => !a.isActive && !a.isSuspended).length,
  };
  const accountFamily = "afc_mt5_accounts";
  for (const [status, count] of Object.entries(byAccountStatus)) {
    metric(accountFamily, accountFamily, count, { status }, "gauge", "MT5 accounts by status.");
  }

  // ── MT5: reconciliation ────────────────────────────────────
  const lastReconRow = db
    .select({ at: mt5Reconciliation.recordedAt, status: mt5Reconciliation.status })
    .from(mt5Reconciliation)
    .orderBy(sql`recorded_at DESC`)
    .limit(1)
    .get();
  const reconCountRow = db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(mt5Reconciliation)
    .get();
  metric("afc_mt5_reconciliation_entries_total", "afc_mt5_reconciliation_entries_total", Number(reconCountRow?.cnt ?? 0), undefined, "gauge", "Total reconciliation runs recorded.");
  metric("afc_mt5_reconciliation_last_timestamp_seconds", "afc_mt5_reconciliation_last_timestamp_seconds", fmtTimestamp(lastReconRow?.at ?? null), undefined, "gauge", "Timestamp of the last reconciliation run.");
  if (lastReconRow?.status) {
    metric("afc_mt5_reconciliation_last_status", "afc_mt5_reconciliation_last_status", 1, { status: lastReconRow.status }, "gauge", "Outcome of the last reconciliation run.");
  }

  // ── Payments ───────────────────────────────────────────────
  const paymentRows = db
    .select({
      status: payments.status,
      cnt: sql<number>`COUNT(*)`,
      total: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
    })
    .from(payments)
    .groupBy(payments.status)
    .all();
  const paymentFamily = "afc_payments_total";
  const amountFamily = "afc_payments_amount_total";
  for (const row of paymentRows) {
    metric(paymentFamily, paymentFamily, Number(row.cnt ?? 0), { status: row.status }, "gauge", "Payments by status.");
    metric(amountFamily, amountFamily, Number(row.total ?? 0), { status: row.status }, "gauge", "Sum of payment amounts by status.");
  }

  const webhookFamily = "afc_payment_webhooks_total";
  for (const [key, count] of [...paymentWebhooks.entries()].sort()) {
    const [provider, event] = key.split("|");
    metric(webhookFamily, webhookFamily, count, { provider, event }, "counter", "Payment webhooks received by provider and event.");
  }

  // ── Users ──────────────────────────────────────────────────
  const userRows = db.select({ role: users.role, cnt: sql<number>`COUNT(*)` }).from(users).groupBy(users.role).all();
  const userFamily = "afc_users_total";
  for (const row of userRows) {
    metric(userFamily, userFamily, Number(row.cnt ?? 0), { role: row.role ?? "none" }, "gauge", "Users by role.");
  }

  return `${lines.join("\n")}\n`;
}
