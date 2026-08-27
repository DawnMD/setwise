import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

import type { Db, DbClient } from "../index";
import { exercises, routineDays, routines, sets, workoutSessions } from "../schema";
import type { CreateSetInput, UpdateSetInput } from "@setwise/domain/validators";
import type { ActivityKind } from "@setwise/domain/activity";
import { findDay, type PlannedExercise, type SessionPlan } from "./plan";

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
};

export type SessionExercise = {
  id: string;
  name: string;
  equipment: string | null;
};

export type LastPerformance = {
  sessionId: string;
  performedAt: Date;
  sets: Array<Pick<SetRow, "setIndex" | "weight" | "reps" | "rpe" | "isWarmup">>;
};

export type SessionDetail = {
  id: string;
  kind: ActivityKind;
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
  /**
   * The last time each exercise in the lineup was trained, keyed by exercise
   * id, excluding this session.
   *
   * Shipped with the workout rather than asked for per exercise. Six exercises
   * on screen used to mean six requests and twelve queries, all of them for the
   * ghost value behind the inputs — which is the app's whole argument for
   * existing and so has to be there before the first tap, not after six round
   * trips. A missing key and a null both mean "first time".
   */
  lastPerformances: Record<string, LastPerformance | null>;
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

export type RestDayLogErrorCode =
  "SESSION_ALREADY_ACTIVE" | "DAY_NOT_FOUND" | "DAY_IS_WORKOUT" | "REST_ALREADY_LOGGED";

export class RestDayLogError extends Error {
  constructor(
    readonly code: RestDayLogErrorCode,
    readonly sessionId?: string,
  ) {
    super(code);
    this.name = "RestDayLogError";
  }
}

/** The user's rest activity for their current local calendar day, if one exists. */
export async function restLoggedToday(db: DbClient, userId: string, timeZone: string) {
  const [row] = await db
    .select()
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.kind, "rest"),
        sql`(${workoutSessions.startedAt} at time zone ${timeZone})::date = (now() at time zone ${timeZone})::date`,
      ),
    )
    .orderBy(desc(workoutSessions.startedAt))
    .limit(1);

  return row ?? null;
}

/** Stores one instantaneous rest activity per local day. */
export async function logRestDay(
  db: Db,
  userId: string,
  input: { routineDayId: string | null; timeZone: string },
) {
  return db.transaction(async (tx) => {
    // The rule is user-and-local-day based, so it cannot be represented by a
    // simple unique index. Serializing this user's rest writes closes the race
    // between two open tabs without locking anyone else's activity.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`rest-day:${userId}`}))`);

    const [open] = await tx
      .select({ id: workoutSessions.id })
      .from(workoutSessions)
      .where(and(eq(workoutSessions.userId, userId), isNull(workoutSessions.endedAt)))
      .limit(1);

    if (open) throw new RestDayLogError("SESSION_ALREADY_ACTIVE", open.id);

    if (input.routineDayId) {
      const day = await findDay(tx, userId, input.routineDayId);
      if (!day) throw new RestDayLogError("DAY_NOT_FOUND");
      if (day.kind !== "rest") throw new RestDayLogError("DAY_IS_WORKOUT");
    }

    const restToday = await restLoggedToday(tx, userId, input.timeZone);
    if (restToday) throw new RestDayLogError("REST_ALREADY_LOGGED", restToday.id);

    const completedAt = new Date();
    const [created] = await tx
      .insert(workoutSessions)
      .values({
        userId,
        routineDayId: input.routineDayId,
        kind: "rest",
        startedAt: completedAt,
        endedAt: completedAt,
      })
      .returning();

    return created;
  });
}

/* -------------------------------------------------------------------------- */
/* Reading a session                                                          */
/* -------------------------------------------------------------------------- */

type JsonSession = {
  id: string;
  user_id: string;
  routine_day_id: string | null;
  kind: ActivityKind;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
};

type JsonDay = {
  id: string;
  name: string;
  kind: ActivityKind;
  routine_id: string;
  routine_name: string;
};

