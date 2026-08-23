import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { sets, workoutSessions, type WorkoutSession } from "@/db/schema";
import { createSetInput, sessionStartInput, timeZone, updateSetInput, uuid } from "@/db/validators";
import { protectedProcedure } from "../orpc";
import { findDay } from "../queries/plan";
import {
  recordSessionVolumeRecords,
  recordSetPersonalRecords,
  type SessionVolumeRecord,
} from "../queries/prs";
import {
  createSet,
  findSession,
  getSessionDetail,
  logRestDay,
  recentSessions,
  restLoggedToday,
  RestDayLogError,
  startSession,
  updateSet,
  type SetWriteResult,
} from "../queries/session";
import "@tanstack/react-start/server-only";

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
  SET_NOT_FOUND: {
    message: "That set isn't part of this workout.",
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
  /**
   * The id has been used before, for something else.
   *
   * Separate from every other failure because it is the one the client must not
   * retry: sending the same request again would produce the same answer. It
   * means two different sets were given one id, which is a bug rather than a
   * lost response.
   */
  IDEMPOTENCY_CONFLICT: {
    message: "That set id already belongs to a different set.",
  },
});

export const sessionRouter = {
  /**
   * The workout in progress, if there is one. The train screen asks this first,
   * so closing the tab mid-workout costs nothing but a reload.
   */
  active: sessionProcedure.handler(
    // Annotated, because `const [row] = rows` is typed as present and this one
    // genuinely returns null most of the time. The client writes that null into
    // its cache when a workout finishes, so the type has to admit it.
    async ({ context }): Promise<WorkoutSession | null> => {
      const rows = await context.db
        .select()
        .from(workoutSessions)
        .where(and(eq(workoutSessions.userId, context.userId), isNull(workoutSessions.endedAt)))
        .limit(1);

      return rows[0] ?? null;
    },
  ),

  /**
   * Starts a workout under the id the client generated.
   *
   * Retrying is safe: the same id returns the same workout rather than opening
   * a second one, and two devices racing get the one the database accepted plus
   * a typed pointer to it.
   */
  start: sessionProcedure.input(sessionStartInput).handler(async ({ input, context, errors }) => {
    // The foreign key only proves the day exists, not that it is the caller's.
    // Without this check a routine day id guessed from someone else's plan
    // would attach their template to this workout.
    if (input.routineDayId) {
      const day = await findDay(context.db, context.userId, input.routineDayId);
      if (!day) throw errors.DAY_NOT_FOUND();
      if (day.kind === "rest") throw errors.DAY_IS_REST();
    }

    const result = await startSession(context.db, context.userId, input);

    if (result.status === "already-active") {
      throw errors.SESSION_ALREADY_ACTIVE({ data: { sessionId: result.sessionId } });
    }

    return result.session;
  }),

  /** Records an instantaneous planned or ad-hoc rest activity. */
  logRestDay: sessionProcedure
    .input(z.object({ routineDayId: uuid.nullable(), timeZone }))
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
        throw error;
      }
    }),

  /** Used by every rest entry point so the UI presents one daily action. */
  restToday: sessionProcedure.input(z.object({ timeZone })).handler(async ({ input, context }) => {
    return restLoggedToday(context.db, context.userId, input.timeZone);
  }),

  /**
   * The workout, its plan, its sets, and the previous performance of everything
   * in its lineup. One call, two queries, and nothing left for the screen to
   * ask for once it mounts.
   */
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

  /** Inserts one set and reports what it beat after the transaction commits. */
  createSet: sessionProcedure.input(createSetInput).handler(async ({ input, context, errors }) => {
    return context.db.transaction(async (tx) => {
      const result = await createSet(tx, context.userId, input);
      if (result.status !== "written" && result.status !== "replayed") {
        throw setWriteError(result, errors);
      }

      // A replay's records were detected and stored the first time. Running
      // detection again would compare the set against itself and find nothing,
      // so the honest answer is that this request set no records — the one that
      // actually wrote the row already said what it beat.
      const records =
        result.status === "written"
          ? await recordSetPersonalRecords(tx, context.userId, result.set, "created")
          : [];

      return { set: result.set, records };
    });
  }),

  /** Updates one owned set and recalculates any affected per-set records. */
  updateSet: sessionProcedure.input(updateSetInput).handler(async ({ input, context, errors }) => {
    return context.db.transaction(async (tx) => {
      const result = await updateSet(tx, context.userId, input);
      if (result.status !== "written" && result.status !== "replayed") {
        throw setWriteError(result, errors);
      }

      const records = await recordSetPersonalRecords(tx, context.userId, result.set, "edited");
      return { set: result.set, records };
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

type SetWriteErrors = {
  SESSION_NOT_FOUND: () => Error;
  SESSION_FINISHED: () => Error;
  SESSION_IS_REST: () => Error;
  EXERCISE_NOT_FOUND: () => Error;
  SET_NOT_FOUND: () => Error;
  IDEMPOTENCY_CONFLICT: () => Error;
};

/**
 * Turns a failed write into the error the user is shown.
 *
 * The distinctions survive the collapse of four checks into one statement:
 * they are worked out on the failure path instead of the happy one, which is
 * where the cost belongs.
 */
function setWriteError(result: SetWriteResult, errors: SetWriteErrors): Error {
  switch (result.status) {
    case "session-missing":
      return errors.SESSION_NOT_FOUND();
    case "session-finished":
      return errors.SESSION_FINISHED();
    case "session-is-rest":
      return errors.SESSION_IS_REST();
    case "exercise-hidden":
      return errors.EXERCISE_NOT_FOUND();
    case "id-conflict":
      return errors.IDEMPOTENCY_CONFLICT();
    default:
      return errors.SET_NOT_FOUND();
  }
}
