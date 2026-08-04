import { useEffect, useState } from "react";

/**
 * Returns the current timestamp, refreshed on an interval. Use this instead
 * of calling `Date.now()` during render (which the react-hooks/purity rule
 * flags as an impure render-time call). The interval keeps "now" reasonably
 * fresh for expiry comparisons.
 */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
