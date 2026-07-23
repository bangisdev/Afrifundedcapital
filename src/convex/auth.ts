// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { emailOtp } from "./auth/emailOtp";


export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [emailOtp, Anonymous],
  // Session lasts 30 days (matches the "remember me" UX).
  // Non-remembered sessions are cleared client-side when the user
  // returns to the auth page (see Auth.tsx mount logic).
  session: {
    totalDurationMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    inactiveDurationMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
  callbacks: {
    /**
     * After a user is created or updated by Convex Auth's default store,
     * this callback ensures our application's `users` table document has
     * the correct default fields (role, KYC status, preferences) and
     * automatically creates a wallet for new users.
     */
    async afterUserCreatedOrUpdated(ctx, args) {
      const { userId, existingUserId } = args;

      // Update the user document with the latest auth identity info
      const identity = await ctx.auth.getUserIdentity();
      await ctx.db.patch(userId, {
        name: identity?.name ?? undefined,
        email: identity?.email ?? undefined,
        image: identity?.image ?? undefined,
        isAnonymous: identity?.tokenIdentifier?.includes("anonymous") || false,
      });

      // ── New user — set default fields and create wallet ──
      if (!existingUserId) {
        await ctx.db.patch(userId, {
          role: "user",
          kycStatus: "unverified",
          emailNotifications: true,
          notificationPreferences: {
            email_payment: true,
            email_kyc: true,
            email_challenge: true,
            email_referral: true,
            email_support: true,
            marketing: false,
          },
        });

        // Create a wallet for the new user
        // (This is a new user so the wallet won't exist yet)
        await ctx.db.insert("wallets", {
          userId,
          balance: 0,
          referralBalance: 0,
          bonusBalance: 0,
          currency: "NGN",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    },
  },
});