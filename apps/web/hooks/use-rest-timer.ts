import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export const REST_PRESETS = [60, 90, 120, 180] as const;
export const DEFAULT_REST_SECONDS = 120;

const TICK_MS = 250;

export type RestSnapshot = {
  /** Seconds left, counting down. Zero once the rest is over. */
  remaining: number;
  duration: number;
  running: boolean;
  done: boolean;
};

export type RestTimer = {
  /** Fires four times a second while the timer runs. Only the bar listens. */
  subscribeTick: (listener: () => void) => () => void;
  /** Fires only when the timer starts or stops. */
  subscribeRunning: (listener: () => void) => () => void;
  getSnapshot: () => RestSnapshot;
  isRunning: () => boolean;
  start: (seconds?: number) => void;
  extend: (seconds: number) => void;
  stop: () => void;
  dispose: () => void;
};

const IDLE: RestSnapshot = {
  remaining: 0,
  duration: DEFAULT_REST_SECONDS,
  running: false,
  done: false,
};

/**
 * The rest timer, as a store rather than as state in the workout screen.
 *
 * It used to be a hook in `ActiveSession`, which meant every 250 ms tick
 * re-rendered the whole workout: the header, the totals, and every exercise
 * card with its sets. Four times a second, for two minutes, while someone is
 * scrolling back through what they lifted — which is exactly what the rest
 * period is for.
 *
 * Two subscriptions rather than one. The countdown changes constantly and only
 * the bar renders it; whether a timer exists at all changes twice per set and
 * is the only part the screen above needs.
 */
export function createRestTimer(): RestTimer {
  let endsAt: number | null = null;
  let duration = DEFAULT_REST_SECONDS;
  let snapshot: RestSnapshot = IDLE;
  let interval: ReturnType<typeof setInterval> | undefined;
  let notified: number | null = null;

  const tickListeners = new Set<() => void>();
  const runningListeners = new Set<() => void>();

  const compute = (): RestSnapshot => {
    if (endsAt === null) return { remaining: 0, duration, running: false, done: false };
    const remaining = Math.max(0, (endsAt - Date.now()) / 1000);
    return { remaining, duration, running: true, done: remaining <= 0 };
  };

  const publish = () => {
    const wasRunning = snapshot.running;
    snapshot = compute();

    if (snapshot.done && endsAt !== null && notified !== endsAt) {
      notified = endsAt;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.([120, 80, 120]);
      }
    }

    for (const listener of tickListeners) listener();
    if (snapshot.running !== wasRunning) {
      for (const listener of runningListeners) listener();
    }
  };

  const startTicking = () => {
    if (interval !== undefined) return;
    interval = setInterval(publish, TICK_MS);
  };

  const stopTicking = () => {
    if (interval === undefined) return;
    clearInterval(interval);
    interval = undefined;
  };

  return {
    subscribeTick(listener) {
      tickListeners.add(listener);
      return () => tickListeners.delete(listener);
    },
    subscribeRunning(listener) {
      runningListeners.add(listener);
      return () => runningListeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    isRunning: () => snapshot.running,

    start(seconds) {
      if (seconds !== undefined) duration = seconds;
      notified = null;
      endsAt = Date.now() + duration * 1000;
      startTicking();
      publish();
    },

    extend(seconds) {
      if (endsAt === null) return;
      // From now when the timer has already run out, so "+30s" always buys 30
      // seconds rather than topping up a number that went negative.
      endsAt = Math.max(Date.now(), endsAt) + seconds * 1000;
      duration += seconds;
      notified = null;
      publish();
    },

    stop() {
      endsAt = null;
      stopTicking();
      publish();
    },

    dispose() {
      stopTicking();
      tickListeners.clear();
      runningListeners.clear();
    },
  };
}

/** One timer per mounted workout, torn down with it. */
export function useRestTimer(): RestTimer {
  const [timer] = useState(createRestTimer);
  useEffect(() => () => timer.dispose(), [timer]);
  return timer;
}

/**
 * Whether a rest is running. Re-renders the caller twice per set, not eight
 * times a second.
 */
export function useRestRunning(timer: RestTimer): boolean {
  return useSyncExternalStore(timer.subscribeRunning, timer.isRunning, () => false);
}

/** There is no countdown on the server, and rendering one would mismatch a beat later. */
const getIdleSnapshot = () => IDLE;

/** The countdown itself. Only the bar that draws it should call this. */
export function useRestSnapshot(timer: RestTimer): RestSnapshot {
  const subscribe = useCallback((listener: () => void) => timer.subscribeTick(listener), [timer]);
  return useSyncExternalStore(subscribe, timer.getSnapshot, getIdleSnapshot);
}
