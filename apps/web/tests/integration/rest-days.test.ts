import { randomUUID } from "node:crypto";

import { createRouterClient } from "@orpc/server";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@setwise/db/schema";
import { openSharedTestDatabase } from "./database";
import { getRoutineDetail, listRoutines, startableDays } from "@setwise/db/queries/plan";
import { getSessionDetail, recentSessions } from "@setwise/db/queries/session";
import { createSessionResolver } from "../../server/orpc";
import { router } from "../../server/router";

const authState = vi.hoisted(() => ({ userId: "" }));

// Procedures reach for the app's own database, which always speaks Neon's
// WebSocket protocol. CI runs against a plain Postgres service with no Neon
// proxy in front of it, so the router is handed the test connection instead.
vi.mock("../../db", async () => {
  const [{ openSharedTestDatabase }, schema] = await Promise.all([
    import("./database"),
    import("@setwise/db/schema"),
  ]);

  return { db: openSharedTestDatabase().db, schema };
});

vi.mock("../../lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({ user: { id: authState.userId } })),
    },
  },
}));

const { client, db } = openSharedTestDatabase();
const userId = `test-rest-${randomUUID()}`;
const otherUserId = `test-rest-other-${randomUUID()}`;
// A fresh context per call, the way a request gets one. The session resolver
// memoises within a request, so a shared context would pin every procedure in
// the file to whichever user happened to call first.
const api = createRouterClient(router, {
  context: () => {
    const headers = new Headers();
    return { headers, getSession: createSessionResolver(headers) };
  },
});
const timeZone = "UTC";

