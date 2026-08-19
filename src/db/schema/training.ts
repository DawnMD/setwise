import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { exercises } from "./exercises";

export const routines = pgTable(
  "routines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    notes: text("notes"),
    isArchived: boolean("is_archived").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("routines_user_idx").on(table.userId)],
);

export const routineDays = pgTable(
  "routine_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routineId: uuid("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    dayIndex: smallint("day_index").notNull(),
    name: text("name").notNull(),
  },
  (table) => [uniqueIndex("routine_days_order_uq").on(table.routineId, table.dayIndex)],
);

export const routineExercises = pgTable(
  "routine_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routineDayId: uuid("routine_day_id")
      .notNull()
      .references(() => routineDays.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    orderIndex: smallint("order_index").notNull(),
    targetSets: smallint("target_sets"),
    targetRepLow: smallint("target_rep_low"),
    targetRepHigh: smallint("target_rep_high"),
    targetRpe: numeric("target_rpe", { precision: 3, scale: 1, mode: "number" }),
  },
  (table) => [index("routine_exercises_day_idx").on(table.routineDayId, table.orderIndex)],
);

/**
 * A workout session. Named `workout_sessions` rather than the plan's `sessions`
 * because Better Auth already owns a `session` table; two tables a single
 * character apart is a bug waiting to be written.
 *
 * `routineDayId` is nullable: an ad-hoc session belongs to no plan, and is
 * `set null` on delete so deleting a routine never destroys training history.
 */
export const workoutSessions = pgTable(
  "workout_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    routineDayId: uuid("routine_day_id").references(() => routineDays.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    notes: text("notes"),
  },
  (table) => [index("workout_sessions_user_started_idx").on(table.userId, table.startedAt)],
);

/**
 * `id` is a client-generated UUIDv7, and it is the idempotency key for the
 * whole write path. The server upserts on it, so a retry after a timeout is a
 * no-op instead of a duplicate set quietly inflating someone's volume.
 *
 * `clientCreatedAt` records when the phone believed the set happened, which is
 * what orders rows correctly if a write lands late.
 */
export const sets = pgTable(
  "sets",
  {
    id: uuid("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    setIndex: smallint("set_index").notNull(),
    /** Always kilograms. `user.unitPref` is a display concern only. */
    weight: numeric("weight", { precision: 6, scale: 2, mode: "number" }).notNull(),
    reps: integer("reps").notNull(),
    rpe: numeric("rpe", { precision: 3, scale: 1, mode: "number" }),
    isWarmup: boolean("is_warmup").default(false).notNull(),
    performedAt: timestamp("performed_at", { withTimezone: true }).defaultNow().notNull(),
    clientCreatedAt: timestamp("client_created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // The plan's two load-bearing indexes. Every stats query starts at one of
    // them: per-exercise history walks (exercise_id, performed_at), and the
    // window filter on the heatmap narrows by performed_at.
    index("sets_exercise_performed_idx").on(table.exerciseId, table.performedAt),
    index("sets_session_idx").on(table.sessionId, table.setIndex),
  ],
);

export const routinesRelations = relations(routines, ({ one, many }) => ({
  user: one(user, { fields: [routines.userId], references: [user.id] }),
  days: many(routineDays),
}));

export const routineDaysRelations = relations(routineDays, ({ one, many }) => ({
  routine: one(routines, { fields: [routineDays.routineId], references: [routines.id] }),
  exercises: many(routineExercises),
}));

export const routineExercisesRelations = relations(routineExercises, ({ one }) => ({
  day: one(routineDays, {
    fields: [routineExercises.routineDayId],
    references: [routineDays.id],
  }),
  exercise: one(exercises, {
    fields: [routineExercises.exerciseId],
    references: [exercises.id],
  }),
}));

export const workoutSessionsRelations = relations(workoutSessions, ({ one, many }) => ({
  user: one(user, { fields: [workoutSessions.userId], references: [user.id] }),
  routineDay: one(routineDays, {
    fields: [workoutSessions.routineDayId],
    references: [routineDays.id],
  }),
  sets: many(sets),
}));

export const setsRelations = relations(sets, ({ one }) => ({
  session: one(workoutSessions, {
    fields: [sets.sessionId],
    references: [workoutSessions.id],
  }),
  exercise: one(exercises, { fields: [sets.exerciseId], references: [exercises.id] }),
}));

export type Routine = typeof routines.$inferSelect;
export type RoutineDay = typeof routineDays.$inferSelect;
export type RoutineExercise = typeof routineExercises.$inferSelect;
export type WorkoutSession = typeof workoutSessions.$inferSelect;
export type NewWorkoutSession = typeof workoutSessions.$inferInsert;
export type WorkoutSet = typeof sets.$inferSelect;
export type NewWorkoutSet = typeof sets.$inferInsert;
