/* eslint-disable @typescript-eslint/no-explicit-any */
import { payments, couponRedemptions, coupons } from "../schema";
import { eq, and, lt } from "drizzle-orm";

/** How long a pending payment may sit before it's treated as an abandoned checkout. */
export const STALE_PAYMENT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Void the coupon redemption linked to a payment (if any) and decrement the
 * coupon's usage counter. Returns true if a redemption was voided.
 * Used when a payment is failed or swept as abandoned.
 */
export function voidRedemptionForPayment(db: any, paymentId: number): boolean {
  const redemption = db
    .select()
    .from(couponRedemptions)
    .where(eq(couponRedemptions.paymentId, paymentId))
    .get();
  if (!redemption) return false;

  db.delete(couponRedemptions).where(eq(couponRedemptions.id, redemption.id)).run();

  const coupon = db.select().from(coupons).where(eq(coupons.id, redemption.couponId)).get();
  if (coupon && (coupon.currentUses || 0) > 0) {
    db.update(coupons)
      .set({ currentUses: (coupon.currentUses || 0) - 1 })
      .where(eq(coupons.id, coupon.id))
      .run();
  }
  return true;
}

/**
 * Find payments stuck in "pending" for longer than `maxAgeMs` (abandoned
 * checkouts), mark them failed, and void their coupon redemptions so they
 * don't consume coupon usage or appear in the user's My Coupons list.
 * Returns a summary of what was cleaned up.
 */
export function voidStaleRedemptions(
  db: any,
  now: number = Date.now(),
  maxAgeMs: number = STALE_PAYMENT_MS,
): { stale: number; voided: number } {
  const cutoff = now - maxAgeMs;
  const stale = db
    .select()
    .from(payments)
    .where(and(eq(payments.status, "pending"), lt(payments.createdAt, cutoff)))
    .all();

  let voided = 0;
  for (const payment of stale) {
    try {
      const hadRedemption = voidRedemptionForPayment(db, payment.id);
      db.update(payments).set({ status: "failed" }).where(eq(payments.id, payment.id)).run();
      if (hadRedemption) voided++;
    } catch {
      // Non-critical — never let a single row block the sweep
    }
  }
  return { stale: stale.length, voided };
}

/**
 * Re-ensure a coupon redemption exists for a payment that just confirmed as
 * successful. Covers late webhooks/verifications that arrive after the
 * stale-payment sweep already voided the pre-created redemption: the payment's
 * metadata still carries couponId/discount, so we restore the redemption row
 * and its usage counter.
 * Idempotent — a redemption that already exists (payment confirmed before any
 * sweep) is left untouched. Returns true if a redemption was (re)created.
 */
export function ensureRedemptionForPayment(db: any, payment: any): boolean {
  let couponId: number | null = null;
  let discount = 0;
  let originalAmount: number | null = null;

  try {
    if (payment.metadata) {
      const meta = JSON.parse(payment.metadata);
      couponId = meta.couponId != null ? Number(meta.couponId) : null;
      discount = Number(meta.discount || 0);
      originalAmount = meta.originalAmount != null ? Number(meta.originalAmount) : null;
    }
  } catch {
    // Unparseable metadata — nothing to restore
  }

  if (!couponId) return false;

  // Idempotent — already redeemed
  const existing = db
    .select()
    .from(couponRedemptions)
    .where(eq(couponRedemptions.paymentId, payment.id))
    .get();
  if (existing) return false;

  const coupon = db.select().from(coupons).where(eq(coupons.id, couponId)).get();
  if (!coupon) return false;

  db.insert(couponRedemptions)
    .values({
      couponId,
      userId: payment.userId,
      paymentId: payment.id,
      discountAmount: discount || 0,
      originalAmount: originalAmount ?? payment.amount,
      redeemedAt: Date.now(),
    })
    .run();

  db.update(coupons)
    .set({ currentUses: (coupon.currentUses || 0) + 1 })
    .where(eq(coupons.id, coupon.id))
    .run();

  return true;
}
