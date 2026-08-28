import { z } from "zod";

import { ACTIVITY_KINDS } from "@setwise/domain/activity";
import { MUSCLE_SLUGS } from "@setwise/domain/muscles";
import { ACTIVITY_LEVELS, GOALS, PROFILE_FIELDS, SEXES } from "@setwise/domain/nutrition";
import { movementPattern, uuid } from "@setwise/domain/validators";

export const timestampSchema = z.date();
export const nullableTimestampSchema = timestampSchema.nullable();
export const isoDaySchema = z.iso.date();
export const activityKindSchema = z.enum(ACTIVITY_KINDS);
export const muscleSlugSchema = z.enum(MUSCLE_SLUGS);
const volumeBandSchema = z.enum(["none", "low", "productive", "high"]);

export const idResultSchema = z.object({ id: uuid });
export const movedResultSchema = idResultSchema.extend({ moved: z.boolean() });

export const routineSchema = z.object({
  id: uuid,
  userId: z.string(),
  name: z.string(),
  notes: z.string().nullable(),
  isArchived: z.boolean(),
  createdAt: timestampSchema,
});

export const routineDayRowSchema = z.object({
  id: uuid,
  routineId: uuid,
  dayIndex: z.number().int(),
  name: z.string(),
  kind: activityKindSchema,
});

export const routineExerciseRowSchema = z.object({
  id: uuid,
  routineDayId: uuid,
  exerciseId: uuid,
  orderIndex: z.number().int(),
  targetSets: z.number().int().nullable(),
  targetRepLow: z.number().int().nullable(),
  targetRepHigh: z.number().int().nullable(),
  targetRpe: z.number().nullable(),
});

export const routineSummarySchema = z.object({
  id: uuid,
  name: z.string(),
  notes: z.string().nullable(),
  isArchived: z.boolean(),
  dayCount: z.number().int(),
  restDayCount: z.number().int(),
  exerciseCount: z.number().int(),
  lastActivityAt: nullableTimestampSchema,
});

export const plannedExerciseSchema = z.object({
  id: uuid,
  exerciseId: uuid,
  name: z.string(),
  equipment: z.string().nullable(),
  orderIndex: z.number().int(),
  targetSets: z.number().int().nullable(),
  targetRepLow: z.number().int().nullable(),
  targetRepHigh: z.number().int().nullable(),
  targetRpe: z.number().nullable(),
});

export type PlannedExerciseDto = z.infer<typeof plannedExerciseSchema>;

export const plannedDaySchema = z.object({
  id: uuid,
  name: z.string(),
  dayIndex: z.number().int(),
  kind: activityKindSchema,
  exercises: z.array(plannedExerciseSchema),
});

export const routineDetailSchema = z.object({
  id: uuid,
  name: z.string(),
  notes: z.string().nullable(),
  isArchived: z.boolean(),
  days: z.array(plannedDaySchema),
});

export const startableDaySchema = z.object({
  id: uuid,
  name: z.string(),
  dayIndex: z.number().int(),
  kind: activityKindSchema,
  routineId: uuid,
  routineName: z.string(),
  exerciseCount: z.number().int(),
  lastRunAt: nullableTimestampSchema,
});

export const workoutSessionSchema = z.object({
  id: uuid,
  userId: z.string(),
  routineDayId: uuid.nullable(),
  kind: activityKindSchema,
  startedAt: timestampSchema,
  endedAt: nullableTimestampSchema,
  notes: z.string().nullable(),
});

export const workoutSetSchema = z.object({
  id: uuid,
  sessionId: uuid,
  exerciseId: uuid,
  setIndex: z.number().int(),
  weight: z.number(),
  reps: z.number().int(),
  rpe: z.number().nullable(),
  isWarmup: z.boolean(),
  performedAt: timestampSchema,
});

export const detectedRecordSchema = z.object({
  kind: z.enum(["max_weight", "best_e1rm", "max_reps_at_weight", "session_volume"]),
  value: z.number(),
  previous: z.number().nullable(),
  atWeight: z.number().optional(),
});

export const sessionVolumeRecordSchema = detectedRecordSchema.extend({
  exerciseId: uuid,
  exerciseName: z.string(),
});

export const sessionPlanSchema = z.object({
  dayId: uuid,
  dayName: z.string(),
  kind: activityKindSchema,
  routineId: uuid,
  routineName: z.string(),
  exercises: z.array(plannedExerciseSchema),
});

export const lastPerformanceSetSchema = workoutSetSchema.pick({
  setIndex: true,
  weight: true,
  reps: true,
  rpe: true,
  isWarmup: true,
});

export const lastPerformanceSchema = z.object({
  sessionId: uuid,
  performedAt: timestampSchema,
  sets: z.array(lastPerformanceSetSchema),
});

export const sessionExerciseSchema = z.object({
  id: uuid,
  name: z.string(),
  equipment: z.string().nullable(),
});

export const sessionDetailSchema = z.object({
  id: uuid,
  kind: activityKindSchema,
  startedAt: timestampSchema,
  endedAt: nullableTimestampSchema,
  notes: z.string().nullable(),
  routineDayId: uuid.nullable(),
  plan: sessionPlanSchema.nullable(),
  exercises: z.array(sessionExerciseSchema),
  sets: z.array(workoutSetSchema),
  lastPerformances: z.record(uuid, lastPerformanceSchema.nullable()),
});

