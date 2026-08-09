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

