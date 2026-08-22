import { relations, sql } from "drizzle-orm";
import { date, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";

/** A daily promise. Calendar dates are always interpreted in the user's zone. */
export const habits = pgTable(
  "habits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startsOn: date("starts_on").notNull(),
    archivedOn: date("archived_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("habits_active_user_idx")
      .on(table.userId)
      .where(sql`${table.archivedOn} is null`),
    uniqueIndex("habits_active_name_uq")
      .on(table.userId, sql`lower(${table.name})`)
      .where(sql`${table.archivedOn} is null`),
  ],
);

/** One row means the habit was kept on that local calendar day. */
export const habitCompletions = pgTable(
  "habit_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    completedOn: date("completed_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("habit_completions_habit_day_uq").on(table.habitId, table.completedOn)],
);

export const habitsRelations = relations(habits, ({ one, many }) => ({
  user: one(user, { fields: [habits.userId], references: [user.id] }),
  completions: many(habitCompletions),
}));

export const habitCompletionsRelations = relations(habitCompletions, ({ one }) => ({
  habit: one(habits, { fields: [habitCompletions.habitId], references: [habits.id] }),
}));

export type Habit = typeof habits.$inferSelect;
export type HabitCompletion = typeof habitCompletions.$inferSelect;
