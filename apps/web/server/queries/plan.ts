import { and, asc, countDistinct, eq, sql } from "drizzle-orm";

import type { DbClient } from "@/db";
import { exercises, routineDays, routineExercises, routines, workoutSessions } from "@/db/schema";
import type { ActivityKind } from "@/lib/activity";
import "@tanstack/react-start/server-only";

export type RoutineSummary = {
  id: string;
  name: string;
  notes: string | null;
  isArchived: boolean;
  dayCount: number;
  restDayCount: number;
  exerciseCount: number;
  lastActivityAt: Date | null;
};

export type PlannedExercise = {
  id: string;
  exerciseId: string;
  name: string;
  equipment: string | null;
  orderIndex: number;
  targetSets: number | null;
  targetRepLow: number | null;
  targetRepHigh: number | null;
  targetRpe: number | null;
};

export type PlannedDay = {
  id: string;
  name: string;
  dayIndex: number;
  kind: ActivityKind;
  exercises: PlannedExercise[];
};

export type RoutineDetail = {
  id: string;
  name: string;
  notes: string | null;
  isArchived: boolean;
  days: PlannedDay[];
};

/** Narrowed by user on every read. A routine id alone is never enough. */
export async function findRoutine(db: DbClient, userId: string, routineId: string) {
  const [row] = await db
    .select()
    .from(routines)
    .where(and(eq(routines.id, routineId), eq(routines.userId, userId)))
    .limit(1);
  return row ?? null;
}

/**
 * A day, with the routine it belongs to, checked against the caller.
 *
 * Every write below reaches a day through this rather than through its id
 * alone: `routine_days` has no `user_id` of its own, so the ownership check is
 * one join away and skipping it would let anyone edit anyone's plan.
 */