type JsonPlanned = {
  id: string;
  exercise_id: string;
  name: string;
  equipment: string | null;
  order_index: number;
  target_sets: number | null;
  target_rep_low: number | null;
  target_rep_high: number | null;
  target_rpe: number | null;
};

type JsonSet = {
  id: string;
  session_id: string;
  exercise_id: string;
  set_index: number;
  weight: number;
  reps: number;
  rpe: number | null;
  is_warmup: boolean;
  performed_at: string;
  exercise_name: string;
  equipment: string | null;
};

/**
 * The whole workout, in two reads.
 *
 * It used to be four: the session, its sets, the routine day, and the day's
 * planned exercises — each waiting on the one before it, each a round trip.
 * They are all narrow reads off the same session row, so they are one
 * statement, assembled server-side and returned as JSON.
 *
 * The second read is the previous-performance lookup for every exercise in the
 * lineup at once. It has to come second because the lineup is not known until
 * the first read has returned; there is no third.
 */
export async function getSessionDetail(
  db: DbClient,
  userId: string,
  sessionId: string,
): Promise<SessionDetail | null> {
  const { rows } = await db.execute<{
    session: JsonSession | null;
    day: JsonDay | null;
    planned: JsonPlanned[];
    sets: JsonSet[];
  }>(sql`
    with s as (
      select id, user_id, routine_day_id, kind, started_at, ended_at, notes
      from workout_sessions
      where id = ${sessionId}::uuid and user_id = ${userId}
    ),
    d as (
      select rd.id, rd.name, rd.kind, r.id as routine_id, r.name as routine_name
      from s
      join routine_days rd on rd.id = s.routine_day_id
      join routines r on r.id = rd.routine_id and r.user_id = ${userId}
    ),
    planned as (
      select re.id, re.exercise_id, e.name, e.equipment, re.order_index,
             re.target_sets, re.target_rep_low, re.target_rep_high,
             re.target_rpe::float8 as target_rpe
      from d
      join routine_exercises re on re.routine_day_id = d.id
      join exercises e on e.id = re.exercise_id
    ),
    logged as (
      select st.id, st.session_id, st.exercise_id, st.set_index,
             st.weight::float8 as weight, st.reps, st.rpe::float8 as rpe,
             st.is_warmup, st.performed_at,
             e.name as exercise_name, e.equipment
      from s
      join sets st on st.session_id = s.id
      join exercises e on e.id = st.exercise_id
    )
    select
      (select to_jsonb(s) from s) as session,
      (select to_jsonb(d) from d) as day,
      coalesce(
        (select jsonb_agg(to_jsonb(planned) order by planned.order_index) from planned),
        '[]'::jsonb
      ) as planned,
      coalesce(
        (select jsonb_agg(to_jsonb(logged) order by logged.performed_at, logged.set_index)
         from logged),
        '[]'::jsonb
      ) as sets
  `);

  const row = rows[0];
  if (!row?.session) return null;

  const session = row.session;
  const loggedSets = row.sets ?? [];

  const setRows: SetRow[] = loggedSets.map((entry) => ({
    id: entry.id,
    sessionId: entry.session_id,
    exerciseId: entry.exercise_id,
    setIndex: entry.set_index,
    weight: entry.weight,
    reps: entry.reps,
    rpe: entry.rpe,
    isWarmup: entry.is_warmup,
    performedAt: new Date(entry.performed_at),
  }));

  // Order of first appearance, which is the order the user did them in. A
  // `session_exercises` table would say this directly, but an exercise with no
  // sets is not part of the training history, so the sets are the truth.
  const exerciseOrder: SessionExercise[] = [];
  const seen = new Set<string>();
  for (const entry of loggedSets) {
    if (seen.has(entry.exercise_id)) continue;
    seen.add(entry.exercise_id);
    exerciseOrder.push({
      id: entry.exercise_id,
      name: entry.exercise_name,
      equipment: entry.equipment,
    });
  }

  const plannedExercises: PlannedExercise[] = (row.planned ?? []).map((entry) => ({
    id: entry.id,
    exerciseId: entry.exercise_id,
    name: entry.name,
    equipment: entry.equipment,
    orderIndex: entry.order_index,
    targetSets: entry.target_sets,
    targetRepLow: entry.target_rep_low,
    targetRepHigh: entry.target_rep_high,
    targetRpe: entry.target_rpe,
  }));

  const plan: SessionPlan | null = row.day
    ? {
        dayId: row.day.id,
        dayName: row.day.name,
        kind: row.day.kind,
        routineId: row.day.routine_id,
        routineName: row.day.routine_name,
        exercises: plannedExercises,
      }
    : null;

  // The planned lineup plus anything added on the fly. Both need a ghost.
  const lineup = [
    ...new Set([
      ...plannedExercises.map((entry) => entry.exerciseId),
      ...exerciseOrder.map((entry) => entry.id),
    ]),
  ];

  return {
    id: session.id,
    kind: session.kind,
    startedAt: new Date(session.started_at),
    endedAt: session.ended_at === null ? null : new Date(session.ended_at),
    notes: session.notes,
    routineDayId: session.routine_day_id,
    plan,
    exercises: exerciseOrder,
    sets: setRows,
    lastPerformances: await lastPerformances(db, userId, lineup, sessionId),
  };
}

