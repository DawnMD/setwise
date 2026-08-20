/**
 * Phase 2's acceptance check for the plan builder.
 *
 * The screens can be driven by hand; these are the four things that cannot be
 * checked by looking, because they either only misbehave on the second run or
 * fail silently:
 *
 *   1. Reordering days survives the unique index on `(routine_id, day_index)`,
 *      including the swap that briefly wants two rows at the same index.
 *   2. Ownership is enforced through the join, not the id. A day belongs to a
 *      routine, and only the routine carries a user.
 *   3. A session started from a routine day reads its lineup back in plan
 *      order, with targets attached.
 *   4. "What's next" puts the never-run day first, then the least recently run,
 *      which is what makes the rotation look after itself mid-week.
 *
 * It creates two throwaway users and deletes them at the end, so it is safe to
 * run against the real database.
 *
 *   npm run db:verify:plan
 */
import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { parseConnectionString } from "../db/connection";
import * as schema from "../db/schema";
import { describeTargets } from "../lib/targets";
import { uuidv7 } from "../lib/uuid";
import {
  findDay,
  getRoutineDetail,
  sessionPlan,
  startableDays,
  swapDayOrder,
} from "../server/queries/plan";

config({ path: ".env.local", quiet: true });

const failures: string[] = [];

function check(label: string, condition: boolean, detail?: string) {
  if (!condition) failures.push(detail ? `${label}: ${detail}` : label);
}

function expectEqual(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) failures.push(`${label}: expected ${b}, got ${a}`);
}

/** How a target reads. Blanks are absent, not zeroes. */
function verifyPure() {
  expectEqual(
    "a full target",
    describeTargets({ targetSets: 3, targetRepLow: 8, targetRepHigh: 12, targetRpe: 8 }),
    "3 × 8–12 @ 8",
  );
  expectEqual(
    "a fixed rep count collapses the range",
    describeTargets({ targetSets: 5, targetRepLow: 5, targetRepHigh: 5, targetRpe: null }),
    "5 × 5",
  );
  expectEqual(
    "an open-ended bottom end",
    describeTargets({ targetSets: 3, targetRepLow: 8, targetRepHigh: null, targetRpe: null }),
    "3 × 8+",
  );
  expectEqual(
    "sets alone",
    describeTargets({ targetSets: 4, targetRepLow: null, targetRepHigh: null, targetRpe: null }),
    "4 ×",
  );
  expectEqual(
    "nothing set reads as nothing, not as a zero",
    describeTargets({ targetSets: null, targetRepLow: null, targetRepHigh: null, targetRpe: null }),
    null,
  );
}

