import { and, asc, desc, eq, isNull, ne, or, sql } from "drizzle-orm";

import type { DbClient } from "@/db";
import { exercises, sets, workoutSessions } from "@/db/schema";
import type { SetInput } from "@/db/validators";
import { sessionPlan, type SessionPlan } from "./plan";

export type SetRow = {
  id: string;
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  weight: number;
  reps: number;
  rpe: number | null;
  isWarmup: boolean;
  performedAt: Date;
  clientCreatedAt: Date;
};

export type SessionExercise = {
  id: string;
  name: string;
  equipment: string | null;
};

export type SessionDetail = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  notes: string | null;
  routineDayId: string | null;
  /**
   * The routine day this session was started from, if any. The logger opens
   * with this lineup already on screen, which is the whole point of planning a
   * day in advance.
   */
  plan: SessionPlan | null;
  /** Every exercise the session has at least one set for, in the order first logged. */
  exercises: SessionExercise[];
  sets: SetRow[];
};

const setColumns = {
  id: sets.id,
  sessionId: sets.sessionId,
  exerciseId: sets.exerciseId,
  setIndex: sets.setIndex,
  weight: sets.weight,
  reps: sets.reps,
  rpe: sets.rpe,
  isWarmup: sets.isWarmup,
  performedAt: sets.performedAt,
  clientCreatedAt: sets.clientCreatedAt,
};

/** Narrowed by user on every read. A session id alone is never enough. */
export async function findSession(db: DbClient, userId: string, sessionId: string) {
  const [row] = await db
    .select()
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getSessionDetail(
  db: DbClient,
  userId: string,
  sessionId: string,
): Promise<SessionDetail | null> {
  const session = await findSession(db, userId, sessionId);
  if (!session) return null;

  const rows = await db
    .select({ ...setColumns, exerciseName: exercises.name, equipment: exercises.equipment })
    .from(sets)
    .innerJoin(exercises, eq(exercises.id, sets.exerciseId))
    .where(eq(sets.sessionId, sessionId))
    .orderBy(asc(sets.clientCreatedAt), asc(sets.setIndex));

  // Order of first appearance, which is the order the user did them in. A
  // `session_exercises` table would say this directly, but an exercise with no
  // sets is not part of the training history, so the sets are the truth.
  const exerciseOrder: SessionExercise[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.exerciseId)) continue;
    seen.add(row.exerciseId);
    exerciseOrder.push({ id: row.exerciseId, name: row.exerciseName, equipment: row.equipment });
  }

  const plan = session.routineDayId ? await sessionPlan(db, userId, sessionId) : null;

  return {
    id: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    notes: session.notes,
    routineDayId: session.routineDayId,
    plan,
    exercises: exerciseOrder,
    sets: rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      exerciseId: row.exerciseId,
      setIndex: row.setIndex,
      weight: row.weight,
      reps: row.reps,
      rpe: row.rpe,
      isWarmup: row.isWarmup,
      performedAt: row.performedAt,
      clientCreatedAt: row.clientCreatedAt,
    })),
  };
}

export type LastPerformance = {
  sessionId: string;
  performedAt: Date;
  sets: Array<Pick<SetRow, "setIndex" | "weight" | "reps" | "rpe" | "isWarmup">>;
};

/**
 * The last time this exercise was trained, before the session being logged.
 *
 * This is the ghost value behind every weight and rep input, and progressive
 * overload is the entire sport, so it is the single most load-bearing read in
 * the app. It walks `sets_exercise_performed_idx` backwards and stops at the
 * first row, then pulls that one session's sets.
 */
export async function lastPerformance(
  db: DbClient,
  userId: string,
  exerciseId: string,
  excludeSessionId: string | null,
): Promise<LastPerformance | null> {
  const [latest] = await db
    .select({ sessionId: sets.sessionId, performedAt: sets.performedAt })
    .from(sets)
    .innerJoin(workoutSessions, eq(workoutSessions.id, sets.sessionId))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(sets.exerciseId, exerciseId),
        excludeSessionId ? ne(sets.sessionId, excludeSessionId) : undefined,
      ),
    )
    .orderBy(desc(sets.performedAt))
    .limit(1);

  if (!latest) return null;

  const rows = await db
    .select({
      setIndex: sets.setIndex,
      weight: sets.weight,
      reps: sets.reps,
      rpe: sets.rpe,
      isWarmup: sets.isWarmup,
    })
    .from(sets)
    .where(and(eq(sets.sessionId, latest.sessionId), eq(sets.exerciseId, exerciseId)))
    .orderBy(asc(sets.setIndex));

  return { sessionId: latest.sessionId, performedAt: latest.performedAt, sets: rows };
}

/**
 * Global exercises, plus the caller's own. Checked on every write so a set can
 * never be attached to another user's custom exercise.
 */
export async function exerciseIsVisible(
  db: DbClient,
  userId: string,
  exerciseId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(
      and(
        eq(exercises.id, exerciseId),
        or(isNull(exercises.ownerId), eq(exercises.ownerId, userId)),
      ),
    )
    .limit(1);
  return row !== undefined;
}

export type SessionSummary = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  setCount: number;
  workingSetCount: number;
  tonnage: number;
  exerciseNames: string[];
};

/** The recent-workouts list on the train screen. */
export async function recentSessions(
  db: DbClient,
  userId: string,
  limit: number,
): Promise<SessionSummary[]> {
  const rows = await db
    .select({
      id: workoutSessions.id,
      startedAt: workoutSessions.startedAt,
      endedAt: workoutSessions.endedAt,
      setCount: sql<number>`count(${sets.id})::int`,
      workingSetCount: sql<number>`(count(${sets.id}) filter (where ${sets.isWarmup} = false))::int`,
      tonnage: sql<number>`coalesce((sum(${sets.weight} * ${sets.reps}) filter (where ${sets.isWarmup} = false)), 0)::float8`,
      exerciseNames: sql<string[]>`coalesce(array_agg(distinct ${exercises.name}) filter (where ${exercises.name} is not null), '{}'::text[])`,
    })
    .from(workoutSessions)
    .leftJoin(sets, eq(sets.sessionId, workoutSessions.id))
    .leftJoin(exercises, eq(exercises.id, sets.exerciseId))
    .where(eq(workoutSessions.userId, userId))
    .groupBy(workoutSessions.id)
    .orderBy(desc(workoutSessions.startedAt))
    .limit(limit);

  return rows;
}

/**
 * Upsert on the client-generated id.
 *
 * `on conflict (id) do update` is what makes the write path idempotent: the
 * second tap after a timeout rewrites the same row rather than adding a
 * duplicate. `performedAt` is left alone on conflict, so a retry does not shift
 * a set into a later stats window than the one it happened in.
 */
export async function upsertSet(db: DbClient, input: SetInput): Promise<SetRow> {
  const [row] = await db
    .insert(sets)
    .values({
      id: input.id,
      sessionId: input.sessionId,
      exerciseId: input.exerciseId,
      setIndex: input.setIndex,
      weight: input.weight,
      reps: input.reps,
      rpe: input.rpe,
      isWarmup: input.isWarmup,
      clientCreatedAt: input.clientCreatedAt,
    })
    .onConflictDoUpdate({
      target: sets.id,
      set: {
        setIndex: input.setIndex,
        weight: input.weight,
        reps: input.reps,
        rpe: input.rpe,
        isWarmup: input.isWarmup,
      },
    })
    .returning(setColumns);

  return row;
}
