import { randomUUID } from "node:crypto";

import { createRouterClient } from "@orpc/server";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "../../db/schema";
import { openSharedTestDatabase } from "./database";
import { createSessionResolver } from "../../server/orpc";
import { getSessionDetail, startSession } from "../../server/queries/session";
import { router } from "../../server/router";

const authState = vi.hoisted(() => ({ userId: "", resolutions: 0 }));

vi.mock("../../db", async () => {
  const [{ openSharedTestDatabase }, schema] = await Promise.all([
    import("./database"),
    import("../../db/schema"),
  ]);

  return { db: openSharedTestDatabase().db, schema };
});

vi.mock("../../lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => {
        authState.resolutions += 1;
        return { user: { id: authState.userId } };
      }),
    },
  },
}));

const { client, db } = openSharedTestDatabase();
const userId = `test-perf-${randomUUID()}`;

/**
 * One context, the way a batched request gets one.
 *
 * The batch handler splits a request into its operations and runs them against
 * the same context object, so this is the shape the memoised resolver actually
 * sees in production.
 */
function batchContext() {
  const headers = new Headers();
  return { headers, getSession: createSessionResolver(headers) };
}

describe("request and query economy", () => {
  let sessionId: string;
  let exerciseIds: string[];

  beforeAll(async () => {
    authState.userId = userId;

    await db.insert(schema.user).values({
      id: userId,
      name: "Performance test fixture",
      email: `${userId}@example.invalid`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const catalogue = await db.select({ id: schema.exercises.id }).from(schema.exercises).limit(6);
    if (catalogue.length < 6) throw new Error("Seed is missing exercises. Run pnpm db:seed.");
    exerciseIds = catalogue.map((row) => row.id);

    // A previous workout for every exercise, so each one has a ghost to find.
    const previousId = randomUUID();
    const lastWeek = new Date(Date.now() - 7 * 86_400_000);
    await db
      .insert(schema.workoutSessions)
      .values({ id: previousId, userId, startedAt: lastWeek, endedAt: lastWeek });
    await db.insert(schema.sets).values(
      exerciseIds.map((exerciseId, index) => ({
        id: randomUUID(),
        sessionId: previousId,
        exerciseId,
        setIndex: index,
        weight: 100,
        reps: 5,
        isWarmup: false,
        performedAt: lastWeek,
      })),
    );

    // The session under test, with a set on each of the six exercises.
    sessionId = randomUUID();
    await db.insert(schema.workoutSessions).values({ id: sessionId, userId });
    await db.insert(schema.sets).values(
      exerciseIds.map((exerciseId, index) => ({
        id: randomUUID(),
        sessionId,
        exerciseId,
        setIndex: index,
        weight: 90,
        reps: 5,
        isWarmup: false,
      })),
    );
  });

  afterAll(async () => {
    await db.delete(schema.user).where(eq(schema.user.id, userId));
    await client.end();
  });

  it("resolves the session once for every procedure in a batch", async () => {
    const api = createRouterClient(router, { context: batchContext() });

    authState.resolutions = 0;
    // The five reads the train screen fires on mount.
    await Promise.all([
      api.session.active(),
      api.session.recent({ limit: 10 }),
      api.plan.upcoming(),
      api.session.restToday({ timeZone: "UTC" }),
      api.profile.get({ timeZone: "UTC" }),
    ]);

    expect(authState.resolutions).toBe(1);
  });

  it("resolves it again for the next request", async () => {
    authState.resolutions = 0;
    const first = createRouterClient(router, { context: batchContext() });
    const second = createRouterClient(router, { context: batchContext() });

    await first.session.active();
    await second.session.active();

    // Memoised per request, never across them: a module-level cache here would
    // leak one user's session into the next request a warm instance served.
    expect(authState.resolutions).toBe(2);
  });

  it("reads a six-exercise workout in two queries", async () => {
    const executed: string[] = [];
    const original = db.execute.bind(db);
    const spy = vi
      .spyOn(db, "execute")
      .mockImplementation((query: Parameters<typeof original>[0]) => {
        executed.push(String(query));
        return original(query);
      });

    try {
      const detail = await getSessionDetail(db, userId, sessionId);

      expect(detail?.sets).toHaveLength(6);
      expect(Object.keys(detail?.lastPerformances ?? {})).toHaveLength(6);
      // Every exercise found its previous session, in the same one query.
      for (const exerciseId of exerciseIds) {
        expect(detail?.lastPerformances[exerciseId]?.sets[0].weight).toBe(100);
      }

      // The workout and its plan, then the ghosts. Not four, and not one per
      // exercise on top.
      expect(executed).toHaveLength(2);
    } finally {
      spy.mockRestore();
    }
  });

  it("leaves one open workout when two starts race", async () => {
    // The open session from the fixture is in the way, and that is the point:
    // it is what the two racing starts are racing against.
    const [first, second] = await Promise.allSettled([
      startSession(db, userId, { id: randomUUID(), routineDayId: null, notes: null }),
      startSession(db, userId, { id: randomUUID(), routineDayId: null, notes: null }),
    ]);

    for (const outcome of [first, second]) {
      expect(outcome.status).toBe("fulfilled");
      if (outcome.status === "fulfilled") {
        // Neither opened a second workout; both were told which one is already
        // running. The database decided that, not a read-then-write.
        expect(outcome.value.status).toBe("already-active");
        if (outcome.value.status === "already-active") {
          expect(outcome.value.sessionId).toBe(sessionId);
        }
      }
    }

    const open = await db
      .select({ id: schema.workoutSessions.id })
      .from(schema.workoutSessions)
      .where(inArray(schema.workoutSessions.userId, [userId]));
    expect(open.filter((row) => row.id === sessionId)).toHaveLength(1);
  });

  it("returns the same workout when a start is retried under the same id", async () => {
    // Close the fixture's workout so a new one can legitimately open.
    await db
      .update(schema.workoutSessions)
      .set({ endedAt: new Date() })
      .where(eq(schema.workoutSessions.id, sessionId));

    const id = randomUUID();
    const started = await startSession(db, userId, { id, routineDayId: null, notes: null });
    const retried = await startSession(db, userId, { id, routineDayId: null, notes: null });

    expect(started.status).toBe("started");
    expect(retried.status).toBe("replayed");
    if (started.status !== "already-active" && retried.status !== "already-active") {
      expect(retried.session.id).toBe(started.session.id);
    }
  });
});
