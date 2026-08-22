import { eq, sql } from "drizzle-orm";

import type { DbClient } from "@/db";
import { userProfiles, type UserProfile } from "@/db/schema";
import type { ProfilePatch } from "@/db/validators";
import { BODYWEIGHT_TREND_DAYS } from "@/lib/math";
import { bodyTargets, promptDismissedUntil, type BodyTargets } from "@/lib/nutrition";
import "@tanstack/react-start/server-only";

/** An unwritten profile and an all-null profile mean the same thing to every reader. */
const EMPTY_PROFILE: ProfileInputsRow = {
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

type ProfileInputsRow = Pick<
  UserProfile,
  | "heightCm"
  | "sex"
  | "birthDate"
  | "activityLevel"
  | "goal"
  | "targetRateKg"
  | "proteinPerKg"
  | "fatPerKg"
  | "calorieOverride"
>;

/**
 * The profile as JSON sees it: dates and timestamps arrive as strings, and the
 * three timestamp columns have to be given back their type on the way out.
 */
type JsonProfile = {
  user_id: string;
  height_cm: number | null;
  sex: UserProfile["sex"];
  birth_date: string | null;
  activity_level: UserProfile["activityLevel"];
  goal: UserProfile["goal"];
  target_rate_kg: number | null;
  protein_per_kg: number | null;
  fat_per_kg: number | null;
  calorie_override: number | null;
  onboarding_started_at: string | null;
  onboarding_completed_at: string | null;
  prompt_dismissed_until: string | null;
  updated_at: string;
};

function fromJsonProfile(row: JsonProfile): UserProfile {
  return {
    userId: row.user_id,
    heightCm: row.height_cm,
    sex: row.sex,
    birthDate: row.birth_date,
    activityLevel: row.activity_level,
    goal: row.goal,
    targetRateKg: row.target_rate_kg,
    proteinPerKg: row.protein_per_kg,
    fatPerKg: row.fat_per_kg,
    calorieOverride: row.calorie_override,
    onboardingStartedAt:
      row.onboarding_started_at === null ? null : new Date(row.onboarding_started_at),
    onboardingCompletedAt:
      row.onboarding_completed_at === null ? null : new Date(row.onboarding_completed_at),
    promptDismissedUntil: row.prompt_dismissed_until,
    updatedAt: new Date(row.updated_at),
  };
}

export async function readProfile(db: DbClient, userId: string): Promise<UserProfile | null> {
  const [row] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
  return row ?? null;
}

/**
 * Upserts whatever the caller knows and leaves the rest alone.
 *
 * Each onboarding step writes on its own, so a patch that only carries a height
 * must not blank the goal saved two steps earlier. Keys the caller omitted are
 * dropped here; an explicit null is kept, because clearing a field from the
 * edit sheet is a real thing to want.
 *
 * `onboardingStartedAt` is set by the insert and never by the update, so the
 * first answer stamps it and nothing after that moves it.
 */
export async function saveProfile(
  db: DbClient,
  userId: string,
  patch: ProfilePatch,
): Promise<UserProfile> {
  const changes = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as ProfilePatch;

  const [row] = await db
    .insert(userProfiles)
    .values({ userId, ...changes, onboardingStartedAt: new Date() })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      // `updatedAt` is restated because `$onUpdate` only fires on a Drizzle
      // `update()`, and this is an insert that happens to conflict.
      set: { ...changes, updatedAt: new Date() },
    })
    .returning();

  return row;
}

/** Stamps the wizard as finished. Skipping every step still counts as finished. */
export async function completeOnboarding(db: DbClient, userId: string): Promise<UserProfile> {
  const now = new Date();
  const [row] = await db
    .insert(userProfiles)
    .values({ userId, onboardingStartedAt: now, onboardingCompletedAt: now })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: { onboardingCompletedAt: now, updatedAt: now },
    })
    .returning();

  return row;
}

/**
 * Two weeks of quiet, counted from the reader's own today.
 *
 * The date is worked out in the caller's zone rather than the server's, because
 * someone dismissing a prompt at 11pm in Auckland has not asked for thirteen
 * days and an hour.
 */
export async function dismissProfilePrompt(
  db: DbClient,
  userId: string,
  timeZone: string,
): Promise<string> {
  const { rows } = await db.execute<{ today: string }>(
    sql`select to_char((now() at time zone ${timeZone})::date, 'YYYY-MM-DD') as today`,
  );
  const until = promptDismissedUntil(new Date(`${rows[0].today}T00:00:00`));
  const now = new Date();

  await db
    .insert(userProfiles)
    .values({ userId, promptDismissedUntil: until, onboardingStartedAt: now })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: { promptDismissedUntil: until, updatedAt: now },
    });

  return until;
}

export type TrendWeight = {
  /** Mean of the weigh-ins in the trailing week, or null if there were none. */
  trend: number | null;
  samples: number;
  /**
   * The most recent weigh-in at any age, so a stale profile can say how stale.
   *
   * Carries its note because the Body screen opens this row for editing, and a
   * round trip that dropped the note would quietly delete it on save.
   */
  latest: { day: string; weight: number; note: string | null } | null;
};

