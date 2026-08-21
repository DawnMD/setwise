import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { sets, workoutSessions } from "@/db/schema";
import { sessionStartInput, setInput, timeZone, uuid } from "@/db/validators";
import { protectedProcedure } from "../orpc";
import { findDay } from "../queries/plan";
import {
  recordSessionVolumeRecords,
  recordSetPersonalRecords,
  type SessionVolumeRecord,
} from "../queries/prs";
import {
  exerciseIsVisible,
  findSession,
  getSessionDetail,
  lastPerformance,
  logRestDay,
  recentSessions,
  restLoggedToday,
  RestDayLogError,
  upsertSet,
} from "../queries/session";

/**
 * Typed errors, declared once and shared by every procedure in this router.
 *
 * A failed set save has to be something the client can pattern-match on, not a
 * 500 whose message it parses. `SESSION_FINISHED` tells the user why their tap
 * did nothing; `SESSION_ALREADY_ACTIVE` carries the id to send them to.
 */
const sessionProcedure = protectedProcedure.errors({
  SESSION_NOT_FOUND: {
    message: "That workout isn't yours, or no longer exists.",
  },
  SESSION_FINISHED: {
    message: "That workout is already finished.",
  },
  SESSION_ALREADY_ACTIVE: {
    message: "You already have a workout in progress.",
    data: z.object({ sessionId: uuid }),
  },
  EXERCISE_NOT_FOUND: {
    message: "That exercise isn't in your catalogue.",
  },
  DAY_NOT_FOUND: {
    message: "That routine day isn't yours, or no longer exists.",
  },
  DAY_IS_REST: {
    message: "A rest day can't start a workout.",
  },
  DAY_IS_WORKOUT: {
    message: "Only a planned rest day can be logged as rest.",
  },
  SESSION_IS_REST: {
    message: "Sets can't be added to a rest entry.",
  },
  REST_ALREADY_LOGGED: {
    message: "You already logged rest today.",
    data: z.object({ sessionId: uuid }),
  },
  SESSION_ID_CONFLICT: {
    message: "That activity id is already in use.",
  },
});

