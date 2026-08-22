import { and, asc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";

import type { DbClient } from "@/db";
import { habitCompletions, habits, type Habit } from "@/db/schema";
import "@tanstack/react-start/server-only";

const DAY_MS = 86_400_000;
export const HABIT_TREND_DAYS = 30;
export const HABIT_ROLLING_DAYS = 7;

export type HabitTrendPoint = {
  day: string;
  completed: number;
  eligible: number;
  dailyRate: number | null;
  sevenDayRate: number | null;
};

export type HabitHomeSummary = {
  today: string;
  habits: { id: string; name: string; completed: boolean }[];
  trend: HabitTrendPoint[];
  latestSevenDayRate: number | null;
  priorSevenDayRate: number | null;
};

export type HabitCalendarDay = {
  day: string;
  completed: number;
  eligible: number;
  rate: number | null;
  completedNames: string[];
  missedNames: string[];
  isFuture: boolean;
  isTracked: boolean;
};

export type HabitCalendarMonth = {
  month: string;
  today: string;
  earliestMonth: string;
  days: HabitCalendarDay[];
};

export type HabitStats = {
  currentStreak: number;
  bestStreak: number;
  trailingThirtyDayRate: number | null;
  totalCompleted: number;
};

export type HabitListItem = {
  id: string;
  name: string;
  startsOn: string;
  archivedOn: string | null;
  stats: HabitStats;
};

export type HabitList = {
  today: string;
  active: HabitListItem[];
  archived: HabitListItem[];
};

export type HabitWriteResult =
  | { ok: true; item?: HabitListItem }
  | { ok: false; code: "NOT_FOUND" | "ARCHIVED" | "NAME_TAKEN" | "ACTIVE_DELETE" };

const toDay = (value: number) => new Date(value).toISOString().slice(0, 10);
const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`);
export const addDays = (day: string, amount: number) => toDay(dayNumber(day) + amount * DAY_MS);

function daysBetween(start: string, end: string): string[] {
  const days: string[] = [];
  for (let value = dayNumber(start); value <= dayNumber(end); value += DAY_MS)
    days.push(toDay(value));
  return days;
}

function eligibleOn(habit: Pick<Habit, "startsOn" | "archivedOn">, day: string): boolean {
  return habit.startsOn <= day && (habit.archivedOn === null || habit.archivedOn >= day);
}

const percentage = (completed: number, eligible: number) =>
  eligible === 0 ? null : (completed / eligible) * 100;

export async function localToday(db: DbClient, timeZone: string): Promise<string> {
  const { rows } = await db.execute<{ today: string }>(
    sql`select to_char((now() at time zone ${timeZone})::date, 'YYYY-MM-DD') as today`,
  );
  return rows[0].today;
}

async function accountHabits(db: DbClient, userId: string): Promise<Habit[]> {
  return db
    .select()
    .from(habits)
    .where(eq(habits.userId, userId))
    .orderBy(asc(habits.createdAt), asc(habits.name));
}

async function accountCompletions(
  db: DbClient,
  userId: string,
  start?: string,
  end?: string,
): Promise<{ habitId: string; completedOn: string }[]> {
  const filters = [eq(habits.userId, userId)];
  if (start) filters.push(gte(habitCompletions.completedOn, start));
  if (end) filters.push(lte(habitCompletions.completedOn, end));

  return db
    .select({ habitId: habitCompletions.habitId, completedOn: habitCompletions.completedOn })
    .from(habitCompletions)
    .innerJoin(habits, eq(habits.id, habitCompletions.habitId))
    .where(and(...filters))
    .orderBy(asc(habitCompletions.completedOn));
}

function completionKey(habitId: string, day: string): string {
  return `${habitId}:${day}`;
}

function rollingRate(points: Pick<HabitTrendPoint, "completed" | "eligible">[]): number | null {
  const totals = points.reduce(
    (sum, point) => ({
      completed: sum.completed + point.completed,
      eligible: sum.eligible + point.eligible,
    }),
    { completed: 0, eligible: 0 },
  );
  return percentage(totals.completed, totals.eligible);
}

export async function habitHome(
  db: DbClient,
  userId: string,
  timeZone: string,
): Promise<HabitHomeSummary> {
  const today = await localToday(db, timeZone);
  const visibleStart = addDays(today, -(HABIT_TREND_DAYS - 1));
  const calculationStart = addDays(visibleStart, -(HABIT_ROLLING_DAYS - 1));
  const [allHabits, completions] = await Promise.all([
    accountHabits(db, userId),
    accountCompletions(db, userId, calculationStart, today),
  ]);
  const completed = new Set(completions.map((row) => completionKey(row.habitId, row.completedOn)));

  const dense = daysBetween(calculationStart, today).map((day) => {
    const eligibleHabits = allHabits.filter((habit) => eligibleOn(habit, day));
    const completedCount = eligibleHabits.filter((habit) =>
      completed.has(completionKey(habit.id, day)),
    ).length;
    return { day, completed: completedCount, eligible: eligibleHabits.length };
  });

  const trend = dense.slice(HABIT_ROLLING_DAYS - 1).map((point, index) => ({
    ...point,
    dailyRate: percentage(point.completed, point.eligible),
    sevenDayRate: rollingRate(dense.slice(index, index + HABIT_ROLLING_DAYS)),
  }));

  const active = allHabits.filter((habit) => habit.archivedOn === null && habit.startsOn <= today);

  return {
    today,
    habits: active.map((habit) => ({
      id: habit.id,
      name: habit.name,
      completed: completed.has(completionKey(habit.id, today)),
    })),
    trend,
    latestSevenDayRate: rollingRate(dense.slice(-HABIT_ROLLING_DAYS)),
    priorSevenDayRate: rollingRate(dense.slice(-HABIT_ROLLING_DAYS * 2, -HABIT_ROLLING_DAYS)),
  };
}

function monthBounds(month: string): { start: string; end: string } {
  const [year, number] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = toDay(Date.UTC(year, number, 0));
  return { start, end };
}

export async function habitCalendar(
  db: DbClient,
  userId: string,
  month: string,
  timeZone: string,
): Promise<HabitCalendarMonth> {
  const today = await localToday(db, timeZone);
  const { start, end } = monthBounds(month);
  const [allHabits, completions] = await Promise.all([
    accountHabits(db, userId),
    accountCompletions(db, userId, start, end),
  ]);
  const completed = new Set(completions.map((row) => completionKey(row.habitId, row.completedOn)));
  const earliest = allHabits.reduce<string | null>(
    (value, habit) => (value === null || habit.startsOn < value ? habit.startsOn : value),
    null,
  );

  const days = daysBetween(start, end).map((day): HabitCalendarDay => {
    const eligibleHabits = allHabits.filter((habit) => eligibleOn(habit, day));
    const completedNames = eligibleHabits
      .filter((habit) => completed.has(completionKey(habit.id, day)))
      .map((habit) => habit.name);
    const missedNames = eligibleHabits
      .filter((habit) => !completed.has(completionKey(habit.id, day)))
      .map((habit) => habit.name);
    const isFuture = day > today;
    const isTracked = eligibleHabits.length > 0 && !isFuture;

    return {
      day,
      completed: completedNames.length,
      eligible: eligibleHabits.length,
      rate: isTracked ? percentage(completedNames.length, eligibleHabits.length) : null,
      completedNames,
      missedNames,
      isFuture,
      isTracked,
    };
  });

  return {
    month,
    today,
    earliestMonth: earliest?.slice(0, 7) ?? today.slice(0, 7),
    days,
  };
}

function bestStreak(days: string[]): number {
  const unique = [...new Set(days)].sort();
  let best = 0;
  let current = 0;
  let previous: string | null = null;
  for (const day of unique) {
    current = previous !== null && addDays(previous, 1) === day ? current + 1 : 1;
    best = Math.max(best, current);
    previous = day;
  }
  return best;
}

function currentStreak(habit: Habit, completed: Set<string>, today: string): number {
  let cursor = completed.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (cursor >= habit.startsOn && completed.has(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

function statsFor(habit: Habit, completionDays: string[], today: string): HabitStats {
  const completed = new Set(completionDays);
  const referenceDay = habit.archivedOn ?? today;
  const windowStart = addDays(referenceDay, -29);
  const eligibleStart = habit.startsOn > windowStart ? habit.startsOn : windowStart;
  const eligibleEnd =
    habit.archivedOn && habit.archivedOn < referenceDay ? habit.archivedOn : referenceDay;
  const eligibleDays = eligibleStart <= eligibleEnd ? daysBetween(eligibleStart, eligibleEnd) : [];
  const completedInWindow = eligibleDays.filter((day) => completed.has(day)).length;

  return {
    currentStreak: habit.archivedOn === null ? currentStreak(habit, completed, today) : 0,
    bestStreak: bestStreak(completionDays),
    trailingThirtyDayRate: percentage(completedInWindow, eligibleDays.length),
    totalCompleted: completed.size,
  };
}

export async function habitList(
  db: DbClient,
  userId: string,
  timeZone: string,
): Promise<HabitList> {
  const today = await localToday(db, timeZone);
  const [allHabits, completions] = await Promise.all([
    accountHabits(db, userId),
    accountCompletions(db, userId),
  ]);
  const byHabit = new Map<string, string[]>();
  for (const completion of completions) {
    const days = byHabit.get(completion.habitId) ?? [];
    days.push(completion.completedOn);
    byHabit.set(completion.habitId, days);
  }

  const items = allHabits.map((habit): HabitListItem => ({
    id: habit.id,
    name: habit.name,
    startsOn: habit.startsOn,
    archivedOn: habit.archivedOn,
    stats: statsFor(habit, byHabit.get(habit.id) ?? [], today),
  }));

  return {
    today,
    active: items.filter((item) => item.archivedOn === null),
    archived: items
      .filter((item) => item.archivedOn !== null)
      .sort((a, b) => b.archivedOn!.localeCompare(a.archivedOn!)),
  };
}

export async function findOwnedHabit(db: DbClient, userId: string, id: string) {
  const [habit] = await db
    .select()
    .from(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)))
    .limit(1);
  return habit ?? null;
}

async function activeNameExists(
  db: DbClient,
  userId: string,
  name: string,
  exceptId?: string,
): Promise<boolean> {
  const filters = [
    eq(habits.userId, userId),
    isNull(habits.archivedOn),
    sql`lower(${habits.name}) = lower(${name})`,
  ];
  if (exceptId) filters.push(ne(habits.id, exceptId));
  const [row] = await db
    .select({ id: habits.id })
    .from(habits)
    .where(and(...filters))
    .limit(1);
  return row !== undefined;
}

export function isHabitNameConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: string; constraint?: string };
  return candidate.code === "23505" && candidate.constraint === "habits_active_name_uq";
}

export async function createHabit(
  db: DbClient,
  userId: string,
  name: string,
  timeZone: string,
): Promise<HabitWriteResult> {
  const normalized = name.trim();
  if (await activeNameExists(db, userId, normalized)) return { ok: false, code: "NAME_TAKEN" };
  const today = await localToday(db, timeZone);
  try {
    const [created] = await db
      .insert(habits)
      .values({ userId, name: normalized, startsOn: today })
      .returning();
    const list = await habitList(db, userId, timeZone);
    return { ok: true, item: list.active.find((item) => item.id === created.id)! };
  } catch (error) {
    if (isHabitNameConflict(error)) return { ok: false, code: "NAME_TAKEN" };
    throw error;
  }
}

export async function renameHabit(
  db: DbClient,
  userId: string,
  id: string,
  name: string,
): Promise<HabitWriteResult> {
  const normalized = name.trim();
  const habit = await findOwnedHabit(db, userId, id);
  if (!habit) return { ok: false, code: "NOT_FOUND" };
  if (habit.archivedOn !== null) return { ok: false, code: "ARCHIVED" };
  if (await activeNameExists(db, userId, normalized, id)) {
    return { ok: false, code: "NAME_TAKEN" };
  }
  try {
    await db.update(habits).set({ name: normalized }).where(eq(habits.id, id));
  } catch (error) {
    if (isHabitNameConflict(error)) return { ok: false, code: "NAME_TAKEN" };
    throw error;
  }
  return { ok: true };
}

export async function setHabitToday(
  db: DbClient,
  userId: string,
  id: string,
  completed: boolean,
  timeZone: string,
): Promise<HabitHomeSummary | HabitWriteResult> {
  const habit = await findOwnedHabit(db, userId, id);
  if (!habit) return { ok: false, code: "NOT_FOUND" };
  if (habit.archivedOn !== null) return { ok: false, code: "ARCHIVED" };
  const today = await localToday(db, timeZone);

  if (completed) {
    await db
      .insert(habitCompletions)
      .values({ habitId: id, completedOn: today })
      .onConflictDoNothing({ target: [habitCompletions.habitId, habitCompletions.completedOn] });
  } else {
    await db
      .delete(habitCompletions)
      .where(and(eq(habitCompletions.habitId, id), eq(habitCompletions.completedOn, today)));
  }

  return habitHome(db, userId, timeZone);
}

export async function archiveHabit(
  db: DbClient,
  userId: string,
  id: string,
  timeZone: string,
): Promise<HabitWriteResult> {
  const habit = await findOwnedHabit(db, userId, id);
  if (!habit) return { ok: false, code: "NOT_FOUND" };
  if (habit.archivedOn !== null) return { ok: false, code: "ARCHIVED" };
  const today = await localToday(db, timeZone);
  await db.update(habits).set({ archivedOn: today }).where(eq(habits.id, id));
  const list = await habitList(db, userId, timeZone);
  return { ok: true, item: list.archived.find((item) => item.id === id)! };
}

export async function deleteHabit(
  db: DbClient,
  userId: string,
  id: string,
): Promise<HabitWriteResult> {
  const habit = await findOwnedHabit(db, userId, id);
  if (!habit) return { ok: false, code: "NOT_FOUND" };
  if (habit.archivedOn === null) return { ok: false, code: "ACTIVE_DELETE" };
  await db.delete(habits).where(and(eq(habits.id, id), eq(habits.userId, userId)));
  return { ok: true };
}
