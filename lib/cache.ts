import type { QueryClient } from "@tanstack/react-query";

import type { ProfileSummary } from "@/server/queries/profile";
import type { RoutineDetail } from "@/server/queries/plan";
import type { SessionDetail, SessionExercise, SetRow } from "@/server/queries/session";
import { PATCH_CACHE } from "./flags";
import { orpc } from "./orpc";
import { queries } from "./queries";

/**
 * What each write invalidates, in one file.
 *
 * Every mutation used to decide for itself, and the two failure modes were both
 * common: a broad `invalidateQueries()` that refetched six screens to save one
 * set, or a missing key that left the heatmap a week out of date until someone
 * reloaded. Writing the dependencies down once makes both visible.
 *
 * The rule the rest of the app follows: an unscoped `invalidateQueries()` is
 * only legitimate at sign-in and sign-out, where the identity of every cached
 * row has changed.
 */

export const cacheKeys = {
  /**
   * The Home summary. Downstream of nearly every write in the app, which is the
   * cost of a screen that summarises all of them — and the reason it is one key
   * rather than six.
   */
  home: () => orpc.home.key(),
  activeSession: () => orpc.session.active.key(),
  recentActivity: () => orpc.session.recent.key(),
  upcomingDays: () => orpc.plan.upcoming.key(),
  restToday: () => orpc.session.restToday.key(),
  routineList: () => orpc.plan.list.key(),
  routineDetail: (routineId: string) => orpc.plan.get.key({ input: { id: routineId } }),
  sessionDetail: (sessionId: string) => orpc.session.get.key({ input: { id: sessionId } }),
  /** Every stats read: volume, intensity, the exercise list and its history. */
  stats: () => orpc.stats.key(),
  bodyweight: () => orpc.bodyweight.key(),
  profile: () => orpc.profile.key(),
} as const;

type Keys = readonly unknown[][];

/**
 * Discards inactive queries and marks active ones stale without fetching.
 *
 * This is the right call for a derived read nobody is looking at. Saving a set
 * does change the 30-day heatmap, but refetching it from the logger spends a
 * round trip on a screen that is not open, at the one moment the user is doing
 * something time-critical. An inactive result is removed so the next screen
 * cannot briefly render the old number before its refetch finishes.
 */
export function markStale(queryClient: QueryClient, keys: Keys): void {
  for (const queryKey of keys) {
    queryClient.removeQueries({ queryKey, type: "inactive" });

    // Active derived reads are unusual here, but keep their current result on
    // screen. The rollback flag restores the old refetch-on-write behaviour.
    void queryClient.invalidateQueries(
      PATCH_CACHE
        ? { queryKey, type: "active", refetchType: "none" }
        : { queryKey, type: "active" },
    );
  }
}

/**
 * Refetches queries on screen and discards inactive copies.
 *
 * Used where the write changed something the user is currently looking at. The
 * existing data stays rendered while the refetch runs, so nothing collapses
 * into a skeleton. Inactive variants are removed because invalidating them
 * would leave old data available to flash on the next range switch.
 */
export async function refreshNow(queryClient: QueryClient, keys: Keys): Promise<void> {
  await Promise.all(
    keys.map((queryKey) => {
      queryClient.removeQueries({ queryKey, type: "inactive" });
      return queryClient.invalidateQueries({ queryKey, type: "active" });
    }),
  );
}

/** Sign-in and sign-out only. Every cached row belonged to someone else. */
export function clearAccountCache(queryClient: QueryClient): void {
  queryClient.clear();
}

/* -------------------------------------------------------------------------- */
/* Session detail                                                             */
/* -------------------------------------------------------------------------- */

const bySequence = (a: SetRow, b: SetRow) => {
  const byTime = new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime();
  return byTime !== 0 ? byTime : a.setIndex - b.setIndex;
};

/**
 * Writes a change into a cached entry, or falls back to fetching it again.
 *
 * The fallback is what `VITE_CACHE_PATCHING=0` buys: slower, and the safest
 * thing to reach for if a patched cache is ever found showing something the
 * server did not say.
 */
function patchOrRefetch<T>(
  queryClient: QueryClient,
  options: { queryKey: readonly unknown[] },
  patch: (current: T) => T,
): void {
  if (!PATCH_CACHE) {
    void queryClient.invalidateQueries({ queryKey: options.queryKey });
    return;
  }

  queryClient.setQueryData(options.queryKey, (current: T | undefined) =>
    current === undefined ? current : patch(current),
  );
}

function patchSession(
  queryClient: QueryClient,
  sessionId: string,
  patch: (detail: SessionDetail) => SessionDetail,
): void {
  patchOrRefetch(queryClient, queries.sessionDetail(sessionId), patch);
}

/**
 * Puts one server-confirmed set into the cached session.
 *
 * Replace-or-insert rather than append, because the same call serves a new set
 * and an edit of an existing one, and an edit that appended would show the row
 * twice until something refetched.
 *
 * `exercise` is needed because a set carries an exercise id and the screen
 * shows a name. It comes from the lineup the user picked from, so it is the
 * same string the server would have returned.
 */
export function putSet(
  queryClient: QueryClient,
  set: SetRow,
  exercise: SessionExercise | null,
): void {
  patchSession(queryClient, set.sessionId, (detail) => {
    const sets = detail.sets.filter((entry) => entry.id !== set.id);
    sets.push(set);
    sets.sort(bySequence);

    const known = detail.exercises.some((entry) => entry.id === set.exerciseId);
    const exercises =
      known || exercise === null ? detail.exercises : [...detail.exercises, exercise];

    return { ...detail, sets, exercises };
  });
}

