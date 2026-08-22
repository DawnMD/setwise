import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "../../db/schema";
import {
  addDays,
  archiveHabit,
  createHabit,
  deleteHabit,
  habitCalendar,
  habitHome,
  habitList,
  localToday,
  renameHabit,
  setHabitToday,
} from "../../server/queries/habits";
import { openTestDatabase } from "./database";

const { client, db } = openTestDatabase();
const writerId = `test-habits-writer-${randomUUID()}`;
const statsId = `test-habits-stats-${randomUUID()}`;
const calendarId = `test-habits-calendar-${randomUUID()}`;
const otherId = `test-habits-other-${randomUUID()}`;
const emptyId = `test-habits-empty-${randomUUID()}`;

async function addUser(id: string) {
  await db.insert(schema.user).values({
    id,
    name: "Habit test fixture",
    email: `${id}@example.invalid`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function addHabit(
  userId: string,
  values: { name: string; startsOn: string; archivedOn?: string | null },
) {
  const [habit] = await db
    .insert(schema.habits)
    .values({ userId, archivedOn: null, ...values })
    .returning();
  return habit;
}

async function complete(habitId: string, ...days: string[]) {
  if (days.length === 0) return;
  await db
    .insert(schema.habitCompletions)
    .values(days.map((completedOn) => ({ habitId, completedOn })));
}

describe("habit tracking", () => {
  beforeAll(async () => {
    await Promise.all([writerId, statsId, calendarId, otherId, emptyId].map(addUser));
  });

  afterAll(async () => {
    for (const id of [writerId, statsId, calendarId, otherId, emptyId]) {
      await db.delete(schema.user).where(eq(schema.user.id, id));
    }
    await client.end();
  });

  it("returns dense empty-account shapes with null rates", async () => {
    const today = await localToday(db, "UTC");
    const home = await habitHome(db, emptyId, "UTC");
    const list = await habitList(db, emptyId, "UTC");
    const calendar = await habitCalendar(db, emptyId, today.slice(0, 7), "UTC");

    expect(home.today).toBe(today);
    expect(home.habits).toEqual([]);
    expect(home.trend).toHaveLength(30);
    expect(
      home.trend.every((point) => point.dailyRate === null && point.sevenDayRate === null),
    ).toBe(true);
    expect(home.latestSevenDayRate).toBeNull();
    expect(home.priorSevenDayRate).toBeNull();
    expect(list).toEqual({ today, active: [], archived: [] });
    expect(calendar.days).toHaveLength(
      new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate(),
    );
    expect(calendar.earliestMonth).toBe(today.slice(0, 7));
  });

  it("uses the caller's local day for creation and completion around UTC boundaries", async () => {
    const zone = "Pacific/Kiritimati";
    const expected = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const created = await createHabit(db, writerId, "Local day", zone);
    expect(created.ok && created.item?.startsOn).toBe(expected);

    const id = created.ok ? created.item!.id : "";
    await setHabitToday(db, writerId, id, true, zone);
    const [row] = await db
      .select()
      .from(schema.habitCompletions)
      .where(eq(schema.habitCompletions.habitId, id));
    expect(row.completedOn).toBe(expected);
  });

  it("checks and unchecks idempotently", async () => {
    const created = await createHabit(db, writerId, "Treadmill", "UTC");
    const id = created.ok ? created.item!.id : "";

    await setHabitToday(db, writerId, id, true, "UTC");
    await setHabitToday(db, writerId, id, true, "UTC");
    expect(
      await db
        .select()
        .from(schema.habitCompletions)
        .where(eq(schema.habitCompletions.habitId, id)),
    ).toHaveLength(1);

    await setHabitToday(db, writerId, id, false, "UTC");
    await setHabitToday(db, writerId, id, false, "UTC");
    expect(
      await db
        .select()
        .from(schema.habitCompletions)
        .where(eq(schema.habitCompletions.habitId, id)),
    ).toHaveLength(0);
  });

  it("enforces case-insensitive active names and allows reuse after archive", async () => {
    const first = await createHabit(db, writerId, "No smoking", "UTC");
    expect(first.ok).toBe(true);
    expect(await createHabit(db, writerId, "  no SMOKING  ", "UTC")).toMatchObject({
      ok: false,
      code: "NAME_TAKEN",
    });

    const id = first.ok ? first.item!.id : "";
    expect((await archiveHabit(db, writerId, id, "UTC")).ok).toBe(true);
    expect((await createHabit(db, writerId, "NO SMOKING", "UTC")).ok).toBe(true);
  });

  it("rejects archived edits, active deletion, and every cross-account write", async () => {
    const created = await createHabit(db, writerId, "Read", "UTC");
    const activeId = created.ok ? created.item!.id : "";

    expect(await renameHabit(db, otherId, activeId, "Mine")).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await setHabitToday(db, otherId, activeId, true, "UTC")).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await archiveHabit(db, otherId, activeId, "UTC")).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await deleteHabit(db, otherId, activeId)).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await deleteHabit(db, writerId, activeId)).toMatchObject({
      ok: false,
      code: "ACTIVE_DELETE",
    });

    await archiveHabit(db, writerId, activeId, "UTC");
    expect(await renameHabit(db, writerId, activeId, "Archived read")).toMatchObject({
      ok: false,
      code: "ARCHIVED",
    });
    expect(await setHabitToday(db, writerId, activeId, true, "UTC")).toMatchObject({
      ok: false,
      code: "ARCHIVED",
    });
    expect(await archiveHabit(db, writerId, activeId, "UTC")).toMatchObject({
      ok: false,
      code: "ARCHIVED",
    });
  });

  it("cascades permanent deletion through retained completions", async () => {
    const created = await createHabit(db, writerId, "Disposable", "UTC");
    const id = created.ok ? created.item!.id : "";
    await setHabitToday(db, writerId, id, true, "UTC");
    await archiveHabit(db, writerId, id, "UTC");
    expect((await deleteHabit(db, writerId, id)).ok).toBe(true);
    expect(
      await db
        .select()
        .from(schema.habitCompletions)
        .where(eq(schema.habitCompletions.habitId, id)),
    ).toHaveLength(0);
  });

  it("calculates daily and summed seven-day rates with null pre-history", async () => {
    const today = await localToday(db, "UTC");
    const steady = await addHabit(statsId, { name: "Steady", startsOn: addDays(today, -20) });
    const recent = await addHabit(statsId, { name: "Recent", startsOn: addDays(today, -6) });
    const archived = await addHabit(statsId, {
      name: "Archived",
      startsOn: addDays(today, -10),
      archivedOn: addDays(today, -3),
    });

    await complete(steady.id, ...Array.from({ length: 7 }, (_, index) => addDays(today, -index)));
    await complete(recent.id, today, addDays(today, -1));
    await complete(archived.id, addDays(today, -4));

    const home = await habitHome(db, statsId, "UTC");
    expect(home.trend.slice(0, 9).every((point) => point.dailyRate === null)).toBe(true);
    expect(home.trend.at(-1)).toMatchObject({ completed: 2, eligible: 2, dailyRate: 100 });

    const window = home.trend.slice(-7);
    const completed = window.reduce((sum, point) => sum + point.completed, 0);
    const eligible = window.reduce((sum, point) => sum + point.eligible, 0);
    expect(home.latestSevenDayRate).toBeCloseTo((completed / eligible) * 100);
    expect(home.trend.at(-1)?.sevenDayRate).toBeCloseTo((completed / eligible) * 100);
  });

  it("computes current and best streaks across gaps and month boundaries", async () => {
    const today = await localToday(db, "UTC");
    const habit = await addHabit(statsId, { name: "Streaks", startsOn: addDays(today, -60) });
    const monthStart = `${today.slice(0, 7)}-01`;
    const previousMonthEnd = addDays(monthStart, -1);
    await complete(
      habit.id,
      addDays(previousMonthEnd, -1),
      previousMonthEnd,
      monthStart,
      addDays(today, -2),
      addDays(today, -1),
    );

    let item = (await habitList(db, statsId, "UTC")).active.find((row) => row.id === habit.id)!;
    expect(item.stats.currentStreak).toBe(2);
    expect(item.stats.bestStreak).toBeGreaterThanOrEqual(3);

    await complete(habit.id, today);
    item = (await habitList(db, statsId, "UTC")).active.find((row) => row.id === habit.id)!;
    expect(item.stats.currentStreak).toBe(3);
    expect(item.stats.totalCompleted).toBe(6);
  });

  it("aggregates partial, full, archived, future, and untracked calendar days", async () => {
    const first = await addHabit(calendarId, { name: "First", startsOn: "2026-07-01" });
    const second = await addHabit(calendarId, {
      name: "Second",
      startsOn: "2026-07-10",
      archivedOn: "2026-07-20",
    });
    await complete(first.id, "2026-07-05", "2026-07-15", "2026-07-16");
    await complete(second.id, "2026-07-16");

    const july = await habitCalendar(db, calendarId, "2026-07", "UTC");
    const byDay = new Map(july.days.map((day) => [day.day, day]));
    expect(byDay.get("2026-07-01")).toMatchObject({ completed: 0, eligible: 1, rate: 0 });
    expect(byDay.get("2026-07-05")).toMatchObject({ completed: 1, eligible: 1, rate: 100 });
    expect(byDay.get("2026-07-15")).toMatchObject({ completed: 1, eligible: 2, rate: 50 });
    expect(byDay.get("2026-07-16")).toMatchObject({ completed: 2, eligible: 2, rate: 100 });
    expect(byDay.get("2026-07-21")).toMatchObject({ completed: 0, eligible: 1, rate: 0 });
    expect(july.earliestMonth).toBe("2026-07");

    const before = await habitCalendar(db, calendarId, "2026-06", "UTC");
    expect(before.days.every((day) => !day.isTracked && day.rate === null)).toBe(true);

    const today = await localToday(db, "UTC");
    const current = await habitCalendar(db, calendarId, today.slice(0, 7), "UTC");
    const tomorrow = current.days.find((day) => day.day === addDays(today, 1));
    if (tomorrow) expect(tomorrow).toMatchObject({ isFuture: true, rate: null });
  });

  it("isolates all read responses by account", async () => {
    const today = await localToday(db, "UTC");
    const home = await habitHome(db, otherId, "UTC");
    const list = await habitList(db, otherId, "UTC");
    const calendar = await habitCalendar(db, otherId, today.slice(0, 7), "UTC");
    expect(home.habits).toEqual([]);
    expect(list.active).toEqual([]);
    expect(list.archived).toEqual([]);
    expect(calendar.days.every((day) => day.eligible === 0)).toBe(true);
  });

  it("keeps completion uniqueness scoped to the habit", async () => {
    const today = await localToday(db, "UTC");
    const rows = await db
      .select({ habitId: schema.habitCompletions.habitId })
      .from(schema.habitCompletions)
      .innerJoin(schema.habits, eq(schema.habits.id, schema.habitCompletions.habitId))
      .where(
        and(eq(schema.habits.userId, statsId), eq(schema.habitCompletions.completedOn, today)),
      );
    expect(new Set(rows.map((row) => row.habitId)).size).toBe(rows.length);
  });
});
