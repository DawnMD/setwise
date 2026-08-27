import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { DbClient } from "@/db";
import { routineDays, routineExercises, routines } from "@setwise/db/schema";
import {
  activityKind,
  dayName,
  routineExerciseTargets,
  routineName,
  uuid,
} from "@setwise/domain/validators";
import { protectedProcedure } from "../orpc";
import { exerciseIsVisible } from "@setwise/db/queries/session";
import {
  findDay,
  findRoutine,
  findRoutineExercise,
  getRoutineDetail,
  listRoutines,
  startableDays,
  swapDayOrder,
  type RoutineDetail,
} from "@setwise/db/queries/plan";
import "@tanstack/react-start/server-only";

const planProcedure = protectedProcedure.errors({
  ROUTINE_NOT_FOUND: {
    message: "That routine isn't yours, or no longer exists.",
  },
  DAY_NOT_FOUND: {
    message: "That day isn't yours, or no longer exists.",
  },
  EXERCISE_NOT_FOUND: {
    message: "That exercise isn't in your catalogue.",
  },
  DAY_IS_REST: {
    message: "Exercises can't be added to a rest day.",
  },
});

/** Appended, not inserted. New days and exercises go on the end. */
async function nextDayIndex(db: DbClient, routineId: string): Promise<number> {
  const [row] = await db
    .select({ next: sql<number>`coalesce(max(${routineDays.dayIndex}) + 1, 0)::int` })
    .from(routineDays)
    .where(eq(routineDays.routineId, routineId));
  return row?.next ?? 0;
}

async function nextOrderIndex(db: DbClient, routineDayId: string): Promise<number> {
  const [row] = await db
    .select({ next: sql<number>`coalesce(max(${routineExercises.orderIndex}) + 1, 0)::int` })
    .from(routineExercises)
    .where(eq(routineExercises.routineDayId, routineDayId));
  return row?.next ?? 0;
}