type JsonLastPerformance = {
  exercise_id: string;
  session_id: string;
  performed_at: string;
  sets: Array<{
    setIndex: number;
    weight: number;
    reps: number;
    rpe: number | null;
    isWarmup: boolean;
  }>;
};

/**
 * The last time each of these exercises was trained, before this session.
 *
 * One query for the whole lineup. The lateral does the work: for each exercise
 * it walks `sets_exercise_performed_idx` backwards and stops at the first row,
 * so the cost is one index seek per exercise rather than a scan of that
 * exercise's whole history. A window function over the same rows would give the
 * same answer and read every set the user has ever logged for it.
 */
export async function lastPerformances(
  db: DbClient,
  userId: string,
  exerciseIds: readonly string[],
  excludeSessionId: string | null,
): Promise<Record<string, LastPerformance | null>> {
  const result: Record<string, LastPerformance | null> = {};
  for (const id of exerciseIds) result[id] = null;

  if (exerciseIds.length === 0) return result;

  // A VALUES list rather than an array parameter: an array reaches the driver
  // as one text literal, and one malformed id in it fails the whole statement
  // with a message about array syntax rather than about the id.
  const lineup = sql.join(
    exerciseIds.map((id) => sql`(${id}::uuid)`),
    sql`, `,
  );

  const { rows } = await db.execute<JsonLastPerformance>(sql`
    with lineup (exercise_id) as (
      values ${lineup}
    ),
    latest as (
      select lineup.exercise_id, previous.session_id, previous.performed_at
      from lineup
      cross join lateral (
        select st.session_id, st.performed_at
        from sets st
        join workout_sessions ws on ws.id = st.session_id
        where st.exercise_id = lineup.exercise_id
          and ws.user_id = ${userId}
          and (${excludeSessionId}::uuid is null or st.session_id <> ${excludeSessionId}::uuid)
        order by st.performed_at desc
        limit 1
      ) previous
    )
    select
      latest.exercise_id,
      latest.session_id,
      latest.performed_at,
      jsonb_agg(
        jsonb_build_object(
          'setIndex', st.set_index,
          'weight', st.weight::float8,
          'reps', st.reps,
          'rpe', st.rpe::float8,
          'isWarmup', st.is_warmup
        ) order by st.set_index
      ) as sets
    from latest
    join sets st
      on st.session_id = latest.session_id and st.exercise_id = latest.exercise_id
    group by latest.exercise_id, latest.session_id, latest.performed_at
  `);

  for (const row of rows) {
    result[row.exercise_id] = {
      sessionId: row.session_id,
      performedAt: new Date(row.performed_at),
      sets: row.sets ?? [],
    };
  }

  return result;
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
  kind: ActivityKind;
  startedAt: Date;
  endedAt: Date | null;
  routineName: string | null;
  dayName: string | null;
  setCount: number;
  workingSetCount: number;
  tonnage: number;
  exerciseNames: string[];
};

