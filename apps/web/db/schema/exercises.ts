import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { movementPatternEnum, muscleRoleEnum } from "./enums";
import { muscles } from "./muscles";

/**
 * Global exercises have a null `ownerId`. A user's custom exercise sets it, and
 * `clonedFromId` points back at the global row it was forked from so a later
 * correction to the global tagging can be offered to people who forked it.
 */
export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    equipment: text("equipment"),
    movementPattern: movementPatternEnum("movement_pattern"),
    /** Source vocabulary, kept verbatim: "compound" or "isolation". */
    mechanic: text("mechanic"),
    /** Source vocabulary: strength, stretching, cardio, plyometrics, and so on. */
    category: text("category"),
    instructions: text("instructions").array(),
    /**
     * The free-exercise-db id this row was seeded from. Makes reseeding
     * idempotent and lets a tagging correction be traced back to its source.
     * Null for user-created exercises.
     */
    sourceId: text("source_id"),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "cascade" }),
    clonedFromId: uuid("cloned_from_id").references((): AnyPgColumn => exercises.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Two partial indexes rather than one on (ownerId, lower(name)): a plain
    // unique index treats every NULL ownerId as distinct, so it would let the
    // global catalogue hold "Bench Press" twice.
    uniqueIndex("exercises_global_name_uq")
      .on(sql`lower(${table.name})`)
      .where(sql`${table.ownerId} is null`),
    uniqueIndex("exercises_owner_name_uq")
      .on(table.ownerId, sql`lower(${table.name})`)
      .where(sql`${table.ownerId} is not null`),
    uniqueIndex("exercises_global_slug_uq")
      .on(table.slug)
      .where(sql`${table.ownerId} is null`),
    uniqueIndex("exercises_source_id_uq")
      .on(table.sourceId)
      .where(sql`${table.sourceId} is not null`),
    index("exercises_owner_idx").on(table.ownerId),
  ],
);

/**
 * The join that the entire heatmap rests on. `factor` is the share of a set
 * credited to this muscle: 1.0 for a primary mover, 0.5 for a secondary. It is
 * a column rather than a constant derived from `role` so that individual
 * exercises can be tuned by hand without a schema change.
 */
export const exerciseMuscles = pgTable(
  "exercise_muscles",
  {
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    muscleId: smallint("muscle_id")
      .notNull()
      .references(() => muscles.id, { onDelete: "restrict" }),
    role: muscleRoleEnum("role").notNull(),
    factor: numeric("factor", { precision: 3, scale: 2, mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.exerciseId, table.muscleId] }),
    index("exercise_muscles_muscle_idx").on(table.muscleId),
  ],
);

export const exercisesRelations = relations(exercises, ({ one, many }) => ({
  owner: one(user, { fields: [exercises.ownerId], references: [user.id] }),
  clonedFrom: one(exercises, {
    fields: [exercises.clonedFromId],
    references: [exercises.id],
    relationName: "clonedFrom",
  }),
  muscles: many(exerciseMuscles),
}));

export const exerciseMusclesRelations = relations(exerciseMuscles, ({ one }) => ({
  exercise: one(exercises, {
    fields: [exerciseMuscles.exerciseId],
    references: [exercises.id],
  }),
  muscle: one(muscles, {
    fields: [exerciseMuscles.muscleId],
    references: [muscles.id],
  }),
}));

export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
export type ExerciseMuscle = typeof exerciseMuscles.$inferSelect;
