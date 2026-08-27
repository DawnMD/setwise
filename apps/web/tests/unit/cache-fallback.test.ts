import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

/**
 * The rollback path, exercised.
 *
 * `VITE_CACHE_PATCHING=0` exists to be reached for in a hurry, which is the
 * worst possible time to find out it was never run. With it off, every write
 * goes back to invalidating and refetching, and nothing is written into the
 * cache from a mutation response.
 */
vi.mock("../../lib/flags", () => ({
  PATCH_CACHE: false,
  AUTH_COOKIE_CACHE: true,
}));

const { afterWrite, clearActiveSession, putSet } = await import("../../lib/cache");
const { queries } = await import("../../lib/queries");

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

describe("cache policy with patching turned off", () => {
  it("refetches the workout instead of writing the returned set into it", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = queries.sessionDetail(SESSION_ID).queryKey;

    let fetches = 0;
    await client.fetchQuery({
      queryKey: key,
      queryFn: async () => {
        fetches += 1;
        return { id: SESSION_ID, sets: [] };
      },
    });
    expect(fetches).toBe(1);

    putSet(
      client,
      {
        id: "44444444-4444-4444-8444-444444444444",
        sessionId: SESSION_ID,
        exerciseId: "22222222-2222-4222-8222-222222222222",
        setIndex: 0,
        weight: 100,
        reps: 5,
        rpe: null,
        isWarmup: false,
        performedAt: new Date(),
      },
      null,
    );

    // Not patched in — marked for refetching, which is the old behaviour.
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect((client.getQueryData(key) as { sets: unknown[] }).sets).toHaveLength(0);
  });

  it("asks whether a workout is still open rather than writing null", () => {
    const client = new QueryClient();
    const key = queries.activeSession().queryKey;
    client.setQueryData(key, { id: SESSION_ID } as never);

    clearActiveSession(client);

    expect(client.getQueryData(key)).not.toBeNull();
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("refetches a derived read that is on screen instead of leaving it stale", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
    // flight is skipped, and the assertion below would never be reached.
    await vi.waitFor(() => {
      expect(fetches).toBe(1);
      expect(client.isFetching()).toBe(0);
    });

    afterWrite.setSaved(client);
    // Patching on, this stays at one until the screen is next visited. Off, the
    // heatmap is refetched from the gym floor, which is the cost being restored.
    await vi.waitFor(() => expect(fetches).toBe(2));

    unsubscribe();
  });
});
