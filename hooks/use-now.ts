import { useCallback, useSyncExternalStore } from "react";

/**
 * The current time, as an external store rather than a `Date.now()` in render.
 *
 * Reading the clock during render is impure: two renders in the same commit can
 * disagree, and the React compiler will not memoise around it. Subscribing
 * instead makes the clock what it actually is — an outside system this
 * component is watching.
 *
 * The snapshot is quantised to the tick interval so it is referentially stable
 * between ticks, which is what `useSyncExternalStore` requires.
 *
 * Returns null on the server, where there is no meaningful "now" to render
 * without causing a hydration mismatch a second later.
 */
export function useNow(intervalMs: number | null): number | null {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (intervalMs === null) return () => {};
      const id = window.setInterval(onStoreChange, intervalMs);
      return () => window.clearInterval(id);
    },
    [intervalMs],
  );

  const getSnapshot = useCallback(() => {
    if (intervalMs === null) return null;
    return Math.floor(Date.now() / intervalMs) * intervalMs;
  }, [intervalMs]);

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
