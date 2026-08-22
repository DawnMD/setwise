import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

import { endSpan, installWebVitals, startSpan, startSpanAt } from "@/lib/perf";
import { routeTree } from "./routeTree.gen";

export type RouterContext = { queryClient: QueryClient };

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Per-query freshness lives in `lib/queries.ts`, next to the reason for
        // it. This is the floor for anything that has not stated one.
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // One retry, quickly. A read that fails twice in a second is a real
        // failure and the screen should say so rather than spin.
        retry: 1,
        retryDelay: (attempt) => Math.min(300 * 2 ** attempt, 2_000),
      },
      // Never globally. A retried write is only safe when the procedure was
      // built to be retried, and that is opted into per mutation.
      mutations: { retry: false },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    // Preloading hands the work to TanStack Query, which already knows what is
    // fresh. A second staleness rule here would mean two answers to one
    // question, and the loader's would usually be the wrong one.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });

  installNavigationTiming(router);

  return router;
}

/**
 * Navigation timing, measured from the tap rather than from the router.
 *
 * `onBeforeNavigate` fires once the click has already been handled, which
 * misses the part of the delay a person actually feels. The pointer-down is the
 * intent; anything within a second of it is the navigation it caused.
 */
function installNavigationTiming(router: {
  subscribe: (event: "onBeforeNavigate" | "onResolved", listener: () => void) => () => void;
}) {
  if (typeof window === "undefined") return;

  installWebVitals();

  /** How long after a tap a navigation still counts as caused by it. */
  const INTENT_WINDOW_MS = 1_000;
  let intentAt = 0;

  window.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target as Element | null;
      if (target?.closest?.("a[href], [data-nav-intent]")) intentAt = performance.now();
    },
    { capture: true, passive: true },
  );

  router.subscribe("onBeforeNavigate", () => {
    const at = performance.now();
    const caused = intentAt !== 0 && at - intentAt < INTENT_WINDOW_MS;
    // A programmatic navigation with no pointer behind it starts here, which is
    // the honest answer for something nobody was waiting on.
    startSpanAt("navigation", caused ? intentAt : at);
    intentAt = 0;
  });

  router.subscribe("onResolved", () => {
    endSpan("navigation");
    // The screen is committed. What it is still waiting for is measured from
    // here, and closed by whichever component owns its critical data.
    startSpan("route-data");
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
