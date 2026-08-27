import { relations, sql } from "drizzle-orm";
import { check, date, integer, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { activityLevelEnum, goalEnum, sexEnum } from "./enums";

/**
 * The answers a calorie target needs, and nothing else.
 *
 * Every column is nullable, and that is the whole design. Onboarding is five
 * questions a stranger is being asked before they have logged a single set, so
 * each one can be skipped and each one is saved on its own. A profile row is a
 * partial answer sheet, not a form that has to be completed before it counts.
 *
 * Separate from `user` rather than more columns on it because Better Auth owns
 * that table's shape: its additional fields are all text, and a birth date
 * stored as text is a birth date nobody can compare against.
 */
export const userProfiles = pgTable(
  "user_profiles",
  {
    /** One row per user, so the user id is the key. There is no second profile. */
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),

    /** Centimetres, to a tenth. Metric throughout, same as `sets.weight`. */
    heightCm: numeric("height_cm", { precision: 4, scale: 1, mode: "number" }),
    sex: sexEnum("sex"),
    /** A `date`, never a timestamp: a birthday does not happen at an instant. */
    birthDate: date("birth_date"),
    activityLevel: activityLevelEnum("activity_level"),
    goal: goalEnum("goal"),

    /**
     * Kilograms per week, unsigned. The direction lives in `goal`, so a row can
     * never say "lose" and "+0.5 a week" at the same time.
     */
    targetRateKg: numeric("target_rate_kg", { precision: 3, scale: 2, mode: "number" }),

    /**
     * Macro overrides. Null means the default from `lib/nutrition`, which is
     * the right way round: a user who never opens this screen inherits later
     * corrections to the default instead of a value frozen at signup.
     */
    proteinPerKg: numeric("protein_per_kg", { precision: 3, scale: 2, mode: "number" }),
    fatPerKg: numeric("fat_per_kg", { precision: 3, scale: 2, mode: "number" }),
    /** For people who arrived with a number. Set, it wins over the calculation. */
    calorieOverride: integer("calorie_override"),

    /**
     * Two timestamps rather than a `completed` flag, because "started the
     * wizard and skipped every step" and "never saw the wizard" are different
     * situations and only one of them deserves to be asked again.
     */
    onboardingStartedAt: timestamp("onboarding_started_at", { withTimezone: true }),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),

    /**
     * A `date`, because a fortnight's peace is counted in days off a calendar
     * and the user's own day is the only one they will judge it by.
     */
    promptDismissedUntil: date("prompt_dismissed_until"),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // Typo guards, matched to the Zod bounds in `db/validators`. They are wide
    // enough that no real person is refused and narrow enough that a slipped
    // decimal point cannot silently halve someone's calorie target.
    check("user_profiles_height_ck", sql`${table.heightCm} between 100 and 250`),
    check("user_profiles_rate_ck", sql`${table.targetRateKg} between 0 and 1.5`),
    check("user_profiles_protein_ck", sql`${table.proteinPerKg} between 0.5 and 4`),
    check("user_profiles_fat_ck", sql`${table.fatPerKg} between 0.2 and 3`),
    check("user_profiles_calories_ck", sql`${table.calorieOverride} between 800 and 8000`),
    // A floor rather than "not in the future", because a check constraint has
    // to be immutable and `current_date` is not. This catches the year typed as
    // 190 or 19000; the real bound — between 13 and 120 years old — is in Zod,
    // where it can be re-evaluated on the day it is asked.
    check("user_profiles_birth_date_ck", sql`${table.birthDate} >= date '1900-01-01'`),
  ],
);

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(user, { fields: [userProfiles.userId], references: [user.id] }),
}));

export type UserProfile = typeof userProfiles.$inferSelect;
