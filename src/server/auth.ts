import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "./db";
import * as schema from "./schema";


export const auth = betterAuth({
  database: drizzleAdapter(getDb(), {
    provider: "sqlite",
    schema: {
      user: schema.users,
      session: schema.sessions,
    },
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  emailVerification: {
    sendOnSignUp: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    freshAge: 60 * 60, // 1 hour
  },
  advanced: {
    crossSubDomainCookies: {
      enabled: false,
    },
    trustedOrigins: (origin: string) => {
      // Accept all origins — the Vite middleware and CORS handle access control.
      // Better Auth rejects requests when the browser Origin header doesn't match,
      // which breaks hosted previews (*.freebuff.dev, *.vly.sh, etc.).
      return true;
    },
  },
  // User can optionally provide OTP via email provider integration
  // For now we use email-password; OTP can be added later
});
