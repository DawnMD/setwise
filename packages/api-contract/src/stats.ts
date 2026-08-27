import { z } from "zod";

import { statWindow, uuid } from "@setwise/domain/validators";
import {
  exerciseHistoryPointSchema,
  intensitySummarySchema,
  muscleSlugSchema,
  muscleVolumeSchema,
  trainedExerciseSchema,
} from "./dto";
import { protectedContract, publicContract } from "./shared";

const windowInput = z.object({ window: statWindow.default(7) });

export const statsContract = {
  muscleVolume: protectedContract.input(windowInput).output(
    z.object({
      window: statWindow,
      muscles: z.array(muscleVolumeSchema),
      untrained: z.array(muscleSlugSchema),
    }),
  ),
  intensity: protectedContract.input(windowInput).output(intensitySummarySchema),
  exercises: protectedContract.input(windowInput).output(z.array(trainedExerciseSchema)),
  exerciseHistory: protectedContract
    .input(z.object({ exerciseId: uuid, window: statWindow.default(7) }))
    .output(z.array(exerciseHistoryPointSchema)),
  windows: publicContract.output(z.tuple([z.literal(7), z.literal(30), z.literal(90)])),
};
