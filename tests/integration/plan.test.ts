import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "../../db/schema";
import { describeTargets } from "../../lib/targets";
import {
  findDay,
  getRoutineDetail,
  listRoutines,
  sessionPlan,
  startableDays,
  swapDayOrder,
} from "../../server/queries/plan";
import { openTestDatabase } from "./database";

const { client, db } = openTestDatabase();
const userId = `test-plan-${randomUUID()}`;
const otherUserId = `test-plan-other-${randomUUID()}`;

describe("plan builder acceptance", () => {
  beforeAll(async () => {
    await db.insert(schema.user).values(
      [userId, otherUserId].map((id) => ({
        id,
        name: "Plan test fixture",
        email: `${id}@example.invalid`,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );
  });

  afterAll(async () => {
    await db.delete(schema.user).where(inArray(schema.user.id, [userId, otherUserId]));
    await client.end();
  });

  it("renders complete, fixed, open-ended, and empty targets", () => {
    expect(
      describeTargets({ targetSets: 3, targetRepLow: 8, targetRepHigh: 12, targetRpe: 8 }),
    ).toBe("3 × 8–12 @ 8");
    expect(
      describeTargets({ targetSets: 5, targetRepLow: 5, targetRepHigh: 5, targetRpe: null }),
    ).toBe("5 × 5");
    expect(
      describeTargets({ targetSets: 3, targetRepLow: 8, targetRepHigh: null, targetRpe: null }),
    ).toBe("3 × 8+");
    expect(
      describeTargets({ targetSets: 4, targetRepLow: null, targetRepHigh: null, targetRpe: null }),
    ).toBe("4 ×");
    expect(
      describeTargets({
        targetSets: null,
        targetRepLow: null,
        targetRepHigh: null,
        targetRpe: null,
      }),
    ).toBeNull();
  });

  it("keeps ordering, ownership, session prefill, rotation, and history consistent", async () => {
    const catalogue = await db
      .select({ id: schema.exercises.id, sourceId: schema.exercises.sourceId })
      .from(schema.exercises)
      .where(
        inArray(schema.exercises.sourceId, [
          "Barbell_Bench_Press_-_Medium_Grip",
          "Barbell_Squat",
          "Barbell_Deadlift",
        ]),
      );
    const bySourceId = new Map(catalogue.map((exercise) => [exercise.sourceId, exercise.id]));
    const benchId = bySourceId.get("Barbell_Bench_Press_-_Medium_Grip");
    const squatId = bySourceId.get("Barbell_Squat");
    const deadliftId = bySourceId.get("Barbell_Deadlift");
    if (!benchId || !squatId || !deadliftId) {
      throw new Error("Seed is missing the big three. Run pnpm db:seed.");
    }

    const [routine] = await db
      .insert(schema.routines)
      .values({ userId, name: "Push/pull/legs" })
      .returning();
    const [push, pull, legs] = await db
      .insert(schema.routineDays)
      .values([
        { routineId: routine.id, dayIndex: 0, name: "Push" },
        { routineId: routine.id, dayIndex: 1, name: "Pull" },
        { routineId: routine.id, dayIndex: 2, name: "Legs" },
      ])
      .returning();

    await db.insert(schema.routineExercises).values([
      {
        routineDayId: push.id,
        exerciseId: benchId,
        orderIndex: 0,
        targetSets: 4,
        targetRepLow: 5,
        targetRepHigh: 8,
        targetRpe: 8,
      },
      {
        routineDayId: legs.id,
        exerciseId: squatId,
        orderIndex: 0,
        targetSets: 5,
        targetRepLow: 5,
        targetRepHigh: 5,
        targetRpe: null,
      },
      {
        routineDayId: legs.id,
        exerciseId: deadliftId,
        orderIndex: 1,
        targetSets: 1,
        targetRepLow: 5,
        targetRepHigh: 5,
        targetRpe: 9,
      },
    ]);

    await db.transaction(async (transaction) => {
      await swapDayOrder(transaction, pull.id, legs.id, pull.dayIndex, legs.dayIndex);
    });

    const reordered = await getRoutineDetail(db, userId, routine.id);
    expect(reordered?.days.map((day) => day.name)).toEqual(["Push", "Legs", "Pull"]);

    const legsDetail = reordered?.days.find((day) => day.name === "Legs");
    expect(legsDetail?.exercises.map((exercise) => exercise.exerciseId)).toEqual([
      squatId,
      deadliftId,
    ]);
    expect(legsDetail?.exercises).toHaveLength(2);
    expect(describeTargets(legsDetail!.exercises[1])).toBe("1 × 5 @ 9");

    expect(await findDay(db, userId, push.id)).not.toBeNull();
    expect(await findDay(db, otherUserId, push.id)).toBeNull();

    const sessionId = randomUUID();
    await db.insert(schema.workoutSessions).values({
      id: sessionId,
      userId,
      routineDayId: legs.id,
    });

    const plannedSession = await sessionPlan(db, userId, sessionId);
    expect(plannedSession).toMatchObject({
      dayName: "Legs",
      routineName: "Push/pull/legs",
    });
    expect(plannedSession?.exercises).toHaveLength(2);
    expect(describeTargets(plannedSession!.exercises[0])).toBe("5 × 5");
    expect(await sessionPlan(db, otherUserId, sessionId)).toBeNull();

    const upcoming = await startableDays(db, userId);
    expect(upcoming.map((day) => day.name)).toEqual(["Push", "Legs"]);

    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    await db
      .update(schema.workoutSessions)
      .set({ startedAt: weekAgo, endedAt: weekAgo })
      .where(eq(schema.workoutSessions.id, sessionId));
    await db.insert(schema.workoutSessions).values({
      id: randomUUID(),
      userId,
      routineDayId: push.id,
      startedAt: new Date(Date.now() - 2 * 86_400_000),
      endedAt: new Date(Date.now() - 2 * 86_400_000),
    });

    const afterRuns = await startableDays(db, userId);
    expect(afterRuns.map((day) => day.name)).toEqual(["Legs", "Push"]);
    expect(afterRuns.every((day) => day.lastRunAt !== null)).toBe(true);

    const listed = await listRoutines(db, userId);
    expect(listed).toEqual([
      expect.objectContaining({
        id: routine.id,
        dayCount: 3,
        restDayCount: 0,
        exerciseCount: 3,
        lastActivityAt: expect.any(Date),
      }),
    ]);

    await db.delete(schema.routines).where(eq(schema.routines.id, routine.id));
    const [survivingSession] = await db
      .select({ routineDayId: schema.workoutSessions.routineDayId })
      .from(schema.workoutSessions)
      .where(eq(schema.workoutSessions.id, sessionId));

    expect(survivingSession).toBeDefined();
    expect(survivingSession.routineDayId).toBeNull();
  });
});
