"use client";

import Link from "next/link";

import { formatElapsed, formatWeight, formatWhen } from "@/lib/format";
import { estimateOneRepMax } from "@/lib/math";
import { buttonClass } from "@/components/ui/button";

import type { LoggerSession } from "./types";

type VolumeRecord = {
  exerciseId: string;
  exerciseName: string;
  value: number;
  previous: number | null;
};

/**
 * What a finished workout looks like, and what `/train/[id]` shows for any
 * session from the history.
 *
 * No confetti, no badge, no streak. The numbers are the reward, and a deload
 * week is correct training that an app has no business scolding anyone for.
 */
export function FinishedSummary({
  detail,
  records,
}: {
  detail: LoggerSession;
  records: VolumeRecord[];
}) {
  const working = detail.sets.filter((set) => !set.isWarmup);
  const tonnage = working.reduce((total, set) => total + set.weight * set.reps, 0);
  const duration = detail.endedAt
    ? formatElapsed(new Date(detail.endedAt).getTime() - new Date(detail.startedAt).getTime())
    : null;

  const beaten = records.filter((record) => record.previous !== null);

  return (
    <div className="mx-auto w-full max-w-[520px] px-4 py-4">
      <header className="py-2">
        <h1 className="text-lg font-semibold">Workout saved</h1>
        <p className="text-xs text-ink-muted">
          {formatWhen(new Date(detail.startedAt))}
          {duration ? ` · ${duration}` : ""}
        </p>
      </header>

      <dl className="my-4 grid grid-cols-3 gap-2">
        <Stat label="Sets" value={String(working.length)} />
        <Stat label="Exercises" value={String(detail.exercises.length)} />
        <Stat label="Volume" value={`${formatWeight(Math.round(tonnage))} kg`} />
      </dl>

      {beaten.length > 0 ? (
        <section className="mb-4 rounded-xl border border-pr/30 bg-pr/5 p-3">
          <h2 className="text-sm font-semibold text-pr">Most volume yet</h2>
          <ul className="numeric mt-1 space-y-0.5 text-sm">
            {beaten.map((record) => (
              <li key={record.exerciseId} className="flex justify-between gap-3">
                <span className="truncate">{record.exerciseName}</span>
                <span className="shrink-0 text-ink-muted">
                  {formatWeight(Math.round(record.value))} kg, was{" "}
                  {formatWeight(Math.round(record.previous ?? 0))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ul className="space-y-3">
        {detail.exercises.map((exercise) => {
          const sets = detail.sets
            .filter((set) => set.exerciseId === exercise.id)
            .sort((a, b) => a.setIndex - b.setIndex);
          const best = sets
            .filter((set) => !set.isWarmup)
            .map((set) => estimateOneRepMax(set.weight, set.reps))
            .filter((value): value is number => value !== null)
            .reduce<number | null>((max, value) => (max === null || value > max ? value : max), null);

          return (
            <li key={exercise.id} className="rounded-xl border border-border bg-surface-raised p-3">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="truncate text-[15px] font-semibold">{exercise.name}</h3>
                {best !== null ? (
                  <span className="numeric shrink-0 text-xs text-ink-muted">
                    best e1RM {Math.round(best * 10) / 10} kg
                  </span>
                ) : null}
              </div>
              <ul className="numeric mt-1 space-y-0.5 text-sm text-ink-muted">
                {sets.map((set) => (
                  <li key={set.id}>
                    {set.isWarmup ? "W" : ""} {formatWeight(set.weight)} kg × {set.reps}
                    {set.rpe !== null ? ` @ ${set.rpe}` : ""}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>

      <Link href="/train" className={buttonClass("primary", "lg", "mt-6 w-full")}>
        Done
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised px-3 py-2">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="numeric-display text-xl">{value}</dd>
    </div>
  );
}