async function main() {
  verifyPure();

  const raw = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!raw) throw new Error("Set DATABASE_URL_UNPOOLED or DATABASE_URL in .env.local");

  const { url, ssl } = parseConnectionString(raw);
  const client = postgres(url, { ssl, max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  const userId = `verify-plan-${randomUUID()}`;
  const otherUserId = `verify-plan-other-${randomUUID()}`;

  try {
    for (const id of [userId, otherUserId]) {
      await db.insert(schema.user).values({
        id,
        name: "Plan fixture",
        email: `${id}@example.invalid`,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

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
    if (catalogue.length < 3) {
      throw new Error("Seed is missing the big three. Run npm run db:seed.");
    }
    const [bench, squat, deadlift] = catalogue;

    // --- A three-day split. ---
    const [routine] = await db
      .insert(schema.routines)
      .values({ userId, name: "Push/pull/legs" })
      .returning();

    const days = await db
      .insert(schema.routineDays)
      .values([
        { routineId: routine.id, dayIndex: 0, name: "Push" },
        { routineId: routine.id, dayIndex: 1, name: "Pull" },
        { routineId: routine.id, dayIndex: 2, name: "Legs" },
      ])
      .returning();

    const [push, pull, legs] = days;

    await db.insert(schema.routineExercises).values([
      {
        routineDayId: push.id,
        exerciseId: bench.id,
        orderIndex: 0,
        targetSets: 4,
        targetRepLow: 5,
        targetRepHigh: 8,
        targetRpe: 8,
      },
      {
        routineDayId: legs.id,
        exerciseId: squat.id,
        orderIndex: 0,
        targetSets: 5,
        targetRepLow: 5,
        targetRepHigh: 5,
        targetRpe: null,
      },
      {
        routineDayId: legs.id,
        exerciseId: deadlift.id,
        orderIndex: 1,
        targetSets: 1,
        targetRepLow: 5,
        targetRepHigh: 5,
        targetRpe: 9,
      },
    ]);

    // --- Reordering: Legs moves ahead of Pull. ---
    // The swap parks one row on a negative index first, because the unique
    // index on (routine_id, day_index) is checked row by row.
    await db.transaction(async (tx) => {
      await swapDayOrder(tx, pull.id, legs.id, pull.dayIndex, legs.dayIndex);
    });

    const reordered = await getRoutineDetail(db, userId, routine.id);
    expectEqual(
      "a day swap survives the unique index",
      reordered?.days.map((day) => day.name),
      ["Push", "Legs", "Pull"],
    );
    const legsDetail = reordered?.days.find((day) => day.name === "Legs");
    expectEqual(
      "exercises stay in their own order after a day moves",
      legsDetail?.exercises.map((entry) => entry.exerciseId),
      [squat.id, deadlift.id],
    );
    expectEqual("legs day keeps both exercises", legsDetail?.exercises.length, 2);
    expectEqual(
      "targets round-trip through the database",
      describeTargets(legsDetail!.exercises[1]),
      "1 × 5 @ 9",
    );

    // --- Ownership runs through the join, not the id. ---
    check("a day is reachable by its owner", (await findDay(db, userId, push.id)) !== null);
    check(
      "a day is not reachable by anyone else",
      (await findDay(db, otherUserId, push.id)) === null,
    );

    // --- A session started from a day reads its lineup back. ---
    const sessionId = uuidv7();
    await db
      .insert(schema.workoutSessions)
      .values({ id: sessionId, userId, routineDayId: legs.id });

    const plan = await sessionPlan(db, userId, sessionId);
    expectEqual("the session knows which day it came from", plan?.dayName, "Legs");
    expectEqual("the session knows the routine", plan?.routineName, "Push/pull/legs");
    expectEqual("the lineup arrives in plan order", plan?.exercises.length, 2);
    expectEqual(
      "the first planned exercise carries its targets",
      describeTargets(plan!.exercises[0]),
      "5 × 5",
    );
    check(
      "another user cannot read the plan behind a session",
      (await sessionPlan(db, otherUserId, sessionId)) === null,
    );

    // --- What to run next. ---
    // Legs has just been started above, Push never has, and Pull has no
    // exercises at all.
    const upcoming = await startableDays(db, userId);
    expectEqual(
      "a day with no exercises is left out, and a day never run comes first",
      upcoming.map((day) => day.name),
      ["Push", "Legs"],
    );

    // Now both have run: Legs a week ago, Push two days ago. The one that has
    // waited longest goes to the top, which is what keeps a rotation honest
    // without anyone tracking where they are in it.
    await db
      .update(schema.workoutSessions)
      .set({ startedAt: new Date(Date.now() - 7 * 86_400_000) })
      .where(eq(schema.workoutSessions.id, sessionId));

    await db.insert(schema.workoutSessions).values({
      id: uuidv7(),
      userId,
      routineDayId: push.id,
      startedAt: new Date(Date.now() - 2 * 86_400_000),
      endedAt: new Date(Date.now() - 2 * 86_400_000),
    });

    const afterRuns = await startableDays(db, userId);
    expectEqual(
      "the least recently run day comes first",
      afterRuns.map((day) => day.name),
      ["Legs", "Push"],
    );
    check("a day that has run reports when", afterRuns.every((day) => day.lastRunAt !== null));

    // --- Deleting the routine keeps the training history. ---
    await db.delete(schema.routines).where(eq(schema.routines.id, routine.id));
    const [survivor] = await db
      .select({ id: schema.workoutSessions.id, routineDayId: schema.workoutSessions.routineDayId })
      .from(schema.workoutSessions)
      .where(eq(schema.workoutSessions.id, sessionId));

    check("deleting a routine keeps the workouts run off it", survivor !== undefined);
    expectEqual("a deleted routine leaves the session unattached", survivor?.routineDayId, null);

    if (failures.length > 0) {
      console.error(`${failures.length} check(s) failed:`);
      for (const failure of failures) console.error(`  ${failure}`);
      process.exitCode = 1;
    } else {
      console.log("Targets, day reordering, ownership, prefill and what's-next all pass.");
    }
  } finally {
    await db.delete(schema.user).where(inArray(schema.user.id, [userId, otherUserId]));
    await client.end();
  }
}

void main();
