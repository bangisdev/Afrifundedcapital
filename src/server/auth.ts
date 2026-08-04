import { Hono } from "hono";
import { getDb, getSqlite } from "./db";
import { users, sessions, affiliates, wallets, referrals, walletTransactions } from "./schema";
import { notify } from "./lib/notifications";
import { referralSignupEmail } from "./lib/email";
import { eq, and, gt } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import { randomBytes } from "crypto";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const COOKIE_NAME = "afc_session";

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

// ─── Custom Auth Router ────────────────────────────────────
export const authRouter = new Hono();

// ─── POST /api/auth/sign-up/email ──────────────────────────
authRouter.post("/sign-up/email", async (c) => {
  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch {}

  const name = (body.name as string)?.trim();
  const email = (body.email as string)?.trim().toLowerCase();
  const password = body.password as string;

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }
  if (password.length < 6) {
    return c.json({ error: "Password must be at least 6 characters" }, 400);
  }

  const db = getDb();

  // Check if user already exists
  const existing = db.select().from(users).where(eq(users.email, email)).get();
  if (existing) {
    return c.json({ error: "An account with this email already exists" }, 409);
  }

  // Hash password
  const hashedPassword = await hash(password);
  const now = Date.now();

  // Create user
  const user = db
    .insert(users)
    .values({
      name: name || email.split("@")[0],
      email,
      emailVerified: true,
      role: null,
      onboardingComplete: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  // Store password hash in accounts table using raw SQLite
  try {
    const sqlite = getSqlite();
    sqlite.prepare(
      "INSERT OR IGNORE INTO accounts (user_id, account_id, provider_id, password) VALUES (?, ?, ?, ?)"
    ).run(String(user.id), String(user.id), "email", hashedPassword);
  } catch (e) {
    console.warn("[Auth] Could not store password in accounts table:", e);
  }

  // Generate unique referral code for the new user
  const referralCode = "AFR" + Math.random().toString(36).substring(2, 8).toUpperCase();

  // Update user with referral code
  db.update(users).set({ referralCode, updatedAt: now }).where(eq(users.id, user.id)).run();

  // Create affiliate record automatically
  try {
    db.insert(affiliates).values({
      userId: user.id,
      referralCode,
      totalReferrals: 0,
      activeReferrals: 0,
      totalCommissions: 0,
      pendingCommissions: 0,
      paidCommissions: 0,
      commissionRate: 0.10,
      commissionLevels: 0,
      isActive: true,
      joinedAt: now,
    }).run();
  } catch (e) {
    console.warn("[Auth] Failed to create affiliate record:", e);
  }

  // Create wallet for new user
  let newWalletId: number | null = null;
  try {
    const existingWallet = db.select().from(wallets).where(eq(wallets.userId, user.id)).get();
    if (!existingWallet) {
      const w = db.insert(wallets).values({
        userId: user.id,
        balance: 0,
        referralBalance: 0,
        bonusBalance: 0,
        currency: "NGN",
        createdAt: now,
        updatedAt: now,
      }).returning().get();
      newWalletId = w.id;
    } else {
      newWalletId = existingWallet.id;
    }
  } catch (e) {
    console.warn("[Auth] Failed to create wallet:", e);
  }

  // ── Process referral (if ?ref=AFRxxxx was provided) ──────
  const refParam = (body.referralCode as string)?.trim();
  if (refParam) {
    try {
      const referrerAffiliate = db.select().from(affiliates).where(eq(affiliates.referralCode, refParam)).get();
      if (referrerAffiliate && referrerAffiliate.userId !== user.id) {
        // 1. Set referredBy on the new user
        db.update(users).set({ referredBy: referrerAffiliate.userId, updatedAt: now }).where(eq(users.id, user.id)).run();

        // 2. Create a referral record
        const referralRecord = db.insert(referrals).values({
          referrerId: referrerAffiliate.userId,
          referredId: user.id,
          affiliateId: referrerAffiliate.id,
          status: "active",
          createdAt: now,
        }).returning().get();

        // 3. Increment the referrer's affiliate stats
        db.update(affiliates).set({
          totalReferrals: referrerAffiliate.totalReferrals + 1,
          activeReferrals: referrerAffiliate.activeReferrals + 1,
        }).where(eq(affiliates.id, referrerAffiliate.id)).run();

        // 4. Credit a ₦5,000 referral bonus to the new user's wallet
        const REFERRAL_BONUS = 5000;
        if (newWalletId) {
          const wallet = db.select().from(wallets).where(eq(wallets.userId, user.id)).get();
          if (wallet) {
            db.update(wallets).set({
              referralBalance: wallet.referralBalance + REFERRAL_BONUS,
              bonusBalance: wallet.bonusBalance + REFERRAL_BONUS,
              updatedAt: now,
            }).where(eq(wallets.id, wallet.id)).run();

            // Log the wallet transaction
            db.insert(walletTransactions).values({
              walletId: wallet.id,
              userId: user.id,
              type: "referral_bonus",
              amount: REFERRAL_BONUS,
              balanceBefore: wallet.balance,
              balanceAfter: wallet.balance,
              description: `Referral bonus from ${referrerAffiliate.referralCode}`,
              reference: `ref_${referralRecord.id}`,
              createdAt: now,
            }).run();
          }
        }

        console.log(`[Auth] Referral tracked: user ${user.id} referred by affiliate ${referrerAffiliate.id} (${refParam})`);

        // 5. Notify the referrer (dashboard + email)
        const referrerUser = db.select().from(users).where(eq(users.id, referrerAffiliate.userId)).get();
        if (referrerUser) {
          notify(db, referrerUser.id, {
            type: "referral",
            title: "New Referral Signup!",
            message: `${user.name || user.email} signed up using your referral link. You'll earn commission when they purchase a challenge.`,
            link: "/dashboard/affiliate",
            email: referralSignupEmail(
              referrerUser.name || referrerUser.email || "Trader",
              user.name || user.email?.split("@")[0] || "New User",
              user.email || "",
            ),
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn("[Auth] Failed to process referral:", e);
    }
  }

  // Create session
  const token = generateToken();
  const sessionId = generateToken();
  db.insert(sessions).values({
    id: sessionId,
    token,
    userId: user.id,
    expiresAt: now + SESSION_DURATION_MS,
    createdAt: now,
  }).execute();

  // Set cookie
  c.header("Set-Cookie", `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION_MS / 1000}`);

  return c.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    session: { id: token, expiresAt: now + SESSION_DURATION_MS },
  }, 201);
});

// ─── POST /api/auth/sign-in/email ──────────────────────────
authRouter.post("/sign-in/email", async (c) => {
  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch {}

  const email = (body.email as string)?.trim().toLowerCase();
  const password = body.password as string;

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  const db = getDb();

  // Find user
  const user = db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  // Find password hash from accounts table using raw SQLite
  let passwordHash: string | null = null;
  try {
    const sqlite = getSqlite();
    const row = sqlite.prepare(
      "SELECT password FROM accounts WHERE user_id = ? AND provider_id = 'email' LIMIT 1"
    ).get(String(user.id)) as { password: string } | undefined;
    if (row) {
      passwordHash = row.password;
    }
  } catch (e) {
    console.warn("[Auth] Failed to read password:", e);
  }

  if (!passwordHash) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  // Verify password
  const valid = await verify(passwordHash, password);
  if (!valid) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  // Create session
  const token = generateToken();
  const now = Date.now();
  const sessionId = generateToken();
  db.insert(sessions).values({
    id: sessionId,
    token,
    userId: user.id,
    expiresAt: now + SESSION_DURATION_MS,
    createdAt: now,
  }).execute();

  // Set cookie
  c.header("Set-Cookie", `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION_MS / 1000}`);

  return c.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    session: { id: token, expiresAt: now + SESSION_DURATION_MS },
  });
});

// ─── GET /api/auth/session ─────────────────────────────────
authRouter.get("/session", (c) => {
  const cookieHeader = c.req.header("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((ck) => {
      const [key, ...val] = ck.trim().split("=");
      return [key, val.join("=")];
    })
  );

  const token = cookies[COOKIE_NAME];
  if (!token) {
    return c.json({ error: "No session" }, 401);
  }

  const db = getDb();
  const session = db
    .select()
    .from(sessions)
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, Date.now())))
    .get();

  if (!session) {
    return c.json({ error: "Invalid or expired session" }, 401);
  }

  const user = db.select().from(users).where(eq(users.id, session.userId)).get();
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  return c.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
      isAnonymous: false,
      tradingExperience: user.tradingExperience,
      country: user.country,
      timezone: user.timezone,
      phone: user.phone,
      onboardingComplete: user.onboardingComplete,
      kycStatus: user.kycStatus,
      emailNotifications: user.emailNotifications,
      notificationPreferences: user.notificationPreferences,
      isDemoSeeded: user.isDemoSeeded,
      referralCode: user.referralCode,
    },
    session: {
      id: session.token,
      expiresAt: session.expiresAt,
    },
  });
});

