import { sql } from "drizzle-orm";

import { MUSCLES, type MuscleSlug } from "../lib/muscles";
import type { DbClient } from "./index";
import { muscles } from "./schema";

/**
 * Writes the eighteen canonical regions and returns their ids by slug.
 *
 * The same statement runs from three places -- the `0002_seed_muscles`
 * migration, `db:seed`, and the custom-exercise handler repairing a database
 * that has neither -- so all three agree by construction: it upserts on `slug`,
 * the only identity these rows have that outlives a reseed. `muscles.id` is an
 * identity column and nothing outside this table's own foreign keys refers to
 * it, so which number a region lands on does not matter; the slug is the
 * contract with `lib/muscles.ts`, the SVGs and the picker.
 *
 * Idempotent, and safe to race: two callers inserting at once leave eighteen
 * rows holding the values in `lib/muscles.ts`.
 */
export async function syncMuscles(db: DbClient): Promise<Map<MuscleSlug, number>> {
  await db
    .insert(muscles)
    .values(
      MUSCLES.map((muscle) => ({
        slug: muscle.slug,
        displayName: muscle.displayName,
        svgPathId: muscle.svgPathId,
        bodySide: muscle.bodySide,
      })),
    )
    .onConflictDoUpdate({
      target: muscles.slug,
      set: {
        displayName: sql`excluded.display_name`,
        svgPathId: sql`excluded.svg_path_id`,
        bodySide: sql`excluded.body_side`,
      },
    });

  const rows = await db.select({ id: muscles.id, slug: muscles.slug }).from(muscles);

  return new Map(rows.map((row) => [row.slug as MuscleSlug, row.id]));
}
