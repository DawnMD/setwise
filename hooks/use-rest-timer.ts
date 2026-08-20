"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import { useNow } from "./use-now";

export const REST_PRESETS = [60, 90, 120, 180] as const;
export const DEFAULT_REST_SECONDS = 120;

const STORAGE_KEY = "setwise:rest-timer";
const DURATION_KEY = "setwise:rest-duration";
/** Fine enough that the seconds digit never visibly stutters. */
const TICK_MS = 250;

type Rest = { endsAt: number; duration: number };

/**
 * The running rest period lives in a module-level store backed by
 * `localStorage`, not in component state.
 *
 * Two reasons. A rest period outlives any one component — the timer bar
 * unmounts when you navigate and the countdown should not restart. And reading
 * `localStorage` is reading an external system, which is exactly what
 * `useSyncExternalStore` is for; doing it in an effect would mean a render with
 * the wrong answer followed by a correction.
 */
let current: Rest | null = null;
/**
 * The last rest length the user chose, remembered across workouts. Someone who
 * rests three minutes on squats does not want to re-pick it every set.
 */
let preferred = DEFAULT_REST_SECONDS;
let hydrated = false;
const listeners = new Set<() => void>();

function readStored(): Rest | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Rest;
    // A deadline in the past is a rest someone already took. Dropping it stops
    // a reopened tab from showing a timer that has been done for two days.
    return typeof saved?.endsAt === "number" && saved.endsAt > Date.now() ? saved : null;
  } catch {
    return null;
  }
}

function write(next: Rest | null) {
  current = next;
  if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  else window.localStorage.removeItem(STORAGE_KEY);
  for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void) {
  if (!hydrated) {
    hydrated = true;
    current = readStored();
    const saved = Number(window.localStorage.getItem(DURATION_KEY));
    if (Number.isFinite(saved) && saved > 0) preferred = saved;
  }
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

const getSnapshot = () => current;
const getServerSnapshot = () => null;

/**
 * Counts down from a deadline rather than decrementing a counter.
 *
 * `setInterval` stops firing when a phone locks or the tab is backgrounded, so
 * a tick-based timer would come back from a screen lock reading whatever it had
 * when the screen went off. Rendering `endsAt - now` is correct on the first
 * paint after waking, with no catch-up logic.
 */
export function useRestTimer() {
  const rest = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const now = useNow(rest === null ? null : TICK_MS);
  const notifiedFor = useRef<number | null>(null);

  const remaining =
    rest === null || now === null ? 0 : Math.max(0, (rest.endsAt - now) / 1000);
  const running = rest !== null;
  const done = running && now !== null && remaining <= 0;

  useEffect(() => {
    if (!done || rest === null || notifiedFor.current === rest.endsAt) return;
    notifiedFor.current = rest.endsAt;
    // Vibration is the one notification that works with the phone in a bag or
    // face down on a bench. No sound: iOS needs a gesture to unlock audio, and
    // a chime would be rude in a shared room.
    if ("vibrate" in navigator) navigator.vibrate?.([120, 80, 120]);
  }, [done, rest]);

  const start = useCallback((seconds?: number) => {
    if (seconds !== undefined) {
      preferred = seconds;
      window.localStorage.setItem(DURATION_KEY, String(seconds));
    }
    const length = seconds ?? preferred;
    write({ endsAt: Date.now() + length * 1000, duration: length });
  }, []);

  /** "+30s", from now if the timer already ran out. */
  const extend = useCallback((seconds: number) => {
    if (current === null) return;
    const base = Math.max(Date.now(), current.endsAt);
    write({ endsAt: base + seconds * 1000, duration: current.duration + seconds });
  }, []);

  const stop = useCallback(() => write(null), []);

  return {
    /** Seconds left, fractional. Zero once the timer has run out. */
    remaining,
    /** The full length of the current rest, for the progress bar. */
    duration: rest?.duration ?? preferred,
    running,
    done,
    start,
    extend,
    stop,
  };
}
