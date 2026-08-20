import { and, eq, gte, sql } from "drizzle-orm";

import type { Db, DbClient } from "@/db";
import { exerciseMuscles, exercises, muscles, sets, workoutSessions } from "@/db/schema";
import { STAT_WINDOWS } from "@/db/validators";
import { type MuscleSlug, MUSCLES } from "@/lib/muscles";
import { E1RM_MAX_REPS, E1RM_MIN_REPS } from "@/lib/math";
import { volumeBand, type VolumeBand } from "@/lib/math";

/**
 * The trailing window the relative-intensity reference is read over, fixed at
 * 90 days regardless of what the screen is showing.
 *
 * A set is judged against your recent best, and "recent" has to mean the same
 * thing whichever toggle is selected. Letting it follow the window would make a
 * set read as 100% on the 7-day view and 85% on the 90-day view without a
 * single number having changed.
 */
export const INTENSITY_REFERENCE_DAYS = 90;

export { STAT_WINDOWS };
export type { StatWindow } from "@/db/validators";

/** Epley in SQL, null outside the rep range it can be trusted over. */
const setE1rm = sql<number | null>`case
  when ${sets.reps} between ${E1RM_MIN_REPS} and ${E1RM_MAX_REPS}
  then ${sets.weight} * (1 + ${sets.reps} / 30.0)
end`;

export type MuscleVolume = {
  slug: MuscleSlug;
  displayName: string;
  /** Sum of per-muscle factors over the window: a primary set counts 1, a secondary 0.5. */
  effectiveSets: number;
  /** The same figure as a per-week rate, which is what the bands are defined over. */
  weeklyEffectiveSets: number;
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
 *
 * The band is taken from the weekly rate, not the window total. The landmarks
 * behind it — ten sets, twenty sets — are weekly figures, so applying them to a
 * 90-day sum would paint almost every muscle at the top of the ramp and the
 * window toggle would stop meaning anything.
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
  const weeks = days / 7;

  return MUSCLES.map((m) => {
    const row = found.get(m.slug);
    const effectiveSets = row?.effectiveSets ?? 0;
    const weeklyEffectiveSets = effectiveSets / weeks;
    return {
      slug: m.slug,
      displayName: m.displayName,
      effectiveSets,
      weeklyEffectiveSets,
      tonnage: row?.tonnage ?? 0,
      band: volumeBand(weeklyEffectiveSets),
    };
  });
}

/** Muscles with no working sets in the window. */
export function untrainedMuscles(volume: MuscleVolume[]): MuscleVolume[] {
  return volume.filter((m) => m.effectiveSets === 0);
}

export type IntensitySummary = {
  /**
   * Mean of `weight / best e1RM for that exercise`, over the sets that have a
   * reference to be judged against. Null when none of them do.
   */
  avgRelativeIntensity: number | null;
  /** How many working sets that average is over, so a thin number can say so. */
  intensitySets: number;
  avgRpe: number | null;
  /** How many working sets carried an RPE. Most won't; RPE is optional. */
  rpeSets: number;
  workingSets: number;
};

/**
 * Average relative intensity and average RPE over the window.
 *
 * These are returned as two numbers and rendered side by side, never blended.
 * They measure different things — one is load against your own best, the other
 * is what the set felt like — and a single "intensity score" would hide the
 * case worth seeing, which is the two disagreeing.
 *
 * Sets of an exercise with no usable e1RM in the reference window are dropped
 * from the intensity average rather than counted as zero. A pure high-rep
 * accessory has no honest denominator, and folding it in as 0% would drag the
 * figure down for training that went fine.
 */