/**
 * The recent-activity list on the train screen.
 *
 * The limit is applied before the joins, not after. Joining every session to
 * every set and then keeping ten made the query grow with the user's whole
 * history to render a list that is always the same length; the CTE picks the
 * ten rows first and aggregates only those.
 */
export async function recentSessions(
  db: DbClient,
  userId: string,
  limit: number,
): Promise<SessionSummary[]> {
  const recent = db.$with("recent").as(
    db
      .select({
        id: workoutSessions.id,
        kind: workoutSessions.kind,
        startedAt: workoutSessions.startedAt,
        endedAt: workoutSessions.endedAt,
        routineDayId: workoutSessions.routineDayId,
      })
      .from(workoutSessions)
      .where(eq(workoutSessions.userId, userId))
      .orderBy(desc(workoutSessions.startedAt))
      .limit(limit),
  );

  const rows = await db
    .with(recent)
    .select({
      id: recent.id,
      kind: recent.kind,
      startedAt: recent.startedAt,
      endedAt: recent.endedAt,
      routineName: routines.name,
      dayName: routineDays.name,
      setCount: sql<number>`count(${sets.id})::int`,
      workingSetCount: sql<number>`(count(${sets.id}) filter (where ${sets.isWarmup} = false))::int`,
      tonnage: sql<number>`coalesce((sum(${sets.weight} * ${sets.reps}) filter (where ${sets.isWarmup} = false)), 0)::float8`,
      exerciseNames: sql<
        string[]
      >`coalesce(array_agg(distinct ${exercises.name}) filter (where ${exercises.name} is not null), '{}'::text[])`,
    })
    .from(recent)
    .leftJoin(routineDays, eq(routineDays.id, recent.routineDayId))
    .leftJoin(routines, eq(routines.id, routineDays.routineId))
    .leftJoin(sets, eq(sets.sessionId, recent.id))
    .leftJoin(exercises, eq(exercises.id, sets.exerciseId))
    .groupBy(
      recent.id,
      recent.kind,
      recent.startedAt,
      recent.endedAt,
      routineDays.name,
      routines.name,
    )
    .orderBy(desc(recent.startedAt));

  return rows;
}

/* -------------------------------------------------------------------------- */
/* Writing a set                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Why a set write did not happen, in the terms the user is told.
 *
 * The distinctions are kept because they mean different things to the person
 * holding the phone: a finished session means their tap did nothing and why, a
 * hidden exercise means the picker is out of date, and a conflict means this id
 * already stands for a different set.
 */
export type SetWriteResult =
  | { status: "written"; set: SetRow }
  /** The same request arrived twice. The row from the first one is returned. */
  | { status: "replayed"; set: SetRow }
  | { status: "id-conflict" }
  | { status: "session-missing" }
  | { status: "session-finished" }
  | { status: "session-is-rest" }
  | { status: "set-missing" }
  | { status: "exercise-hidden" };

type WrittenSetRow = {
  id: string;
  session_id: string;
  exercise_id: string;
  set_index: number;
  weight: number;
  reps: number;
  rpe: number | null;
  is_warmup: boolean;
  performed_at: string;
};

const toSetRow = (row: WrittenSetRow): SetRow => ({
  id: row.id,
  sessionId: row.session_id,
  exerciseId: row.exercise_id,
  setIndex: row.set_index,
  weight: row.weight,
  reps: row.reps,
  rpe: row.rpe,
  isWarmup: row.is_warmup,
  performedAt: new Date(row.performed_at),
});

const RETURNED_SET_COLUMNS = sql`
  id, session_id, exercise_id, set_index,
  weight::float8 as weight, reps, rpe::float8 as rpe,
  is_warmup, performed_at
`;

/** Two sets are the same request when every value the client sent matches. */
function sameSet(stored: SetRow, input: CreateSetInput | UpdateSetInput): boolean {
  return (
    stored.sessionId === input.sessionId &&
    stored.exerciseId === input.exerciseId &&
    stored.setIndex === input.setIndex &&
    stored.weight === input.weight &&
    stored.reps === input.reps &&
    stored.rpe === input.rpe &&
    stored.isWarmup === input.isWarmup
  );
}