export async function findDay(db: DbClient, userId: string, dayId: string) {
  const [row] = await db
    .select({
      id: routineDays.id,
      routineId: routineDays.routineId,
      dayIndex: routineDays.dayIndex,
      name: routineDays.name,
      kind: routineDays.kind,
      routineName: routines.name,
    })
    .from(routineDays)
    .innerJoin(routines, eq(routines.id, routineDays.routineId))
    .where(and(eq(routineDays.id, dayId), eq(routines.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function findRoutineExercise(db: DbClient, userId: string, id: string) {
  const [row] = await db
    .select({
      id: routineExercises.id,
      routineDayId: routineExercises.routineDayId,
      orderIndex: routineExercises.orderIndex,
    })
    .from(routineExercises)
    .innerJoin(routineDays, eq(routineDays.id, routineExercises.routineDayId))
    .innerJoin(routines, eq(routines.id, routineDays.routineId))
    .where(and(eq(routineExercises.id, id), eq(routines.userId, userId)))
    .limit(1);
  return row ?? null;
}

/**
 * The plan list.
 *
 * `lastActivityAt` is the reason this is one query with two aggregates rather
 * than a simple select: "when did I last use this" is the thing that tells you
 * which of four routines is the live one, and it is the first thing you look
 * for on this screen.
 */
export async function listRoutines(db: DbClient, userId: string): Promise<RoutineSummary[]> {
  const rows = await db
    .select({
      id: routines.id,
      name: routines.name,
      notes: routines.notes,
      isArchived: routines.isArchived,
      dayCount: countDistinct(routineDays.id),
      restDayCount: sql<number>`(
        count(distinct ${routineDays.id}) filter (where ${routineDays.kind} = 'rest')
      )::int`,
      exerciseCount: countDistinct(routineExercises.id),
      lastActivityAt: sql<Date | null>`(
          max(${workoutSessions.startedAt}) filter (where ${workoutSessions.endedAt} is not null)
        )`.mapWith(workoutSessions.startedAt),
    })
    .from(routines)
    .leftJoin(routineDays, eq(routineDays.routineId, routines.id))
    .leftJoin(routineExercises, eq(routineExercises.routineDayId, routineDays.id))
    .leftJoin(
      workoutSessions,
      and(eq(workoutSessions.routineDayId, routineDays.id), eq(workoutSessions.userId, userId)),
    )
    .where(eq(routines.userId, userId))
    .groupBy(routines.id)
    .orderBy(asc(routines.isArchived), asc(routines.createdAt));

  return rows;
}

export async function getRoutineDetail(
  db: DbClient,
  userId: string,
  routineId: string,
): Promise<RoutineDetail | null> {
  const routine = await findRoutine(db, userId, routineId);
  if (!routine) return null;

  const days = await db
    .select({
      id: routineDays.id,
      name: routineDays.name,
      dayIndex: routineDays.dayIndex,
      kind: routineDays.kind,
    })
    .from(routineDays)
    .where(eq(routineDays.routineId, routineId))
    .orderBy(asc(routineDays.dayIndex));

  const planned = await db
    .select({
      id: routineExercises.id,
      routineDayId: routineExercises.routineDayId,
      exerciseId: routineExercises.exerciseId,
      name: exercises.name,
      equipment: exercises.equipment,
      orderIndex: routineExercises.orderIndex,
      targetSets: routineExercises.targetSets,
      targetRepLow: routineExercises.targetRepLow,
      targetRepHigh: routineExercises.targetRepHigh,
      targetRpe: routineExercises.targetRpe,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .innerJoin(routineDays, eq(routineDays.id, routineExercises.routineDayId))
    .where(eq(routineDays.routineId, routineId))
    .orderBy(asc(routineExercises.orderIndex));

  const byDay = new Map<string, PlannedExercise[]>();
  for (const row of planned) {
    const { routineDayId, ...exercise } = row;
    const list = byDay.get(routineDayId);
    if (list) list.push(exercise);
    else byDay.set(routineDayId, [exercise]);
  }

  return {
    id: routine.id,
    name: routine.name,
    notes: routine.notes,
    isArchived: routine.isArchived,
    days: days.map((day) => ({ ...day, exercises: byDay.get(day.id) ?? [] })),
  };
}

/**
 * The plan behind a session, as the logger reads it.
 *
 * Assembled inside `getSessionDetail` rather than fetched on its own, and read
 * live rather than copied into the session at start: a routine edited mid-week
 * should show its new form the next time it is run, and a snapshot would need
 * its own table to say something nobody asked for.
 */
export type SessionPlan = {
  dayId: string;
  dayName: string;
  kind: ActivityKind;
  routineId: string;
  routineName: string;
  exercises: PlannedExercise[];
};

/**
 * Swaps two rows' order values.
 *
 * `routine_days` carries a unique index on `(routine_id, day_index)`, and a
 * non-deferrable unique index is checked row by row, so writing both new values
 * in one statement can trip over the pair mid-flight. Parking one row on a
 * negative index first is what makes the swap safe, and negatives are otherwise
 * unreachable because every index the app writes is zero or above.
 */
export async function swapDayOrder(
  db: DbClient,
  a: string,
  b: string,
  aIndex: number,
  bIndex: number,
) {
  await db.update(routineDays).set({ dayIndex: -1 }).where(eq(routineDays.id, a));
  await db.update(routineDays).set({ dayIndex: aIndex }).where(eq(routineDays.id, b));
  await db.update(routineDays).set({ dayIndex: bIndex }).where(eq(routineDays.id, a));
}

export type StartableDay = {
  id: string;
  name: string;
  dayIndex: number;
  kind: ActivityKind;
  routineId: string;
  routineName: string;
  exerciseCount: number;
  lastRunAt: Date | null;
};

/**
 * Every day you could run right now, least recently run first.
 *
 * This is the answer to "what am I doing today", which is the question the
 * train screen exists to answer. Ordering by last run rather than by day index
 * is what makes it useful mid-week: after Push and Pull, Legs is at the top
 * without anyone having to track where they are in the rotation.
 *
 * Days with no exercises are left out. Starting one would open an empty workout
 * that looks broken.
 */
export async function startableDays(db: DbClient, userId: string): Promise<StartableDay[]> {
  // Written once and used in both the projection and the sort. Ordering by the
  // output alias would work in Postgres but ties the query to how Drizzle
  // happens to quote it.
  const lastRun = sql<Date | null>`(
      select max(s.started_at)
      from workout_sessions s
      where s.routine_day_id = ${routineDays.id}
        and s.user_id = ${userId}
        and s.ended_at is not null
    )`.mapWith(workoutSessions.startedAt);

  const rows = await db
    .select({
      id: routineDays.id,
      name: routineDays.name,
      dayIndex: routineDays.dayIndex,
      kind: routineDays.kind,
      routineId: routines.id,
      routineName: routines.name,
      exerciseCount: sql<number>`(
        select count(*)::int from routine_exercises re where re.routine_day_id = ${routineDays.id}
      )`,
      lastRunAt: lastRun,
    })
    .from(routineDays)
    .innerJoin(routines, eq(routines.id, routineDays.routineId))
    .where(and(eq(routines.userId, userId), eq(routines.isArchived, false)))
    // Nulls first: a day you have never run is the one most likely to be next.
    .orderBy(sql`${lastRun} asc nulls first`, asc(routines.createdAt), asc(routineDays.dayIndex));

  return rows.filter((row) => row.kind === "rest" || row.exerciseCount > 0);
}
