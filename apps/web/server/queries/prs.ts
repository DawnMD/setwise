import { and, eq, ne, sql } from "drizzle-orm";

import type { DbClient } from "@/db";
import { personalRecords, sets, workoutSessions } from "@/db/schema";
import { E1RM_MAX_REPS, E1RM_MIN_REPS, estimateOneRepMax } from "@/lib/math";

import type { SetRow } from "./session";
import "@tanstack/react-start/server-only";

export type PrKind = "max_weight" | "best_e1rm" | "max_reps_at_weight" | "session_volume";

export type DetectedRecord = {
  kind: PrKind;
  value: number;
  /**
   * What it beat, or null when nothing came before it.
   *
   * A first-ever set is genuinely a record and is stored as one, so the history
   * is complete. The UI only celebrates when `previous` is non-null, because
   * congratulating someone on every set of their first workout is noise.
   */
  previous: number | null;
  /** The weight the reps were done at. Only set for `max_reps_at_weight`. */
  atWeight?: number;
};

/**
 * Previous bests read from `sets` rather than from `personal_records`.
 *
 * The PR table is an append-only log of "this happened". Detection reads from
 * the sets themselves, so an edited or deleted set cannot leave a phantom
 * record standing as the number to beat.
 */
async function previousBests(db: DbClient, userId: string, set: SetRow) {
  const [row] = await db
    .select({
      maxWeight: sql<number | null>`max(${sets.weight})::float8`,
      bestE1rm: sql<number | null>`max(
        case when ${sets.reps} between ${E1RM_MIN_REPS} and ${E1RM_MAX_REPS}
        then ${sets.weight} * (1 + ${sets.reps} / 30.0) end
      )::float8`,
      maxRepsAtWeight: sql<number | null>`max(
        case when ${sets.weight} = ${set.weight}::numeric then ${sets.reps} end
      )::int`,
    })
    .from(sets)
    .innerJoin(workoutSessions, eq(workoutSessions.id, sets.sessionId))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(sets.exerciseId, set.exerciseId),
        eq(sets.isWarmup, false),
        ne(sets.id, set.id),
      ),
    );

  return row ?? { maxWeight: null, bestE1rm: null, maxRepsAtWeight: null };
}

/**
 * Whether this set already existed.
 *
 * A brand-new set cannot have records to clean up: nothing can reference an id
 * the database has never seen. Skipping the delete removes a statement from the
 * write path people are standing over. An edit still has to clear the old rows,
 * or a set corrected downward would leave its previous PR standing.
 */
export type RecordMode = "created" | "edited";

/**
 * Detects and stores records for one saved set.
 *
 * On an edit, the delete and the insert go out together rather than as two
 * awaited statements, because they are one change: the records for this set are
 * whatever it now proves, and there is no useful moment in between.
 */
export async function recordSetPersonalRecords(
  db: DbClient,
  userId: string,
  set: SetRow,
  mode: RecordMode = "edited",
): Promise<DetectedRecord[]> {
  const clearsExisting = mode === "edited";

  // Warm-ups are logged so you can see them next session, not so they set
  // records. A warm-up single is not a max.
  if (set.isWarmup) {
    if (clearsExisting) {
      await db.delete(personalRecords).where(eq(personalRecords.setId, set.id));
    }
    return [];
  }

  const best = await previousBests(db, userId, set);
  const found: DetectedRecord[] = [];

  if (set.weight > 0 && (best.maxWeight === null || set.weight > best.maxWeight)) {
    found.push({ kind: "max_weight", value: set.weight, previous: best.maxWeight });
  }

  const e1rm = estimateOneRepMax(set.weight, set.reps);
  if (e1rm !== null && (best.bestE1rm === null || e1rm > best.bestE1rm)) {
    found.push({ kind: "best_e1rm", value: e1rm, previous: best.bestE1rm });
  }

  if (best.maxRepsAtWeight === null || set.reps > best.maxRepsAtWeight) {
    found.push({
      kind: "max_reps_at_weight",
      value: set.reps,
      previous: best.maxRepsAtWeight,
      atWeight: set.weight,
    });
  }

  if (found.length === 0) {
    if (clearsExisting) {
      await db.delete(personalRecords).where(eq(personalRecords.setId, set.id));
    }
    return found;
  }

  const values = found.map((record) => ({
    userId,
    exerciseId: set.exerciseId,
    kind: record.kind,
    value: Math.round(record.value * 100) / 100,
    setId: set.id,
    achievedAt: set.performedAt,
  }));

  if (!clearsExisting) {
    await db.insert(personalRecords).values(values);
    return found;
  }

  // One statement: the old rows for this set go and the new ones arrive. A
  // data-modifying CTE always runs to completion whether or not the outer query
  // reads from it, so the delete does not need to be referenced to happen.
  await db.execute(sql`
    with cleared as (
      delete from personal_records where set_id = ${set.id}::uuid returning 1
    )
    insert into personal_records (user_id, exercise_id, kind, value, set_id, achieved_at)
    values ${sql.join(
      values.map(
        (record) =>
          sql`(${userId}, ${record.exerciseId}::uuid, ${record.kind}::pr_kind,
               ${record.value}::numeric, ${record.setId}::uuid, ${record.achievedAt}::timestamptz)`,
      ),
      sql`, `,
    )}
  `);

  return found;
}

export type SessionVolumeRecord = DetectedRecord & {
  exerciseId: string;
  exerciseName: string;
};

/**
 * Per-exercise session volume, detected when a workout is finished rather than
 * on each set. Volume for a session is only known once the session is over;
 * checking it per set would fire a PR on set two and again on set three.
 */
export async function recordSessionVolumeRecords(
  db: DbClient,
  userId: string,
  sessionId: string,
): Promise<SessionVolumeRecord[]> {
  const { rows } = await db.execute<{
    exercise_id: string;
    exercise_name: string;
    volume: number;
    previous_best: number | null;
  }>(sql`
    with this_session as (
      select s.exercise_id, sum(s.weight * s.reps) as volume
      from sets s
      where s.session_id = ${sessionId} and s.is_warmup = false
      group by s.exercise_id
    ),
    per_session as (
      select s.exercise_id, s.session_id, sum(s.weight * s.reps) as volume
      from sets s
      join workout_sessions ws on ws.id = s.session_id
      where ws.user_id = ${userId}
        and s.is_warmup = false
        and s.session_id <> ${sessionId}
      group by s.exercise_id, s.session_id
    ),
    previous as (
      select exercise_id, max(volume) as previous_best
      from per_session
      group by exercise_id
    )
    select t.exercise_id,
           e.name as exercise_name,
           t.volume::float8 as volume,
           p.previous_best::float8 as previous_best
    from this_session t
    join exercises e on e.id = t.exercise_id
    left join previous p on p.exercise_id = t.exercise_id
    where t.volume > 0
      and (p.previous_best is null or t.volume > p.previous_best)
  `);

  const found: SessionVolumeRecord[] = rows.map((row) => ({
    kind: "session_volume" as const,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    value: Number(row.volume),
    previous: row.previous_best === null ? null : Number(row.previous_best),
  }));

  if (found.length === 0) return [];

  // Session-volume records carry no `setId`: they belong to the session, not to
  // any one set in it, so there is no key to deduplicate them by. The caller is
  // responsible for only running this on the transition to finished — see the
  // conditional update in `session.finish`.
  await db.insert(personalRecords).values(
    found.map((record) => ({
      userId,
      exerciseId: record.exerciseId,
      kind: "session_volume" as const,
      value: Math.round(record.value * 100) / 100,
      setId: null,
      achievedAt: new Date(),
    })),
  );

  return found;
}