// ─── POST /api/auth/sign-out ───────────────────────────────
authRouter.post("/sign-out", (c) => {
  const cookieHeader = c.req.header("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((ck) => {
      const [key, ...val] = ck.trim().split("=");
      return [key, val.join("=")];
    })
  );

  const token = cookies[COOKIE_NAME];
  if (token) {
    try {
      const db = getDb();
      db.delete(sessions).where(eq(sessions.token, token)).run();
    } catch {
      // Non-critical
    }
  }

  c.header("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);

  return c.json({ success: true });
});

// ─── PUT /api/auth/update-user ─────────────────────────────
authRouter.put("/update-user", async (c) => {
  const cookieHeader = c.req.header("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((ck) => {
      const [key, ...val] = ck.trim().split("=");
      return [key, val.join("=")];
    })
  );

  const token = cookies[COOKIE_NAME];
  if (!token) return c.json({ error: "Not authenticated" }, 401);

  const db = getDb();
  const session = db
    .select()
    .from(sessions)
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, Date.now())))
    .get();

  if (!session) return c.json({ error: "Invalid session" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch {}

  // Only allow updating safe fields
  const allowedFields = [
    "name", "tradingExperience", "country", "timezone",
    "phone", "onboardingComplete", "emailNotifications",
    "notificationPreferences", "isDemoSeeded",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  updates.updatedAt = Date.now();

  try {
    db.update(users).set(updates).where(eq(users.id, session.userId)).run();
  } catch {
    return c.json({ error: "Failed to update user" }, 500);
  }

  return c.json({ success: true });
});
