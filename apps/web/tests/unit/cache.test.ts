import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { afterWrite, cacheKeys, clearActiveSession, putSet, removeSet } from "../../lib/cache";
import { queries } from "../../lib/queries";
import type { StatWindow } from "@setwise/domain/validators";
import type { BodyweightSeriesDto, SessionDetailDto, WorkoutSetDto } from "@setwise/api-contract";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const BENCH = "22222222-2222-4222-8222-222222222222";
const SQUAT = "33333333-3333-4333-8333-333333333333";

function makeSet(overrides: Partial<WorkoutSetDto> = {}): WorkoutSetDto {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    sessionId: SESSION_ID,
    exerciseId: BENCH,
    setIndex: 0,
    weight: 100,
    reps: 5,
    rpe: null,
    isWarmup: false,
    performedAt: new Date("2026-08-22T10:00:00Z"),
    ...overrides,
  };
}

function makeDetail(): SessionDetailDto {
  return {
    id: SESSION_ID,
    kind: "workout",
    startedAt: new Date("2026-08-22T09:00:00Z"),
    endedAt: null,
    notes: null,
    routineDayId: null,
    plan: null,
    exercises: [{ id: BENCH, name: "Bench press", equipment: "barbell" }],
    sets: [],
    lastPerformances: {},
  };
}

function makeBodyweightSeries(
  window: StatWindow,
  trendNow: number,
): BodyweightSeriesDto & {
  window: StatWindow;
} {
  return {
    window,
    points: [],
    latest: null,
    trendNow,
    trendChange: null,
    weighIns: 0,
    tonnage: 0,
  };
}

/**
 * A client that records every fetch, so a test can assert that nothing was.
 *
 * The real query options carry oRPC's own `queryFn`, which would try to reach
 * the network. Reads under test go through `read`, which keeps the key the app
 * uses and replaces only the part that would leave the process.
 */
function makeClient() {
  const fetched: string[] = [];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const read = (options: { queryKey: readonly unknown[] }) =>
    client.fetchQuery({
      queryKey: options.queryKey,
      queryFn: async () => {
        fetched.push(JSON.stringify(options.queryKey));
        return null;
      },
    });

  return { client, fetched, read };
}