export function removeSet(queryClient: QueryClient, sessionId: string, setId: string): void {
  patchSession(queryClient, sessionId, (detail) => {
    const sets = detail.sets.filter((entry) => entry.id !== setId);
    // An exercise with no sets left is no longer part of the session's history,
    // which is the same rule the server reads the list back with.
    const exercises = detail.exercises.filter((entry) =>
      sets.some((set) => set.exerciseId === entry.id),
    );
    return { ...detail, sets, exercises };
  });
}

/** Closes the cached session from the finish response. */
export function markSessionFinished(
  queryClient: QueryClient,
  sessionId: string,
  finished: { endedAt: Date | null; notes: string | null },
): void {
  patchSession(queryClient, sessionId, (detail) => ({
    ...detail,
    endedAt: finished.endedAt,
    notes: finished.notes,
  }));
}

/** Seeds a detail cache before navigating to the screen that reads it. */
export function seedSessionDetail(queryClient: QueryClient, detail: SessionDetail): void {
  if (!PATCH_CACHE) return;
  queryClient.setQueryData(queries.sessionDetail(detail.id).queryKey, detail);
}

/**
 * There is no open workout any more.
 *
 * Written rather than invalidated because the client has just been told so by
 * the server that closed it. Refetching to confirm would put a round trip
 * between finishing a workout and being allowed to start the next one.
 */
export function clearActiveSession(queryClient: QueryClient): void {
  if (!PATCH_CACHE) {
    void queryClient.invalidateQueries({ queryKey: cacheKeys.activeSession() });
    return;
  }
  queryClient.setQueryData(queries.activeSession().queryKey, null);
}

/* -------------------------------------------------------------------------- */
/* Profile, bodyweight and plans                                              */
/* -------------------------------------------------------------------------- */

/**
 * Profile writes return the same summary a read does, so the exact key is set
 * rather than invalidated. Re-deriving the targets on the client would put a
 * second copy of the calorie formulas in the browser, which is how the two
 * start to disagree.
 */
export function putProfileSummary(
  queryClient: QueryClient,
  timeZone: string,
  summary: ProfileSummary,
): void {
  if (!PATCH_CACHE) {
    void queryClient.invalidateQueries({ queryKey: cacheKeys.profile() });
    return;
  }
  // Written whether or not anything was cached: the wizard saves a step before
  // the screen that reads it has ever asked.
  queryClient.setQueryData(queries.profile(timeZone).queryKey, summary);
}

export function patchRoutineDetail(
  queryClient: QueryClient,
  routineId: string,
  patch: (detail: RoutineDetail) => RoutineDetail,
): void {
  patchOrRefetch(queryClient, queries.routineDetail(routineId), patch);
}

export function seedRoutineDetail(queryClient: QueryClient, detail: RoutineDetail): void {
  if (!PATCH_CACHE) return;
  queryClient.setQueryData(queries.routineDetail(detail.id).queryKey, detail);
}

/* -------------------------------------------------------------------------- */
/* The dependency map                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The reads each write makes stale, expressed once.
 *
 * `patched` is what the write updates from its own response and therefore never
 * refetches. Inactive derived reads are discarded and fetched on their next
 * visit. Visible reads are refreshed now.
 */
export const afterWrite = {
  /** A set landed. The workout itself is patched; everything downstream waits. */
  setSaved(queryClient: QueryClient): void {
    markStale(queryClient, [
      cacheKeys.home(),
      cacheKeys.recentActivity(),
      cacheKeys.stats(),
      cacheKeys.bodyweight(),
      cacheKeys.upcomingDays(),
    ]);
  },

  /** A workout closed. Same set, plus the rotation and the routine summaries. */
  workoutFinished(queryClient: QueryClient): void {
    markStale(queryClient, [
      cacheKeys.home(),
      cacheKeys.recentActivity(),
      cacheKeys.stats(),
      cacheKeys.bodyweight(),
      cacheKeys.upcomingDays(),
      cacheKeys.routineList(),
    ]);
  },

  /** A workout was started or thrown away. */
  sessionLifecycle(queryClient: QueryClient): void {
    void queryClient.invalidateQueries({ queryKey: cacheKeys.activeSession() });
    markStale(queryClient, [
      cacheKeys.home(),
      cacheKeys.recentActivity(),
      cacheKeys.upcomingDays(),
    ]);
  },

  /** Rest was logged. Today's rest is on screen wherever this can be triggered. */
  restLogged(queryClient: QueryClient): void {
    // Home is refreshed rather than marked: it is one of the two places rest
    // can be logged from, and its button reads this answer.
    void refreshNow(queryClient, [cacheKeys.restToday(), cacheKeys.home()]);
    markStale(queryClient, [
      cacheKeys.recentActivity(),
      cacheKeys.upcomingDays(),
      cacheKeys.routineList(),
    ]);
  },

  /**
   * A weigh-in changed. The series is on screen and stays visible while it
   * recalculates; the profile summary came back with the response and is
   * patched rather than refetched.
   */
  async bodyweightLogged(queryClient: QueryClient): Promise<void> {
    markStale(queryClient, [cacheKeys.stats(), cacheKeys.home()]);
    await refreshNow(queryClient, [cacheKeys.bodyweight()]);
  },

  /**
   * A routine changed. The detail is patched from the response where the
   * response says enough; the list carries `lastActivityAt`, which no single
   * mutation response can reconstruct, so its inactive cache is discarded.
   */
  planEdited(queryClient: QueryClient, routineId?: string): void {
    markStale(queryClient, [cacheKeys.home(), cacheKeys.routineList(), cacheKeys.upcomingDays()]);
    if (routineId) void refreshNow(queryClient, [cacheKeys.routineDetail(routineId)]);
  },
};
