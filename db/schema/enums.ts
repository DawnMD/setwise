import { pgEnum } from "drizzle-orm/pg-core";

import { ACTIVITY_KINDS } from "@/lib/activity";
import { ACTIVITY_LEVELS, GOALS, SEXES } from "@/lib/nutrition";

export const activityKindEnum = pgEnum("activity_kind", ACTIVITY_KINDS);

/**
 * The three profile enums. Their values are defined beside the formulas that
 * consume them, so a new activity band cannot be added to the database without
 * someone having to give it a factor.
 */
export const sexEnum = pgEnum("sex", SEXES);

export const activityLevelEnum = pgEnum("activity_level", ACTIVITY_LEVELS);

export const goalEnum = pgEnum("goal", GOALS);

export const bodySideEnum = pgEnum("body_side", ["front", "back", "both"]);

export const muscleRoleEnum = pgEnum("muscle_role", ["primary", "secondary"]);

export const movementPatternEnum = pgEnum("movement_pattern", [
  "squat",
  "hinge",
  "lunge",
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "carry",
  "core",
  "isolation",
]);

export const prKindEnum = pgEnum("pr_kind", [
  "max_weight",
  "best_e1rm",
  "max_reps_at_weight",
  "session_volume",
]);

export const friendshipStatusEnum = pgEnum("friendship_status", ["pending", "accepted", "blocked"]);

export const visibilityFieldEnum = pgEnum("visibility_field", [
  "prs",
  "calendar",
  "volume",
  "bodyweight",
]);

export const visibilityLevelEnum = pgEnum("visibility_level", ["private", "friends"]);
