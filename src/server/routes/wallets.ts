import { Hono } from "hono";
import { getDb } from "../db";
import { wallets, walletTransactions } from "../schema";
import { eq, desc, asc, count, and, or, like, type SQL, type SQLWrapper } from "drizzle-orm";
import { requireAuth } from "../middleware";

const app = new Hono();

// Get my wallet
app.get("/my", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();
  let wallet = db.select().from(wallets).where(eq(wallets.userId, userId)).get();
  if (!wallet) {
    const now = Date.now();
    db.insert(wallets).values({ userId, balance: 0, referralBalance: 0, bonusBalance: 0, createdAt: now, updatedAt: now }).run();
    wallet = db.select().from(wallets).where(eq(wallets.userId, userId)).get();
  }
  return c.json(wallet);
});

// Get my wallet transactions
app.get("/transactions", requireAuth, (c) => {
  const userId = c.get("userId");
  const db = getDb();

  const qPage = Number(c.req.query("page") || 1);
  const qPageSize = Number(c.req.query("pageSize") || 10);
  const page = Math.max(1, qPage);
  const pageSize = Math.min(50, Math.max(1, qPageSize));

  // Sorting (whitelisted columns, asc/desc)
  const SORTABLE: Record<string, SQLWrapper> = {
    id: walletTransactions.id,
    type: walletTransactions.type,
    amount: walletTransactions.amount,
    reference: walletTransactions.reference,
    createdAt: walletTransactions.createdAt,
  };
  const qSortBy = String(c.req.query("sortBy") || "createdAt");
  const qSortOrder = String(c.req.query("sortOrder") || "desc");
  const sortCol = SORTABLE[qSortBy] || walletTransactions.createdAt;
  const sortOrder = qSortOrder.toLowerCase() === "asc" ? asc(sortCol) : desc(sortCol);

  // Filters
  const search = (c.req.query("search") || "").trim();
  const type = c.req.query("type") || "";

  const conditions: SQL[] = [eq(walletTransactions.userId, userId)];
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        like(walletTransactions.description, pattern),
        like(walletTransactions.type, pattern),
      )!,
    );
  }
  if (type && type !== "all") conditions.push(eq(walletTransactions.type, type));
  const whereClause: SQL = and(...conditions)!;

  // Total matching count
  const totalRow = db
    .select({ count: count() })
    .from(walletTransactions)
    .where(whereClause)
    .get();
  const total = totalRow?.count || 0;

  // Page of transactions
  const items = db
    .select()
    .from(walletTransactions)
    .where(whereClause)
    .orderBy(sortOrder)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  // User-wide stats (unfiltered)
  const allTxns = db
    .select({ type: walletTransactions.type })
    .from(walletTransactions)
    .where(eq(walletTransactions.userId, userId))
    .all();
  const byType = allTxns.reduce<Record<string, number>>((acc, t) => {
    acc[t.type] = (acc[t.type] || 0) + 1;
    return acc;
  }, {});

  return c.json({
    transactions: items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats: { total: allTxns.length, byType },
  });
});

// Request withdrawal
app.post("/withdraw", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const db = getDb();
  const wallet = db.select().from(wallets).where(eq(wallets.userId, userId)).get();

  if (!wallet || wallet.balance < body.amount) {
    return c.json({ error: "Insufficient balance" }, 400);
  }

  const newBalance = wallet.balance - body.amount;
  db.update(wallets).set({ balance: newBalance, updatedAt: Date.now() }).where(eq(wallets.userId, userId)).run();
  db.insert(walletTransactions).values({
    walletId: wallet.id, userId, type: "withdrawal", amount: body.amount,
    balanceBefore: wallet.balance, balanceAfter: newBalance,
    description: body.description || "Wallet withdrawal",
    createdAt: Date.now(),
  }).run();

  return c.json({ success: true });
});

export default app;
