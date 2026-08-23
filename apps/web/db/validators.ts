/**
 * One definition of what a valid set is, enforced at the client input, the API
 * boundary and the database.
 *
 * These live next to the Drizzle schema on purpose: the bounds below are the
 * column definitions restated in Zod, so a change to `numeric(6, 2)` has an
 * obvious place to land. Nothing here imports the database, so the client can
 * validate against the same rules before it ever hits the network.
 */

import { z } from "zod";

import { ACTIVITY_KINDS } from "@/lib/activity";
import { MUSCLE_SLUGS } from "@/lib/muscles";
import { ACTIVITY_LEVELS, ageInYears, GOALS, SEXES } from "@/lib/nutrition";

/** `numeric(6, 2)`: four digits before the point, two after. */
export const WEIGHT_MAX = 9999.99;
/** The smallest plate jump anyone loads, and the granularity of the number pad. */
export const WEIGHT_STEP = 0.25;

/** RPE is a 6-to-10 scale with half steps. It is a slider, never a text field. */
export const RPE_MIN = 6;
export const RPE_MAX = 10;
export const RPE_STEP = 0.5;

export const uuid = z.uuid();

export const activityKind = z.enum(ACTIVITY_KINDS);

/**
 * Weight is always kilograms. `user.unitPref` is a display concern, so a unit
 * mistake can never reach a stored row.
 *
 * Zero is allowed: bodyweight dips, push-ups and band work are real sets, and
 * refusing them would push people into typing a fake 1 kg.
 */
export const weightKg = z
  .number()
  .min(0, "Weight can't be negative.")
  .max(WEIGHT_MAX, "That weight is out of range.")
  .refine((w) => Math.abs(w * 100 - Math.round(w * 100)) < 1e-6, {
    message: "Weight goes to two decimal places.",
  });

export const reps = z
  .number()
  .int("Reps have to be whole.")
  .min(1, "A set is at least one rep.")
  .max(1000, "That rep count is out of range.");

export const rpe = z
  .number()
  .min(RPE_MIN)
  .max(RPE_MAX)
  .refine((v) => Math.abs(v / RPE_STEP - Math.round(v / RPE_STEP)) < 1e-9, {
    message: "RPE moves in half points.",
  });

const setValuesInput = z.object({
  sessionId: uuid,
  exerciseId: uuid,
  setIndex: z.number().int().min(0).max(500),
  weight: weightKg,
  reps,
  rpe: rpe.nullable(),
  // Required, not defaulted. A payload that forgot to say whether this was a
  // warm-up should be rejected, not quietly counted as working volume.
  isWarmup: z.boolean(),
});

/**
 * The client names the row.
 *
 * A set save is the one write in the app that someone is standing over, out of
 * breath, on gym wifi. When the response is lost the only safe retry is one
 * that can be recognised as the same request, and a server-generated id makes
 * that impossible: the second attempt is indistinguishable from a second set at
 * the same weight, which is a completely ordinary thing to log.
 *
 * With the id supplied, a repeat is a no-op that returns the row already
 * stored, and the app can retry a write it never got an answer for.
 */
export const createSetInput = setValuesInput.extend({ id: uuid });
export const updateSetInput = setValuesInput.extend({ id: uuid });

export type CreateSetInput = z.infer<typeof createSetInput>;
export type UpdateSetInput = z.infer<typeof updateSetInput>;

/** Same reasoning as `createSetInput`: a retried start must not open a second workout. */
export const sessionStartInput = z.object({
  id: uuid,
  routineDayId: uuid.nullable(),
  notes: z.string().trim().max(2000).nullable(),
});

/**
 * The trailing windows the whole app toggles between. One meaning everywhere.
 *
 * The list lives here rather than beside the stats queries so the toggle can
 * import it without pulling the Drizzle schema into the client bundle.
 */
export const STAT_WINDOWS = [7, 30, 90] as const;
export type StatWindow = (typeof STAT_WINDOWS)[number];

export const statWindow = z
  .union([z.literal(7), z.literal(30), z.literal(90)])
  .describe("Trailing window in days.");

