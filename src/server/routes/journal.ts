import { Hono } from "hono";
import { getDb } from "../db";
import { journalEntries } from "../schema";
import { eq, desc, asc, and, sql, like, count, inArray } from "drizzle-orm";
import { requireAuth } from "../middleware";

const app = new Hono();

// ─── GET /api/journal — List journal entries (with filters) ────────────
app.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const db = getDb();

  const symbol = c.req.query("symbol");
  const outcome = c.req.query("outcome");
  const strategy = c.req.query("strategy");
  const search = c.req.query("search");
  const sort = c.req.query("sort") || "newest";
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const offset = parseInt(c.req.query("offset") || "0");

  const conditions = [eq(journalEntries.userId, userId)];

  if (symbol) conditions.push(eq(journalEntries.symbol, symbol));
  if (outcome) conditions.push(eq(journalEntries.outcome, outcome));
  if (strategy) conditions.push(eq(journalEntries.strategy, strategy));
  if (search) {
    conditions.push(
      sql`(${journalEntries.symbol} LIKE ${"%" + search + "%"} OR ${journalEntries.notes} LIKE ${"%" + search + "%"} OR ${journalEntries.strategy} LIKE ${"%" + search + "%"} OR ${journalEntries.tags} LIKE ${"%" + search + "%"})`
    );
  }

  const where = and(...conditions);
  const orderBy = sort === "oldest" ? asc(journalEntries.createdAt) : desc(journalEntries.createdAt);

  const entries = db
    .select()
    .from(journalEntries)
    .where(where)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset)
    .all();

  const total = db
    .select({ count: count() })
    .from(journalEntries)
    .where(where)
    .get();

  // Compute stats
  const allEntries = db
    .select({
      outcome: journalEntries.outcome,
      pnl: journalEntries.pnl,
      symbol: journalEntries.symbol,
      strategy: journalEntries.strategy,
      setupQuality: journalEntries.setupQuality,
    })
    .from(journalEntries)
    .where(eq(journalEntries.userId, userId))
    .all();

  const wins = allEntries.filter((e) => e.outcome === "win");
  const losses = allEntries.filter((e) => e.outcome === "loss");
  const breakeven = allEntries.filter((e) => e.outcome === "breakeven");
  const totalPnl = allEntries.reduce((sum, e) => sum + (e.pnl || 0), 0);
  const avgWin = wins.length > 0 ? wins.reduce((s, e) => s + (e.pnl || 0), 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, e) => s + Math.abs(e.pnl || 0), 0) / losses.length : 0;
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

  // Win rate by strategy
  const strategyMap = new Map<string, { wins: number; total: number; pnl: number }>();
  for (const e of allEntries) {
    if (!e.strategy) continue;
    const s = strategyMap.get(e.strategy) || { wins: 0, total: 0, pnl: 0 };
    s.total++;
    s.pnl += e.pnl || 0;
    if (e.outcome === "win") s.wins++;
    strategyMap.set(e.strategy, s);
  }

  // Win rate by symbol
  const symbolMap = new Map<string, { wins: number; total: number; pnl: number }>();
  for (const e of allEntries) {
    const s = symbolMap.get(e.symbol) || { wins: 0, total: 0, pnl: 0 };
    s.total++;
    s.pnl += e.pnl || 0;
    if (e.outcome === "win") s.wins++;
    symbolMap.set(e.symbol, s);
  }

  return c.json({
    entries,
    total: total?.count || 0,
    stats: {
      totalTrades: allEntries.length,
      wins: wins.length,
      losses: losses.length,
      breakeven: breakeven.length,
      winRate: allEntries.length > 0 ? (wins.length / allEntries.length) * 100 : 0,
      totalPnl,
      avgWin,
      avgLoss,
      profitFactor,
      largestWin: Math.max(0, ...wins.map((e) => e.pnl || 0)),
      largestLoss: Math.min(0, ...losses.map((e) => e.pnl || 0)),
      avgSetupQuality: allEntries.length > 0
        ? allEntries.reduce((s, e) => s + (e.setupQuality || 0), 0) / allEntries.length
        : 0,
      strategyStats: Array.from(strategyMap.entries()).map(([name, data]) => ({
        name,
        winRate: data.total > 0 ? (data.wins / data.total) * 100 : 0,
        total: data.total,
        pnl: data.pnl,
      })),
      symbolStats: Array.from(symbolMap.entries()).map(([symbol, data]) => ({
        symbol,
        winRate: data.total > 0 ? (data.wins / data.total) * 100 : 0,
        total: data.total,
        pnl: data.pnl,
      })),
    },
  });
});