/**
 * Works out which of the several ways a set write can fail actually happened.
 *
 * Only ever run when the write returned nothing, so the ordinary path stays at
 * one statement. This is the cost of collapsing four sequential checks into a
 * single insert: the checks still exist, they just only run when they matter.
 */
async function diagnoseSetWrite(
  db: DbClient,
  userId: string,
  input: CreateSetInput | UpdateSetInput,
): Promise<SetWriteResult> {
  const { rows } = await db.execute<{
    existing: WrittenSetRow | null;
    session: { kind: ActivityKind; ended_at: string | null } | null;
    visible: boolean | null;
  }>(sql`
    select
      (select jsonb_build_object(
         'id', st.id, 'session_id', st.session_id, 'exercise_id', st.exercise_id,
         'set_index', st.set_index, 'weight', st.weight::float8, 'reps', st.reps,
         'rpe', st.rpe::float8, 'is_warmup', st.is_warmup, 'performed_at', st.performed_at)
       from sets st where st.id = ${input.id}::uuid) as existing,
      (select jsonb_build_object('kind', ws.kind, 'ended_at', ws.ended_at)
       from workout_sessions ws
       where ws.id = ${input.sessionId}::uuid and ws.user_id = ${userId}) as session,
      (select true from exercises ex
       where ex.id = ${input.exerciseId}::uuid
         and (ex.owner_id is null or ex.owner_id = ${userId})) as visible
  `);

  const row = rows[0];

  if (row?.existing) {
    const stored = toSetRow(row.existing);
    // A retry of a request whose response was lost. Answering with the stored
    // row is the whole point of the client naming it.
    return sameSet(stored, input) ? { status: "replayed", set: stored } : { status: "id-conflict" };
  }

  if (!row?.session) return { status: "session-missing" };
  if (row.session.kind === "rest") return { status: "session-is-rest" };
  if (row.session.ended_at !== null) return { status: "session-finished" };
  if (!row.visible) return { status: "exercise-hidden" };

  return { status: "set-missing" };
}

/**
 * Inserts one set, checking everything it depends on in the same statement.
 *
 * Ownership of the session, the session still being open, the session being a
 * workout rather than a rest entry, and the exercise being visible to this user
 * were four reads before the insert. They are all joins and predicates on the
 * insert's own SELECT now, so the whole write is one round trip and there is no
 * window between the checks and the row landing.
 */
export async function createSet(
  db: DbClient,
  userId: string,
  input: CreateSetInput,
): Promise<SetWriteResult> {
  const { rows } = await db.execute<WrittenSetRow>(sql`
    insert into sets (id, session_id, exercise_id, set_index, weight, reps, rpe, is_warmup)
    select
      ${input.id}::uuid, ws.id, ex.id, ${input.setIndex}::smallint,
      ${input.weight}::numeric, ${input.reps}::integer, ${input.rpe}::numeric,
      ${input.isWarmup}::boolean
    from workout_sessions ws
    join exercises ex
      on ex.id = ${input.exerciseId}::uuid
     and (ex.owner_id is null or ex.owner_id = ${userId})
    where ws.id = ${input.sessionId}::uuid
      and ws.user_id = ${userId}
      and ws.kind = 'workout'
      and ws.ended_at is null
    on conflict (id) do nothing
    returning ${RETURNED_SET_COLUMNS}
  `);

  const row = rows[0];
  if (row) return { status: "written", set: toSetRow(row) };

  return diagnoseSetWrite(db, userId, input);
}

