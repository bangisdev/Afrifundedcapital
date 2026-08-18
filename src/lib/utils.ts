import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a challenge template's news blackout window for display:
 * "15m" (symmetric), "30m/5m" (asymmetric before/after), or null when both
 * sides are explicitly disabled. Falls back to the rule engine's default
 * ±15 min when a side is unset.
 */
export function newsBlackoutWindow(t: {
  newsBlackoutBeforeMinutes?: number | null;
  newsBlackoutAfterMinutes?: number | null;
}): string | null {
  const before = t.newsBlackoutBeforeMinutes ?? 15;
  const after = t.newsBlackoutAfterMinutes ?? 15;
  if (before <= 0 && after <= 0) return null;
  if (before === after) return `${before}m`;
  return `${before}m/${after}m`;
}

/**
 * Plain-language explanations for each trading rule restriction, mirroring the
 * enforcement logic in the MT5 rule engine. Single source of truth shared by
 * the admin tooltips and the public landing page inline helper text.
 */
/**
 * Format a monetary amount for display. NGN is shown with no decimal places
 * (₦250,000) while other currencies keep up to two (so USD stays $50,000 for
 * whole-dollar account sizes). Falls back to a plain "CODE amount" string if
 * the runtime's Intl doesn't know the currency.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency = "NGN",
): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: currency === "NGN" ? 0 : 2,
      maximumFractionDigits: currency === "NGN" ? 0 : 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString()}`;
  }
}

/**
 * Compact relative time: "Just now", "5m ago", "2h ago", "3d ago", then the
 * short absolute date. Shared so lists (notifications, payouts, wallet)
 * present timestamps identically.
 */
export function formatRelativeTime(timestamp: number | string | null | undefined): string {
  const ts = typeof timestamp === "string" ? Date.parse(timestamp) : timestamp;
  if (!ts || Number.isNaN(ts)) return "";
  const diffMs = Date.now() - ts;
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatShortDate(ts);
}

/** Absolute short date — "Mar 15, 2025" — for tooltips, dialogs, and tables. */
export function formatShortDate(timestamp: number | string | null | undefined): string {
  const ts = typeof timestamp === "string" ? Date.parse(timestamp) : timestamp;
  if (!ts || Number.isNaN(ts)) return "";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const RULE_HINTS: Record<
  "weekendHolding" | "newsTrading" | "eaTrading" | "copyTrading",
  string
> = {
  weekendHolding:
    "When restricted, any trade opened or closed on Saturday or Sunday is flagged as a rule violation.",
  newsTrading:
    "When restricted, trades opened inside the blackout window around a high-impact news release are flagged. The window is template-configured (15 min each side by default).",
  eaTrading:
    "When restricted, automated strategies are flagged using heuristics — high trade frequency, robotic spacing, and night trading.",
  copyTrading:
    "When restricted, trades matching another account's trade signatures within a short window are flagged.",
};
