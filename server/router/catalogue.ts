import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { exercises } from "@/db/schema";
import { uuid } from "@/db/validators";
import { MUSCLE_SLUGS } from "@/lib/muscles";
import { protectedProcedure, publicProcedure } from "../orpc";

export const catalogueRouter = {
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

  /**
   * The muscles one exercise trains, with the factor each is credited. Shown in
   * the picker so a bad tag is visible at the moment it would corrupt the
   * heatmap, rather than three phases later.
   */
  exerciseMuscles: protectedProcedure
    .input(z.object({ exerciseId: uuid }))
    .handler(async ({ input, context }) => {
      return context.db.execute<{ slug: string; display_name: string; role: string; factor: number }>(
        sql`
          select m.slug, m.display_name, em.role, em.factor::float8 as factor
          from exercise_muscles em
          join muscles m on m.id = em.muscle_id
          where em.exercise_id = ${input.exerciseId}
          order by em.factor desc, m.display_name
        `,
      );
    }),

  muscles: publicProcedure.handler(async ({ context }) => {
    return context.db.query.muscles.findMany();
  }),
};