// ─── GET /api/journal/:id — Get single entry ────────────
app.get("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = parseInt(c.req.param("id"));
  const db = getDb();

  const entry = db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)))
    .get();

  if (!entry) {
    return c.json({ error: "Entry not found" }, 404);
  }

  return c.json(entry);
});

// ─── POST /api/journal — Create new entry ────────────
app.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const db = getDb();
  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch { /* non-critical */ }

  const now = Date.now();

  const entryData = {
    userId,
    challengeId: body.challengeId as number | null || null,
    symbol: (body.symbol as string || "EURUSD").toUpperCase(),
    direction: (body.direction as string || "buy").toLowerCase(),
    lotSize: body.lotSize as number || null,
    entryPrice: body.entryPrice as number || null,
    exitPrice: body.exitPrice as number || null,
    stopLoss: body.stopLoss as number || null,
    takeProfit: body.takeProfit as number || null,
    pnl: body.pnl as number || 0,
    commission: body.commission as number || 0,
    swap: body.swap as number || null,
    pips: body.pips as number || null,
    openTime: body.openTime as number || null,
    closeTime: body.closeTime as number || null,
    duration: body.duration as number || null,
    strategy: (body.strategy as string) || null,
    timeframe: (body.timeframe as string) || null,
    setupQuality: body.setupQuality as number || null,
    emotionalState: (body.emotionalState as string) || null,
    outcome: (body.outcome as string) || "win",
    tags: body.tags ? JSON.stringify(body.tags) : null,
    notes: (body.notes as string) || null,
    lessonsLearned: (body.lessonsLearned as string) || null,
    screenshots: body.screenshots ? JSON.stringify(body.screenshots) : null,
    createdAt: now,
    updatedAt: now,
  };

  const result = db.insert(journalEntries).values(entryData).run();

  return c.json({ id: result.lastInsertRowid, ...entryData }, 201);
});

// ─── PUT /api/journal/:id — Update entry ────────────
app.put("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = parseInt(c.req.param("id"));
  const db = getDb();
  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch { /* non-critical */ }

  const existing = db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)))
    .get();

  if (!existing) {
    return c.json({ error: "Entry not found" }, 404);
  }

  const updates: Record<string, unknown> = { updatedAt: Date.now() };

  // Only update provided fields
  const fields = [
    "symbol", "direction", "lotSize", "entryPrice", "exitPrice",
    "stopLoss", "takeProfit", "pnl", "commission", "swap", "pips",
    "openTime", "closeTime", "duration", "strategy", "timeframe",
    "setupQuality", "emotionalState", "outcome", "notes", "lessonsLearned", "challengeId",
  ];

  for (const field of fields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (body.tags !== undefined) {
    updates.tags = JSON.stringify(body.tags);
  }
  if (body.screenshots !== undefined) {
    updates.screenshots = JSON.stringify(body.screenshots);
  }

  db.update(journalEntries).set(updates).where(eq(journalEntries.id, id)).run();

  return c.json({ id, ...updates });
});

// ─── DELETE /api/journal/:id — Delete entry ────────────
app.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = parseInt(c.req.param("id"));
  const db = getDb();

  const existing = db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)))
    .get();

  if (!existing) {
    return c.json({ error: "Entry not found" }, 404);
  }

  db.delete(journalEntries).where(eq(journalEntries.id, id)).run();

  return c.json({ success: true });
});

// ─── GET /api/journal/symbols — Get distinct symbols used ────────────
app.get("/symbols/list", requireAuth, async (c) => {
  const userId = c.get("userId");
  const db = getDb();

  const symbols = db
    .selectDistinct({ symbol: journalEntries.symbol })
    .from(journalEntries)
    .where(eq(journalEntries.userId, userId))
    .all();

  return c.json(symbols.map((s) => s.symbol));
});

// ─── GET /api/journal/strategies — Get distinct strategies used ────────────
app.get("/strategies/list", requireAuth, async (c) => {
  const userId = c.get("userId");
  const db = getDb();

  const strategies = db
    .selectDistinct({ strategy: journalEntries.strategy })
    .from(journalEntries)
    .where(and(eq(journalEntries.userId, userId), sql`${journalEntries.strategy} IS NOT NULL`))
    .all();

  return c.json(strategies.map((s) => s.strategy));
});

export default app;
