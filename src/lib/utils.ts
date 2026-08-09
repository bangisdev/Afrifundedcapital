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