/**
 * The weight every calorie calculation runs on.
 *
 * The trend, not the last reading. Bodyweight swings a kilo either way on
 * water alone, and a target rebuilt off this morning's number would move by a
 * hundred calories for reasons that have nothing to do with the person. The
 * bodyweight chart already draws this average; this is the same window asked
 * for as a single number.
 *
 * Deliberately null when the week is empty rather than reaching further back.
 * A three-week-old weigh-in is not what someone weighs, and saying so is more
 * use than a stale target nobody can tell is stale.
 */
export async function trendWeight(
  db: DbClient,
  userId: string,
  timeZone: string,
): Promise<TrendWeight> {
  const { rows } = await db.execute<{
    trend: number | null;
    samples: number;
    latest_day: string | null;
    latest_weight: number | null;
    latest_note: string | null;
  }>(sql`
    with span as (
      select (now() at time zone ${timeZone})::date as today
    ),
    week as (
      select avg(b.weight)::float8 as trend, count(*)::int as samples
      from bodyweight_logs b
      cross join span
      where b.user_id = ${userId}
        and b.logged_on <= span.today
        and b.logged_on > span.today - make_interval(days => ${BODYWEIGHT_TREND_DAYS})
    ),
    latest as (
      select to_char(b.logged_on, 'YYYY-MM-DD') as day, b.weight::float8 as weight, b.note
      from bodyweight_logs b
      cross join span
      where b.user_id = ${userId} and b.logged_on <= span.today
      order by b.logged_on desc
      limit 1
    )
    select
      week.trend,
      week.samples,
      latest.day as latest_day,
      latest.weight as latest_weight,
      latest.note as latest_note
    from week
    left join latest on true
  `);

  const row = rows[0];
  return {
    trend: row?.trend ?? null,
    samples: Number(row?.samples ?? 0),
    latest:
      row?.latest_day && row.latest_weight !== null
        ? { day: row.latest_day, weight: row.latest_weight, note: row.latest_note }
        : null,
  };
}

export type ProfileSummary = {
  profile: UserProfile | null;
  weight: TrendWeight;
  targets: BodyTargets;
  /**
   * Whether the wizard has been through, so the Body screen knows the
   * difference between an account that skipped the questions and one that has
   * never been asked.
   */
  onboarded: boolean;
  /** "YYYY-MM-DD" or null. The prompt stays hidden until this day passes. */
  promptDismissedUntil: string | null;
};

/**
 * Everything the Body screen and the profile prompt read, in one call.
 *
 * The profile row and the trend are pulled together rather than left to two
 * queries, because every number on the screen is a function of both and a
 * screen that renders a BMI from one and a calorie target from the other is a
 * screen that can contradict itself for a frame.
 *
 * One statement rather than two concurrent ones. Two would each need a
 * connection, and this is read on the first paint of three different screens —
 * exactly where a pool is tightest and a queued read is a visible delay.
 */
export async function profileSummary(
  db: DbClient,
  userId: string,
  timeZone: string,
): Promise<ProfileSummary> {
  const { rows } = await db.execute<{
    profile: JsonProfile | null;
    trend: number | null;
    samples: number;
    latest_day: string | null;
    latest_weight: number | null;
    latest_note: string | null;
  }>(sql`
    with span as (
      select (now() at time zone ${timeZone})::date as today
    ),
    week as (
      select avg(b.weight)::float8 as trend, count(*)::int as samples
      from bodyweight_logs b
      cross join span
      where b.user_id = ${userId}
        and b.logged_on <= span.today
        and b.logged_on > span.today - make_interval(days => ${BODYWEIGHT_TREND_DAYS})
    ),
    latest as (
      select to_char(b.logged_on, 'YYYY-MM-DD') as day, b.weight::float8 as weight, b.note
      from bodyweight_logs b
      cross join span
      where b.user_id = ${userId} and b.logged_on <= span.today
      order by b.logged_on desc
      limit 1
    ),
    profile as (
      select * from user_profiles where user_id = ${userId}
    )
    select
      (select to_jsonb(profile) from profile) as profile,
      week.trend,
      week.samples,
      latest.day as latest_day,
      latest.weight as latest_weight,
      latest.note as latest_note
    from week
    left join latest on true
  `);

  const row = rows[0];
  const profile = row?.profile ? fromJsonProfile(row.profile) : null;
  const weight: TrendWeight = {
    trend: row?.trend ?? null,
    samples: Number(row?.samples ?? 0),
    latest:
      row?.latest_day && row.latest_weight !== null
        ? { day: row.latest_day, weight: row.latest_weight, note: row.latest_note }
        : null,
  };

  return {
    profile,
    weight,
    targets: bodyTargets(profile ?? EMPTY_PROFILE, weight.trend),
    onboarded: profile?.onboardingCompletedAt != null,
    promptDismissedUntil: profile?.promptDismissedUntil ?? null,
  };
}
