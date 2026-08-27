/**
 * The energy and body-composition math, defined once so the wizard, the Body
 * screen and any later home summary all agree on what a number means.
 *
 * Everything here is a pure function over answers the user actually gave.
 * Nothing guesses: a missing height or birth date produces a null, never a
 * plausible default, because a calorie target quietly built on an assumed
 * 175 cm is worse than no target at all.
 */

import { parseIsoDay, toIsoDay } from "./format";

export const SEXES = ["male", "female"] as const;
export type Sex = (typeof SEXES)[number];

/**
 * Mifflin-St Jeor takes a sex constant, and the equation only has the two.
 *
 * This is a coefficient in a metabolic formula, not a claim about anybody.
 * Someone who would rather not answer skips the step and reads the rest of the
 * screen without a BMR, which is the honest outcome.
 */
export const SEX_CONSTANTS: Record<Sex, number> = { male: 5, female: -161 };

export const ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "very", "athlete"] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  athlete: 1.9,
};

/**
 * Described in days rather than adjectives. "Moderately active" means whatever
 * the reader wants it to mean, and everyone picks one band too high.
 */
export const ACTIVITY_DESCRIPTIONS: Record<ActivityLevel, string> = {
  sedentary: "Desk job, no training",
  light: "Training 1 to 3 days a week",
  moderate: "Training 3 to 5 days a week",
  very: "Training 6 or 7 days a week",
  athlete: "Twice a day, or physical work on top of training",
};

export const GOALS = ["lose", "maintain", "gain"] as const;
export type Goal = (typeof GOALS)[number];

export const GOAL_LABELS: Record<Goal, string> = {
  lose: "Lose weight",
  maintain: "Hold weight",
  gain: "Gain weight",
};

/**
 * The energy in a kilogram of bodyweight change, and the number the entire
 * deficit calculation rests on.
 *
 * It is a round figure for mixed tissue, not a constant of nature. A rate set
 * against it lands close enough to steer by, and the scale corrects it anyway,
 * which is why targets are recalculated from the trend rather than set once
 * and trusted.
 */
export const KCAL_PER_KG = 7700;

export const DEFAULT_PROTEIN_PER_KG = 1.8;
export const DEFAULT_FAT_PER_KG = 0.8;

export const KCAL_PER_G = { protein: 4, fat: 9, carb: 4 } as const;