/**
 * The user's IANA time zone, sent by the client and used wherever an instant
 * has to be bucketed into a day.
 *
 * Bodyweight is stored as a `date`, so it is already local by construction, but
 * a set is a timestamp. Without the zone a 9pm workout lands on tomorrow for
 * anyone west of UTC, and the tonnage bars would sit a day off the weight line
 * they are drawn against.
 *
 * Validated by asking `Intl` rather than by pattern, because the zone list
 * changes and a regex would either refuse valid names or wave through a string
 * Postgres then throws on.
 */
export const timeZone = z
  .string()
  .max(64)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat(undefined, { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Unknown time zone." },
  );

/**
 * Bodyweight.
 *
 * The bounds are a typo guard, not a judgement. They only have to be wide
 * enough that no real person is refused, and narrow enough that a misplaced
 * decimal point does not quietly flatten the trend line for a fortnight.
 */
export const BODYWEIGHT_MIN = 20;
export const BODYWEIGHT_MAX = 500;
/** Scales read to a tenth, so the pad's increment is a plausible correction. */
export const BODYWEIGHT_STEP = 0.5;

export const bodyweightKg = z
  .number()
  .min(BODYWEIGHT_MIN, "That doesn't look like a bodyweight.")
  .max(BODYWEIGHT_MAX, "That doesn't look like a bodyweight.")
  .refine((w) => Math.abs(w * 100 - Math.round(w * 100)) < 1e-6, {
    message: "Weight goes to two decimal places.",
  });

/** "YYYY-MM-DD", the client's local day. Never a timestamp: see `bodyweightLogs`. */
export const isoDay = z.iso.date();

export const bodyweightNote = z.string().trim().max(280, "That note is too long.").nullable();

export const bodyweightLogInput = z.object({
  loggedOn: isoDay,
  weight: bodyweightKg,
  note: bodyweightNote,
});

export type BodyweightLogInput = z.infer<typeof bodyweightLogInput>;

/**
 * The plan builder.
 *
 * Targets are all nullable, and that is the point: a routine that forces you to
 * declare an RPE target for every accessory is a routine nobody finishes
 * building. A blank target means "no opinion", which the logger renders as
 * nothing rather than as a zero.
 */

export const routineName = z
  .string()
  .trim()
  .min(1, "Give the routine a name.")
  .max(80, "That name is too long.");

export const dayName = z
  .string()
  .trim()
  .min(1, "Give the day a name.")
  .max(60, "That name is too long.");

/** Ten sets of one exercise is already past the point of usefulness; 20 is the ceiling. */
export const targetSets = z.number().int().min(1).max(20);

/**
 * A rep range, not a rep count. "8 to 12" is how anyone who trains actually
 * thinks, and it is what makes the double progression in the logger legible.
 */
export const targetReps = z.number().int().min(1).max(100);

export const routineExerciseTargets = z
  .object({
    targetSets: targetSets.nullable(),
    targetRepLow: targetReps.nullable(),
    targetRepHigh: targetReps.nullable(),
    targetRpe: rpe.nullable(),
  })
  .refine(
    (value) =>
      value.targetRepLow === null ||
      value.targetRepHigh === null ||
      value.targetRepLow <= value.targetRepHigh,
    { message: "The low end of the range has to come first.", path: ["targetRepLow"] },
  );

export const exerciseName = z
  .string()
  .trim()
  .min(1, "Give the exercise a name.")
  .max(120, "That name is too long.");

export const equipment = z.enum([
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "kettlebell",
  "bands",
  "body only",
  "other",
]);

export const movementPattern = z.enum([
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

/** 1.0 for a primary mover, 0.5 for a secondary. The heatmap inherits both. */
export const PRIMARY_FACTOR = 1;
export const SECONDARY_FACTOR = 0.5;

/**
 * A custom exercise, with its muscle tagging.
 *
 * At least one primary muscle is required. An exercise with no primary is
 * invisible to every volume query in the app, and a silently untracked
 * exercise is worse than no exercise: the heatmap would quietly under-report
 * the training someone actually did.
 */
export const customExerciseInput = z.object({
  name: exerciseName,
  equipment: equipment.nullable(),
  movementPattern: movementPattern.nullable(),
  primaryMuscles: z
    .array(z.enum(MUSCLE_SLUGS))
    .min(1, "Pick at least one primary muscle.")
    .max(6)
    .transform(uniqueSlugs),
  secondaryMuscles: z.array(z.enum(MUSCLE_SLUGS)).max(8).transform(uniqueSlugs),
});

/**
 * A muscle tagged twice is the same tag, not two of them.
 *
 * `exercise_muscles` is keyed on (exercise, muscle), so a repeat would fail on
 * insert; collapsing it here means a double-tap in the picker can never turn
 * into an error the user has no way to act on.
 */
function uniqueSlugs<T extends string>(slugs: T[]): T[] {
  return [...new Set(slugs)];
}

export type CustomExerciseInput = z.infer<typeof customExerciseInput>;
export type RoutineExerciseTargets = z.infer<typeof routineExerciseTargets>;

/**
 * The profile.
 *
 * These bounds are the `user_profiles` check constraints restated in Zod, so
 * the wizard refuses a slipped decimal point before the network sees it and the
 * database refuses it again if anything else ever writes the row.
 */

export const HEIGHT_MIN_CM = 100;
export const HEIGHT_MAX_CM = 250;
export const HEIGHT_STEP_CM = 1;

export const heightCm = z
  .number()
  .min(HEIGHT_MIN_CM, "That doesn't look like a height in centimetres.")
  .max(HEIGHT_MAX_CM, "That doesn't look like a height in centimetres.")
  .refine((cm) => Math.abs(cm * 10 - Math.round(cm * 10)) < 1e-6, {
    message: "Height goes to one decimal place.",
  });

export const sex = z.enum(SEXES);
export const activityLevel = z.enum(ACTIVITY_LEVELS);
export const goal = z.enum(GOALS);

/**
 * The floor is an account age, not a judgement about who trains. The ceiling
 * exists so a mistyped year lands as an error rather than as a BMR calculated
 * for a four-hundred-year-old.
 */
export const MIN_AGE = 13;
export const MAX_AGE = 120;

export const birthDate = isoDay
  .refine((day) => {
    const age = ageInYears(day);
    return age !== null && age >= MIN_AGE && age <= MAX_AGE;
  }, `Setwise needs a date of birth between ${MIN_AGE} and ${MAX_AGE} years ago.`)
  .describe("The user's date of birth, used only for the age term in BMR.");

/**
 * Kilograms per week, unsigned: `goal` carries the direction.
 *
 * The ceiling is 1.5 because past roughly a percent of bodyweight a week the
 * thing being lost stops being mostly fat, and a lifting app has no business
 * making that easy to type.
 */
export const TARGET_RATE_MAX = 1.5;
export const TARGET_RATE_STEP = 0.05;

export const targetRateKg = z
  .number()
  .min(0, "A rate can't be negative — pick a goal instead.")
  .max(TARGET_RATE_MAX, `${TARGET_RATE_MAX} kg a week is as fast as Setwise will plan for.`)
  .refine((rate) => Math.abs(rate * 100 - Math.round(rate * 100)) < 1e-6, {
    message: "Rate goes to two decimal places.",
  });

export const proteinPerKg = z
  .number()
  .min(0.5, "That's below what a lifter should be eating.")
  .max(4, "That's more protein than anyone needs.");

export const fatPerKg = z
  .number()
  .min(0.2, "Fat that low is a hormonal problem, not a diet.")
  .max(3, "That's out of range for a fat target.");

export const calorieOverride = z
  .number()
  .int("Calories are whole numbers.")
  .min(800, "That's below what anyone should be eating without supervision.")
  .max(8000, "That's out of range for a daily target.");

/**
 * A patch, not a full profile.
 *
 * Every onboarding step saves on its own and every step can be skipped, so a
 * write says only what it knows. Absent means "leave it alone", explicit null
 * means "clear it" — the difference matters on a form where blanking a field is
 * a deliberate act and not touching it is the common one.
 */
export const profilePatch = z.object({
  heightCm: heightCm.nullable().optional(),
  sex: sex.nullable().optional(),
  birthDate: birthDate.nullable().optional(),
  activityLevel: activityLevel.nullable().optional(),
  goal: goal.nullable().optional(),
  targetRateKg: targetRateKg.nullable().optional(),
  proteinPerKg: proteinPerKg.nullable().optional(),
  fatPerKg: fatPerKg.nullable().optional(),
  calorieOverride: calorieOverride.nullable().optional(),
});

export type ProfilePatch = z.infer<typeof profilePatch>;
