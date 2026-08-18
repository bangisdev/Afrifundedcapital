/**
 * Shared Zod validation helpers for Hono route handlers.
 *
 * Usage:
 *   import { validate, schemas } from "../lib/validate";
 *   const result = await validate(c, schemas.signIn);
 *   if (result instanceof Response) return result;
 *   const body = result;
 */
import { z } from "zod";
import type { Context } from "hono";

/**
 * Parse and validate the JSON body of a Hono request.
 * Returns the validated data on success, or a 400 Response on failure.
 * Callers MUST check `if (result instanceof Response) return result;`.
 */
export async function validate<T extends z.ZodType>(
  c: Context,
  schema: T,
): Promise<z.infer<T> | Response> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    return c.json({ error: "Validation failed", issues }, 400);
  }
  return result.data;
}

// ═══════════════════════════════════════════════
//  SCHEMAS — reusable validation contracts
// ═══════════════════════════════════════════════

export const schemas = {
  // Auth
  signIn: z.object({
    email: z.string().email().max(255),
    password: z.string().min(1).max(128),
  }),

  signUp: z.object({
    name: z.string().max(100).optional(),
    email: z.string().email().max(255),
    password: z.string().min(6).max(128),
  }),

  twoFactorVerify: z.object({
    challengeToken: z.string().min(1),
    code: z.string().min(1).max(10),
  }),

  // Profile updates
  profileUpdate: z.object({
    name: z.string().min(1).max(100).optional(),
    phone: z.string().max(30).optional(),
    address: z.string().max(500).optional(),
    country: z.string().max(100).optional(),
    tradingExperience: z.string().max(50).optional(),
    timezone: z.string().max(50).optional(),
    dateOfBirth: z.string().optional(),
    image: z.string().max(2000).optional(),
  }),

  onboarding: z.object({
    name: z.string().min(1).max(100).optional(),
    phone: z.string().max(30).optional(),
    country: z.string().max(100).optional(),
    timezone: z.string().max(50).optional(),
    tradingExperience: z.string().max(50).optional(),
    emailNotifications: z.boolean().optional(),
    notificationPreferences: z.record(z.string(), z.boolean()).optional(),
  }),

  notificationPreferences: z.object({
    emailNotifications: z.boolean().optional(),
    notificationPreferences: z.record(z.string(), z.boolean()).optional(),
  }),

  // Challenge management
  createTemplate: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    type: z.enum(["one_step", "two_step", "instant_funding", "evaluation"]),
    profitTarget: z.number().min(0).max(100),
    dailyDrawdown: z.number().min(0).max(100),
    maxDrawdown: z.number().min(0).max(100),
    maxLeverage: z.number().min(1).max(1000),
    minTradingDays: z.number().min(0).max(365).optional(),
    maxTradingDays: z.number().min(1).max(365).optional(),
    price: z.number().min(0),
    currency: z.string().max(10).optional(),
    durationDays: z.number().min(1).max(365),
    allowWeekendHolding: z.boolean().optional(),
    allowNewsTrading: z.boolean().optional(),
    allowEATrading: z.boolean().optional(),
    allowCopyTrading: z.boolean().optional(),
    newsBlackoutBeforeMinutes: z.number().min(0).optional(),
    newsBlackoutAfterMinutes: z.number().min(0).optional(),
    resetFee: z.number().min(0).optional(),
  }),

  createAccountSize: z.object({
    label: z.string().min(1).max(50),
    size: z.number().min(1),
    currency: z.string().max(10).optional(),
    templateId: z.number().int().positive(),
    price: z.number().min(0),
    sortOrder: z.number().int().optional(),
  }),

  updateChallengeStatus: z.object({
    status: z.enum([
      "active", "phase_1_passed", "phase_2_passed",
      "funded", "violated", "expired", "refunded",
    ]),
    currentPhase: z.number().int().min(1).max(3).optional(),
  }),

  demoPurchase: z.object({
    templateId: z.string().min(1),
    accountSizeId: z.string().min(1),
    userId: z.string().optional(),
  }),

  // Coupon
  validateCoupon: z.object({
    code: z.string().min(1).max(50),
    amount: z.number().min(0),
  }),

  // Payment settings
  updateSetting: z.object({
    value: z.unknown(),
    group: z.string().max(50).optional(),
  }),

  // User management (admin)
  updateRole: z.object({
    role: z.string().min(1).max(50),
  }),

  updateStatus: z.object({
    locked: z.boolean().optional(),
  }),

  updateProfileAdmin: z.object({
    name: z.string().min(1).max(100).optional(),
    phone: z.string().max(30).optional(),
    country: z.string().max(100).optional(),
    tradingExperience: z.string().max(50).optional(),
    timezone: z.string().max(50).optional(),
    kycStatus: z.string().max(20).optional(),
  }),

  // Support
  createTicket: z.object({
    subject: z.string().min(1).max(200),
    message: z.string().min(1).max(5000),
    category: z.string().max(50).optional(),
    priority: z.string().max(20).optional(),
  }),

  replyTicket: z.object({
    message: z.string().min(1).max(5000),
  }),

  // KYC
  submitKyc: z.object({
    documentType: z.enum([
      "passport", "national_id", "drivers_license",
      "proof_of_address", "selfie",
    ]),
    documentUrl: z.string().max(2000),
    notes: z.string().max(1000).optional(),
  }),

  // Payout
  requestPayout: z.object({
    accountId: z.number().int().positive(),
    amount: z.number().min(1),
    currency: z.string().max(10).optional(),
    method: z.string().max(50).optional(),
    accountDetails: z.string().max(500).optional(),
  }),

  // Roles (admin)
  createRole: z.object({
    name: z.string().min(1).max(50),
    displayName: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    permissions: z.array(z.string()).optional(),
    inheritsFrom: z.number().int().positive().optional(),
  }),

  updateRolePermissions: z.object({
    permissions: z.array(z.string()),
  }),

  // Refund
  refundPayment: z.object({
    reason: z.string().min(1).max(500),
  }),
};