export const sessionRouter = {
  /**
   * The workout in progress, if there is one. The train screen asks this first,
   * so closing the tab mid-workout costs nothing but a reload.
   */
  active: sessionProcedure.handler(async ({ context }) => {
    const [row] = await context.db
      .select()
      .from(workoutSessions)
      .where(and(eq(workoutSessions.userId, context.userId), isNull(workoutSessions.endedAt)))
      .orderBy(desc(workoutSessions.startedAt))
      .limit(1);

    return row ?? null;
  }),

  /**
   * Starts a workout on an id the client generated, for the same reason sets
   * carry one: a retried start is the same workout, not a second empty one.
   */
  start: sessionProcedure.input(sessionStartInput).handler(async ({ input, context, errors }) => {
    const existing = await findSession(context.db, context.userId, input.id);
    if (existing) {
      if (existing.kind === "rest") throw errors.SESSION_IS_REST();
      return existing;
    }

    const [open] = await context.db
      .select({ id: workoutSessions.id })
      .from(workoutSessions)
      .where(and(eq(workoutSessions.userId, context.userId), isNull(workoutSessions.endedAt)))
      .limit(1);

    if (open) {
      throw errors.SESSION_ALREADY_ACTIVE({ data: { sessionId: open.id } });
    }

    // The foreign key only proves the day exists, not that it is the caller's.
    // Without this check a routine day id guessed from someone else's plan
    // would attach their template to this workout.
    if (input.routineDayId) {
      const day = await findDay(context.db, context.userId, input.routineDayId);
      if (!day) throw errors.DAY_NOT_FOUND();
      if (day.kind === "rest") throw errors.DAY_IS_REST();
    }

    const [row] = await context.db
      .insert(workoutSessions)
      .values({
        id: input.id,
        userId: context.userId,
        routineDayId: input.routineDayId,
        notes: input.notes,
      })
      .returning();

    return row;
  }),

  /** Records an instantaneous planned or ad-hoc rest activity. */
  logRestDay: sessionProcedure
    .input(z.object({ id: uuid, routineDayId: uuid.nullable(), timeZone }))
    .handler(async ({ input, context, errors }) => {
      try {
        return await logRestDay(context.db, context.userId, input);
      } catch (error) {
        if (!(error instanceof RestDayLogError)) throw error;
        if (error.code === "SESSION_ALREADY_ACTIVE" && error.sessionId) {
          throw errors.SESSION_ALREADY_ACTIVE({ data: { sessionId: error.sessionId } });
        }
        if (error.code === "DAY_NOT_FOUND") throw errors.DAY_NOT_FOUND();
        if (error.code === "DAY_IS_WORKOUT") throw errors.DAY_IS_WORKOUT();
        if (error.code === "REST_ALREADY_LOGGED" && error.sessionId) {
          throw errors.REST_ALREADY_LOGGED({ data: { sessionId: error.sessionId } });
        }
        throw errors.SESSION_ID_CONFLICT();
      }
    }),

  /** Used by every rest entry point so the UI presents one daily action. */
  restToday: sessionProcedure.input(z.object({ timeZone })).handler(async ({ input, context }) => {
    return restLoggedToday(context.db, context.userId, input.timeZone);
  }),

  get: sessionProcedure
    .input(z.object({ id: uuid }))
    .handler(async ({ input, context, errors }) => {
      const detail = await getSessionDetail(context.db, context.userId, input.id);
      if (!detail) throw errors.SESSION_NOT_FOUND();
      return detail;
    }),

  recent: sessionProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
    .handler(async ({ input, context }) => {
      return recentSessions(context.db, context.userId, input.limit);
    }),

  /**
   * Last time this exercise was trained. Drives the ghost value behind every
   * weight and rep input, which is the app's whole argument for existing.
   */
  lastPerformance: sessionProcedure
    .input(z.object({ exerciseId: uuid, excludeSessionId: uuid.nullable().default(null) }))
    .handler(async ({ input, context }) => {
      return lastPerformance(context.db, context.userId, input.exerciseId, input.excludeSessionId);
    }),

  /**
   * Saves one set and reports what it beat.
   *
   * The upsert and the PR detection share a transaction, so a record can never
   * be logged against a set that failed to store.
   */
  logSet: sessionProcedure.input(setInput).handler(async ({ input, context, errors }) => {
    const session = await findSession(context.db, context.userId, input.sessionId);
    if (!session) throw errors.SESSION_NOT_FOUND();
    if (session.kind === "rest") throw errors.SESSION_IS_REST();
    if (session.endedAt) throw errors.SESSION_FINISHED();

    if (!(await exerciseIsVisible(context.db, context.userId, input.exerciseId))) {
      throw errors.EXERCISE_NOT_FOUND();
    }

    return context.db.transaction(async (tx) => {
      const saved = await upsertSet(tx, input);
      const records = await recordSetPersonalRecords(tx, context.userId, saved);
      return { set: saved, records };
    });
  }),

  deleteSet: sessionProcedure
    .input(z.object({ id: uuid, sessionId: uuid }))
    .handler(async ({ input, context, errors }) => {
      const session = await findSession(context.db, context.userId, input.sessionId);
      if (!session) throw errors.SESSION_NOT_FOUND();
      if (session.endedAt) throw errors.SESSION_FINISHED();

      // `personal_records.set_id` is `set null` on delete, so removing a
      // mistyped set drops its provenance but keeps the record of the PR having
      // happened. Deleting the rows here instead would rewrite history.
      await context.db
        .delete(sets)
        .where(and(eq(sets.id, input.id), eq(sets.sessionId, input.sessionId)));

      return { id: input.id };
    }),

  /**
   * Closes the workout and checks per-exercise session volume.
   *
   * The update is conditional on `ended_at is null`, so a double tap on Finish
   * closes the session once and runs volume detection once. Session-volume
   * records have no set id to deduplicate on, and this is what stands in for it.
   */
  finish: sessionProcedure
    .input(
      z.object({
        id: uuid,
        notes: z.string().trim().max(2000).nullable(),
      }),
    )
    .handler(async ({ input, context, errors }) => {
      const session = await findSession(context.db, context.userId, input.id);
      if (!session) throw errors.SESSION_NOT_FOUND();

      return context.db.transaction(async (tx) => {
        const [finished] = await tx
          .update(workoutSessions)
          .set({ endedAt: new Date(), notes: input.notes ?? session.notes })
          .where(
            and(
              eq(workoutSessions.id, input.id),
              eq(workoutSessions.userId, context.userId),
              isNull(workoutSessions.endedAt),
            ),
          )
          .returning();

        if (!finished) {
          return { session, records: [] as SessionVolumeRecord[] };
        }

        const records = await recordSessionVolumeRecords(tx, context.userId, input.id);
        return { session: finished, records };
      });
    }),

  /**
   * Throws the workout away. Sets cascade with it.
   *
   * Only reachable from an explicit confirmation: this is the one destructive
   * action in the logger, and it is not the same button as Finish.
   */
  discard: sessionProcedure
    .input(z.object({ id: uuid }))
    .handler(async ({ input, context, errors }) => {
      const session = await findSession(context.db, context.userId, input.id);
      if (!session) throw errors.SESSION_NOT_FOUND();
      if (session.endedAt) throw errors.SESSION_FINISHED();

      await context.db.delete(workoutSessions).where(eq(workoutSessions.id, input.id));
      return { id: input.id };
    }),
};
