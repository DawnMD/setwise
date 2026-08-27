import { z } from "zod";

import { statWindow, uuid } from "@setwise/domain/validators";
import {
  exerciseHistory,
  intensitySummary,
  muscleVolume,
  STAT_WINDOWS,
  trainedExercises,
  untrainedMuscles,
} from "@setwise/db/queries/stats";
import { protectedProcedure, publicProcedure } from "../orpc";
import "@tanstack/react-start/server-only";

/**
 * Volume and intensity, read across whatever window the user has selected. The
 * heatmap query touches four tables and belongs to none of them, which is why
 * routers here are grouped by feature rather than by table.
 *
 * Every procedure takes the same `window`, and the screen drives them all from
 * one toggle. Splitting them rather than returning a single `overview` keeps
 * the exercise trend from refetching the heatmap each time the picker changes.
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

  /** Average %e1RM and average RPE, returned separately and never blended. */
  intensity: protectedProcedure
    .input(z.object({ window: statWindow.default(7) }))
    .handler(async ({ input, context }) => {
      return intensitySummary(context.db, context.userId, input.window);
    }),

  /** The exercises trained in the window, for the trend picker. */
  exercises: protectedProcedure
    .input(z.object({ window: statWindow.default(7) }))
    .handler(async ({ input, context }) => {
      return trainedExercises(context.db, context.userId, input.window);
    }),

  /** One point per session for a single exercise, oldest first. */
  exerciseHistory: protectedProcedure
    .input(z.object({ exerciseId: uuid, window: statWindow.default(7) }))
    .handler(async ({ input, context }) => {
      return exerciseHistory(context.db, context.userId, input.exerciseId, input.window);
    }),

  windows: publicProcedure.handler(() => STAT_WINDOWS),
};
