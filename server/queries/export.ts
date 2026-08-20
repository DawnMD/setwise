import { asc, eq } from "drizzle-orm";

import type { DbClient } from "@/db";
import { bodyweightLogs, exercises, sets, workoutSessions } from "@/db/schema";
import { estimateOneRepMax } from "@/lib/math";

/**
 * Every set the user has ever logged, flattened.
 *
 * Without offline storage this file is the user's only backup, so it is one row
 * per set with the session denormalised onto it: readable in a spreadsheet with
 * no joins, and re-importable by anything.
 */
const COLUMNS = [
  "session_id",
  "session_started_at",
  "session_ended_at",
  "set_id",
  "performed_at",
  "exercise",
  "equipment",
  "set_index",
  "is_warmup",
  "weight_kg",
  "reps",
  "rpe",
  "e1rm_kg",
] as const;

function escape(value: string | number | boolean | null): string {
  if (value === null) return "";
  const text = String(value);
  // Quote anything a spreadsheet could misread, and double any quote inside.
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const iso = (date: Date | null) => (date === null ? null : date.toISOString());

export async function exportSetsCsv(db: DbClient, userId: string): Promise<string> {
  const rows = await db
    .select({
      sessionId: workoutSessions.id,
      startedAt: workoutSessions.startedAt,
      endedAt: workoutSessions.endedAt,
      setId: sets.id,
      performedAt: sets.performedAt,
      exercise: exercises.name,
      equipment: exercises.equipment,
      setIndex: sets.setIndex,
      isWarmup: sets.isWarmup,
      weight: sets.weight,
      reps: sets.reps,
      rpe: sets.rpe,
    })
    .from(sets)
    .innerJoin(workoutSessions, eq(workoutSessions.id, sets.sessionId))
    .innerJoin(exercises, eq(exercises.id, sets.exerciseId))
    .where(eq(workoutSessions.userId, userId))
    .orderBy(asc(workoutSessions.startedAt), asc(sets.performedAt), asc(sets.setIndex));

  const lines = [COLUMNS.join(",")];

  for (const row of rows) {
    const e1rm = row.isWarmup ? null : estimateOneRepMax(row.weight, row.reps);
    lines.push(
      [
        row.sessionId,
        iso(row.startedAt),
        iso(row.endedAt),
        row.setId,
        iso(row.performedAt),
        row.exercise,
        row.equipment,
        row.setIndex,
        row.isWarmup,
        row.weight,
        row.reps,
        row.rpe,
        e1rm === null ? null : Math.round(e1rm * 100) / 100,
      ]
        .map(escape)
        .join(","),
    );
  }

  // Trailing newline: some tools drop the last row without one.
  return `${lines.join("\r\n")}\r\n`;
}

const BODYWEIGHT_COLUMNS = ["logged_on", "weight_kg", "note"] as const;

/**
 * The weigh-ins, as their own file rather than a column on the set export.
 *
 * They are a different shape — one row per day, not per set — and stapling them
 * onto a set table would mean either repeating a weight on every set of the day
 * or leaving most of the column blank. Two files a spreadsheet can each open.
 */
export async function exportBodyweightCsv(db: DbClient, userId: string): Promise<string> {
  const rows = await db
    .select({
      loggedOn: bodyweightLogs.loggedOn,
      weight: bodyweightLogs.weight,
      note: bodyweightLogs.note,
    })
    .from(bodyweightLogs)
    .where(eq(bodyweightLogs.userId, userId))
    .orderBy(asc(bodyweightLogs.loggedOn));

  const lines = [BODYWEIGHT_COLUMNS.join(",")];

  for (const row of rows) {
    lines.push([row.loggedOn, row.weight, row.note].map(escape).join(","));
  }

  return `${lines.join("\r\n")}\r\n`;
}
