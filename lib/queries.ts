import { keepPreviousData, type QueryClient } from "@tanstack/react-query";

import type { StatWindow } from "@/db/validators";
import type { MuscleSlug } from "./muscles";
import { orpc } from "./orpc";
import { STALE } from "./stale";

/**
 * One definition of every query the app runs.
 *
 * Components and route loaders both call these, so a loader can never warm a
 * key a component then misses. That used to be a real hazard: the same read was
 * spelled out at each call site with its own `staleTime`, and two spellings of
 * one query are two cache entries.
 */

export { STALE };

/** The reader's IANA zone, outside React. Loaders need it before a hook exists. */
export function resolveTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Switching 7/30/90 keeps the previous window on screen while the next one
 * loads. Charts and summaries that collapse into skeletons on every toggle read
 * as a page reload, and the shape being compared is the whole point of the
 * control.
 */
const windowed = { placeholderData: keepPreviousData } as const;

export const queries = {
  activeSession: () => orpc.session.active.queryOptions({ staleTime: STALE.activeSession }),

  recentActivity: (limit = 10) =>
    orpc.session.recent.queryOptions({ input: { limit }, staleTime: STALE.plans }),

  upcomingDays: () => orpc.plan.upcoming.queryOptions({ staleTime: STALE.plans }),

  restToday: (timeZone: string) =>
    orpc.session.restToday.queryOptions({ input: { timeZone }, staleTime: STALE.plans }),

  sessionDetail: (id: string) =>
    orpc.session.get.queryOptions({ input: { id }, staleTime: STALE.openSession }),

  routineList: () => orpc.plan.list.queryOptions({ staleTime: STALE.plans }),

  routineDetail: (id: string) =>
    orpc.plan.get.queryOptions({ input: { id }, staleTime: STALE.plans }),

  profile: (timeZone: string) =>
    orpc.profile.get.queryOptions({ input: { timeZone }, staleTime: STALE.profile }),

  muscleVolume: (window: StatWindow) =>
    orpc.stats.muscleVolume.queryOptions({
      input: { window },
      staleTime: STALE.stats,
      ...windowed,
    }),

  intensity: (window: StatWindow) =>
    orpc.stats.intensity.queryOptions({ input: { window }, staleTime: STALE.stats, ...windowed }),

  trainedExercises: (window: StatWindow) =>
    orpc.stats.exercises.queryOptions({ input: { window }, staleTime: STALE.stats, ...windowed }),

  exerciseHistory: (exerciseId: string | null, window: StatWindow) =>
    orpc.stats.exerciseHistory.queryOptions({
      input: { exerciseId: exerciseId ?? "", window },
      enabled: exerciseId !== null,
      staleTime: STALE.stats,
      ...windowed,
    }),

  bodyweightSeries: (window: StatWindow, timeZone: string) =>
    orpc.bodyweight.series.queryOptions({
      input: { window, timeZone },
      staleTime: STALE.stats,
      ...windowed,
    }),

  catalogueSearch: (input: { query: string; muscle?: MuscleSlug; limit: number }, open: boolean) =>
    orpc.catalogue.search.queryOptions({ input, enabled: open, staleTime: STALE.catalogue }),
};

type Prefetchable = { queryKey: readonly unknown[] };

/**
 * Loaders only prefetch in the browser.
 *
 * Authenticated routes are data-only SSR: the guard runs on the server, the
 * screen renders in the browser, and the oRPC client is browser-only by design.
 * On the first document there is nothing to warm anyway — the component mounts
 * in the same tick the loader would have finished in. Every navigation after
 * that, including a preload on intent, runs here and gets the head start.
 */
const canPrefetch = () => typeof window !== "undefined";

/** Starts a query without waiting for it. The screen commits while it runs. */
export function warm(queryClient: QueryClient, options: Prefetchable): void {
  if (!canPrefetch()) return;
  // Errors belong to the component that renders the query, not to the
  // navigation. A failed prefetch must never take a route down with it.
  void queryClient.prefetchQuery(options as Parameters<QueryClient["prefetchQuery"]>[0]);
}

/**
 * Waits for data the screen cannot be drawn without, but only the first time.
 *
 * A detail route opened from a list it was seeded from has the row already, and
 * blocking the commit on a refetch of something already on screen is how a fast
 * app is made to feel slow.
 */
export async function ensureCritical(
  queryClient: QueryClient,
  options: Prefetchable,
): Promise<void> {
  if (!canPrefetch()) return;

  const args = options as Parameters<QueryClient["ensureQueryData"]>[0];
  if (queryClient.getQueryData(options.queryKey) !== undefined) {
    void queryClient.ensureQueryData(args);
    return;
  }

  try {
    await queryClient.ensureQueryData(args);
  } catch {
    // The component owns the error state and says so in words. A throw here
    // would replace that with the router's error boundary.
  }
}
