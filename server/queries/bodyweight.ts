import { and, eq, sql } from "drizzle-orm";

import type { DbClient } from "@/db";
import { bodyweightLogs } from "@/db/schema";
import type { BodyweightLogInput } from "@/db/validators";
import { BODYWEIGHT_TREND_DAYS } from "@/lib/math";

/**
 * How far back of extra history the trend line needs before the window starts.
 *
 * Without it the first six points of every chart would be averages of a partial
 * window, which slope toward the true line and read as a change in bodyweight
 * that never happened. The lead-in is fetched, used, and then trimmed off, so
 * the first visible point is a full seven-day average like every other one.
 */
export const TREND_LEAD_IN_DAYS = BODYWEIGHT_TREND_DAYS - 1;

export type BodyweightPoint = {
  /** "YYYY-MM-DD" in the caller's own time zone. */
  day: string;
  /** The weigh-in, if there was one that day. Most days there isn't. */
  weight: number | null;
  note: string | null;
  /** Mean of the weigh-ins in the trailing seven days. Null before the first one. */
  trend: number | null;
  /** How many weigh-ins that mean is over. One is not an average. */
  trendSamples: number;
  /** Working-set tonnage for the day, in kilograms. Zero on a rest day. */
  tonnage: number;
};

export type BodyweightSeries = {
  points: BodyweightPoint[];
  /** The most recent weigh-in in the window, which is what the card leads with. */
  latest: { day: string; weight: number } | null;
  /** The trend on the last day of the window, or null before the first weigh-in. */
  trendNow: number | null;
  /**
   * Trend at the end of the window minus trend at the start of it.
   *
   * Trend against trend, never raw against raw: comparing the first and last
   * weigh-in makes a normal day's water swing look like a fortnight of
   * progress, in whichever direction the noise happened to fall.
   */
  trendChange: number | null;
  weighIns: number;
  /** Total working tonnage over the window, the other half of the overlay. */
  tonnage: number;
};

/**
 * The bodyweight chart, in one query: a row per calendar day with the weigh-in,
 * its seven-day rolling average, and that day's training tonnage.
 *
 * Dense rather than one row per weigh-in, because the two series are read
 * against each other and a gap on a rest day is a fact about the training, not
 * a missing point to interpolate through.
 *
 * The zone is the caller's. Bodyweight is a `date` and already local, but sets
 * are timestamps, and bucketing those in UTC would slide an evening workout
 * onto the next bar for everyone west of it.
 */
export async function bodyweightSeries(
  db: DbClient,
  userId: string,
  days: number,
  timeZone: string,
): Promise<BodyweightSeries> {
  const { rows } = await db.execute<{
    day: string;
    weight: number | null;
    note: string | null;
    trend: number | null;
    trend_samples: number;
    tonnage: number;
  }>(sql`
    with span as (
      select
        (now() at time zone ${timeZone})::date as end_day,
        ((now() at time zone ${timeZone})::date - make_interval(days => ${days - 1}))::date
          as start_day,
        ((now() at time zone ${timeZone})::date
          - make_interval(days => ${days - 1 + TREND_LEAD_IN_DAYS}))::date as lead_day
    ),
    calendar as (
      select generate_series(span.lead_day, span.end_day, interval '1 day')::date as day
      from span
    ),
    weights as (
      select b.logged_on, b.weight, b.note
      from bodyweight_logs b
      cross join span
      where b.user_id = ${userId}
        and b.logged_on between span.lead_day and span.end_day
    ),
    tonnage as (
      select (s.performed_at at time zone ${timeZone})::date as day,
             sum(s.weight * s.reps)::float8 as tonnage
      from sets s
      join workout_sessions ws on ws.id = s.session_id
      cross join span
      where ws.user_id = ${userId}
        and s.is_warmup = false
        and s.performed_at >= span.lead_day::timestamp at time zone ${timeZone}
        and s.performed_at < (span.end_day + 1)::timestamp at time zone ${timeZone}
      group by 1
    ),
    joined as (
      select c.day, w.weight, w.note, coalesce(t.tonnage, 0) as tonnage
      from calendar c
      left join weights w on w.logged_on = c.day
      left join tonnage t on t.day = c.day
    ),
    trended as (
      select
        day, weight, note, tonnage,
        -- avg() and count() both skip nulls, so a day with no weigh-in still
        -- carries the average of the ones around it and the line stays whole.
        avg(weight) over trailing_week as trend,
        count(weight) over trailing_week as trend_samples
      from joined
      window trailing_week as (
        order by day
        range between make_interval(days => ${TREND_LEAD_IN_DAYS}) preceding and current row
      )
    )
    select
      to_char(trended.day, 'YYYY-MM-DD') as day,
      trended.weight::float8 as weight,
      trended.note as note,
      trended.trend::float8 as trend,
      trended.trend_samples::int as trend_samples,
      trended.tonnage::float8 as tonnage
    from trended
    cross join span
    where trended.day >= span.start_day
    order by trended.day
  `);

  const points: BodyweightPoint[] = rows.map((row) => ({
    day: row.day,
    weight: row.weight,
    note: row.note,
    trend: row.trend,
    trendSamples: Number(row.trend_samples ?? 0),
    tonnage: row.tonnage ?? 0,
  }));

  const weighed = points.filter((point) => point.weight !== null);
  const trended = points.filter((point) => point.trend !== null);
  const latest = weighed.at(-1);
  const firstTrend = trended.at(0);
  const lastTrend = trended.at(-1);

  return {
    points,
    latest: latest ? { day: latest.day, weight: latest.weight! } : null,
    trendNow: lastTrend?.trend ?? null,
    // One trend point is one weigh-in seen twice, not a change worth reporting.
    trendChange:
      firstTrend && lastTrend && firstTrend !== lastTrend
        ? lastTrend.trend! - firstTrend.trend!
        : null,
    weighIns: weighed.length,
    tonnage: points.reduce((total, point) => total + point.tonnage, 0),
  };
}

/**
 * One weigh-in per day, upserted on the natural key.
 *
 * Weighing yourself twice in a morning is normal and the second reading is the
 * one you meant, so a repeat is a correction rather than a conflict. It also
 * makes the write idempotent for free: a retry after a timeout can only ever
 * restate the same day.
 */
export async function logBodyweight(
  db: DbClient,
  userId: string,
  input: BodyweightLogInput,
): Promise<typeof bodyweightLogs.$inferSelect> {
  const [row] = await db
    .insert(bodyweightLogs)
    .values({
      userId,
      loggedOn: input.loggedOn,
      weight: input.weight,
      note: input.note,
    })
    .onConflictDoUpdate({
      target: [bodyweightLogs.userId, bodyweightLogs.loggedOn],
      set: { weight: input.weight, note: input.note },
    })
    .returning();

  return row;
}

/** Deletes a weigh-in by its day. Returns false when there was nothing to delete. */
export async function removeBodyweight(
  db: DbClient,
  userId: string,
  loggedOn: string,
): Promise<boolean> {
  const deleted = await db
    .delete(bodyweightLogs)
    .where(and(eq(bodyweightLogs.userId, userId), eq(bodyweightLogs.loggedOn, loggedOn)))
    .returning({ id: bodyweightLogs.id });

  return deleted.length > 0;
}
