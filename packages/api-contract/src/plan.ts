import { z } from "zod";

import {
  activityKind,
  dayName,
  routineExerciseTargets,
  routineName,
  uuid,
} from "@setwise/domain/validators";
import {
  idResultSchema,
  movedResultSchema,
  routineDayRowSchema,
  routineDetailSchema,
  routineExerciseRowSchema,
  routineSchema,
  routineSummarySchema,
  startableDaySchema,
} from "./dto";
import { protectedContract } from "./shared";

const planProcedure = protectedContract.errors({
  ROUTINE_NOT_FOUND: { message: "That routine isn't yours, or no longer exists." },
  DAY_NOT_FOUND: { message: "That day isn't yours, or no longer exists." },
  EXERCISE_NOT_FOUND: { message: "That exercise isn't in your catalogue." },
  DAY_IS_REST: { message: "Exercises can't be added to a rest day." },
});

export const planContract = {
  list: planProcedure.output(z.array(routineSummarySchema)),
  upcoming: planProcedure.output(z.array(startableDaySchema)),
  get: planProcedure.input(z.object({ id: uuid })).output(routineDetailSchema),
  createRoutine: planProcedure
    .input(z.object({ name: routineName, firstDayName: dayName.default("Day 1") }))
    .output(routineDetailSchema),
  renameRoutine: planProcedure
    .input(z.object({ id: uuid, name: routineName }))
    .output(routineSchema),
  archiveRoutine: planProcedure
    .input(z.object({ id: uuid, isArchived: z.boolean() }))
    .output(routineSchema),
  deleteRoutine: planProcedure.input(z.object({ id: uuid })).output(idResultSchema),
  addDay: planProcedure
    .input(z.object({ routineId: uuid, name: dayName, kind: activityKind.default("workout") }))
    .output(routineDayRowSchema),
  renameDay: planProcedure.input(z.object({ id: uuid, name: dayName })).output(routineDayRowSchema),
  deleteDay: planProcedure
    .input(z.object({ id: uuid }))
    .output(idResultSchema.extend({ routineId: uuid })),
  moveDay: planProcedure
    .input(z.object({ id: uuid, direction: z.enum(["up", "down"]) }))
    .output(movedResultSchema),
  addExercise: planProcedure
    .input(
      z.object({
        routineDayId: uuid,
        exerciseId: uuid,
        targets: routineExerciseTargets.optional(),
      }),
    )
    .output(routineExerciseRowSchema),
  updateTargets: planProcedure
    .input(z.object({ id: uuid, targets: routineExerciseTargets }))
    .output(routineExerciseRowSchema),
  removeExercise: planProcedure.input(z.object({ id: uuid })).output(idResultSchema),
  moveExercise: planProcedure
    .input(z.object({ id: uuid, direction: z.enum(["up", "down"]) }))
    .output(movedResultSchema),
};