/** BMI, from kilograms and centimetres. Null when either is missing. */
export function bodyMassIndex(weightKg: number | null, heightCm: number | null): number | null {
  if (weightKg === null || heightCm === null) return null;
  if (weightKg <= 0 || heightCm <= 0) return null;
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

export type BmiBand = "underweight" | "healthy" | "overweight" | "obese";

/**
 * The standard bands, which the Body screen always prints next to the caveat.
 *
 * BMI cannot tell muscle from fat, and the people using a hypertrophy tracker
 * are exactly the population it misreads. The band is shown because it is the
 * number everyone else will quote at them, not because Setwise believes it.
 */
export function bmiBand(bmi: number): BmiBand {
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "healthy";
  if (bmi < 30) return "overweight";
  return "obese";
}

/**
 * Whole years, counting the birthday rather than dividing by 365.25.
 *
 * Being a year out only moves BMR by five calories, but getting it right costs
 * three lines and getting it wrong is the kind of bug that survives forever.
 */
export function ageInYears(birthDate: string, on: Date = new Date()): number | null {
  const born = parseIsoDay(birthDate);
  if (Number.isNaN(born.getTime())) return null;

  let age = on.getFullYear() - born.getFullYear();
  const beforeBirthday =
    on.getMonth() < born.getMonth() ||
    (on.getMonth() === born.getMonth() && on.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;

  return age >= 0 ? age : null;
}

/**
 * Mifflin-St Jeor: `10 * kg + 6.25 * cm - 5 * age + sex constant`.
 *
 * Chosen over Harris-Benedict because it has been the more accurate of the two
 * in every comparison since the nineties, and over Katch-McArdle because that
 * one needs a body-fat percentage Setwise deliberately does not collect.
 */
export function basalMetabolicRate(input: {
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  sex: Sex | null;
}): number | null {
  const { weightKg, heightCm, age, sex } = input;
  if (weightKg === null || heightCm === null || age === null || sex === null) return null;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + SEX_CONSTANTS[sex];
}

export function totalDailyEnergy(
  bmr: number | null,
  activity: ActivityLevel | null,
): number | null {
  if (bmr === null || activity === null) return null;
  return bmr * ACTIVITY_FACTORS[activity];
}

/**
 * The signed weekly rate, derived rather than stored.
 *
 * The profile keeps a direction and a magnitude separately, so "lose" and
 * "+0.5 kg a week" can never end up saved together and quietly cancel out.
 */
export function weeklyRateKg(goal: Goal | null, magnitude: number | null): number | null {
  if (goal === null) return null;
  if (goal === "maintain") return 0;
  if (magnitude === null) return null;
  return goal === "lose" ? -Math.abs(magnitude) : Math.abs(magnitude);
}

/**
 * Calorie targets round to ten.
 *
 * The inputs are a height rounded to the centimetre, an activity factor picked
 * off a five-item list, and a rate measured against a scale that swings a kilo
 * with the weather. A target reading 2347 would be claiming four digits of
 * precision the arithmetic never had.
 */
export const CALORIE_ROUNDING = 10;

export type CalorieTarget = {
  calories: number;
  /** True when the target sits under resting expenditure. The screen says so. */
  belowBmr: boolean;
};

export function calorieTarget(input: {
  tdee: number | null;
  bmr: number | null;
  weeklyRateKg: number | null;
}): CalorieTarget | null {
  const { tdee, bmr, weeklyRateKg: rate } = input;
  if (tdee === null || rate === null) return null;

  const raw = tdee + (rate * KCAL_PER_KG) / 7;
  const calories = Math.round(raw / CALORIE_ROUNDING) * CALORIE_ROUNDING;

  // Not clamped. Someone who asked for a kilo a week gets the number their
  // choice implies, along with a warning saying what it is. Silently raising it
  // to their BMR would hide the fact that the rate is the thing to change.
  return { calories, belowBmr: bmr !== null && calories < bmr };
}

export type Macros = {
  proteinG: number;
  fatG: number;
  carbG: number;
  /**
   * Calories that protein alone overshot the target by, once fat was cut to
   * zero. Anything above zero means the target and the protein floor genuinely
   * disagree, and the screen says so rather than printing an impossible split.
   */
  shortfallKcal: number;
};

/**
 * Protein and fat per kilogram, carbohydrate takes the rest.
 *
 * The first two are set against bodyweight because that is what the evidence
 * scales them to. Carbohydrate is the remainder because it is the macro that
 * funds training, and training is the thing being funded.
 *
 * When the two floors do not fit inside the target, fat gives way first. There
 * is a fat intake below which hormones suffer, but it sits well under the
 * 0.8 g/kg default, whereas cutting protein in a deficit costs muscle directly.
 */
export function macroTargets(input: {
  calories: number | null;
  weightKg: number | null;
  proteinPerKg: number;
  fatPerKg: number;
}): Macros | null {
  const { calories, weightKg, proteinPerKg, fatPerKg } = input;
  if (calories === null || weightKg === null) return null;

  const proteinG = weightKg * proteinPerKg;
  const proteinKcal = proteinG * KCAL_PER_G.protein;
  const wantedFatKcal = weightKg * fatPerKg * KCAL_PER_G.fat;

  const fatKcal = Math.max(0, Math.min(wantedFatKcal, calories - proteinKcal));
  const carbKcal = Math.max(0, calories - proteinKcal - fatKcal);

  return {
    // Rounded last. Grams are what a label reports, and the rounded three can
    // land a few calories either side of the target, which is noise next to an
    // activity factor.
    proteinG: Math.round(proteinG),
    fatG: Math.round(fatKcal / KCAL_PER_G.fat),
    carbG: Math.round(carbKcal / KCAL_PER_G.carb),
    shortfallKcal: Math.round(Math.max(0, proteinKcal - calories)),
  };
}

/**
 * What the profile still needs before it can produce a target.
 *
 * `weight` is in the list even though it is not a profile column, because from
 * the reader's side it is one more unanswered question, and it is the one they
 * can fix in ten seconds.
 */
export const PROFILE_FIELDS = [
  "weight",
  "height",
  "sex",
  "birthDate",
  "activityLevel",
  "goal",
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

export const PROFILE_FIELD_LABELS: Record<ProfileField, string> = {
  weight: "a weigh-in in the last week",
  height: "your height",
  sex: "sex, for the BMR formula",
  birthDate: "your date of birth",
  activityLevel: "how active you are",
  goal: "what you are aiming for",
};

export type ProfileInputs = {
  heightCm: number | null;
  sex: Sex | null;
  birthDate: string | null;
  activityLevel: ActivityLevel | null;
  goal: Goal | null;
  targetRateKg: number | null;
  proteinPerKg: number | null;
  fatPerKg: number | null;
  calorieOverride: number | null;
};

export type BodyTargets = {
  /** The seven-day trend, never the last weigh-in. */
  weightKg: number | null;
  bmi: number | null;
  bmiBand: BmiBand | null;
  age: number | null;
  bmr: number | null;
  tdee: number | null;
  weeklyRateKg: number | null;
  calories: number | null;
  belowBmr: boolean;
  /** Where the calorie number came from, so the screen can label it. */
  calorieSource: "computed" | "override" | null;
  macros: Macros | null;
  proteinPerKg: number;
  fatPerKg: number;
  missing: ProfileField[];
};

/**
 * The whole Body screen in one pass.
 *
 * Written as one function rather than six the UI stitches together, because the
 * interesting part is which numbers survive a missing input, and that is only
 * legible when they are worked out side by side.
 */
export function bodyTargets(
  profile: ProfileInputs,
  trendWeightKg: number | null,
  now: Date = new Date(),
): BodyTargets {
  const age = profile.birthDate === null ? null : ageInYears(profile.birthDate, now);
  const bmi = bodyMassIndex(trendWeightKg, profile.heightCm);
  const bmr = basalMetabolicRate({
    weightKg: trendWeightKg,
    heightCm: profile.heightCm,
    age,
    sex: profile.sex,
  });
  const tdee = totalDailyEnergy(bmr, profile.activityLevel);
  const rate = weeklyRateKg(profile.goal, profile.targetRateKg);
  const computed = calorieTarget({ tdee, bmr, weeklyRateKg: rate });

  // An override wins outright. Someone who arrived with a number from a coach
  // or a metabolic test did not come here to have it recalculated.
  const override = profile.calorieOverride;
  const calories = override ?? computed?.calories ?? null;

  const proteinPerKg = profile.proteinPerKg ?? DEFAULT_PROTEIN_PER_KG;
  const fatPerKg = profile.fatPerKg ?? DEFAULT_FAT_PER_KG;

  const missing: ProfileField[] = [];
  if (trendWeightKg === null) missing.push("weight");
  if (profile.heightCm === null) missing.push("height");
  if (profile.sex === null) missing.push("sex");
  if (profile.birthDate === null) missing.push("birthDate");
  if (profile.activityLevel === null) missing.push("activityLevel");
  if (profile.goal === null) missing.push("goal");

  return {
    weightKg: trendWeightKg,
    bmi,
    bmiBand: bmi === null ? null : bmiBand(bmi),
    age,
    bmr,
    tdee,
    weeklyRateKg: rate,
    calories,
    belowBmr: calories !== null && bmr !== null && calories < bmr,
    calorieSource: override !== null ? "override" : computed === null ? null : "computed",
    macros: macroTargets({ calories, weightKg: trendWeightKg, proteinPerKg, fatPerKg }),
    proteinPerKg,
    fatPerKg,
    missing,
  };
}

/** How long a dismissed profile prompt stays dismissed. */
export const PROMPT_DISMISSAL_DAYS = 14;

export function promptDismissedUntil(from: Date = new Date()): string {
  const until = new Date(from);
  until.setDate(until.getDate() + PROMPT_DISMISSAL_DAYS);
  return toIsoDay(until);
}
