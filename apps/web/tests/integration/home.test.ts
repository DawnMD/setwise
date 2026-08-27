import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@setwise/db/schema";
import { MUSCLES } from "@setwise/domain/muscles";
import { homeSummary, HOME_WEEK_DAYS, type HomeSummary } from "@setwise/db/queries/home";
import { startableDays } from "@setwise/db/queries/plan";
import { profileSummary } from "@setwise/db/queries/profile";
import { muscleVolume, untrainedMuscles } from "@setwise/db/queries/stats";
import { openTestDatabase } from "./database";

const { client, db } = openTestDatabase();

/** The account with history. */
const userId = `test-home-${randomUUID()}`;
/** Someone else, mid-workout, to prove nothing here crosses accounts. */
const otherUserId = `test-home-other-${randomUUID()}`;
/** A brand new account, which is the state most of these numbers have to survive. */
const emptyUserId = `test-home-empty-${randomUUID()}`;

/**
 * Everything is built and read in UTC, so the hand-worked figures below do not
 * move depending on what the clock says where this runs.
 */
function utcDate(daysAgo: number, hour = 12): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

const utcDay = (daysAgo: number) => utcDate(daysAgo).toISOString().slice(0, 10);

/**
 * Two weigh-ins in the current week and two in the week before it.
 *
 * 81 against 85 is a four-kilogram drop that no single pair of readings in it
 * would report: 80 against 86 is six, 82 against 84 is two. That is the whole
 * argument for comparing trend against trend.
 */
const THIS_WEEK: [daysAgo: number, weight: number][] = [
  [1, 80],
  [3, 82],
];
const LAST_WEEK: [daysAgo: number, weight: number][] = [
  [8, 84],
  [10, 86],
];
const EXPECTED_TREND = 81;
const EXPECTED_PREVIOUS_TREND = 85;

/** Three working sets at 100x5 and two at 140x3, behind one warm-up. */
const EXPECTED_WORKING_SETS = 5;
const EXPECTED_TONNAGE = 3 * 100 * 5 + 2 * 140 * 3;
const EXPECTED_SESSIONS = 2;