export const sessionSummarySchema = z.object({
  id: uuid,
  kind: activityKindSchema,
  startedAt: timestampSchema,
  endedAt: nullableTimestampSchema,
  routineName: z.string().nullable(),
  dayName: z.string().nullable(),
  setCount: z.number().int(),
  workingSetCount: z.number().int(),
  tonnage: z.number(),
  exerciseNames: z.array(z.string()),
});

export const exerciseSummarySchema = z.object({
  id: uuid,
  name: z.string(),
  slug: z.string(),
  equipment: z.string().nullable(),
  movementPattern: movementPattern.nullable(),
  isCustom: z.boolean(),
});

export const exerciseMuscleSchema = z.object({
  slug: muscleSlugSchema,
  display_name: z.string(),
  role: z.enum(["primary", "secondary"]),
  factor: z.number(),
});

export const muscleSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  displayName: z.string(),
  svgPathId: z.string(),
  bodySide: z.enum(["front", "back", "both"]),
});

export const userProfileSchema = z.object({
  userId: z.string(),
  heightCm: z.number().nullable(),
  sex: z.enum(SEXES).nullable(),
  birthDate: isoDaySchema.nullable(),
  activityLevel: z.enum(ACTIVITY_LEVELS).nullable(),
  goal: z.enum(GOALS).nullable(),
  targetRateKg: z.number().nullable(),
  proteinPerKg: z.number().nullable(),
  fatPerKg: z.number().nullable(),
  calorieOverride: z.number().int().nullable(),
  onboardingStartedAt: nullableTimestampSchema,
  onboardingCompletedAt: nullableTimestampSchema,
  promptDismissedUntil: isoDaySchema.nullable(),
  updatedAt: timestampSchema,
});

export const macrosSchema = z.object({
  proteinG: z.number(),
  fatG: z.number(),
  carbG: z.number(),
  shortfallKcal: z.number(),
});

export const bodyTargetsSchema = z.object({
  weightKg: z.number().nullable(),
  bmi: z.number().nullable(),
  bmiBand: z.enum(["underweight", "healthy", "overweight", "obese"]).nullable(),
  age: z.number().int().nullable(),
  bmr: z.number().nullable(),
  tdee: z.number().nullable(),
  weeklyRateKg: z.number().nullable(),
  calories: z.number().nullable(),
  belowBmr: z.boolean(),
  calorieSource: z.enum(["computed", "override"]).nullable(),
  macros: macrosSchema.nullable(),
  proteinPerKg: z.number(),
  fatPerKg: z.number(),
  missing: z.array(z.enum(PROFILE_FIELDS)),
});

export const profileSummarySchema = z.object({
  profile: userProfileSchema.nullable(),
  weight: z.object({
    trend: z.number().nullable(),
    samples: z.number().int(),
    latest: z
      .object({ day: isoDaySchema, weight: z.number(), note: z.string().nullable() })
      .nullable(),
  }),
  targets: bodyTargetsSchema,
  onboarded: z.boolean(),
  promptDismissedUntil: isoDaySchema.nullable(),
});

export const bodyweightLogSchema = z.object({
  id: uuid,
  userId: z.string(),
  weight: z.number(),
  loggedOn: isoDaySchema,
  note: z.string().nullable(),
});

export const bodyweightPointSchema = z.object({
  day: isoDaySchema,
  weight: z.number().nullable(),
  note: z.string().nullable(),
  trend: z.number().nullable(),
  trendSamples: z.number().int(),
  tonnage: z.number(),
});

export const bodyweightSeriesSchema = z.object({
  points: z.array(bodyweightPointSchema),
  latest: z.object({ day: isoDaySchema, weight: z.number() }).nullable(),
  trendNow: z.number().nullable(),
  trendChange: z.number().nullable(),
  weighIns: z.number().int(),
  tonnage: z.number(),
});

export const muscleVolumeSchema = z.object({
  slug: muscleSlugSchema,
  displayName: z.string(),
  effectiveSets: z.number(),
  weeklyEffectiveSets: z.number(),
  tonnage: z.number(),
  band: volumeBandSchema,
});

export const intensitySummarySchema = z.object({
  avgRelativeIntensity: z.number().nullable(),
  intensitySets: z.number().int(),
  avgRpe: z.number().nullable(),
  rpeSets: z.number().int(),
  workingSets: z.number().int(),
});

export const trainedExerciseSchema = z.object({
  id: uuid,
  name: z.string(),
  sessions: z.number().int(),
  lastPerformedAt: timestampSchema,
});

export const exerciseHistoryPointSchema = z.object({
  sessionId: uuid,
  performedAt: timestampSchema,
  bestE1rm: z.number().nullable(),
  topWeight: z.number(),
  volume: z.number(),
  sets: z.number().int(),
});

export type RoutineDto = z.infer<typeof routineSchema>;
export type RoutineDetailDto = z.infer<typeof routineDetailSchema>;
export type WorkoutSetDto = z.infer<typeof workoutSetSchema>;
export type SessionExerciseDto = z.infer<typeof sessionExerciseSchema>;
export type LastPerformanceDto = z.infer<typeof lastPerformanceSchema>;
export type SessionDetailDto = z.infer<typeof sessionDetailSchema>;
export type UserProfileDto = z.infer<typeof userProfileSchema>;
export type ProfileSummaryDto = z.infer<typeof profileSummarySchema>;
export type BodyweightSeriesDto = z.infer<typeof bodyweightSeriesSchema>;
