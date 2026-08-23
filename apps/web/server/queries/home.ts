import { sql } from "drizzle-orm";

import type { DbClient } from "@/db";
import { BODYWEIGHT_TREND_DAYS } from "@/lib/math";
import { MUSCLES, type MuscleSlug } from "@/lib/muscles";
import { startableDays, type StartableDay } from "./plan";
import "@tanstack/react-start/server-only";

/**
 * The window Home means by "this week".
 *
 * Trailing seven days rather than the calendar week, because every other window
 * in the app is trailing and a Monday morning that reads "0 sets" would be
 * telling the truth in a way nobody wants at 6am. It is fixed rather than
 * selectable: Home answers today's question, and the screens that own these
 * numbers are where you go to change the window.
 */
export const HOME_WEEK_DAYS = 7;

export type HomeWeek = {
  days: number;
  /** Working sets only. Warm-ups are logged, not counted. */
  workingSets: number;
  tonnage: number;
  /** Distinct workouts the sets came from, so one big day cannot read as four. */
  sessions: number;
  /** Muscles with no working set in the window, in the canonical order. */
  untrained: { slug: MuscleSlug; displayName: string }[];
};

export type HomeWeight = {
  /** The seven-day mean. The same figure every calorie target is computed from. */
  trend: number | null;
  /** That mean one week earlier, or null when the week before has no weigh-ins. */
  previousTrend: number | null;
  /**
   * `trend - previousTrend`, in kilograms a week, signed.
   *
   * Trend against trend, and a week apart, so it is directly comparable to the
   * rate the profile is aiming at. Comparing two weigh-ins would report a
   * morning's water as a fortnight of progress.
   */
  changeKg: number | null;
  latest: { day: string; weight: number } | null;
};

export type HomeSummary = {
  /** The workout in progress, if there is one. Home leads with it. */
  active: { id: string; startedAt: Date } | null;
  /** The day the rotation puts next, or null when there is no usable routine. */
  nextDay: StartableDay | null;
  /** Whether rest is already recorded for the caller's own calendar day. */
  restLoggedToday: boolean;
  week: HomeWeek;
  weight: HomeWeight;
};

type SummaryRow = {
  working_sets: number;
  tonnage: number;
  sessions: number;
  trained_slugs: string[] | null;
  active_id: string | null;
  active_started_at: Date | null;
  rest_session_id: string | null;
  trend: number | null;
  previous_trend: number | null;
  latest_day: string | null;
  latest_weight: number | null;
};

/**
 * Everything Home draws, in one call.
 *
 * Two statements, run together rather than one after the other. The rotation is
 * `startableDays` — the same query Train reads, reused rather than rewritten, so
 * the day Home offers to start is by construction the day Train puts at the top
 * of its list. Folding it into the statement below would be a second copy of it
 * that could drift.
 *
 * Nothing about the profile is here. Calories and protein come from
 * `profile.get`, which Home reads alongside this and which every other screen
 * already shares: a second copy of the targets on this response would be one
 * the profile's own writes could not patch, and Home would go stale the moment
 * someone edited their goal.
 */
export async function homeSummary(
  db: DbClient,
  userId: string,
  timeZone: string,
): Promise<HomeSummary> {
  const [{ rows }, rotation] = await Promise.all([
    db.execute<SummaryRow>(sql`
      with span as (
        select (now() at time zone ${timeZone})::date as today
      ),
      week_sets as (
        select s.session_id, s.exercise_id, s.weight, s.reps
        from sets s
        join workout_sessions ws on ws.id = s.session_id
        where ws.user_id = ${userId}
          and s.is_warmup = false
          and s.performed_at >= now() - make_interval(days => ${HOME_WEEK_DAYS})
      ),
      volume as (
        select
          count(*)::int as working_sets,
          coalesce(sum(weight * reps), 0)::float8 as tonnage,
          count(distinct session_id)::int as sessions
        from week_sets
      ),
      -- Slugs that saw any work at all. Which muscles are missing is worked out
      -- against the canonical list in code, so an untrained region cannot be
      -- omitted here by an absent row.
      trained as (
        select coalesce(array_agg(distinct m.slug), '{}') as slugs
        from week_sets w
        join exercise_muscles em on em.exercise_id = w.exercise_id
        join muscles m on m.id = em.muscle_id
      ),
      active as (
        select id, started_at
        from workout_sessions
        where user_id = ${userId} and ended_at is null
        limit 1
      ),
      rest_today as (
        select ws.id
        from workout_sessions ws
        cross join span
        where ws.user_id = ${userId}
          and ws.kind = 'rest'
          and (ws.started_at at time zone ${timeZone})::date = span.today
        limit 1
      ),
      -- Two non-overlapping weeks in one pass. The first filter is the same
      -- window profileSummary averages, so the trend Home shows and the trend
      -- the targets are built on are the same number.
      weight as (
        select
          avg(b.weight) filter (
            where b.logged_on > span.today - make_interval(days => ${BODYWEIGHT_TREND_DAYS})
          )::float8 as trend,
          avg(b.weight) filter (
            where b.logged_on <= span.today - make_interval(days => ${BODYWEIGHT_TREND_DAYS})
          )::float8 as previous_trend
        from bodyweight_logs b
        cross join span
        where b.user_id = ${userId}
          and b.logged_on <= span.today
          and b.logged_on > span.today - make_interval(days => ${BODYWEIGHT_TREND_DAYS * 2})
      ),
      latest as (
        select to_char(b.logged_on, 'YYYY-MM-DD') as day, b.weight::float8 as weight
        from bodyweight_logs b
        cross join span
        where b.user_id = ${userId} and b.logged_on <= span.today
        order by b.logged_on desc
        limit 1
      )
      select
        volume.working_sets,
        volume.tonnage,
        volume.sessions,
        trained.slugs as trained_slugs,
        active.id as active_id,
        active.started_at as active_started_at,
        rest_today.id as rest_session_id,
        weight.trend,
        weight.previous_trend,
        latest.day as latest_day,
        latest.weight as latest_weight
      from volume
      cross join trained
      cross join weight
      left join active on true
      left join rest_today on true
      left join latest on true
    `),
    startableDays(db, userId),
  ]);

  const row = rows[0];
  const trained = new Set(row?.trained_slugs ?? []);
  const trend = row?.trend ?? null;
  const previousTrend = row?.previous_trend ?? null;

  return {
    active:
      row?.active_id && row.active_started_at
        ? { id: row.active_id, startedAt: new Date(row.active_started_at) }
        : null,
    nextDay: rotation[0] ?? null,
    restLoggedToday: row?.rest_session_id != null,
    week: {
      days: HOME_WEEK_DAYS,
      workingSets: Number(row?.working_sets ?? 0),
      tonnage: row?.tonnage ?? 0,
      sessions: Number(row?.sessions ?? 0),
      untrained: MUSCLES.filter((muscle) => !trained.has(muscle.slug)).map((muscle) => ({
        slug: muscle.slug,
        displayName: muscle.displayName,
      })),
    },
    weight: {
      trend,
      previousTrend,
      changeKg: trend !== null && previousTrend !== null ? trend - previousTrend : null,
      latest:
        row?.latest_day && row.latest_weight !== null
          ? { day: row.latest_day, weight: row.latest_weight }
          : null,
    },
  };
}
