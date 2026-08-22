import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { afterWrite, cacheKeys, clearActiveSession, putSet, removeSet } from "../../lib/cache";
import { queries } from "../../lib/queries";
import type { SessionDetail, SetRow } from "../../server/queries/session";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const BENCH = "22222222-2222-4222-8222-222222222222";
const SQUAT = "33333333-3333-4333-8333-333333333333";

function makeSet(overrides: Partial<SetRow> = {}): SetRow {
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

function makeDetail(): SessionDetail {
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

    const detail = client.getQueryData(key) as SessionDetail;
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

    const detail = client.getQueryData(key) as SessionDetail;
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

    expect((client.getQueryData(key) as SessionDetail).exercises.map((e) => e.id)).toEqual([
      BENCH,
      SQUAT,
    ]);

    removeSet(client, SESSION_ID, squatSet.id);
    const after = client.getQueryData(key) as SessionDetail;
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

  it("marks a derived read stale so the next visit refetches it", async () => {
    const { client, fetched, read } = makeClient();

    const volume = queries.muscleVolume(7);
    await read(volume);
    expect(fetched).toHaveLength(1);

    afterWrite.setSaved(client);
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));

    expect(client.getQueryState(volume.queryKey)?.isInvalidated).toBe(true);
    expect(fetched).toHaveLength(1);
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
