import type { MuscleSlug } from "@setwise/domain/muscles";

export type MovementPattern =
  | "squat"
  | "hinge"
  | "lunge"
  | "horizontal_push"
  | "vertical_push"
  | "horizontal_pull"
  | "vertical_pull"
  | "carry"
  | "core"
  | "isolation";

export type Tagging = {
  /** Every listed muscle earns a full effective set. */
  primary: MuscleSlug[];
  /** Every listed muscle earns half a set. */
  secondary: MuscleSlug[];
  pattern: MovementPattern;
};

/** One row of the correction table, keyed by free-exercise-db id. */
const t = (
  id: string,
  primary: MuscleSlug[],
  secondary: MuscleSlug[],
  pattern: MovementPattern,
): [string, Tagging] => [id, { primary, secondary, pattern }];

/**
 * Hand-corrected tagging for the exercises people actually perform.
 *
 * This table exists because the heatmap is the app's differentiator and it
 * inherits every tagging error directly. Three classes of correction live here:
 *
 * - Delt heads. The source has a single `shoulders` tag, so it cannot tell a
 *   lateral raise from an overhead press from a rear delt flye. Every exercise
 *   where the head matters is set explicitly.
 * - Outright source errors. Several are load-bearing: the source calls the
 *   powerlifting bench a triceps exercise, the deadlift a lower-back exercise,
 *   and cable hip adduction a quad exercise.
 * - Compounds whose real movers are listed as secondary, most often glutes in
 *   squats and hamstrings in hinges.
 *
 * Anything absent falls through to the automatic mapping in `source-map.ts`,
 * which is rough by design and fine for the long tail.
 */