describe("rest-day acceptance", () => {
  let routineId: string;
  let workoutDayId: string;
  let restDayId: string;
  let emptyWorkoutDayId: string;
  let benchId: string;
  let plannedRestId: string;

  beforeAll(async () => {
    authState.userId = userId;

    await db.insert(schema.user).values(
      [userId, otherUserId].map((id) => ({
        id,
        name: "Rest test fixture",
        email: `${id}@example.invalid`,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );

    const [bench] = await db
      .select({ id: schema.exercises.id })
      .from(schema.exercises)
      .where(eq(schema.exercises.sourceId, "Barbell_Bench_Press_-_Medium_Grip"))
      .limit(1);
    if (!bench) throw new Error("Seed is missing bench press. Run pnpm db:seed.");
    benchId = bench.id;

    const [routine] = await db
      .insert(schema.routines)
      .values({ userId, name: "Workout and recovery" })
      .returning();
    routineId = routine.id;

    const workout = await api.plan.addDay({ routineId, name: "Workout" });
    const rest = await api.plan.addDay({ routineId, name: "Rest day", kind: "rest" });
    const empty = await api.plan.addDay({ routineId, name: "Empty workout" });
    workoutDayId = workout.id;
    restDayId = rest.id;
    emptyWorkoutDayId = empty.id;

    await db.insert(schema.routineExercises).values({
      routineDayId: workoutDayId,
      exerciseId: benchId,
      orderIndex: 0,
    });

    const oldWorkout = new Date(Date.now() - 7 * 86_400_000);
    await db.insert(schema.workoutSessions).values({
      id: randomUUID(),
      userId,
      routineDayId: workoutDayId,
      startedAt: oldWorkout,
      endedAt: oldWorkout,
    });
  });

  afterAll(async () => {
    await db.delete(schema.user).where(inArray(schema.user.id, [userId, otherUserId]));
    await client.end();
  });

  it("defaults existing contracts to workout and exposes rest kinds in plan responses", async () => {
    const [workoutDay, restDay, defaultSession] = await Promise.all([
      db.select().from(schema.routineDays).where(eq(schema.routineDays.id, workoutDayId)).limit(1),
      db.select().from(schema.routineDays).where(eq(schema.routineDays.id, restDayId)).limit(1),
      db
        .select()
        .from(schema.workoutSessions)
        .where(eq(schema.workoutSessions.routineDayId, workoutDayId))
        .limit(1),
    ]);

    expect(workoutDay[0].kind).toBe("workout");
    expect(restDay[0].kind).toBe("rest");
    expect(defaultSession[0].kind).toBe("workout");

    const detail = await getRoutineDetail(db, userId, routineId);
    expect(detail?.days.map((day) => [day.name, day.kind])).toEqual([
      ["Workout", "workout"],
      ["Rest day", "rest"],
      ["Empty workout", "workout"],
    ]);

    const [summary] = await listRoutines(db, userId);
    expect(summary).toMatchObject({
      dayCount: 3,
      restDayCount: 1,
      exerciseCount: 1,
      lastActivityAt: expect.any(Date),
    });
  });

  it("includes empty rest days in upcoming, excludes empty workouts, and advances rotation", async () => {
    const before = await startableDays(db, userId);
    expect(before.map((day) => [day.name, day.kind])).toEqual([
      ["Rest day", "rest"],
      ["Workout", "workout"],
    ]);
    expect(before.some((day) => day.id === emptyWorkoutDayId)).toBe(false);

    const logged = await api.session.logRestDay({
      routineDayId: restDayId,
      timeZone,
    });
    plannedRestId = logged.id;

    expect(logged.kind).toBe("rest");
    expect(logged.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(logged.startedAt.getTime()).toBe(logged.endedAt?.getTime());

    const stored = await db
      .select()
      .from(schema.workoutSessions)
      .where(eq(schema.workoutSessions.id, plannedRestId));
    expect(stored).toHaveLength(1);
    expect(await api.session.restToday({ timeZone })).toMatchObject({ id: plannedRestId });
    await expect(api.session.logRestDay({ routineDayId: null, timeZone })).rejects.toMatchObject({
      code: "REST_ALREADY_LOGGED",
      data: { sessionId: plannedRestId },
    });

    const after = await startableDays(db, userId);
    expect(after.map((day) => day.name)).toEqual(["Workout", "Rest day"]);
    expect(after.find((day) => day.id === restDayId)?.lastRunAt).not.toBeNull();
  });

  it("logs ad-hoc rest without changing routine order", async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    await db
      .update(schema.workoutSessions)
      .set({ startedAt: yesterday, endedAt: yesterday })
      .where(eq(schema.workoutSessions.id, plannedRestId));

    const before = (await startableDays(db, userId)).map((day) => day.id);
    const adHoc = await api.session.logRestDay({ routineDayId: null, timeZone });
    const after = (await startableDays(db, userId)).map((day) => day.id);

    expect(adHoc).toMatchObject({ kind: "rest", routineDayId: null });
    expect(after).toEqual(before);
  });

  it("enforces ownership and activity kinds on every write path", async () => {
    const [otherRoutine] = await db
      .insert(schema.routines)
      .values({ userId: otherUserId, name: "Other routine" })
      .returning();
    const [otherRest] = await db
      .insert(schema.routineDays)
      .values({ routineId: otherRoutine.id, dayIndex: 0, name: "Other rest", kind: "rest" })
      .returning();

    await expect(
      api.session.logRestDay({ routineDayId: otherRest.id, timeZone }),
    ).rejects.toMatchObject({ code: "DAY_NOT_FOUND" });
    await expect(
      api.session.logRestDay({ routineDayId: workoutDayId, timeZone }),
    ).rejects.toMatchObject({ code: "DAY_IS_WORKOUT" });
    await expect(
      api.session.start({ id: randomUUID(), routineDayId: restDayId, notes: null }),
    ).rejects.toMatchObject({ code: "DAY_IS_REST" });
    await expect(
      api.plan.addExercise({ routineDayId: restDayId, exerciseId: benchId }),
    ).rejects.toMatchObject({ code: "DAY_IS_REST" });
    await expect(
      api.session.createSet({
        id: randomUUID(),
        sessionId: plannedRestId,
        exerciseId: benchId,
        setIndex: 0,
        weight: 100,
        reps: 5,
        rpe: null,
        isWarmup: false,
      }),
    ).rejects.toMatchObject({ code: "SESSION_IS_REST" });
  });

  it("creates, updates, and deletes sets only through an owned workout", async () => {
    const session = await api.session.start({ id: randomUUID(), routineDayId: null, notes: null });
    const created = await api.session.createSet({
      id: randomUUID(),
      sessionId: session.id,
      exerciseId: benchId,
      setIndex: 0,
      weight: 100,
      reps: 5,
      rpe: 8,
      isWarmup: false,
    });

    expect(created.set.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.records.length).toBeGreaterThan(0);

    const updated = await api.session.updateSet({
      id: created.set.id,
      sessionId: session.id,
      exerciseId: benchId,
      setIndex: 0,
      weight: 102.5,
      reps: 5,
      rpe: 8,
      isWarmup: false,
    });
    expect(updated.set).toMatchObject({ id: created.set.id, weight: 102.5 });
    expect(
      await db.select().from(schema.sets).where(eq(schema.sets.sessionId, session.id)),
    ).toHaveLength(1);

    authState.userId = otherUserId;
    await expect(
      api.session.deleteSet({ id: created.set.id, sessionId: session.id }),
    ).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });
    expect(
      await db.select().from(schema.sets).where(eq(schema.sets.id, created.set.id)),
    ).toHaveLength(1);

    authState.userId = userId;
    await api.session.deleteSet({ id: created.set.id, sessionId: session.id });
    expect(
      await db.select().from(schema.sets).where(eq(schema.sets.id, created.set.id)),
    ).toHaveLength(0);
    await api.session.discard({ id: session.id });
  });

  it("refuses rest while a workout is active and reports activity kinds", async () => {
    const active = await api.session.start({ id: randomUUID(), routineDayId: null, notes: null });
    const activeId = active.id;
    expect(activeId).toMatch(/^[0-9a-f-]{36}$/);
    expect(active.kind).toBe("workout");
    await expect(api.session.logRestDay({ routineDayId: null, timeZone })).rejects.toMatchObject({
      code: "SESSION_ALREADY_ACTIVE",
      data: { sessionId: activeId },
    });
    await api.session.discard({ id: activeId });

    const recent = await recentSessions(db, userId, 20);
    const planned = recent.find((session) => session.id === plannedRestId);
    expect(planned).toMatchObject({
      kind: "rest",
      routineName: "Workout and recovery",
      dayName: "Rest day",
      setCount: 0,
      tonnage: 0,
    });

    const detail = await getSessionDetail(db, userId, plannedRestId);
    expect(detail).toMatchObject({
      kind: "rest",
      plan: { kind: "rest", dayName: "Rest day", routineName: "Workout and recovery" },
      sets: [],
    });
  });

  it("preserves rest history when its routine is deleted", async () => {
    await db.delete(schema.routines).where(eq(schema.routines.id, routineId));

    const detail = await getSessionDetail(db, userId, plannedRestId);
    expect(detail).toMatchObject({ kind: "rest", routineDayId: null, plan: null });

    const recent = await recentSessions(db, userId, 20);
    expect(recent.find((session) => session.id === plannedRestId)).toMatchObject({
      kind: "rest",
      routineName: null,
      dayName: null,
    });
  });
});
