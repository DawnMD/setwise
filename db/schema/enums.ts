import { pgEnum } from "drizzle-orm/pg-core";

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

export const friendshipStatusEnum = pgEnum("friendship_status", [
  "pending",
  "accepted",
  "blocked",
]);

export const visibilityFieldEnum = pgEnum("visibility_field", [
  "prs",
  "calendar",
  "volume",
  "bodyweight",
]);

export const visibilityLevelEnum = pgEnum("visibility_level", ["private", "friends"]);
