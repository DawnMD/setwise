import { z } from "zod";

import { statWindow } from "@/db/validators";
import { muscleVolume, STAT_WINDOWS, untrainedMuscles } from "../queries/stats";
import { protectedProcedure, publicProcedure } from "../orpc";

/**
 * Volume and intensity, read across whatever window the user has selected. The
 * heatmap query touches four tables and belongs to none of them, which is why
 * routers here are grouped by feature rather than by table.
 */
export const statsRouter = {
  /** Effective sets and tonnage per muscle, for the heatmap. */
  muscleVolume: protectedProcedure
    .input(z.object({ window: statWindow.default(7) }))
    .handler(async ({ input, context }) => {
      const volume = await muscleVolume(context.db, context.userId, input.window);
      return {
        window: input.window,
        muscles: volume,
        untrained: untrainedMuscles(volume).map((m) => m.slug),
      };
    }),

  windows: publicProcedure.handler(() => STAT_WINDOWS),
};
