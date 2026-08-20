import { and, eq, gte, sql } from "drizzle-orm";

import type { Db } from "@/db";
import { exerciseMuscles, muscles, sets, workoutSessions } from "@/db/schema";
import { type MuscleSlug, MUSCLES } from "@/lib/muscles";
import { volumeBand, type VolumeBand } from "@/lib/math";

/** The windows the whole app toggles between. One meaning everywhere. */
export const STAT_WINDOWS = [7, 30, 90] as const;
export type StatWindow = (typeof STAT_WINDOWS)[number];

export type MuscleVolume = {
  slug: MuscleSlug;
  displayName: string;
  /** Sum of per-muscle factors: a primary set counts 1, a secondary 0.5. */
  effectiveSets: number;
  /** Sum of weight * reps * factor, in kilograms. */
  tonnage: number;
  band: VolumeBand;
};

/**
 * Effective sets and tonnage per muscle over a trailing window.
 *
 * Warm-ups are excluded: they are logged so the user can see them next session,
 * not so they inflate volume. Muscles with no work in the window are returned
 * with zeroes rather than omitted, because "you trained this zero times" is the
 * most actionable thing the heatmap says and it cannot be said by an absent row.
 */
export async function muscleVolume(db: Db, userId: string, days: number): Promise<MuscleVolume[]> {
  const rows = await db
    .select({
      slug: muscles.slug,
      effectiveSets: sql<number>`sum(${exerciseMuscles.factor})::float8`,
      tonnage: sql<number>`sum(${sets.weight} * ${sets.reps} * ${exerciseMuscles.factor})::float8`,
    })
    .from(sets)
    .innerJoin(exerciseMuscles, eq(exerciseMuscles.exerciseId, sets.exerciseId))
    .innerJoin(muscles, eq(muscles.id, exerciseMuscles.muscleId))
    .innerJoin(workoutSessions, eq(workoutSessions.id, sets.sessionId))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(sets.isWarmup, false),
        gte(sets.performedAt, sql`now() - make_interval(days => ${days})`),
      ),
    )
    .groupBy(muscles.slug);

  const found = new Map(rows.map((r) => [r.slug, r]));

  return MUSCLES.map((m) => {
    const row = found.get(m.slug);
    const effectiveSets = row?.effectiveSets ?? 0;
    return {
      slug: m.slug,
      displayName: m.displayName,
      effectiveSets,
      tonnage: row?.tonnage ?? 0,
      band: volumeBand(effectiveSets),
    };
  });
}

/** Muscles with no working sets in the window. */
export function untrainedMuscles(volume: MuscleVolume[]): MuscleVolume[] {
  return volume.filter((m) => m.effectiveSets === 0);
}
