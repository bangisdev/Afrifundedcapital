import { Hono, type Context } from "hono";
import { emitMetrics } from "../lib/metrics";

/**
 * Prometheus scrape endpoint — unauthenticated aggregates only (no PII).
 * Mounted at /api/metrics (dev + prod) and /metrics (prod alias).
 */
export const metricsHandler = (c: Context) =>
  c.text(emitMetrics(), 200, {
    "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
  });

const app = new Hono();
app.get("/", metricsHandler);

export default app;
