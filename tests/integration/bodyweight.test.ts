import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "../../db/schema";
import {
  bodyweightSeries,
  logBodyweight,
  removeBodyweight,
  TREND_LEAD_IN_DAYS,
} from "../../server/queries/bodyweight";
import { openTestDatabase } from "./database";

const { client, db } = openTestDatabase();
const userId = `test-bodyweight-${randomUUID()}`;
const otherUserId = `test-bodyweight-other-${randomUUID()}`;

/**
 * Days are built in UTC and read back in UTC, so the hand-worked numbers below
 * do not move depending on what the clock says where this runs. The one test
 * that cares about zones asks for another one explicitly.
 */
function utcDate(daysAgo: number, hour = 12): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

const utcDay = (daysAgo: number) => utcDate(daysAgo).toISOString().slice(0, 10);

const dayIn = (zone: string, date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

/**
 * Five weigh-ins, two of them before the seven-day window starts.
 *
 * The pair at nine and eight days back is the whole point of the lead-in: they
 * are never drawn, but they belong to the trailing week of the first day that
 * is, and leaving them out would put the line's first point a kilo high and
 * report a rise that never happened.
 */
const WEIGH_INS: [daysAgo: number, weight: number][] = [
  [9, 80],
  [8, 81],
  [6, 82],
  [3, 84],
  [1, 83],
];

/** Hand-worked seven-day means for each day of the 7-day window, oldest first. */
const EXPECTED_TREND = [81, 81, 81, 81.75, (81 + 82 + 84) / 3, 83, 83];

const EVENING_SET = { daysAgo: 5, hour: 22, weight: 50, reps: 10 };

describe("bodyweight series", () => {
  let week: Awaited<ReturnType<typeof bodyweightSeries>>;
  let month: Awaited<ReturnType<typeof bodyweightSeries>>;

  beforeAll(async () => {
    for (const id of [userId, otherUserId]) {
      await db.insert(schema.user).values({
        id,
        name: "Bodyweight test fixture",
        email: `${id}@example.invalid`,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    for (const [daysAgo, weight] of WEIGH_INS) {
      await logBodyweight(db, userId, { loggedOn: utcDay(daysAgo), weight, note: null });
    }

    // Someone else's weigh-in, on a day this user has none.
    await logBodyweight(db, otherUserId, { loggedOn: utcDay(0), weight: 55, note: null });

    const sessionId = randomUUID();
    await db.insert(schema.workoutSessions).values({
      id: sessionId,
      userId,
      startedAt: utcDate(20),
      endedAt: utcDate(20),
    });

    const [exercise] = await db
      .insert(schema.exercises)
      .values({
        name: `Bodyweight fixture press ${userId}`,
        slug: `bodyweight-fixture-${userId}`,
        ownerId: userId,
      })
      .returning();

    let setIndex = 0;
    const logSet = async (
      daysAgo: number,
      weight: number,
      reps: number,
      isWarmup: boolean,
      hour = 12,
    ) => {
      const at = utcDate(daysAgo, hour);
      await db.insert(schema.sets).values({
        id: randomUUID(),
        sessionId,
        exerciseId: exercise.id,
        setIndex: setIndex++,
        weight,
        reps,
        isWarmup,
        performedAt: at,
        clientCreatedAt: at,
      });
    };

    // 1,500 kg of working tonnage three days back, behind a warm-up that must
    // not count toward any of it.
    await logSet(3, 60, 5, true);
    for (let index = 0; index < 3; index += 1) await logSet(3, 100, 5, false);
    for (let index = 0; index < 2; index += 1) await logSet(1, 140, 3, false);
    // Late enough in the day that it belongs to tomorrow east of UTC.
    await logSet(
      EVENING_SET.daysAgo,
      EVENING_SET.weight,
      EVENING_SET.reps,
      false,
      EVENING_SET.hour,
    );
    // Outside the seven-day window, inside the thirty.
    await logSet(20, 100, 5, false);

    week = await bodyweightSeries(db, userId, 7, "UTC");
    month = await bodyweightSeries(db, userId, 30, "UTC");
  });

  afterAll(async () => {
    await db.delete(schema.workoutSessions).where(eq(schema.workoutSessions.userId, userId));
    await db.delete(schema.exercises).where(eq(schema.exercises.ownerId, userId));
    for (const id of [userId, otherUserId]) {
      await db.delete(schema.user).where(eq(schema.user.id, id));
    }
    await client.end();
  });

  it("returns one row per day of the window, oldest first", () => {
    expect(week.points).toHaveLength(7);
    expect(week.points.map((point) => point.day)).toEqual([6, 5, 4, 3, 2, 1, 0].map(utcDay));
    expect(month.points).toHaveLength(30);
  });

  it("keeps the raw weigh-ins, and only on the days they happened", () => {
    const byDay = new Map(week.points.map((point) => [point.day, point.weight]));

    expect(byDay.get(utcDay(6))).toBe(82);
    expect(byDay.get(utcDay(3))).toBe(84);
    expect(byDay.get(utcDay(1))).toBe(83);
    expect(byDay.get(utcDay(5))).toBeNull();
    expect(byDay.get(utcDay(0))).toBeNull();
    expect(week.weighIns).toBe(3);
    expect(week.latest).toEqual({ day: utcDay(1), weight: 83 });
  });

  it("averages the trailing week, reaching back before the window to do it", () => {
    week.points.forEach((point, index) => {
      expect(point.trend).toBeCloseTo(EXPECTED_TREND[index]);
    });

    // Without the lead-in the first point would be 82: that day's weigh-in
    // averaged with nothing, sloping the start of the line toward the end of it.
    expect(week.points[0].trend).toBeCloseTo(81);
    expect(week.points[0].trendSamples).toBe(3);
    expect(TREND_LEAD_IN_DAYS).toBe(6);
  });

  it("carries the average across days with no weigh-in", () => {
    const quiet = week.points.find((point) => point.day === utcDay(5))!;

    expect(quiet.weight).toBeNull();
    expect(quiet.trend).toBeCloseTo(81);
  });

  it("has no average before the first weigh-in", () => {
    const early = month.points.find((point) => point.day === utcDay(29))!;

    expect(early.trend).toBeNull();
    expect(early.trendSamples).toBe(0);
  });

  it("reports change as average against average", () => {
    // Raw last minus raw first is 83 - 82 = 1, which is a day of water. The
    // average has moved two kilos, and that is the thing that happened.
    expect(week.trendNow).toBeCloseTo(83);
    expect(week.trendChange).toBeCloseTo(2);
  });

  it("counts working tonnage per day and leaves warm-ups out", () => {
    const byDay = new Map(week.points.map((point) => [point.day, point.tonnage]));

    // 3 x 100 x 5, with the 60 kg warm-up excluded.
    expect(byDay.get(utcDay(3))).toBeCloseTo(1_500);
    expect(byDay.get(utcDay(1))).toBeCloseTo(840);
    expect(byDay.get(utcDay(4))).toBe(0);
    expect(byDay.get(utcDay(EVENING_SET.daysAgo))).toBeCloseTo(500);
  });

  it("excludes older training from the short window and includes it in the long one", () => {
    expect(week.tonnage).toBeCloseTo(2_840);
    expect(month.tonnage).toBeCloseTo(3_340);
  });

  it("buckets sets by the caller's day, not the server's", async () => {
    const evening = utcDate(EVENING_SET.daysAgo, EVENING_SET.hour);
    const kolkata = await bodyweightSeries(db, userId, 7, "Asia/Kolkata");
    const byDay = new Map(kolkata.points.map((point) => [point.day, point.tonnage]));
    const tonnage = EVENING_SET.weight * EVENING_SET.reps;

    // 22:00 UTC is half past three the next morning in Kolkata, so the bar
    // belongs to that morning rather than to the night before it.
    expect(dayIn("Asia/Kolkata", evening)).not.toBe(utcDay(EVENING_SET.daysAgo));
    expect(byDay.get(dayIn("Asia/Kolkata", evening))).toBeCloseTo(tonnage);
    expect(byDay.get(utcDay(EVENING_SET.daysAgo)) ?? 0).toBe(0);
  });

  it("shows nobody else's weigh-ins", () => {
    expect(week.points.find((point) => point.day === utcDay(0))?.weight).toBeNull();
    expect(week.weighIns).toBe(3);
  });
});

describe("bodyweight writes", () => {
  const writerId = `test-bodyweight-writer-${randomUUID()}`;
  const { client: writerClient, db: writerDb } = openTestDatabase();

  beforeAll(async () => {
    await writerDb.insert(schema.user).values({
      id: writerId,
      name: "Bodyweight write fixture",
      email: `${writerId}@example.invalid`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterAll(async () => {
    await writerDb.delete(schema.user).where(eq(schema.user.id, writerId));
    await writerClient.end();
  });

  it("keeps one weigh-in per day, with the last reading winning", async () => {
    const day = utcDay(0);

    await logBodyweight(writerDb, writerId, { loggedOn: day, weight: 81.4, note: null });
    const second = await logBodyweight(writerDb, writerId, {
      loggedOn: day,
      weight: 81.9,
      note: "after coffee",
    });

    const rows = await writerDb
      .select()
      .from(schema.bodyweightLogs)
      .where(eq(schema.bodyweightLogs.userId, writerId));

    expect(rows).toHaveLength(1);
    expect(rows[0].weight).toBeCloseTo(81.9);
    expect(rows[0].note).toBe("after coffee");
    // Upserted in place, so a retry after a timeout cannot make a second row.
    expect(second.id).toBe(rows[0].id);
  });

  it("deletes a weigh-in, and says so when there was none", async () => {
    const day = utcDay(0);

    expect(await removeBodyweight(writerDb, writerId, day)).toBe(true);
    expect(await removeBodyweight(writerDb, writerId, day)).toBe(false);
  });
});
