import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { exercises } from "@/db/schema";
import { MUSCLE_SLUGS } from "@/lib/muscles";
import { protectedProcedure, publicProcedure } from "../orpc";
import { muscleVolume, STAT_WINDOWS, untrainedMuscles } from "../stats";

const statWindow = z
  .union([z.literal(7), z.literal(30), z.literal(90)])
  .describe("Trailing window in days. The same three windows everywhere in the app.");

/**
 * Routers are grouped by feature, not by table. The volume query below touches
 * four tables and belongs to none of them.
 */

const stats = {
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

const catalogue = {
  /**
   * Exercise search over the global catalogue plus the caller's own custom
   * exercises. Never returns another user's custom exercises.
   */
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().trim().max(100).default(""),
        muscle: z.enum(MUSCLE_SLUGS).optional(),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    )
    .handler(async ({ input, context }) => {
      const visible = or(isNull(exercises.ownerId), eq(exercises.ownerId, context.userId));

      const matchesQuery =
        input.query.length > 0 ? ilike(exercises.name, `%${input.query}%`) : undefined;

      const matchesMuscle = input.muscle
        ? sql`exists (
            select 1
            from exercise_muscles em
            join muscles m on m.id = em.muscle_id
            where em.exercise_id = ${exercises.id}
              and m.slug = ${input.muscle}
              and em.role = 'primary'
          )`
        : undefined;

      return context.db
        .select({
          id: exercises.id,
          name: exercises.name,
          slug: exercises.slug,
          equipment: exercises.equipment,
          movementPattern: exercises.movementPattern,
          isCustom: sql<boolean>`${exercises.ownerId} is not null`,
        })
        .from(exercises)
        .where(and(visible, matchesQuery, matchesMuscle))
        .orderBy(exercises.name)
        .limit(input.limit);
    }),

  muscles: publicProcedure.handler(async ({ context }) => {
    return context.db.query.muscles.findMany();
  }),
};

export const router = { stats, catalogue };
export type AppRouter = typeof router;