export async function intensitySummary(
  db: DbClient,
  userId: string,
  days: number,
): Promise<IntensitySummary> {
  const { rows } = await db.execute<{
    avg_relative_intensity: number | null;
    intensity_sets: number;
    avg_rpe: number | null;
    rpe_sets: number;
    working_sets: number;
  }>(sql`
    with reference as (
      select s.exercise_id,
             max(case when s.reps between ${E1RM_MIN_REPS} and ${E1RM_MAX_REPS}
                      then s.weight * (1 + s.reps / 30.0) end) as best_e1rm
      from sets s
      join workout_sessions ws on ws.id = s.session_id
      where ws.user_id = ${userId}
        and s.is_warmup = false
        and s.performed_at >= now() - make_interval(days => ${INTENSITY_REFERENCE_DAYS})
      group by s.exercise_id
    ),
    window_sets as (
      select s.weight, s.rpe, r.best_e1rm
      from sets s
      join workout_sessions ws on ws.id = s.session_id
      left join reference r on r.exercise_id = s.exercise_id
      where ws.user_id = ${userId}
        and s.is_warmup = false
        and s.performed_at >= now() - make_interval(days => ${days})
    )
    select
      avg(weight / best_e1rm) filter (where best_e1rm > 0)::float8 as avg_relative_intensity,
      count(*) filter (where best_e1rm > 0)::int as intensity_sets,
      avg(rpe)::float8 as avg_rpe,
      count(rpe)::int as rpe_sets,
      count(*)::int as working_sets
    from window_sets
  `);
  const [row] = rows;

  return {
    avgRelativeIntensity: row?.avg_relative_intensity ?? null,
    intensitySets: Number(row?.intensity_sets ?? 0),
    avgRpe: row?.avg_rpe ?? null,
    rpeSets: Number(row?.rpe_sets ?? 0),
    workingSets: Number(row?.working_sets ?? 0),
  };
}

export type TrainedExercise = {
  id: string;
  name: string;
  /** Distinct sessions in the window. Below two there is no trend to draw. */
  sessions: number;
  lastPerformedAt: Date;
};

/**
 * The exercises worth offering in the trend picker: the ones actually trained
 * in the window, most recent first, so the default selection is whatever the
 * user did last rather than whatever sorts first alphabetically.
 */
export async function trainedExercises(
  db: DbClient,
  userId: string,
  days: number,
): Promise<TrainedExercise[]> {
  const rows = await db
    .select({
      id: exercises.id,
      name: exercises.name,
      sessions: sql<number>`count(distinct ${sets.sessionId})::int`,
      lastPerformedAt: sql<Date>`max(${sets.performedAt})`,
    })
    .from(sets)
    .innerJoin(workoutSessions, eq(workoutSessions.id, sets.sessionId))
    .innerJoin(exercises, eq(exercises.id, sets.exerciseId))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(sets.isWarmup, false),
        gte(sets.performedAt, sql`now() - make_interval(days => ${days})`),
      ),
    )
    .groupBy(exercises.id, exercises.name)
    .orderBy(sql`max(${sets.performedAt}) desc`);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sessions: Number(row.sessions),
    lastPerformedAt: new Date(row.lastPerformedAt),
  }));
}

export type ExerciseHistoryPoint = {
  sessionId: string;
  performedAt: Date;
  /** Best Epley estimate of the session. Null if every set ran past twelve reps. */
  bestE1rm: number | null;
  topWeight: number;
  volume: number;
  sets: number;
};

/**
 * One point per session for a single exercise, oldest first.
 *
 * Rolled up per session rather than per set because that is the unit people
 * compare: "was last Tuesday better than the Tuesday before". A point per set
 * would put five dots on one date and turn the trend into noise.
 *
 * Scoped to the caller's own sessions, so the exercise id needs no separate
 * ownership check — another user's history is unreachable through it.
 */
export async function exerciseHistory(
  db: DbClient,
  userId: string,
  exerciseId: string,
  days: number,
): Promise<ExerciseHistoryPoint[]> {
  const rows = await db
    .select({
      sessionId: workoutSessions.id,
      performedAt: sql<Date>`min(${sets.performedAt})`,
      bestE1rm: sql<number | null>`max(${setE1rm})::float8`,
      topWeight: sql<number>`max(${sets.weight})::float8`,
      volume: sql<number>`sum(${sets.weight} * ${sets.reps})::float8`,
      sets: sql<number>`count(*)::int`,
    })
    .from(sets)
    .innerJoin(workoutSessions, eq(workoutSessions.id, sets.sessionId))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(sets.exerciseId, exerciseId),
        eq(sets.isWarmup, false),
        gte(sets.performedAt, sql`now() - make_interval(days => ${days})`),
      ),
    )
    .groupBy(workoutSessions.id)
    .orderBy(sql`min(${sets.performedAt}) asc`);

  return rows.map((row) => ({
    sessionId: row.sessionId,
    performedAt: new Date(row.performedAt),
    bestE1rm: row.bestE1rm,
    topWeight: row.topWeight,
    volume: row.volume,
    sets: Number(row.sets),
  }));
}
