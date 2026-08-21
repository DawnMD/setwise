import { relations } from "drizzle-orm";
import { pgTable, smallint, text, uniqueIndex } from "drizzle-orm/pg-core";

import { bodySideEnum } from "./enums";
import { exerciseMuscles } from "./exercises";

/**
 * Eighteen fixed rows, written from `lib/muscles.ts` by `syncMuscles` in
 * `db/sync-muscles.ts` — from the `0002_seed_muscles` migration, from `db:seed`,
 * and as a repair if a database somehow reaches the app without them. Reference
 * data, never user data: the only runtime write is that repair, and it writes
 * exactly the list the app already holds in code.
 *
 * `svgPathId` is the `id` attribute of the matching path in the body SVGs, kept
 * as data so a bought SVG with different ids can be adopted without a code
 * change.
 */
export const muscles = pgTable(
  "muscles",
  {
    id: smallint("id").primaryKey().generatedAlwaysAsIdentity(),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    svgPathId: text("svg_path_id").notNull(),
    bodySide: bodySideEnum("body_side").notNull(),
  },
  (table) => [
    uniqueIndex("muscles_slug_uq").on(table.slug),
    uniqueIndex("muscles_svg_path_id_uq").on(table.svgPathId),
  ],
);

export const musclesRelations = relations(muscles, ({ many }) => ({
  exerciseMuscles: many(exerciseMuscles),
}));

export type Muscle = typeof muscles.$inferSelect;
export type NewMuscle = typeof muscles.$inferInsert;
