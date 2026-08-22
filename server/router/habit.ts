import { z } from "zod";

import { habitName, timeZone, uuid, yearMonth } from "@/db/validators";
import { protectedProcedure } from "../orpc";
import {
  archiveHabit,
  createHabit,
  deleteHabit,
  habitCalendar,
  habitHome,
  habitList,
  renameHabit,
  setHabitToday,
  type HabitWriteResult,
} from "../queries/habits";
import "@tanstack/react-start/server-only";

const habitProcedure = protectedProcedure.errors({
  HABIT_NAME_TAKEN: {
    message: "You already have an active habit with that name.",
  },
  HABIT_NOT_FOUND: {
    message: "That habit isn't yours, or no longer exists.",
  },
  HABIT_ARCHIVED: {
    message: "Archived habits can't be changed.",
  },
  HABIT_ACTIVE_DELETE: {
    message: "Archive this habit before deleting it permanently.",
  },
});

function throwWriteError(
  result: Extract<HabitWriteResult, { ok: false }>,
  errors: Record<string, (...args: never[]) => Error>,
): never {
  switch (result.code) {
    case "NAME_TAKEN":
      throw errors.HABIT_NAME_TAKEN();
    case "NOT_FOUND":
      throw errors.HABIT_NOT_FOUND();
    case "ARCHIVED":
      throw errors.HABIT_ARCHIVED();
    case "ACTIVE_DELETE":
      throw errors.HABIT_ACTIVE_DELETE();
  }
}

export const habitRouter = {
  home: habitProcedure
    .input(z.object({ timeZone }))
    .handler(({ input, context }) => habitHome(context.db, context.userId, input.timeZone)),

  calendar: habitProcedure
    .input(z.object({ month: yearMonth, timeZone }))
    .handler(({ input, context }) =>
      habitCalendar(context.db, context.userId, input.month, input.timeZone),
    ),

  list: habitProcedure
    .input(z.object({ timeZone }))
    .handler(({ input, context }) => habitList(context.db, context.userId, input.timeZone)),

  create: habitProcedure
    .input(z.object({ name: habitName, timeZone }))
    .handler(async ({ input, context, errors }) => {
      const result = await createHabit(context.db, context.userId, input.name, input.timeZone);
      if (!result.ok) throwWriteError(result, errors);
      return result.item!;
    }),

  rename: habitProcedure
    .input(z.object({ id: uuid, name: habitName }))
    .handler(async ({ input, context, errors }) => {
      const result = await renameHabit(context.db, context.userId, input.id, input.name);
      if (!result.ok) throwWriteError(result, errors);
      return { id: input.id, name: input.name };
    }),

  setToday: habitProcedure
    .input(z.object({ id: uuid, completed: z.boolean(), timeZone }))
    .handler(async ({ input, context, errors }) => {
      const result = await setHabitToday(
        context.db,
        context.userId,
        input.id,
        input.completed,
        input.timeZone,
      );
      if ("ok" in result) {
        if (!result.ok) throwWriteError(result, errors);
        throw new Error("Habit completion did not return a summary.");
      }
      return result;
    }),

  archive: habitProcedure
    .input(z.object({ id: uuid, timeZone }))
    .handler(async ({ input, context, errors }) => {
      const result = await archiveHabit(context.db, context.userId, input.id, input.timeZone);
      if (!result.ok) throwWriteError(result, errors);
      return result.item!;
    }),

  delete: habitProcedure
    .input(z.object({ id: uuid }))
    .handler(async ({ input, context, errors }) => {
      const result = await deleteHabit(context.db, context.userId, input.id);
      if (!result.ok) throwWriteError(result, errors);
      return { id: input.id };
    }),
};
