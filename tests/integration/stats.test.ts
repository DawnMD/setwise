import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "../../db/schema";
import { volumeBand } from "../../lib/math";
import type { MuscleSlug } from "../../lib/muscles";
import {
  exerciseHistory,
  intensitySummary,
  muscleVolume,
  trainedExercises,
} from "../../server/queries/stats";
import { openTestDatabase } from "./database";

const { client, db } = openTestDatabase();
const userId = `test-stats-${randomUUID()}`;
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

type Workout = [
  sourceId: string,
  weight: number,
  reps: number,
  count: number,
  daysAgo: number,
  isWarmup: boolean,
];

const WEEK: Workout[] = [
  ["Barbell_Squat", 60, 5, 1, 3, true],
  ["Barbell_Squat", 100, 5, 3, 3, false],
  ["Barbell_Bench_Press_-_Medium_Grip", 80, 5, 3, 2, false],
  ["Barbell_Deadlift", 140, 3, 2, 1, false],
  ["Side_Lateral_Raise", 10, 15, 3, 1, false],
  ["Barbell_Curl", 30, 10, 3, 40, false],
];

const EXPECTED_SETS_7D: Record<MuscleSlug, number> = {
  chest: 3,
  front_delts: 1.5,
  side_delts: 3,
  rear_delts: 0,
  biceps: 0,
  triceps: 1.5,
  forearms: 1,
  lats: 1,
  traps: 1,
  upper_back: 1,
  lower_back: 2.5,
  abs: 1.5,
  obliques: 0,
  glutes: 5,
  quads: 4,
  hamstrings: 3.5,
  adductors: 1.5,
  calves: 0,
};

const EXPECTED_TONNAGE_7D: Partial<Record<MuscleSlug, number>> = {
  quads: 1_920,
  glutes: 2_340,
  hamstrings: 1_590,
  lower_back: 1_170,
  adductors: 750,
  abs: 750,
  chest: 1_200,
  front_delts: 600,
  triceps: 600,
  side_delts: 450,
};

/**
 * Twenty sets of a calf raise, forty days back, tagged to one muscle and
 * nothing else.
 *
 * It exists to separate a window total from a weekly rate. Twenty effective
 * sets is "high" if you did them this week and barely anything if you spread
 * them over a quarter, and banding the raw window sum cannot tell the two
 * apart. A purpose-built exercise rather than a seeded one, so the assertion
 * does not rest on how the catalogue happens to tag calf raises.
 */
const SPREAD_SETS = 20;
const SPREAD_DAYS_AGO = 40;