export const EXERCISE_OVERRIDES: Record<string, Tagging> = Object.fromEntries([
  // ------------------------------------------------------------ horizontal push
  t("Barbell_Bench_Press_-_Medium_Grip", ["chest"], ["front_delts", "triceps"], "horizontal_push"),
  t("Wide-Grip_Barbell_Bench_Press", ["chest"], ["front_delts", "triceps"], "horizontal_push"),
  t("Barbell_Guillotine_Bench_Press", ["chest"], ["front_delts", "triceps"], "horizontal_push"),
  // Source tags this as primarily triceps. It is a bench press.
  t("Bench_Press_-_Powerlifting", ["chest"], ["front_delts", "triceps", "lats"], "horizontal_push"),
  t("Bench_Press_with_Chains", ["chest"], ["front_delts", "triceps"], "horizontal_push"),
  t("Bench_Press_-_With_Bands", ["chest"], ["front_delts", "triceps"], "horizontal_push"),
  t(
    "Barbell_Incline_Bench_Press_-_Medium_Grip",
    ["chest"],
    ["front_delts", "triceps"],
    "horizontal_push",
  ),
  t("Incline_Dumbbell_Press", ["chest"], ["front_delts", "triceps"], "horizontal_push"),
  t("Hammer_Grip_Incline_DB_Bench_Press", ["chest"], ["front_delts", "triceps"], "horizontal_push"),
  t("Decline_Barbell_Bench_Press", ["chest"], ["front_delts", "triceps"], "horizontal_push"),
  t(
    "Wide-Grip_Decline_Barbell_Bench_Press",
    ["chest"],
    ["front_delts", "triceps"],
    "horizontal_push",
  ),
  t("Dumbbell_Bench_Press", ["chest"], ["front_delts", "triceps"], "horizontal_push"),
  t(
    "Dumbbell_Bench_Press_with_Neutral_Grip",
    ["chest"],
    ["front_delts", "triceps"],
    "horizontal_push",
  ),
  t("Decline_Dumbbell_Bench_Press", ["chest"], ["front_delts", "triceps"], "horizontal_push"),
  t("One_Arm_Dumbbell_Bench_Press", ["chest"], ["front_delts", "triceps"], "horizontal_push"),
  t("Machine_Bench_Press", ["chest"], ["front_delts", "triceps"], "horizontal_push"),
  t("Leverage_Chest_Press", ["chest"], ["front_delts", "triceps"], "horizontal_push"),
  t("Leverage_Incline_Chest_Press", ["chest"], ["front_delts", "triceps"], "horizontal_push"),
  t("Leverage_Decline_Chest_Press", ["chest"], ["front_delts", "triceps"], "horizontal_push"),
  t("Cable_Chest_Press", ["chest"], ["front_delts", "triceps"], "horizontal_push"),
  t("Incline_Cable_Chest_Press", ["chest"], ["front_delts", "triceps"], "horizontal_push"),
  t("Standing_Cable_Chest_Press", ["chest"], ["front_delts", "triceps"], "horizontal_push"),
  t("Close-Grip_Barbell_Bench_Press", ["chest", "triceps"], ["front_delts"], "horizontal_push"),
  t("Pushups", ["chest"], ["front_delts", "triceps", "abs"], "horizontal_push"),
  t(
    "Pushups_Close_and_Wide_Hand_Positions",
    ["chest"],
    ["front_delts", "triceps"],
    "horizontal_push",
  ),
  t("Push-Ups_With_Feet_Elevated", ["chest"], ["front_delts", "triceps", "abs"], "horizontal_push"),
  t("Push-Ups_-_Close_Triceps_Position", ["triceps"], ["chest", "front_delts"], "horizontal_push"),
  t("Incline_Push-Up", ["chest"], ["front_delts", "triceps"], "horizontal_push"),
  t("Decline_Push-Up", ["chest"], ["front_delts", "triceps"], "horizontal_push"),
  t("Dips_-_Chest_Version", ["chest"], ["front_delts", "triceps"], "horizontal_push"),

  // ------------------------------------------------------------ chest isolation
  t("Dumbbell_Flyes", ["chest"], ["front_delts"], "isolation"),
  t("Incline_Dumbbell_Flyes", ["chest"], ["front_delts"], "isolation"),
  t("Decline_Dumbbell_Flyes", ["chest"], ["front_delts"], "isolation"),
  t("One-Arm_Flat_Bench_Dumbbell_Flye", ["chest"], ["front_delts"], "isolation"),
  t("Cable_Crossover", ["chest"], ["front_delts"], "isolation"),
  t("Low_Cable_Crossover", ["chest"], ["front_delts"], "isolation"),
  t("Single-Arm_Cable_Crossover", ["chest"], ["front_delts"], "isolation"),
  t("Flat_Bench_Cable_Flyes", ["chest"], ["front_delts"], "isolation"),
  t("Incline_Cable_Flye", ["chest"], ["front_delts"], "isolation"),
  t("Butterfly", ["chest"], ["front_delts"], "isolation"),

  // ------------------------------------------------------------ vertical push
  t("Barbell_Shoulder_Press", ["front_delts"], ["side_delts", "triceps"], "vertical_push"),
  t("Standing_Military_Press", ["front_delts"], ["side_delts", "triceps", "abs"], "vertical_push"),
  t("Seated_Barbell_Military_Press", ["front_delts"], ["side_delts", "triceps"], "vertical_push"),
  t("Machine_Shoulder_Military_Press", ["front_delts"], ["side_delts", "triceps"], "vertical_push"),
  t("Dumbbell_Shoulder_Press", ["front_delts"], ["side_delts", "triceps"], "vertical_push"),
  t("Dumbbell_One-Arm_Shoulder_Press", ["front_delts"], ["side_delts", "triceps"], "vertical_push"),
  t("Cable_Shoulder_Press", ["front_delts"], ["side_delts", "triceps"], "vertical_push"),
  t(
    "Alternating_Cable_Shoulder_Press",
    ["front_delts"],
    ["side_delts", "triceps"],
    "vertical_push",
  ),
  t("Leverage_Shoulder_Press", ["front_delts"], ["side_delts", "triceps"], "vertical_push"),
  t(
    "Two-Arm_Kettlebell_Military_Press",
    ["front_delts"],
    ["side_delts", "triceps"],
    "vertical_push",
  ),
  t("Arnold_Dumbbell_Press", ["front_delts", "side_delts"], ["triceps"], "vertical_push"),
  t("Kettlebell_Arnold_Press", ["front_delts", "side_delts"], ["triceps"], "vertical_push"),
  t(
    "Standing_Barbell_Press_Behind_Neck",
    ["front_delts", "side_delts"],
    ["triceps"],
    "vertical_push",
  ),
  t("Handstand_Push-Ups", ["front_delts"], ["side_delts", "triceps", "abs"], "vertical_push"),
  t("Dips_-_Triceps_Version", ["triceps"], ["chest", "front_delts"], "vertical_push"),
  t("Parallel_Bar_Dip", ["triceps"], ["chest", "front_delts"], "vertical_push"),
  t("Ring_Dips", ["triceps"], ["chest", "front_delts"], "vertical_push"),
  t("Bench_Dips", ["triceps"], ["chest", "front_delts"], "vertical_push"),
  t("Dip_Machine", ["triceps"], ["chest", "front_delts"], "vertical_push"),

  // ------------------------------------------------------------ delt isolation
  t("Side_Lateral_Raise", ["side_delts"], [], "isolation"),
  t("Seated_Side_Lateral_Raise", ["side_delts"], [], "isolation"),
  t("Cable_Seated_Lateral_Raise", ["side_delts"], [], "isolation"),
  t("Lateral_Raise_-_With_Bands", ["side_delts"], [], "isolation"),
  t("One-Arm_Incline_Lateral_Raise", ["side_delts"], [], "isolation"),
  t("Lying_One-Arm_Lateral_Raise", ["side_delts"], [], "isolation"),
  t("Side_Laterals_to_Front_Raise", ["side_delts", "front_delts"], [], "isolation"),
  t("Front_Dumbbell_Raise", ["front_delts"], [], "isolation"),
  t("Front_Plate_Raise", ["front_delts"], [], "isolation"),
  t("Reverse_Flyes", ["rear_delts"], ["upper_back"], "isolation"),
  t("Reverse_Flyes_With_External_Rotation", ["rear_delts"], ["upper_back"], "isolation"),
  t("Cable_Rear_Delt_Fly", ["rear_delts"], ["upper_back"], "isolation"),
  t("Seated_Bent-Over_Rear_Delt_Raise", ["rear_delts"], ["upper_back"], "isolation"),
  t("Lying_Rear_Delt_Raise", ["rear_delts"], ["upper_back"], "isolation"),
  t("Dumbbell_Lying_Rear_Lateral_Raise", ["rear_delts"], ["upper_back"], "isolation"),
  t("Dumbbell_Lying_One-Arm_Rear_Lateral_Raise", ["rear_delts"], ["upper_back"], "isolation"),
  t(
    "Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench",
    ["rear_delts"],
    ["upper_back"],
    "isolation",
  ),
  t("Sled_Reverse_Flye", ["rear_delts"], ["upper_back"], "isolation"),
  t("Back_Flyes_-_With_Bands", ["rear_delts"], ["upper_back"], "isolation"),
  t("Face_Pull", ["rear_delts"], ["upper_back", "traps"], "horizontal_pull"),
  t("Barbell_Rear_Delt_Row", ["rear_delts", "upper_back"], ["biceps"], "horizontal_pull"),
  t("Cable_Rope_Rear-Delt_Rows", ["rear_delts", "upper_back"], ["biceps"], "horizontal_pull"),
  t("Low_Pulley_Row_To_Neck", ["rear_delts", "upper_back"], ["biceps", "traps"], "horizontal_pull"),

  // ------------------------------------------------------------ vertical pull
  t("Pullups", ["lats"], ["biceps", "upper_back", "forearms"], "vertical_pull"),
  t("Weighted_Pull_Ups", ["lats"], ["biceps", "upper_back", "forearms"], "vertical_pull"),
  t("Chin-Up", ["lats", "biceps"], ["upper_back", "forearms"], "vertical_pull"),
  t("Band_Assisted_Pull-Up", ["lats"], ["biceps", "upper_back", "forearms"], "vertical_pull"),
  t("Wide-Grip_Rear_Pull-Up", ["lats"], ["biceps", "upper_back", "rear_delts"], "vertical_pull"),
  t("Wide-Grip_Lat_Pulldown", ["lats"], ["biceps", "upper_back"], "vertical_pull"),
  t(
    "Wide-Grip_Pulldown_Behind_The_Neck",
    ["lats"],
    ["biceps", "upper_back", "rear_delts"],
    "vertical_pull",
  ),
  t("Close-Grip_Front_Lat_Pulldown", ["lats"], ["biceps", "upper_back"], "vertical_pull"),
  t("Full_Range-Of-Motion_Lat_Pulldown", ["lats"], ["biceps", "upper_back"], "vertical_pull"),
  t("One_Arm_Lat_Pulldown", ["lats"], ["biceps", "upper_back"], "vertical_pull"),
  t("Rocky_Pull-Ups_Pulldowns", ["lats"], ["biceps", "upper_back"], "vertical_pull"),
  t("Straight-Arm_Pulldown", ["lats"], [], "isolation"),
  t("Rope_Straight-Arm_Pulldown", ["lats"], [], "isolation"),
  t("Cable_Incline_Pushdown", ["lats"], [], "isolation"),

  // ------------------------------------------------------------ horizontal pull
  t(
    "Bent_Over_Barbell_Row",
    ["upper_back", "lats"],
    ["biceps", "rear_delts", "lower_back"],
    "horizontal_pull",
  ),
  t(
    "Reverse_Grip_Bent-Over_Rows",
    ["lats", "upper_back"],
    ["biceps", "lower_back"],
    "horizontal_pull",
  ),
  t(
    "Bent_Over_Two-Dumbbell_Row",
    ["upper_back", "lats"],
    ["biceps", "rear_delts"],
    "horizontal_pull",
  ),
  t(
    "Bent_Over_Two-Dumbbell_Row_With_Palms_In",
    ["lats", "upper_back"],
    ["biceps", "rear_delts"],
    "horizontal_pull",
  ),
  t("One-Arm_Dumbbell_Row", ["lats", "upper_back"], ["biceps", "rear_delts"], "horizontal_pull"),
  t("Seated_Cable_Rows", ["upper_back", "lats"], ["biceps", "rear_delts"], "horizontal_pull"),
  t("T-Bar_Row_with_Handle", ["upper_back", "lats"], ["biceps", "rear_delts"], "horizontal_pull"),
  t("Lying_T-Bar_Row", ["upper_back", "lats"], ["biceps", "rear_delts"], "horizontal_pull"),
  t("Leverage_High_Row", ["lats", "upper_back"], ["biceps"], "horizontal_pull"),
  t("Leverage_Iso_Row", ["lats", "upper_back"], ["biceps"], "horizontal_pull"),
  t("Inverted_Row", ["upper_back"], ["lats", "biceps", "rear_delts"], "horizontal_pull"),
  t("One-Arm_Kettlebell_Row", ["lats", "upper_back"], ["biceps"], "horizontal_pull"),

  // ------------------------------------------------------------ traps
  t("Barbell_Shrug", ["traps"], ["forearms"], "isolation"),
  t("Dumbbell_Shrug", ["traps"], ["forearms"], "isolation"),
  t("Cable_Shrugs", ["traps"], ["forearms"], "isolation"),
  t("Leverage_Shrug", ["traps"], ["forearms"], "isolation"),
  t("Calf-Machine_Shoulder_Shrug", ["traps"], [], "isolation"),
  t("Barbell_Shrug_Behind_The_Back", ["traps"], ["forearms", "upper_back"], "isolation"),
  t("Smith_Machine_Behind_the_Back_Shrug", ["traps"], [], "isolation"),
  t("Upright_Cable_Row", ["side_delts", "traps"], ["biceps"], "vertical_pull"),
  t("Smith_Machine_Upright_Row", ["side_delts", "traps"], ["biceps"], "vertical_pull"),
  t("Standing_Dumbbell_Upright_Row", ["side_delts", "traps"], ["biceps"], "vertical_pull"),
  t("Dumbbell_One-Arm_Upright_Row", ["side_delts", "traps"], ["biceps"], "vertical_pull"),
  t("Upright_Row_-_With_Bands", ["side_delts", "traps"], ["biceps"], "vertical_pull"),

  // ------------------------------------------------------------ biceps, forearms
  t("Barbell_Curl", ["biceps"], ["forearms"], "isolation"),
  t("EZ-Bar_Curl", ["biceps"], ["forearms"], "isolation"),
  t("Close-Grip_EZ_Bar_Curl", ["biceps"], ["forearms"], "isolation"),
  t("Wide-Grip_Standing_Barbell_Curl", ["biceps"], ["forearms"], "isolation"),
  t("Close-Grip_Standing_Barbell_Curl", ["biceps"], ["forearms"], "isolation"),
  t("Dumbbell_Bicep_Curl", ["biceps"], ["forearms"], "isolation"),
  t("Dumbbell_Alternate_Bicep_Curl", ["biceps"], ["forearms"], "isolation"),
  t("Incline_Dumbbell_Curl", ["biceps"], [], "isolation"),
  t("Concentration_Curls", ["biceps"], [], "isolation"),
  t("Preacher_Curl", ["biceps"], [], "isolation"),
  t("Cable_Preacher_Curl", ["biceps"], [], "isolation"),
  t("Machine_Preacher_Curls", ["biceps"], [], "isolation"),
  t("One_Arm_Dumbbell_Preacher_Curl", ["biceps"], [], "isolation"),
  t("Machine_Bicep_Curl", ["biceps"], [], "isolation"),
  t("Drag_Curl", ["biceps"], [], "isolation"),
  t("High_Cable_Curls", ["biceps"], [], "isolation"),
  t("Lying_Cable_Curl", ["biceps"], [], "isolation"),
  // Hammer-style curls load the brachioradialis hard enough to count as a mover.
  t("Hammer_Curls", ["biceps", "forearms"], [], "isolation"),
  t("Alternate_Hammer_Curl", ["biceps", "forearms"], [], "isolation"),
  t("Cross_Body_Hammer_Curl", ["biceps", "forearms"], [], "isolation"),
  t("Incline_Hammer_Curls", ["biceps", "forearms"], [], "isolation"),
  t("Cable_Hammer_Curls_-_Rope_Attachment", ["biceps", "forearms"], [], "isolation"),
  t("Preacher_Hammer_Dumbbell_Curl", ["biceps", "forearms"], [], "isolation"),
  t("Standing_Dumbbell_Reverse_Curl", ["forearms"], ["biceps"], "isolation"),
  t("Reverse_Barbell_Preacher_Curls", ["forearms"], ["biceps"], "isolation"),

  // ------------------------------------------------------------ triceps
  t("Triceps_Pushdown", ["triceps"], [], "isolation"),
  t("Triceps_Pushdown_-_Rope_Attachment", ["triceps"], [], "isolation"),
  t("Triceps_Pushdown_-_V-Bar_Attachment", ["triceps"], [], "isolation"),
  t("Reverse_Grip_Triceps_Pushdown", ["triceps"], [], "isolation"),
  t("EZ-Bar_Skullcrusher", ["triceps"], [], "isolation"),
  t("Band_Skull_Crusher", ["triceps"], [], "isolation"),
  t("Lying_Close-Grip_Barbell_Triceps_Extension_Behind_The_Head", ["triceps"], [], "isolation"),
  t("Decline_EZ_Bar_Triceps_Extension", ["triceps"], [], "isolation"),
  t("Cable_Lying_Triceps_Extension", ["triceps"], [], "isolation"),
  t("Cable_Rope_Overhead_Triceps_Extension", ["triceps"], [], "isolation"),
  t("Dumbbell_One-Arm_Triceps_Extension", ["triceps"], [], "isolation"),
  t("Decline_Dumbbell_Triceps_Extension", ["triceps"], [], "isolation"),
  t("Machine_Triceps_Extension", ["triceps"], [], "isolation"),
  t("Low_Cable_Triceps_Extension", ["triceps"], [], "isolation"),
  t("Kneeling_Cable_Triceps_Extension", ["triceps"], [], "isolation"),
  t("Lying_Dumbbell_Tricep_Extension", ["triceps"], [], "isolation"),

  // ------------------------------------------------------------ squat
  t(
    "Barbell_Squat",
    ["quads", "glutes"],
    ["hamstrings", "adductors", "lower_back", "abs"],
    "squat",
  ),
  t(
    "Barbell_Full_Squat",
    ["quads", "glutes"],
    ["hamstrings", "adductors", "lower_back", "abs"],
    "squat",
  ),
  t("Olympic_Squat", ["quads", "glutes"], ["hamstrings", "adductors", "lower_back"], "squat"),
  t("Narrow_Stance_Squats", ["quads"], ["glutes", "hamstrings", "lower_back"], "squat"),
  t("Box_Squat", ["quads", "glutes"], ["hamstrings", "adductors", "lower_back"], "squat"),
  t(
    "Box_Squat_with_Bands",
    ["quads", "glutes"],
    ["hamstrings", "adductors", "lower_back"],
    "squat",
  ),
  t(
    "Box_Squat_with_Chains",
    ["quads", "glutes"],
    ["hamstrings", "adductors", "lower_back"],
    "squat",
  ),
  t("Front_Barbell_Squat", ["quads", "glutes"], ["abs", "upper_back", "adductors"], "squat"),
  t("Front_Squat_Clean_Grip", ["quads", "glutes"], ["abs", "upper_back", "adductors"], "squat"),
  t("Frankenstein_Squat", ["quads", "glutes"], ["abs", "upper_back"], "squat"),
  t("Goblet_Squat", ["quads", "glutes"], ["adductors", "abs"], "squat"),
  t("Dumbbell_Squat", ["quads", "glutes"], ["hamstrings", "adductors"], "squat"),
  t("Bodyweight_Squat", ["quads", "glutes"], ["adductors"], "squat"),
  t("Hack_Squat", ["quads"], ["glutes", "adductors"], "squat"),
  t("Barbell_Hack_Squat", ["quads"], ["glutes", "hamstrings", "forearms"], "squat"),
  t("Narrow_Stance_Hack_Squats", ["quads"], ["glutes", "adductors"], "squat"),
  t("Leg_Press", ["quads"], ["glutes", "adductors"], "squat"),
  t("Narrow_Stance_Leg_Press", ["quads"], ["glutes", "adductors"], "squat"),
  t("Kettlebell_Pistol_Squat", ["quads", "glutes"], ["hamstrings", "adductors"], "squat"),

  // ------------------------------------------------------------ lunge
  t("Split_Squat_with_Dumbbells", ["quads", "glutes"], ["hamstrings", "adductors"], "lunge"),
  // Source calls this a hamstring exercise. It is a single-leg squat.
  t("Split_Squats", ["quads", "glutes"], ["hamstrings", "adductors"], "lunge"),
  t("Smith_Single-Leg_Split_Squat", ["quads", "glutes"], ["hamstrings", "adductors"], "lunge"),
  t("Barbell_Side_Split_Squat", ["quads", "adductors"], ["glutes", "hamstrings"], "lunge"),
  t("Barbell_Lunge", ["quads", "glutes"], ["hamstrings", "adductors"], "lunge"),
  t("Dumbbell_Lunges", ["quads", "glutes"], ["hamstrings", "adductors"], "lunge"),
  t("Barbell_Walking_Lunge", ["quads", "glutes"], ["hamstrings", "adductors"], "lunge"),
  t("Bodyweight_Walking_Lunge", ["quads", "glutes"], ["hamstrings", "adductors"], "lunge"),
  t("Dumbbell_Rear_Lunge", ["quads", "glutes"], ["hamstrings", "adductors"], "lunge"),
  t("Elevated_Back_Lunge", ["quads", "glutes"], ["hamstrings"], "lunge"),
  // Source calls this a lower-back exercise. It is a lunge.
  t("Crossover_Reverse_Lunge", ["quads", "glutes"], ["hamstrings", "adductors"], "lunge"),

  // ------------------------------------------------------------ hinge
  // The deadlift is tagged lower back first. The erectors work isometrically;
  // the hips do the moving.
  t(
    "Barbell_Deadlift",
    ["hamstrings", "glutes"],
    ["lower_back", "quads", "traps", "upper_back", "forearms", "lats"],
    "hinge",
  ),
  t(
    "Deadlift_with_Bands",
    ["hamstrings", "glutes"],
    ["lower_back", "quads", "traps", "upper_back", "forearms"],
    "hinge",
  ),
  t(
    "Deadlift_with_Chains",
    ["hamstrings", "glutes"],
    ["lower_back", "quads", "traps", "upper_back", "forearms"],
    "hinge",
  ),
  t(
    "Deficit_Deadlift",
    ["hamstrings", "glutes"],
    ["lower_back", "quads", "traps", "upper_back", "forearms"],
    "hinge",
  ),
  t(
    "Axle_Deadlift",
    ["hamstrings", "glutes"],
    ["lower_back", "quads", "traps", "forearms"],
    "hinge",
  ),
  t(
    "Trap_Bar_Deadlift",
    ["quads", "glutes"],
    ["hamstrings", "lower_back", "traps", "forearms"],
    "hinge",
  ),
  t(
    "Rack_Pulls",
    ["hamstrings", "glutes", "traps"],
    ["lower_back", "upper_back", "forearms"],
    "hinge",
  ),
  t(
    "Rack_Pull_with_Bands",
    ["hamstrings", "glutes", "traps"],
    ["lower_back", "upper_back", "forearms"],
    "hinge",
  ),
  t("Romanian_Deadlift", ["hamstrings", "glutes"], ["lower_back", "forearms"], "hinge"),
  t(
    "Romanian_Deadlift_from_Deficit",
    ["hamstrings", "glutes"],
    ["lower_back", "forearms", "traps"],
    "hinge",
  ),
  t("Stiff-Legged_Barbell_Deadlift", ["hamstrings", "glutes"], ["lower_back", "forearms"], "hinge"),
  t(
    "Stiff-Legged_Dumbbell_Deadlift",
    ["hamstrings", "glutes"],
    ["lower_back", "forearms"],
    "hinge",
  ),
  t("Smith_Machine_Stiff-Legged_Deadlift", ["hamstrings", "glutes"], ["lower_back"], "hinge"),
  // Source calls both of these quad exercises.
  t("Cable_Deadlifts", ["hamstrings", "glutes"], ["lower_back", "quads", "forearms"], "hinge"),
  t("Leverage_Deadlift", ["hamstrings", "glutes"], ["quads", "lower_back"], "hinge"),
  t("Good_Morning", ["hamstrings"], ["glutes", "lower_back", "abs"], "hinge"),
  t("Good_Morning_off_Pins", ["hamstrings"], ["glutes", "lower_back", "abs"], "hinge"),
  t("Stiff_Leg_Barbell_Good_Morning", ["hamstrings"], ["glutes", "lower_back"], "hinge"),
  t("Band_Good_Morning", ["hamstrings"], ["glutes", "lower_back"], "hinge"),
  t("Barbell_Hip_Thrust", ["glutes"], ["hamstrings"], "hinge"),
  t("Barbell_Glute_Bridge", ["glutes"], ["hamstrings"], "hinge"),
  t("Single_Leg_Glute_Bridge", ["glutes"], ["hamstrings"], "hinge"),
  t("Hip_Extension_with_Bands", ["glutes"], ["hamstrings"], "hinge"),
  t("Hyperextensions_Back_Extensions", ["lower_back"], ["glutes", "hamstrings"], "hinge"),
  t(
    "Hyperextensions_With_No_Hyperextension_Bench",
    ["lower_back"],
    ["glutes", "hamstrings"],
    "hinge",
  ),
  t("Superman", ["lower_back"], ["glutes", "hamstrings"], "core"),
  // Source calls this an abdominal exercise. It is a back extension.
  t("Lower_Back_Curl", ["lower_back"], ["glutes"], "core"),
  t("Glute_Ham_Raise", ["hamstrings"], ["glutes", "calves", "lower_back"], "hinge"),
  t("Natural_Glute_Ham_Raise", ["hamstrings"], ["glutes", "calves", "lower_back"], "hinge"),
  t("Floor_Glute-Ham_Raise", ["hamstrings"], ["glutes", "calves"], "hinge"),

  // ------------------------------------------------------------ leg isolation
  t("Leg_Extensions", ["quads"], [], "isolation"),
  t("Lying_Leg_Curls", ["hamstrings"], [], "isolation"),
  t("Seated_Leg_Curl", ["hamstrings"], [], "isolation"),
  t("Standing_Leg_Curl", ["hamstrings"], [], "isolation"),
  t("Ball_Leg_Curl", ["hamstrings"], ["glutes"], "isolation"),
  t("Standing_Calf_Raises", ["calves"], [], "isolation"),
  t("Seated_Calf_Raise", ["calves"], [], "isolation"),
  t("Barbell_Seated_Calf_Raise", ["calves"], [], "isolation"),
  t("Calf_Press_On_The_Leg_Press_Machine", ["calves"], [], "isolation"),
  t("Donkey_Calf_Raises", ["calves"], [], "isolation"),
  t("Rocking_Standing_Calf_Raise", ["calves"], [], "isolation"),
  t("Calf_Raise_On_A_Dumbbell", ["calves"], [], "isolation"),
  t("Dumbbell_Seated_One-Leg_Calf_Raise", ["calves"], [], "isolation"),
  t("Calf_Raises_-_With_Bands", ["calves"], [], "isolation"),
  t("Glute_Kickback", ["glutes"], ["hamstrings"], "isolation"),
  t("One-Legged_Cable_Kickback", ["glutes"], ["hamstrings"], "isolation"),
  t("Thigh_Adductor", ["adductors"], [], "isolation"),
  // Source calls cable hip adduction a quad exercise, and files hip abduction
  // under a region we don't model.
  t("Cable_Hip_Adduction", ["adductors"], [], "isolation"),
  t("Band_Hip_Adductions", ["adductors"], [], "isolation"),
  t("Thigh_Abductor", ["glutes"], [], "isolation"),
  t("Side_Leg_Raises", ["glutes"], [], "isolation"),
  t("Rear_Leg_Raises", ["glutes"], ["hamstrings"], "isolation"),

  // ------------------------------------------------------------ core
  t("Crunches", ["abs"], [], "core"),
  t("Crunch_-_Hands_Overhead", ["abs"], [], "core"),
  t("Cable_Crunch", ["abs"], [], "core"),
  t("Cable_Seated_Crunch", ["abs"], [], "core"),
  t("Ab_Crunch_Machine", ["abs"], [], "core"),
  t("Exercise_Ball_Crunch", ["abs"], [], "core"),
  t("Decline_Crunch", ["abs"], [], "core"),
  t("Cable_Reverse_Crunch", ["abs"], [], "core"),
  t("Decline_Reverse_Crunch", ["abs"], [], "core"),
  t("Sit-Up", ["abs"], [], "core"),
  t("3_4_Sit-Up", ["abs"], [], "core"),
  t("Jackknife_Sit-Up", ["abs"], [], "core"),
  t("Plank", ["abs"], ["obliques"], "core"),
  t("Hanging_Leg_Raise", ["abs"], ["obliques"], "core"),
  t("Flat_Bench_Lying_Leg_Raise", ["abs"], [], "core"),
  t("Ab_Roller", ["abs"], ["lats", "front_delts"], "core"),
  t("Gorilla_Chin_Crunch", ["abs", "lats"], ["biceps"], "core"),
  t("Russian_Twist", ["obliques"], ["abs"], "core"),
  t("Cable_Russian_Twists", ["obliques"], ["abs"], "core"),
  t("Oblique_Crunches", ["obliques"], ["abs"], "core"),
  t("Oblique_Crunches_-_On_The_Floor", ["obliques"], ["abs"], "core"),
  t("Decline_Oblique_Crunch", ["obliques"], ["abs"], "core"),
  t("Cross-Body_Crunch", ["obliques"], ["abs"], "core"),
  t("Kneeling_Cable_Crunch_With_Alternating_Oblique_Twists", ["obliques"], ["abs"], "core"),
  t("Barbell_Side_Bend", ["obliques"], ["abs"], "core"),
  t("Dumbbell_Side_Bend", ["obliques"], ["abs"], "core"),
  t("One-Arm_High-Pulley_Cable_Side_Bends", ["obliques"], ["abs"], "core"),
  t("Landmine_180s", ["obliques"], ["abs", "front_delts"], "core"),

  // ------------------------------------------------------------ carry
  t("Farmers_Walk", ["forearms", "traps"], ["abs", "glutes", "quads", "upper_back"], "carry"),
]);
