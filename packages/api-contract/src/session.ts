import { z } from "zod";

import {
  createSetInput,
  sessionStartInput,
  timeZone,
  updateSetInput,
  uuid,
} from "@setwise/domain/validators";
import {
  detectedRecordSchema,
  idResultSchema,
  sessionDetailSchema,
  sessionSummarySchema,
  sessionVolumeRecordSchema,
  workoutSessionSchema,
  workoutSetSchema,
} from "./dto";
import { protectedContract } from "./shared";

const sessionProcedure = protectedContract.errors({
  SESSION_NOT_FOUND: { message: "That workout isn't yours, or no longer exists." },
  SESSION_FINISHED: { message: "That workout is already finished." },
  SET_NOT_FOUND: { message: "That set isn't part of this workout." },
  SESSION_ALREADY_ACTIVE: {
    message: "You already have a workout in progress.",
    data: z.object({ sessionId: uuid }),
  },
  EXERCISE_NOT_FOUND: { message: "That exercise isn't in your catalogue." },
  DAY_NOT_FOUND: { message: "That routine day isn't yours, or no longer exists." },
  DAY_IS_REST: { message: "A rest day can't start a workout." },
  DAY_IS_WORKOUT: { message: "Only a planned rest day can be logged as rest." },
  SESSION_IS_REST: { message: "Sets can't be added to a rest entry." },
  REST_ALREADY_LOGGED: {
    message: "You already logged rest today.",
    data: z.object({ sessionId: uuid }),
  },
  IDEMPOTENCY_CONFLICT: { message: "That set id already belongs to a different set." },
});

const setWriteOutput = z.object({
  set: workoutSetSchema,
  records: z.array(detectedRecordSchema),
});

export const sessionContract = {
  active: sessionProcedure.output(workoutSessionSchema.nullable()),
  start: sessionProcedure.input(sessionStartInput).output(workoutSessionSchema),
  logRestDay: sessionProcedure
    .input(z.object({ routineDayId: uuid.nullable(), timeZone }))
    .output(workoutSessionSchema),
  restToday: sessionProcedure.input(z.object({ timeZone })).output(workoutSessionSchema.nullable()),
  get: sessionProcedure.input(z.object({ id: uuid })).output(sessionDetailSchema),
  recent: sessionProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
    .output(z.array(sessionSummarySchema)),
  createSet: sessionProcedure.input(createSetInput).output(setWriteOutput),
  updateSet: sessionProcedure.input(updateSetInput).output(setWriteOutput),
  deleteSet: sessionProcedure.input(z.object({ id: uuid, sessionId: uuid })).output(idResultSchema),
  finish: sessionProcedure
    .input(z.object({ id: uuid, notes: z.string().trim().max(2000).nullable() }))
    .output(
      z.object({
        session: workoutSessionSchema,
        records: z.array(sessionVolumeRecordSchema),
      }),
    ),
  discard: sessionProcedure.input(z.object({ id: uuid })).output(idResultSchema),
};
