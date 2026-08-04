import { useState } from "react";

/**
 * Reset a value (e.g. pagination page) whenever any of the provided
 * dependencies change. Uses the React-recommended "adjust state during
 * render" pattern instead of a setState-in-effect, which avoids cascading
 * renders flagged by the react-hooks/purity rule.
 *
 * `enabled` optionally gates the reset (e.g. "only clamp when page exceeds
 * total pages") while still tracking the latest dependencies.
 */
export function useResetOnChange(deps: unknown[], reset: () => void, enabled = true) {
  const [prevDeps, setPrevDeps] = useState<unknown[] | null>(null);

  const changed =
    prevDeps === null ||
    prevDeps.length !== deps.length ||
    prevDeps.some((dep, i) => !Object.is(dep, deps[i]));

  if (changed) {
    setPrevDeps(deps);
  }
  if (enabled && changed) {
    reset();
  }
}