export const planRouter = {
  list: planProcedure.handler(async ({ context }) => {
    return listRoutines(context.db, context.userId);
  }),

  /**
   * What to run next, for the train screen. Least recently run first, so the
   * rotation looks after itself.
   */
  upcoming: planProcedure.handler(async ({ context }) => {
    return startableDays(context.db, context.userId);
  }),

  get: planProcedure.input(z.object({ id: uuid })).handler(async ({ input, context, errors }) => {
    const detail = await getRoutineDetail(context.db, context.userId, input.id);
    if (!detail) throw errors.ROUTINE_NOT_FOUND();
    return detail;
  }),

  /**
   * A new routine starts with one day rather than none.
   *
   * A routine with no days is a shell you have to understand before you can use
   * it. One day means the next tap is adding an exercise, which is the thing
   * someone came here to do.
   */
  createRoutine: planProcedure
    .input(z.object({ name: routineName, firstDayName: dayName.default("Day 1") }))
    .handler(async ({ input, context }): Promise<RoutineDetail> => {
      return context.db.transaction(async (tx) => {
        const [routine] = await tx
          .insert(routines)
          .values({ userId: context.userId, name: input.name })
          .returning();

        const [day] = await tx
          .insert(routineDays)
          .values({ routineId: routine.id, dayIndex: 0, name: input.firstDayName })
          .returning();

        // The whole routine, not just its row. Everything the editor needs is
        // known here, so the screen it navigates to opens on real data instead
        // of fetching back what this transaction just wrote.
        return {
          id: routine.id,
          name: routine.name,
          notes: routine.notes,
          isArchived: routine.isArchived,
          days: [
            { id: day.id, name: day.name, dayIndex: day.dayIndex, kind: day.kind, exercises: [] },
          ],
        };
      });
    }),

  renameRoutine: planProcedure
    .input(z.object({ id: uuid, name: routineName }))
    .handler(async ({ input, context, errors }) => {
      const routine = await findRoutine(context.db, context.userId, input.id);
      if (!routine) throw errors.ROUTINE_NOT_FOUND();

      const [row] = await context.db
        .update(routines)
        .set({ name: input.name })
        .where(eq(routines.id, input.id))
        .returning();
      return row;
    }),

  /**
   * Archiving, not deleting, is the default on the plan screen.
   *
   * `workout_sessions.routine_day_id` is `set null` on delete, so deleting a
   * routine costs no training history — but it does cost the answer to "what
   * was I running in March", and that is worth keeping by default.
   */
  archiveRoutine: planProcedure
    .input(z.object({ id: uuid, isArchived: z.boolean() }))
    .handler(async ({ input, context, errors }) => {
      const routine = await findRoutine(context.db, context.userId, input.id);
      if (!routine) throw errors.ROUTINE_NOT_FOUND();

      const [row] = await context.db
        .update(routines)
        .set({ isArchived: input.isArchived })
        .where(eq(routines.id, input.id))
        .returning();
      return row;
    }),

  deleteRoutine: planProcedure
    .input(z.object({ id: uuid }))
    .handler(async ({ input, context, errors }) => {
      const routine = await findRoutine(context.db, context.userId, input.id);
      if (!routine) throw errors.ROUTINE_NOT_FOUND();

      await context.db.delete(routines).where(eq(routines.id, input.id));
      return { id: input.id };
    }),

  addDay: planProcedure
    .input(z.object({ routineId: uuid, name: dayName, kind: activityKind.default("workout") }))
    .handler(async ({ input, context, errors }) => {
      const routine = await findRoutine(context.db, context.userId, input.routineId);
      if (!routine) throw errors.ROUTINE_NOT_FOUND();

      const dayIndex = await nextDayIndex(context.db, input.routineId);

      const [row] = await context.db
        .insert(routineDays)
        .values({ routineId: input.routineId, dayIndex, name: input.name, kind: input.kind })
        .returning();
      return row;
    }),

  renameDay: planProcedure
    .input(z.object({ id: uuid, name: dayName }))
    .handler(async ({ input, context, errors }) => {
      const day = await findDay(context.db, context.userId, input.id);
      if (!day) throw errors.DAY_NOT_FOUND();

      const [row] = await context.db
        .update(routineDays)
        .set({ name: input.name })
        .where(eq(routineDays.id, input.id))
        .returning();
      return row;
    }),

  deleteDay: planProcedure
    .input(z.object({ id: uuid }))
    .handler(async ({ input, context, errors }) => {
      const day = await findDay(context.db, context.userId, input.id);
      if (!day) throw errors.DAY_NOT_FOUND();

      await context.db.delete(routineDays).where(eq(routineDays.id, input.id));
      return { id: input.id, routineId: day.routineId };
    }),

  /**
   * Moves a day one place in either direction.
   *
   * A swap with its neighbour rather than a drag target, because reordering
   * four days is two taps and a drag handle on a phone fights the page scroll.
   */
  moveDay: planProcedure
    .input(z.object({ id: uuid, direction: z.enum(["up", "down"]) }))
    .handler(async ({ input, context, errors }) => {
      const day = await findDay(context.db, context.userId, input.id);
      if (!day) throw errors.DAY_NOT_FOUND();

      const siblings = await context.db
        .select({ id: routineDays.id, dayIndex: routineDays.dayIndex })
        .from(routineDays)
        .where(eq(routineDays.routineId, day.routineId))
        .orderBy(asc(routineDays.dayIndex));

      const position = siblings.findIndex((entry) => entry.id === day.id);
      const target = siblings[position + (input.direction === "up" ? -1 : 1)];
      if (!target) return { id: day.id, moved: false };

      await context.db.transaction(async (tx) => {
        await swapDayOrder(tx, day.id, target.id, day.dayIndex, target.dayIndex);
      });

      return { id: day.id, moved: true };
    }),

  addExercise: planProcedure
    .input(
      z.object({
        routineDayId: uuid,
        exerciseId: uuid,
        targets: routineExerciseTargets.optional(),
      }),
    )
    .handler(async ({ input, context, errors }) => {
      const day = await findDay(context.db, context.userId, input.routineDayId);
      if (!day) throw errors.DAY_NOT_FOUND();
      if (day.kind === "rest") throw errors.DAY_IS_REST();

      if (!(await exerciseIsVisible(context.db, context.userId, input.exerciseId))) {
        throw errors.EXERCISE_NOT_FOUND();
      }

      const orderIndex = await nextOrderIndex(context.db, input.routineDayId);

      // Three sets of eight to twelve is the default because it is the answer
      // for most accessory work, and a filled-in target is faster to correct
      // than an empty one is to fill.
      const targets = input.targets ?? {
        targetSets: 3,
        targetRepLow: 8,
        targetRepHigh: 12,
        targetRpe: null,
      };

      const [row] = await context.db
        .insert(routineExercises)
        .values({
          routineDayId: input.routineDayId,
          exerciseId: input.exerciseId,
          orderIndex,
          ...targets,
        })
        .returning();
      return row;
    }),

  updateTargets: planProcedure
    .input(z.object({ id: uuid, targets: routineExerciseTargets }))
    .handler(async ({ input, context, errors }) => {
      const planned = await findRoutineExercise(context.db, context.userId, input.id);
      if (!planned) throw errors.EXERCISE_NOT_FOUND();

      const [row] = await context.db
        .update(routineExercises)
        .set(input.targets)
        .where(eq(routineExercises.id, input.id))
        .returning();
      return row;
    }),

  removeExercise: planProcedure
    .input(z.object({ id: uuid }))
    .handler(async ({ input, context, errors }) => {
      const planned = await findRoutineExercise(context.db, context.userId, input.id);
      if (!planned) throw errors.EXERCISE_NOT_FOUND();

      await context.db.delete(routineExercises).where(eq(routineExercises.id, input.id));
      return { id: input.id };
    }),

  /**
   * `routine_exercises.order_index` carries no unique index, so unlike days
   * this swap is two plain updates.
   */
  moveExercise: planProcedure
    .input(z.object({ id: uuid, direction: z.enum(["up", "down"]) }))
    .handler(async ({ input, context, errors }) => {
      const planned = await findRoutineExercise(context.db, context.userId, input.id);
      if (!planned) throw errors.EXERCISE_NOT_FOUND();

      const siblings = await context.db
        .select({ id: routineExercises.id, orderIndex: routineExercises.orderIndex })
        .from(routineExercises)
        .where(eq(routineExercises.routineDayId, planned.routineDayId))
        .orderBy(asc(routineExercises.orderIndex));

      const position = siblings.findIndex((entry) => entry.id === planned.id);
      const target = siblings[position + (input.direction === "up" ? -1 : 1)];
      if (!target) return { id: planned.id, moved: false };

      await context.db.transaction(async (tx) => {
        await tx
          .update(routineExercises)
          .set({ orderIndex: target.orderIndex })
          .where(eq(routineExercises.id, planned.id));
        await tx
          .update(routineExercises)
          .set({ orderIndex: planned.orderIndex })
          .where(
            and(
              eq(routineExercises.id, target.id),
              eq(routineExercises.routineDayId, planned.routineDayId),
            ),
          );
      });

      return { id: planned.id, moved: true };
    }),
};