describe("cache policy", () => {
  it("puts a confirmed set into the open workout without refetching it", async () => {
    const { client, fetched } = makeClient();
    const key = queries.sessionDetail(SESSION_ID).queryKey;
    client.setQueryData(key, makeDetail());

    putSet(client, makeSet(), null);
    afterWrite.setSaved(client);
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));

    const detail = client.getQueryData(key) as SessionDetailDto;
    expect(detail.sets).toHaveLength(1);
    expect(detail.sets[0].weight).toBe(100);

    // The point of the whole change: the row is on screen because the server
    // returned it, not because the workout was fetched again.
    expect(fetched).toEqual([]);
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  });

  it("replaces rather than duplicates when the same set is edited", () => {
    const { client } = makeClient();
    const key = queries.sessionDetail(SESSION_ID).queryKey;
    client.setQueryData(key, makeDetail());

    putSet(client, makeSet(), null);
    putSet(client, makeSet({ weight: 102.5 }), null);

    const detail = client.getQueryData(key) as SessionDetailDto;
    expect(detail.sets).toHaveLength(1);
    expect(detail.sets[0].weight).toBe(102.5);
  });

  it("adds an exercise to the lineup the first time it is logged, and drops it when emptied", () => {
    const { client } = makeClient();
    const key = queries.sessionDetail(SESSION_ID).queryKey;
    client.setQueryData(key, makeDetail());

    const squatSet = makeSet({
      id: "55555555-5555-4555-8555-555555555555",
      exerciseId: SQUAT,
      performedAt: new Date("2026-08-22T10:05:00Z"),
    });
    putSet(client, squatSet, { id: SQUAT, name: "Back squat", equipment: "barbell" });

    expect((client.getQueryData(key) as SessionDetailDto).exercises.map((e) => e.id)).toEqual([
      BENCH,
      SQUAT,
    ]);

    removeSet(client, SESSION_ID, squatSet.id);
    const after = client.getQueryData(key) as SessionDetailDto;
    expect(after.sets).toHaveLength(0);
    // Bench had no sets either, so neither survives: an exercise with no sets is
    // not part of the session's history, which is how the server reads it back.
    expect(after.exercises).toEqual([]);
  });

  it("does not refetch a derived read, even one that is on screen", async () => {
    // The strong version of the claim. Not "an unwatched query was left alone",
    // which invalidation would have done anyway, but "the heatmap was not
    // refetched from the gym floor even with something watching it".
    const { client } = makeClient();
    const volume = queries.muscleVolume(7);

    let fetches = 0;
    const observer = new QueryObserver(client, {
      queryKey: volume.queryKey,
      queryFn: async () => {
        fetches += 1;
        return null;
      },
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});
    // Settled, not merely started: an invalidation while a query is still in
    // flight is skipped, and this assertion would pass for the wrong reason.
    await vi.waitFor(() => {
      expect(fetches).toBe(1);
      expect(client.isFetching()).toBe(0);
    });

    afterWrite.setSaved(client);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fetches).toBe(1);
    unsubscribe();
  });

  it("drops an inactive derived read so the next visit cannot flash stale data", async () => {
    const { client, fetched, read } = makeClient();

    const volume = queries.muscleVolume(7);
    await read(volume);
    expect(fetched).toHaveLength(1);

    afterWrite.setSaved(client);
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));

    expect(client.getQueryData(volume.queryKey)).toBeUndefined();
    expect(fetched).toHaveLength(1);
  });

  it("refetches the visible bodyweight window and drops cached inactive windows", async () => {
    const { client } = makeClient();
    const week = queries.bodyweightSeries(7, "UTC");
    const month = queries.bodyweightSeries(30, "UTC");
    const quarter = queries.bodyweightSeries(90, "UTC");

    client.setQueryData(week.queryKey, makeBodyweightSeries(7, 70));
    client.setQueryData(month.queryKey, makeBodyweightSeries(30, 71));
    client.setQueryData(quarter.queryKey, makeBodyweightSeries(90, 72));

    let fetches = 0;
    const observer = new QueryObserver(client, {
      queryKey: month.queryKey,
      queryFn: async () => {
        fetches += 1;
        return makeBodyweightSeries(30, 73);
      },
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});

    await afterWrite.bodyweightLogged(client);

    expect(fetches).toBe(1);
    expect(client.getQueryData(month.queryKey)?.trendNow).toBe(73);
    expect(client.getQueryData(week.queryKey)).toBeUndefined();
    expect(client.getQueryData(quarter.queryKey)).toBeUndefined();
    unsubscribe();
  });

  it("does not borrow data from another stats window while a range loads", () => {
    const windowed = [
      queries.muscleVolume(7),
      queries.intensity(7),
      queries.trainedExercises(7),
      queries.exerciseHistory(BENCH, 7),
      queries.bodyweightSeries(7, "UTC"),
    ];

    for (const options of windowed) {
      expect(options).not.toHaveProperty("placeholderData");
    }
  });

  it("closes the active workout by writing null rather than asking again", async () => {
    const { client, fetched } = makeClient();
    const key = queries.activeSession().queryKey;
    client.setQueryData(key, { id: SESSION_ID } as never);

    clearActiveSession(client);
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));

    expect(client.getQueryData(key)).toBeNull();
    expect(fetched).toEqual([]);
  });

  it("scopes each write to the reads it actually changes", () => {
    // A guard against the old habit of reaching for `invalidateQueries()`:
    // saving a set must not touch the routine being edited on another screen.
    const { client } = makeClient();
    const routine = queries.routineDetail("66666666-6666-4666-8666-666666666666");
    client.setQueryData(routine.queryKey, { id: "x" } as never);

    afterWrite.setSaved(client);

    expect(client.getQueryState(routine.queryKey)?.isInvalidated).toBe(false);
    expect(cacheKeys.routineList()).not.toEqual(cacheKeys.stats());
  });
});
