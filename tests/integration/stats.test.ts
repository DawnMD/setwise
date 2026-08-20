import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "../../db/schema";
import type { MuscleSlug } from "../../lib/muscles";
import { muscleVolume } from "../../server/queries/stats";
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

describe("muscle volume queries", () => {
  let week: Awaited<ReturnType<typeof muscleVolume>>;
  let quarter: Awaited<ReturnType<typeof muscleVolume>>;

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

    week = await muscleVolume(db, userId, 7);
    quarter = await muscleVolume(db, userId, 90);
  });

  afterAll(async () => {
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
});
