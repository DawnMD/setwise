import { useCallback, useEffect, useRef, useState } from "react";

import { useNow } from "./use-now";

export const REST_PRESETS = [60, 90, 120, 180] as const;
export const DEFAULT_REST_SECONDS = 120;

const TICK_MS = 250;

export function useRestTimer() {
  const [duration, setDuration] = useState(DEFAULT_REST_SECONDS);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const now = useNow(endsAt === null ? null : TICK_MS);
  const notifiedFor = useRef<number | null>(null);

  const remaining = endsAt === null || now === null ? 0 : Math.max(0, (endsAt - now) / 1000);
  const running = endsAt !== null;
  const done = running && now !== null && remaining <= 0;

  useEffect(() => {
    if (!done || endsAt === null || notifiedFor.current === endsAt) return;
    notifiedFor.current = endsAt;
    if ("vibrate" in navigator) navigator.vibrate?.([120, 80, 120]);
  }, [done, endsAt]);

  const start = useCallback(
    (seconds?: number) => {
      const length = seconds ?? duration;
      if (seconds !== undefined) setDuration(seconds);
      notifiedFor.current = null;
      setEndsAt(Date.now() + length * 1000);
    },
    [duration],
  );

  const extend = useCallback((seconds: number) => {
    setEndsAt((current) =>
      current === null ? null : Math.max(Date.now(), current) + seconds * 1000,
    );
    setDuration((current) => current + seconds);
  }, []);

  const stop = useCallback(() => setEndsAt(null), []);

  return { remaining, duration, running, done, start, extend, stop };
}
