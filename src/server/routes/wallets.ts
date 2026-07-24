import { Hono } from "hono";
import { getDb } from "../db";
import { wallets, walletTransactions } from "../schema";
import { eq, desc, and } from "drizzle-orm";
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
  const txns = db.select().from(walletTransactions)
    .where(eq(walletTransactions.userId, userId))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(100).all();
  return c.json(txns);
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
