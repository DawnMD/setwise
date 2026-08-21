import { useEffect } from "react";

/**
 * Holds a screen wake lock for as long as a workout is open.
 *
 * The Screen Wake Lock API works in plain mobile browsers over https with no
 * service worker, which is the whole reason the MVP can skip the PWA shell. A
 * phone that sleeps between sets means unlocking it with chalky hands forty
 * times a session.
 *
 * The lock is released by the browser whenever the tab is hidden, so it is
 * re-acquired on every return to visible rather than assumed to survive.
 */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Denied by the browser, or the tab lost focus mid-request. Not worth
        // surfacing: the workout is unaffected, the screen just dims.
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}
