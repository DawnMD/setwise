import { relations } from "drizzle-orm";
import {
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { prKindEnum } from "./enums";
import { exercises } from "./exercises";
import { sets } from "./training";

/**
 * One row per calendar day. `loggedOn` is a `date`, not a timestamp: weighing
 * yourself is a daily event, and storing an instant would let a 23:50 and a
 * 00:10 weigh-in land on different days depending on the reader's timezone.
 */
export const bodyweightLogs = pgTable(
  "bodyweight_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Always kilograms, same as `sets.weight`. */
    weight: numeric("weight", { precision: 6, scale: 2, mode: "number" }).notNull(),
    loggedOn: date("logged_on").notNull(),
    note: text("note"),
  },
  (table) => [uniqueIndex("bodyweight_logs_user_day_uq").on(table.userId, table.loggedOn)],
);

/**
 * Append-only history, not a current-best cache. Keeping every PR row is what
 * makes "your third bench PR this year" possible later, and recomputing the
 * current best is a cheap ordered read on the index below.
 *
 * `setId` is `set null` on delete so deleting a mistyped set does not erase the
 * record of the PR having happened; the value stays, its provenance goes.
 */
export const personalRecords = pgTable(
  "personal_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    kind: prKindEnum("kind").notNull(),
    value: numeric("value", { precision: 8, scale: 2, mode: "number" }).notNull(),
    setId: uuid("set_id").references(() => sets.id, { onDelete: "set null" }),
    achievedAt: timestamp("achieved_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("personal_records_lookup_idx").on(
      table.userId,
      table.exerciseId,
      table.kind,
      table.achievedAt,
    ),
  ],
);

export const bodyweightLogsRelations = relations(bodyweightLogs, ({ one }) => ({
  user: one(user, { fields: [bodyweightLogs.userId], references: [user.id] }),
}));

export const personalRecordsRelations = relations(personalRecords, ({ one }) => ({
  user: one(user, { fields: [personalRecords.userId], references: [user.id] }),
  exercise: one(exercises, {
    fields: [personalRecords.exerciseId],
    references: [exercises.id],
  }),
  set: one(sets, { fields: [personalRecords.setId], references: [sets.id] }),
}));

export type BodyweightLog = typeof bodyweightLogs.$inferSelect;
export type PersonalRecord = typeof personalRecords.$inferSelect;
