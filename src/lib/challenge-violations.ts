/**
 * Shared display helpers for stored challenge violations.
 *
 * The MT5 rule engine persists breaches into `user_challenges.violations` as a
 * JSON array (each entry carrying a rule code, severity, message, evidence and
 * detection timestamp). These helpers format that data for the admin digest
 * (Admin Challenges → Violations tab) and the overview snapshot — single
 * source of truth instead of per-page duplicates.
 */

/** Human-readable labels for stored violation rule codes (rule-engine `RuleCode`s). */
export const RULE_CODE_LABELS: Record<string, string> = {
  max_drawdown: "Max drawdown",
  daily_drawdown: "Daily drawdown",
  consistency: "Consistency rule",
  max_position_size: "Max position size",
  weekend_holding: "Weekend holding",
  news_trading: "News trading",
  ea_detected: "EA trading",
  copy_trading_detected: "Copy trading",
  max_drawdown_warning: "Max drawdown (approaching)",
  daily_drawdown_warning: "Daily drawdown (approaching)",
};

/** One entry inside the stored `user_challenges.violations` JSON blob. */
export interface StoredViolation {
  code?: string;
  type?: string; // legacy alias kept for pre-warning consumers
  severity?: string;
  message?: string;
  detectedAt?: number;
  evidence?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Parse the stored `user_challenges.violations` JSON blob. */
export function parseStoredViolations(raw: string | null | undefined): StoredViolation[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredViolation[]) : [];
  } catch {
    return [];
  }
}

/** Human-readable label for a stored violation rule code (falls back to the raw code). */
export function ruleCodeLabel(code: string | null | undefined): string {
  const key = code || "unknown";
  return RULE_CODE_LABELS[key] || key;
}

/** Compact relative timestamp for the digest (e.g. "3h ago"). */
export function timeAgo(ts: number | null | undefined): string {
  if (!ts) return "—";
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}