describe("muscle volume queries", () => {
  let week: Awaited<ReturnType<typeof muscleVolume>>;
  let quarter: Awaited<ReturnType<typeof muscleVolume>>;
  const exerciseIds = new Map<string, string>();

  beforeAll(async () => {
    await db.insert(schema.user).values({
      id: userId,
      name: "Stats test fixture",
      email: `${userId}@example.invalid`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const catalogue = await db
      .select({ id: schema.exercises.id, sourceId: schema.exercises.sourceId })
      .from(schema.exercises);
    const bySourceId = new Map(catalogue.map((exercise) => [exercise.sourceId, exercise.id]));

    const sessionId = randomUUID();
    await db.insert(schema.workoutSessions).values({
      id: sessionId,
      userId,
      startedAt: daysAgo(3),
      endedAt: daysAgo(3),
    });

    let setIndex = 0;
    for (const [sourceId, weight, reps, count, age, isWarmup] of WEEK) {
      const exerciseId = bySourceId.get(sourceId);
      if (!exerciseId) {
        throw new Error(`Seed is missing exercise ${sourceId}. Run npm run db:seed.`);
      }

      exerciseIds.set(sourceId, exerciseId);

      for (let index = 0; index < count; index += 1) {
        await db.insert(schema.sets).values({
          id: randomUUID(),
          sessionId,
          exerciseId,
          setIndex: setIndex++,
          weight,
          reps,
          isWarmup,
          performedAt: daysAgo(age),
          clientCreatedAt: daysAgo(age),
        });
      }
    }

    const [calves] = await db
      .select({ id: schema.muscles.id })
      .from(schema.muscles)
      .where(eq(schema.muscles.slug, "calves"));

    const [spreadExercise] = await db
      .insert(schema.exercises)
      .values({
        name: `Spread calf raise ${userId}`,
        slug: `spread-calf-${userId}`,
        ownerId: userId,
      })
      .returning();
    exerciseIds.set("spread", spreadExercise.id);

    await db.insert(schema.exerciseMuscles).values({
      exerciseId: spreadExercise.id,
      muscleId: calves.id,
      role: "primary",
      factor: 1,
    });

    for (let index = 0; index < SPREAD_SETS; index += 1) {
      await db.insert(schema.sets).values({
        id: randomUUID(),
        sessionId,
        exerciseId: spreadExercise.id,
        setIndex: setIndex++,
        weight: 100,
        // Past the range Epley is trusted over, so these sets stay out of every
        // e1RM and relative-intensity figure and only move volume.
        reps: 15,
        isWarmup: false,
        performedAt: daysAgo(SPREAD_DAYS_AGO),
        clientCreatedAt: daysAgo(SPREAD_DAYS_AGO),
      });
    }

    week = await muscleVolume(db, userId, 7);
    quarter = await muscleVolume(db, userId, 90);
  });

  afterAll(async () => {
    // Sets reference exercises with `on delete restrict`, so the owned exercise
    // cannot go while its rows are still there. Deleting the user alone would
    // leave Postgres to pick an order and trip over that.
    await db.delete(schema.workoutSessions).where(eq(schema.workoutSessions.userId, userId));
    await db.delete(schema.exercises).where(eq(schema.exercises.ownerId, userId));
    await db.delete(schema.user).where(eq(schema.user.id, userId));
    await client.end();
  });

  it("returns every muscle, including those with no work", () => {
    expect(week).toHaveLength(18);
    expect(new Set(week.map((muscle) => muscle.slug))).toEqual(
      new Set(Object.keys(EXPECTED_SETS_7D)),
    );

    for (const muscle of week) {
      expect(muscle.effectiveSets).toBeCloseTo(EXPECTED_SETS_7D[muscle.slug]);
      expect(muscle.band).toBe(muscle.effectiveSets === 0 ? "none" : "low");
    }
  });

  it("weights effective sets by muscle factor and ignores warm-ups", () => {
    const bySlug = new Map(week.map((muscle) => [muscle.slug, muscle]));

    for (const [slug, expected] of Object.entries(EXPECTED_SETS_7D)) {
      expect(bySlug.get(slug as MuscleSlug)?.effectiveSets).toBeCloseTo(expected);
    }
  });

  it("weights tonnage by the same muscle factor", () => {
    const bySlug = new Map(week.map((muscle) => [muscle.slug, muscle]));

    for (const [slug, expected] of Object.entries(EXPECTED_TONNAGE_7D)) {
      expect(bySlug.get(slug as MuscleSlug)?.tonnage).toBeCloseTo(expected);
    }
  });

  it("excludes old work from short windows and includes it in longer windows", () => {
    const weekBySlug = new Map(week.map((muscle) => [muscle.slug, muscle]));
    const quarterBySlug = new Map(quarter.map((muscle) => [muscle.slug, muscle]));

    expect(weekBySlug.get("biceps")?.effectiveSets).toBe(0);
    expect(quarterBySlug.get("biceps")?.effectiveSets).toBeCloseTo(3);
    expect(weekBySlug.get("forearms")?.effectiveSets).toBeCloseTo(1);
    expect(quarterBySlug.get("forearms")?.effectiveSets).toBeCloseTo(2.5);
  });

  it("reports the weekly rate alongside the window total", () => {
    for (const muscle of week) {
      expect(muscle.weeklyEffectiveSets).toBeCloseTo(muscle.effectiveSets);
    }

    for (const muscle of quarter) {
      expect(muscle.weeklyEffectiveSets).toBeCloseTo((muscle.effectiveSets * 7) / 90);
    }
  });

  it("bands on the weekly rate, so a long window doesn't inflate the ramp", () => {
    const calves = quarter.find((muscle) => muscle.slug === "calves")!;

    // Twenty effective sets in the window, which the weekly landmarks would
    // call "high" if they were applied to the raw total.
    expect(calves.effectiveSets).toBeCloseTo(SPREAD_SETS);
    expect(volumeBand(calves.effectiveSets)).toBe("high");

    // Spread over ninety days it is about a set and a half a week, which is
    // what the heatmap has to say.
    expect(calves.weeklyEffectiveSets).toBeCloseTo((SPREAD_SETS * 7) / 90);
    expect(calves.band).toBe("low");

    for (const muscle of quarter) {
      expect(muscle.band).toBe(volumeBand(muscle.weeklyEffectiveSets));
    }
  });

  describe("intensity", () => {
    it("averages weight against the best e1RM for that exercise", async () => {
      const summary = await intensitySummary(db, userId, 7);

      // Relative intensity collapses to 1 / (1 + reps / 30) when the reference
      // is the set's own e1RM: 0.857 at five reps, 0.909 at three.
      const fives = 1 / (1 + 5 / 30);
      const threes = 1 / (1 + 3 / 30);
      expect(summary.avgRelativeIntensity).toBeCloseTo((6 * fives + 2 * threes) / 8);

      // Eleven working sets, of which the three lateral raises have no e1RM to
      // be judged against and are dropped rather than counted as zero.
      expect(summary.workingSets).toBe(11);
      expect(summary.intensitySets).toBe(8);
    });

    it("reports RPE separately and says when there is none", async () => {
      const summary = await intensitySummary(db, userId, 7);

      expect(summary.avgRpe).toBeNull();
      expect(summary.rpeSets).toBe(0);
    });
  });

  describe("exercise history", () => {
    it("lists the exercises trained in the window, most recent first", async () => {
      const weekly = await trainedExercises(db, userId, 7);

      // The deadlift and the lateral raise are both a day back and separated
      // only by the microseconds between two inserts, so the pair is asserted
      // as a pair. What matters is that neither sorts below the older work.
      expect(new Set(weekly.slice(0, 2).map((exercise) => exercise.name))).toEqual(
        new Set(["Barbell Deadlift", "Side Lateral Raise"]),
      );
      expect(weekly.slice(2).map((exercise) => exercise.name)).toEqual([
        "Barbell Bench Press - Medium Grip",
        "Barbell Squat",
      ]);

      const times = weekly.map((exercise) => exercise.lastPerformedAt.getTime());
      expect(times).toEqual([...times].sort((a, b) => b - a));
      expect(weekly.every((exercise) => exercise.sessions === 1)).toBe(true);

      // The curl and the spread calf raise are both forty days back.
      const quarterly = await trainedExercises(db, userId, 90);
      expect(quarterly).toHaveLength(6);
    });

    it("rolls up one point per session, warm-ups excluded", async () => {
      const history = await exerciseHistory(db, userId, exerciseIds.get("Barbell_Squat")!, 7);

      expect(history).toHaveLength(1);
      // Three working sets of 100x5. The 60 kg warm-up is not the top weight
      // and does not count toward the volume.
      expect(history[0].sets).toBe(3);
      expect(history[0].topWeight).toBe(100);
      expect(history[0].volume).toBeCloseTo(1_500);
      expect(history[0].bestE1rm).toBeCloseTo(100 * (1 + 5 / 30));
    });

    it("returns no e1RM for a session that never got under twelve reps", async () => {
      const history = await exerciseHistory(db, userId, exerciseIds.get("spread")!, 90);

      expect(history).toHaveLength(1);
      expect(history[0].bestE1rm).toBeNull();
      expect(history[0].sets).toBe(SPREAD_SETS);
    });
  });
});
