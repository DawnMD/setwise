import { z } from "zod";

import { MUSCLE_SLUGS } from "@setwise/domain/muscles";
import { customExerciseInput, uuid } from "@setwise/domain/validators";
import { exerciseMuscleSchema, exerciseSummarySchema, muscleSchema } from "./dto";
import { protectedContract, publicContract } from "./shared";

export const catalogueContract = {
  search: protectedContract
    .input(
      z.object({
        query: z.string().trim().max(100).default(""),
        muscle: z.enum(MUSCLE_SLUGS).optional(),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    )
    .output(z.array(exerciseSummarySchema)),
  exerciseMuscles: protectedContract
    .input(z.object({ exerciseId: uuid }))
    .output(z.array(exerciseMuscleSchema)),
  muscles: publicContract.output(z.array(muscleSchema)),
  createExercise: protectedContract
    .errors({
      NAME_TAKEN: { message: "You already have an exercise with that name." },
      UNKNOWN_MUSCLE: {
        message: "This database is out of step with the app's eighteen muscle regions.",
        data: z.object({ missing: z.array(z.string()) }),
      },
    })
    .input(customExerciseInput)
    .output(exerciseSummarySchema),
};
