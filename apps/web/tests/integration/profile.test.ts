import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@setwise/db/schema";
import { profilePatch } from "@setwise/domain/validators";
import {
  basalMetabolicRate,
  bodyMassIndex,
  bodyTargets,
  calorieTarget,
  DEFAULT_FAT_PER_KG,
  DEFAULT_PROTEIN_PER_KG,
  KCAL_PER_KG,
  macroTargets,
  PROMPT_DISMISSAL_DAYS,
  totalDailyEnergy,
  weeklyRateKg,
  type ProfileInputs,
} from "@setwise/domain/nutrition";
import { logBodyweight } from "@setwise/db/queries/bodyweight";
import {
  completeOnboarding,
  dismissProfilePrompt,
  profileSummary,
  readProfile,
  saveProfile,
  trendWeight,
} from "@setwise/db/queries/profile";
import { openTestDatabase } from "./database";

const { client, db } = openTestDatabase();

function utcDay(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

/**
 * A complete profile, hand-worked below. Height and weight are round numbers so
 * the expected BMR can be checked on paper rather than by re-running the code
 * the test is meant to be checking.
 */
const FIXTURE: ProfileInputs = {
  heightCm: 180,
  sex: "male",
  birthDate: "1996-01-01",
  activityLevel: "moderate",
  goal: "lose",
  targetRateKg: 0.5,
  proteinPerKg: null,
  fatPerKg: null,
  calorieOverride: null,
};

const AT = new Date("2026-06-15T12:00:00Z");
const AGE = 30;
const WEIGHT = 80;

describe("body composition math", () => {
  it("works BMI from kilograms and centimetres", () => {
    expect(bodyMassIndex(80, 180)).toBeCloseTo(24.691, 3);
    expect(bodyMassIndex(null, 180)).toBeNull();
    expect(bodyMassIndex(80, null)).toBeNull();
  });

  it("works BMR with the sex constant, both ways round", () => {
    const shared = { weightKg: WEIGHT, heightCm: 180, age: AGE };
    // 800 + 1125 - 150 + 5
    expect(basalMetabolicRate({ ...shared, sex: "male" })).toBeCloseTo(1780, 6);
    // The same three terms, 166 lower.
    expect(basalMetabolicRate({ ...shared, sex: "female" })).toBeCloseTo(1614, 6);
  });

  it("returns no BMR when any single term is missing", () => {
    const complete = { weightKg: WEIGHT, heightCm: 180, age: AGE, sex: "male" as const };
    expect(basalMetabolicRate({ ...complete, weightKg: null })).toBeNull();
    expect(basalMetabolicRate({ ...complete, heightCm: null })).toBeNull();
    expect(basalMetabolicRate({ ...complete, age: null })).toBeNull();
    expect(basalMetabolicRate({ ...complete, sex: null })).toBeNull();
  });

  it("multiplies BMR by the activity factor", () => {
    expect(totalDailyEnergy(1780, "sedentary")).toBeCloseTo(2136, 6);
    expect(totalDailyEnergy(1780, "moderate")).toBeCloseTo(2759, 6);
    expect(totalDailyEnergy(1780, "athlete")).toBeCloseTo(3382, 6);
    expect(totalDailyEnergy(null, "moderate")).toBeNull();
    expect(totalDailyEnergy(1780, null)).toBeNull();
  });

  it("signs the weekly rate off the goal, never off the stored number", () => {
    expect(weeklyRateKg("lose", 0.5)).toBe(-0.5);
    expect(weeklyRateKg("gain", 0.5)).toBe(0.5);
    // A magnitude saved by mistake cannot flip a maintenance target.
    expect(weeklyRateKg("maintain", 0.5)).toBe(0);
    expect(weeklyRateKg(null, 0.5)).toBeNull();
    expect(weeklyRateKg("lose", null)).toBeNull();
  });

  it("shifts the calorie target by the energy in the weekly rate", () => {
    const tdee = 2759;
    const daily = (KCAL_PER_KG * 0.5) / 7;
    const target = calorieTarget({ tdee, bmr: 1780, weeklyRateKg: -0.5 });

    expect(target).not.toBeNull();
    // Rounded to ten, because the inputs never had four digits of precision.
    expect(target!.calories).toBe(Math.round((tdee - daily) / 10) * 10);
    expect(target!.calories % 10).toBe(0);
    expect(target!.belowBmr).toBe(false);
  });

  it("reports a target under BMR rather than raising it", () => {
    const target = calorieTarget({ tdee: 2136, bmr: 1780, weeklyRateKg: -1.5 });

    expect(target).not.toBeNull();
    expect(target!.calories).toBeLessThan(1780);
    // Reported, not clamped. The rate is the thing the user should change.
    expect(target!.belowBmr).toBe(true);
  });

  it("gives carbohydrate whatever protein and fat leave behind", () => {
    const macros = macroTargets({
      calories: 2400,
      weightKg: WEIGHT,
      proteinPerKg: DEFAULT_PROTEIN_PER_KG,
      fatPerKg: DEFAULT_FAT_PER_KG,
    });

    expect(macros).not.toBeNull();
    expect(macros!.proteinG).toBe(144);
    expect(macros!.fatG).toBe(64);
    // 2400 - 576 - 576, over four.
    expect(macros!.carbG).toBe(312);
    expect(macros!.shortfallKcal).toBe(0);
  });

  it("cuts fat before protein when the two floors do not fit", () => {
    const macros = macroTargets({
      calories: 900,
      weightKg: WEIGHT,
      proteinPerKg: DEFAULT_PROTEIN_PER_KG,
      fatPerKg: DEFAULT_FAT_PER_KG,
    });

    // 144 g of protein is 576 kcal, so 324 kcal are left and every one of them
    // goes to fat before carbohydrate gets any.
    expect(macros!.proteinG).toBe(144);
    expect(macros!.fatG).toBe(36);
    expect(macros!.carbG).toBe(0);
    expect(macros!.shortfallKcal).toBe(0);
  });

  it("floors carbohydrate at zero and reports the shortfall", () => {
    const macros = macroTargets({
      calories: 500,
      weightKg: WEIGHT,
      proteinPerKg: DEFAULT_PROTEIN_PER_KG,
      fatPerKg: DEFAULT_FAT_PER_KG,
    });

    expect(macros!.proteinG).toBe(144);
    expect(macros!.fatG).toBe(0);
    expect(macros!.carbG).toBe(0);
    // 576 kcal of protein against a 500 kcal target.
    expect(macros!.shortfallKcal).toBe(76);
  });
});

describe("body targets", () => {
  it("assembles the whole screen from a complete profile", () => {
    const targets = bodyTargets(FIXTURE, WEIGHT, AT);

    expect(targets.age).toBe(AGE);
    expect(targets.bmr).toBeCloseTo(1780, 6);
    expect(targets.tdee).toBeCloseTo(2759, 6);
    expect(targets.weeklyRateKg).toBe(-0.5);
    expect(targets.calories).toBe(2210);
    expect(targets.calorieSource).toBe("computed");
    expect(targets.bmiBand).toBe("healthy");
    expect(targets.macros!.proteinG).toBe(144);
    expect(targets.missing).toEqual([]);
  });

  it("lets an override win outright, macros included", () => {
    const targets = bodyTargets({ ...FIXTURE, calorieOverride: 3000 }, WEIGHT, AT);

    expect(targets.calories).toBe(3000);
    expect(targets.calorieSource).toBe("override");
    // The split follows the number in force, not the one that was calculated.
    expect(targets.macros!.carbG).toBe(462);
  });

  it("names every answer it is missing, and guesses none of them", () => {
    const empty: ProfileInputs = {
      heightCm: null,
      sex: null,
      birthDate: null,
      activityLevel: null,
      goal: null,
      targetRateKg: null,
      proteinPerKg: null,
      fatPerKg: null,
      calorieOverride: null,
    };
    const targets = bodyTargets(empty, null, AT);

    expect(targets.missing).toEqual([
      "weight",
      "height",
      "sex",
      "birthDate",
      "activityLevel",
      "goal",
    ]);
    expect(targets.bmi).toBeNull();
    expect(targets.bmr).toBeNull();
    expect(targets.calories).toBeNull();
    expect(targets.macros).toBeNull();
    expect(targets.calorieSource).toBeNull();
  });

  it("keeps the numbers that survive one missing answer", () => {
    // No sex, so no BMR and nothing downstream of it. BMI needs neither.
    const targets = bodyTargets({ ...FIXTURE, sex: null }, WEIGHT, AT);

    expect(targets.bmi).toBeCloseTo(24.691, 3);
    expect(targets.bmr).toBeNull();
    expect(targets.calories).toBeNull();
    expect(targets.missing).toEqual(["sex"]);
  });

  it("falls back to the default macro ratios without storing them", () => {
    const targets = bodyTargets(FIXTURE, WEIGHT, AT);
    expect(targets.proteinPerKg).toBe(DEFAULT_PROTEIN_PER_KG);
    expect(targets.fatPerKg).toBe(DEFAULT_FAT_PER_KG);
  });
});

describe("profile validation", () => {
  it("takes a patch of one field and leaves the rest absent", () => {
    const parsed = profilePatch.parse({ heightCm: 180 });
    expect(parsed).toEqual({ heightCm: 180 });
    expect("goal" in parsed).toBe(false);
  });

  it("keeps an explicit null, because clearing a field is a real thing to want", () => {
    expect(profilePatch.parse({ goal: null })).toEqual({ goal: null });
  });

  it("refuses values the column would refuse", () => {
    expect(profilePatch.safeParse({ heightCm: 40 }).success).toBe(false);
    expect(profilePatch.safeParse({ targetRateKg: 3 }).success).toBe(false);
    expect(profilePatch.safeParse({ targetRateKg: -0.5 }).success).toBe(false);
    expect(profilePatch.safeParse({ calorieOverride: 100 }).success).toBe(false);
    expect(profilePatch.safeParse({ birthDate: "2030-01-01" }).success).toBe(false);
    expect(profilePatch.safeParse({ activityLevel: "extremely" }).success).toBe(false);
  });
});

describe("profile persistence", () => {
  const userId = `test-profile-${randomUUID()}`;
  const otherUserId = `test-profile-other-${randomUUID()}`;

  beforeAll(async () => {
    for (const id of [userId, otherUserId]) {
      await db.insert(schema.user).values({
        id,
        name: "Profile test fixture",
        email: `${id}@example.invalid`,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  });

  afterAll(async () => {
    for (const id of [userId, otherUserId]) {
      await db.delete(schema.user).where(eq(schema.user.id, id));
    }
    await client.end();
  });

  it("creates the row on the first answer and stamps the start", async () => {
    const row = await saveProfile(db, userId, { heightCm: 180 });

    expect(row.heightCm).toBe(180);
    expect(row.onboardingStartedAt).not.toBeNull();
    expect(row.onboardingCompletedAt).toBeNull();
  });

  it("leaves fields the patch never mentioned alone", async () => {
    await saveProfile(db, userId, { goal: "lose", targetRateKg: 0.5 });
    await saveProfile(db, userId, { activityLevel: "moderate" });

    const row = await readProfile(db, userId);
    // The height from the first step is still there three patches later.
    expect(row!.heightCm).toBe(180);
    expect(row!.goal).toBe("lose");
    expect(row!.targetRateKg).toBe(0.5);
    expect(row!.activityLevel).toBe("moderate");
  });

  it("clears a field when the patch says null", async () => {
    await saveProfile(db, userId, { activityLevel: null });
    expect((await readProfile(db, userId))!.activityLevel).toBeNull();
    await saveProfile(db, userId, { activityLevel: "moderate" });
  });

  it("does not move the start stamp on later writes", async () => {
    const before = (await readProfile(db, userId))!.onboardingStartedAt;
    await saveProfile(db, userId, { sex: "male" });
    const after = (await readProfile(db, userId))!.onboardingStartedAt;

    expect(after!.getTime()).toBe(before!.getTime());
  });

  it("finishes onboarding even with answers still blank", async () => {
    const row = await completeOnboarding(db, userId);
    expect(row.onboardingCompletedAt).not.toBeNull();
    // Skipping every question is an answer about being asked, not about height.
    expect(row.birthDate).toBeNull();
  });

  it("writes one profile per user and never touches another's", async () => {
    await saveProfile(db, otherUserId, { heightCm: 160, goal: "gain" });

    const mine = await readProfile(db, userId);
    const theirs = await readProfile(db, otherUserId);

    expect(mine!.heightCm).toBe(180);
    expect(theirs!.heightCm).toBe(160);
    expect(theirs!.goal).toBe("gain");
  });

  it("hushes the prompt for a fortnight of the reader's own days", async () => {
    const until = await dismissProfilePrompt(db, userId, "Pacific/Auckland");

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Pacific/Auckland",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const days = Math.round(
      (Date.parse(`${until}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
    );

    expect(days).toBe(PROMPT_DISMISSAL_DAYS);
  });
});

describe("trend weight", () => {
  const userId = `test-trend-${randomUUID()}`;
  const { client: trendClient, db: trendDb } = openTestDatabase();

  beforeAll(async () => {
    await trendDb.insert(schema.user).values({
      id: userId,
      name: "Trend test fixture",
      email: `${userId}@example.invalid`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterAll(async () => {
    await trendDb.delete(schema.user).where(eq(schema.user.id, userId));
    await trendClient.end();
  });

  it("is null with no weigh-ins at all", async () => {
    const weight = await trendWeight(trendDb, userId, "UTC");
    expect(weight.trend).toBeNull();
    expect(weight.samples).toBe(0);
    expect(weight.latest).toBeNull();
  });

  it("averages the trailing week rather than reading the latest", async () => {
    await logBodyweight(trendDb, userId, { loggedOn: utcDay(6), weight: 80, note: null });
    await logBodyweight(trendDb, userId, { loggedOn: utcDay(3), weight: 82, note: null });
    await logBodyweight(trendDb, userId, { loggedOn: utcDay(0), weight: 84, note: "morning" });

    const weight = await trendWeight(trendDb, userId, "UTC");

    expect(weight.samples).toBe(3);
    expect(weight.trend).toBeCloseTo(82, 6);
    // The latest reading is two kilos above the trend, and the targets use the
    // trend. That gap is the entire reason this function exists.
    expect(weight.latest).toEqual({ day: utcDay(0), weight: 84, note: "morning" });
  });

  it("ignores weigh-ins older than the window but still reports the last one", async () => {
    const stale = `test-stale-${randomUUID()}`;
    await trendDb.insert(schema.user).values({
      id: stale,
      name: "Stale fixture",
      email: `${stale}@example.invalid`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await logBodyweight(trendDb, stale, { loggedOn: utcDay(30), weight: 90, note: null });

    const weight = await trendWeight(trendDb, stale, "UTC");

    // A month-old weigh-in is not what someone weighs, so there is no trend and
    // no calorie target — but the screen can still say how stale it is.
    expect(weight.trend).toBeNull();
    expect(weight.samples).toBe(0);
    expect(weight.latest!.day).toBe(utcDay(30));

    await trendDb.delete(schema.user).where(eq(schema.user.id, stale));
  });

  it("builds the summary from the trend, not the last reading", async () => {
    await saveProfile(trendDb, userId, {
      heightCm: 180,
      sex: "male",
      birthDate: "1996-01-01",
      activityLevel: "moderate",
      goal: "maintain",
    });

    const summary = await profileSummary(trendDb, userId, "UTC");
    const inputs: ProfileInputs = {
      ...FIXTURE,
      goal: "maintain",
      targetRateKg: null,
    };

    expect(summary.targets.weightKg).toBeCloseTo(82, 6);
    expect(summary.targets.missing).toEqual([]);
    expect(summary.onboarded).toBe(false);
    // The whole point of the trend: the target is the one for the 82 kg
    // average, not the one for the 84 kg the scale said this morning.
    expect(summary.targets.calories).toBe(bodyTargets(inputs, 82).calories);
    expect(summary.targets.calories).not.toBe(bodyTargets(inputs, 84).calories);
  });
});
