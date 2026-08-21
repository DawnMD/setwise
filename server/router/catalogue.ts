import { and, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { exerciseMuscles, exercises, muscles } from "@/db/schema";
import { customExerciseInput, PRIMARY_FACTOR, SECONDARY_FACTOR, uuid } from "@/db/validators";
import { MUSCLE_SLUGS, muscleBySlug } from "@/lib/muscles";
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
      const result = await context.db.execute<{
        slug: string;
        display_name: string;
        role: string;
        factor: number;
      }>(
        sql`
          select m.slug, m.display_name, em.role, em.factor::float8 as factor
          from exercise_muscles em
          join muscles m on m.id = em.muscle_id
          where em.exercise_id = ${input.exerciseId}
          order by em.factor desc, m.display_name
        `,
      );

      return result.rows;
    }),

  muscles: publicProcedure.handler(async ({ context }) => {
    return context.db.query.muscles.findMany();
  }),

  /**
   * A custom exercise, owned by the caller.
   *
   * The tagging is the whole reason this needs a form rather than a name field.
   * The heatmap inherits every factor written here directly, so a muscle the
   * user forgets to tick is training that silently disappears from it — which
   * is why at least one primary is required at the boundary.
   */
  createExercise: protectedProcedure
    .errors({
      NAME_TAKEN: {
        message: "You already have an exercise with that name.",
      },
      UNKNOWN_MUSCLE: {
        message: "This database is out of step with the app's eighteen muscle regions.",
        data: z.object({ missing: z.array(z.string()) }),
      },
      MUSCLES_NOT_SEEDED: {
        message: "The muscle list is missing from the database.",
        data: z.object({ found: z.number(), expected: z.number() }),
      },
    })
    .input(customExerciseInput)
    .handler(async ({ input, context, errors }) => {
      // A muscle can be primary or secondary, not both. Silently dropping the
      // secondary would credit it 1.0 without saying so.
      const secondary = input.secondaryMuscles.filter(
        (slug) => !input.primaryMuscles.includes(slug),
      );
      const wanted = [...input.primaryMuscles, ...secondary];

      const rows = await context.db
        .select({ id: muscles.id, slug: muscles.slug })
        .from(muscles)
        .where(inArray(muscles.slug, wanted));

      const idBySlug = new Map(rows.map((row) => [row.slug, row.id]));
      const missing = wanted.filter((slug) => !idBySlug.has(slug));

      // Every slug here already passed `z.enum(MUSCLE_SLUGS)`, so a miss is
      // never a bad tag from the picker — it is this database disagreeing with
      // `lib/muscles.ts`. Saying which region is missing, and whether the table
      // was seeded at all, is the difference between a one-command fix and an
      // afternoon: the old message blamed the user's tagging for a deployment
      // problem they could not see.
      if (missing.length > 0) {
        const [{ seeded }] = await context.db
          .select({ seeded: sql<number>`count(*)::int` })
          .from(muscles);

        if (seeded < MUSCLE_SLUGS.length) {
          throw errors.MUSCLES_NOT_SEEDED({
            message: `This database has ${seeded} of the ${MUSCLE_SLUGS.length} muscle regions. Run \`npm run db:seed\` against it.`,
            data: { found: seeded, expected: MUSCLE_SLUGS.length },
          });
        }

        const named = missing.map((slug) => muscleBySlug(slug)?.displayName ?? slug);
        throw errors.UNKNOWN_MUSCLE({
          message: `This database has no muscle called ${named.join(", ")}. It is out of step with the app's eighteen regions.`,
          data: { missing },
        });
      }

      const slug = slugify(input.name);

      return context.db.transaction(async (tx) => {
        const [exercise] = await tx
          .insert(exercises)
          .values({
            name: input.name,
            // Namespaced with the owner id: the global slug index is unique,
            // and a custom "Bench Press" must not collide with the catalogue's.
            slug: `${slug}-${context.userId.slice(0, 8)}`,
            equipment: input.equipment,
            movementPattern: input.movementPattern,
            ownerId: context.userId,
          })
          .onConflictDoNothing()
          .returning();

        if (!exercise) throw errors.NAME_TAKEN();

        await tx.insert(exerciseMuscles).values([
          ...input.primaryMuscles.map((muscleSlug) => ({
            exerciseId: exercise.id,
            muscleId: idBySlug.get(muscleSlug)!,
            role: "primary" as const,
            factor: PRIMARY_FACTOR,
          })),
          ...secondary.map((muscleSlug) => ({
            exerciseId: exercise.id,
            muscleId: idBySlug.get(muscleSlug)!,
            role: "secondary" as const,
            factor: SECONDARY_FACTOR,
          })),
        ]);

        return {
          id: exercise.id,
          name: exercise.name,
          slug: exercise.slug,
          equipment: exercise.equipment,
          movementPattern: exercise.movementPattern,
          isCustom: true,
        };
      });
    }),
};

/** Lowercase, hyphenated, no leading or trailing punctuation. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