describe("home summary", () => {
  let summary: HomeSummary;
  let empty: HomeSummary;
  let exerciseId: string;

  beforeAll(async () => {
    for (const id of [userId, otherUserId, emptyUserId]) {
      await db.insert(schema.user).values({
        id,
        name: "Home test fixture",
        email: `${id}@example.invalid`,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    for (const [daysAgo, weight] of [...THIS_WEEK, ...LAST_WEEK]) {
      await db
        .insert(schema.bodyweightLogs)
        .values({ userId, loggedOn: utcDay(daysAgo), weight, note: null });
    }
    // Today, and someone else's. It must not reach this user's trend.
    await db
      .insert(schema.bodyweightLogs)
      .values({ userId: otherUserId, loggedOn: utcDay(0), weight: 120, note: null });

    // Tagged by hand rather than taken from the seed, so "sixteen muscles had
    // nothing" is an exact statement about this fixture rather than a statement
    // about how the catalogue happens to tag a bench press.
    const [exercise] = await db
      .insert(schema.exercises)
      .values({
        name: `Home fixture press ${userId}`,
        slug: `home-fixture-${userId}`,
        ownerId: userId,
      })
      .returning();
    exerciseId = exercise.id;

    const muscleIds = new Map(
      (
        await db.select({ id: schema.muscles.id, slug: schema.muscles.slug }).from(schema.muscles)
      ).map((row) => [row.slug, row.id] as const),
    );
    await db.insert(schema.exerciseMuscles).values([
      { exerciseId, muscleId: muscleIds.get("chest")!, role: "primary", factor: 1 },
      { exerciseId, muscleId: muscleIds.get("triceps")!, role: "secondary", factor: 0.5 },
    ]);

    let setIndex = 0;
    const addSets = async (
      sessionId: string,
      daysAgo: number,
      weight: number,
      reps: number,
      count: number,
      isWarmup: boolean,
    ) => {
      for (let index = 0; index < count; index += 1) {
        await db.insert(schema.sets).values({
          id: randomUUID(),
          sessionId,
          exerciseId,
          setIndex: setIndex++,
          weight,
          reps,
          isWarmup,
          performedAt: utcDate(daysAgo),
        });
      }
    };

    const finished = async (daysAgo: number) => {
      const id = randomUUID();
      await db.insert(schema.workoutSessions).values({
        id,
        userId,
        startedAt: utcDate(daysAgo),
        endedAt: utcDate(daysAgo),
      });
      return id;
    };

    const first = await finished(3);
    await addSets(first, 3, 60, 5, 1, true);
    await addSets(first, 3, 100, 5, 3, false);

    const second = await finished(1);
    await addSets(second, 1, 140, 3, 2, false);

    // Outside the week, inside every longer window.
    const old = await finished(20);
    await addSets(old, 20, 100, 5, 4, false);

    // Rest, today, in this user's own zone.
    await db.insert(schema.workoutSessions).values({
      id: randomUUID(),
      userId,
      kind: "rest",
      startedAt: new Date(),
      endedAt: new Date(),
    });

    // A routine with a workout day and a rest day, neither ever run, so the
    // rotation puts the first one next.
    const [routine] = await db
      .insert(schema.routines)
      .values({ userId, name: `Home fixture routine ${userId}` })
      .returning();
    const [pushDay] = await db
      .insert(schema.routineDays)
      .values({ routineId: routine.id, dayIndex: 0, name: "Push", kind: "workout" })
      .returning();
    await db
      .insert(schema.routineDays)
      .values({ routineId: routine.id, dayIndex: 1, name: "Rest", kind: "rest" });
    await db.insert(schema.routineExercises).values({
      routineDayId: pushDay.id,
      exerciseId,
      orderIndex: 0,
      targetSets: 3,
      targetRepLow: 8,
      targetRepHigh: 12,
      targetRpe: null,
    });

    // Someone else, mid-workout.
    await db.insert(schema.workoutSessions).values({
      id: randomUUID(),
      userId: otherUserId,
      startedAt: utcDate(0),
      endedAt: null,
    });

    summary = await homeSummary(db, userId, "UTC");
    empty = await homeSummary(db, emptyUserId, "UTC");
  });

  afterAll(async () => {
    for (const id of [userId, otherUserId, emptyUserId]) {
      await db.delete(schema.workoutSessions).where(eq(schema.workoutSessions.userId, id));
      await db.delete(schema.bodyweightLogs).where(eq(schema.bodyweightLogs.userId, id));
      await db.delete(schema.routines).where(eq(schema.routines.userId, id));
      await db.delete(schema.exercises).where(eq(schema.exercises.ownerId, id));
      await db.delete(schema.user).where(eq(schema.user.id, id));
    }
    await client.end();
  });

  it("rolls the week up over working sets only", () => {
    expect(summary.week.days).toBe(HOME_WEEK_DAYS);
    expect(summary.week.workingSets).toBe(EXPECTED_WORKING_SETS);
    expect(summary.week.tonnage).toBeCloseTo(EXPECTED_TONNAGE);
    // Two workouts, not five sets and not the three sessions that exist.
    expect(summary.week.sessions).toBe(EXPECTED_SESSIONS);
  });

  it("names every muscle the week missed, and agrees with the heatmap", async () => {
    const slugs = summary.week.untrained.map((muscle) => muscle.slug);
    expect(slugs).not.toContain("chest");
    expect(slugs).not.toContain("triceps");
    expect(slugs).toHaveLength(MUSCLES.length - 2);

    // The definition is shared with Progress rather than reimplemented: if one
    // of them ever starts counting warm-ups, this is where it shows up.
    const volume = await muscleVolume(db, userId, HOME_WEEK_DAYS);
    expect(slugs).toEqual(untrainedMuscles(volume).map((muscle) => muscle.slug));
  });

  it("reports weight as a change between two seven-day means", async () => {
    expect(summary.weight.trend).toBeCloseTo(EXPECTED_TREND);
    expect(summary.weight.previousTrend).toBeCloseTo(EXPECTED_PREVIOUS_TREND);
    expect(summary.weight.changeKg).toBeCloseTo(EXPECTED_TREND - EXPECTED_PREVIOUS_TREND);
    expect(summary.weight.latest).toEqual({ day: utcDay(1), weight: 80 });
  });

  it("shows the same trend the calorie targets are computed from", async () => {
    const profile = await profileSummary(db, userId, "UTC");
    expect(summary.weight.trend).toBeCloseTo(profile.weight.trend!);
  });

  it("offers the day the rotation puts first", async () => {
    const rotation = await startableDays(db, userId);
    expect(summary.nextDay).toEqual(rotation[0]);
    expect(summary.nextDay?.name).toBe("Push");
  });

  it("reads rest and the open workout per account", async () => {
    expect(summary.restLoggedToday).toBe(true);
    expect(summary.active).toBeNull();

    const other = await homeSummary(db, otherUserId, "UTC");
    expect(other.active).not.toBeNull();
    expect(other.restLoggedToday).toBe(false);
    // The other account's weigh-in today is theirs, and only theirs.
    expect(other.weight.latest).toEqual({ day: utcDay(0), weight: 120 });
    expect(other.week.workingSets).toBe(0);
  });

  it("draws a new account without a single missing answer becoming a crash", () => {
    expect(empty.active).toBeNull();
    expect(empty.nextDay).toBeNull();
    expect(empty.restLoggedToday).toBe(false);
    expect(empty.week.workingSets).toBe(0);
    expect(empty.week.tonnage).toBe(0);
    expect(empty.week.sessions).toBe(0);
    expect(empty.week.untrained).toHaveLength(MUSCLES.length);
    expect(empty.weight.trend).toBeNull();
    expect(empty.weight.previousTrend).toBeNull();
    expect(empty.weight.changeKg).toBeNull();
    expect(empty.weight.latest).toBeNull();
  });

  it("has no change to report until there are two weeks of weigh-ins", async () => {
    await db.delete(schema.bodyweightLogs).where(eq(schema.bodyweightLogs.userId, emptyUserId));
    await db
      .insert(schema.bodyweightLogs)
      .values({ userId: emptyUserId, loggedOn: utcDay(2), weight: 70, note: null });

    const oneWeek = await homeSummary(db, emptyUserId, "UTC");
    expect(oneWeek.weight.trend).toBeCloseTo(70);
    expect(oneWeek.weight.previousTrend).toBeNull();
    // Null rather than zero. "No change" and "nothing to compare with" are
    // different answers, and only one of them is worth printing.
    expect(oneWeek.weight.changeKg).toBeNull();
  });
});