/** Updates one existing row and never turns a missing id into an insert. */
export async function updateSet(
  db: DbClient,
  userId: string,
  input: UpdateSetInput,
): Promise<SetWriteResult> {
  const { rows } = await db.execute<WrittenSetRow>(sql`
    update sets st
    set exercise_id = ex.id,
        set_index = ${input.setIndex}::smallint,
        weight = ${input.weight}::numeric,
        reps = ${input.reps}::integer,
        rpe = ${input.rpe}::numeric,
        is_warmup = ${input.isWarmup}::boolean
    from workout_sessions ws, exercises ex
    where st.id = ${input.id}::uuid
      and st.session_id = ${input.sessionId}::uuid
      and ws.id = st.session_id
      and ws.user_id = ${userId}
      and ws.kind = 'workout'
      and ws.ended_at is null
      and ex.id = ${input.exerciseId}::uuid
      and (ex.owner_id is null or ex.owner_id = ${userId})
    returning st.id, st.session_id, st.exercise_id, st.set_index,
              st.weight::float8 as weight, st.reps, st.rpe::float8 as rpe,
              st.is_warmup, st.performed_at
  `);

  const row = rows[0];
  if (row) return { status: "written", set: toSetRow(row) };

  const diagnosis = await diagnoseSetWrite(db, userId, input);
  // An edit whose values already match what is stored is not a conflict, it is
  // the same edit arriving twice.
  return diagnosis.status === "id-conflict" ? { status: "set-missing" } : diagnosis;
}

/* -------------------------------------------------------------------------- */
/* Starting a session                                                         */
/* -------------------------------------------------------------------------- */

export type StartSessionResult =
  | { status: "started"; session: typeof workoutSessions.$inferSelect }
  | { status: "replayed"; session: typeof workoutSessions.$inferSelect }
  | { status: "already-active"; sessionId: string };

/** Postgres reports a violated unique index by name, which is how this is caught. */
const OPEN_SESSION_INDEX = "workout_sessions_one_open_uq";
const UNIQUE_VIOLATION = "23505";

type PostgresError = { code?: string; constraint?: string };

/**
 * Finds the driver's error inside whatever wrapped it.
 *
 * Drizzle wraps a failed query in a `DrizzleQueryError` carrying the statement
 * and its parameters, and puts the original underneath as `cause`. Reading the
 * code off the outer error finds nothing, which is how a race would have
 * surfaced as a 500 rather than as "you already have a workout in progress".
 */
function postgresError(error: unknown): PostgresError | null {
  for (let current = error; current != null; current = (current as { cause?: unknown }).cause) {
    const candidate = current as PostgresError;
    if (typeof candidate.code === "string") return candidate;
  }
  return null;
}

function isOpenSessionViolation(error: unknown): boolean {
  const detail = postgresError(error);
  return detail?.code === UNIQUE_VIOLATION && detail.constraint === OPEN_SESSION_INDEX;
}

function isDuplicateId(error: unknown): boolean {
  const detail = postgresError(error);
  return detail?.code === UNIQUE_VIOLATION && detail.constraint !== OPEN_SESSION_INDEX;
}

/**
 * Opens a workout under an id the client chose.
 *
 * The one-open-workout rule is the database's now, so this inserts and reads
 * the failure rather than reading first and hoping nothing changed in between.
 * Two taps on Start produce one workout, and the second tap is told which one.
 */
export async function startSession(
  db: DbClient,
  userId: string,
  input: { id: string; routineDayId: string | null; notes: string | null },
): Promise<StartSessionResult> {
  const existing = await findSession(db, userId, input.id);
  if (existing) return { status: "replayed", session: existing };

  try {
    const [row] = await db
      .insert(workoutSessions)
      .values({
        id: input.id,
        userId,
        routineDayId: input.routineDayId,
        notes: input.notes,
      })
      .returning();

    return { status: "started", session: row };
  } catch (error) {
    if (isOpenSessionViolation(error)) {
      const [open] = await db
        .select({ id: workoutSessions.id })
        .from(workoutSessions)
        .where(and(eq(workoutSessions.userId, userId), isNull(workoutSessions.endedAt)))
        .limit(1);

      if (open) return { status: "already-active", sessionId: open.id };
    }

    if (isDuplicateId(error)) {
      // The id landed between the read above and this insert, which is what a
      // double tap looks like from here.
      const replayed = await findSession(db, userId, input.id);
      if (replayed) return { status: "replayed", session: replayed };
    }

    throw error;
  }
}
