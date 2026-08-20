"use client";

import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { formatWeight, formatWhen } from "@/lib/format";
import { ghostForPosition } from "@/lib/overload";
import { orpc } from "@/lib/orpc";
import { Button } from "@/components/ui/button";

import { SetRow } from "./set-row";
import type { LoggerExercise, LoggerSet, RowStatus } from "./types";

/**
 * One exercise and its sets.
 *
 * Owns the ghost lookup, because the ghost is per exercise and the query for it
 * is the same shape for every set inside. Fetched once here rather than once
 * per row.
 */
export function ExerciseBlock({
  exercise,
  sessionId,
  sets,
  statusOf,
  prSetIds,
  onAddSet,
  onEditSet,
  onRetrySet,
  onDeleteSet,
  onRemove,
}: {
  exercise: LoggerExercise;
  sessionId: string;
  sets: LoggerSet[];
  statusOf: (setId: string) => RowStatus;
  prSetIds: ReadonlySet<string>;
  onAddSet: (exercise: LoggerExercise) => void;
  onEditSet: (set: LoggerSet) => void;
  onRetrySet: (setId: string) => void;
  onDeleteSet: (setId: string) => void;
  onRemove: (exerciseId: string) => void;
}) {
  const last = useQuery(
    orpc.session.lastPerformance.queryOptions({
      input: { exerciseId: exercise.id, excludeSessionId: sessionId },
      // The previous session cannot change while this one is open.
      staleTime: Infinity,
    }),
  );

  const lastSets = last.data?.sets ?? [];

  // Position within its own kind, so a warm-up appearing this session does not
  // shift every working set's ghost by one.
  const ordinals = React.useMemo(() => {
    const map = new Map<string, number>();
    let working = 0;
    let warmup = 0;
    for (const set of sets) {
      if (set.isWarmup) map.set(set.id, warmup++);
      else map.set(set.id, working++);
    }
    return map;
  }, [sets]);

  return (
    <section className="rounded-xl border border-border bg-surface-raised">
      <header className="flex items-start justify-between gap-3 px-3 pt-3">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold">{exercise.name}</h2>
          <p className="numeric mt-0.5 text-xs text-ink-muted">
            {last.data
              ? `Last ${formatWhen(last.data.performedAt).toLowerCase()} · ${summarise(last.data.sets)}`
              : last.isPending
                ? " "
                : "First time"}
          </p>
        </div>
        {sets.length === 0 ? (
          <button
            type="button"
            onClick={() => onRemove(exercise.id)}
            className="shrink-0 text-xs text-ink-muted underline underline-offset-4"
          >
            Remove
          </button>
        ) : null}
      </header>

      <div className="mt-2 space-y-1 px-1">
        {sets.map((set) => (
          <SetRow
            key={set.id}
            set={set}
            label={set.isWarmup ? "W" : String((ordinals.get(set.id) ?? 0) + 1)}
            status={statusOf(set.id)}
            ghost={ghostForPosition(lastSets, ordinals.get(set.id) ?? 0, set.isWarmup)}
            isPr={prSetIds.has(set.id)}
            onEdit={() => onEditSet(set)}
            onRetry={() => onRetrySet(set.id)}
            onDelete={() => onDeleteSet(set.id)}
          />
        ))}
      </div>

      <div className="p-2">
        <Button variant="secondary" className="w-full" onClick={() => onAddSet(exercise)}>
          Add set
        </Button>
      </div>
    </section>
  );
}

/** "100 × 8, 100 × 8, 95 × 9" collapsed to the working sets only. */
function summarise(
  sets: ReadonlyArray<{ weight: number; reps: number; isWarmup: boolean }>,
): string {
  const working = sets.filter((set) => !set.isWarmup);
  if (working.length === 0) return "warm-up only";
  return working
    .slice(0, 4)
    .map((set) => `${formatWeight(set.weight)}×${set.reps}`)
    .join(", ");
}
