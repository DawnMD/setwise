"use client";

import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { cn } from "@/lib/cn";
import { MUSCLES, type MuscleSlug } from "@/lib/muscles";
import { orpc } from "@/lib/orpc";
import { Sheet } from "@/components/ui/sheet";

import type { LoggerExercise } from "./types";

/**
 * Search over the global catalogue plus the user's own exercises.
 *
 * The muscle chips are the fast path: mid-workout nobody types "Romanian
 * deadlift", they tap Hamstrings and scan. Search is debounced because a
 * per-keystroke round trip on gym wifi is worse than a stale list.
 */
export function ExercisePicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (exercise: LoggerExercise) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [muscle, setMuscle] = React.useState<MuscleSlug | null>(null);

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(id);
  }, [query]);

  const results = useQuery(
    orpc.catalogue.search.queryOptions({
      input: { query: debounced, muscle: muscle ?? undefined, limit: 40 },
      enabled: open,
      staleTime: 5 * 60_000,
    }),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add exercise">
      <div className="mt-3 space-y-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search exercises"
          autoComplete="off"
          className={cn(
            "h-12 w-full rounded-lg border border-border bg-surface px-3 text-base",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          )}
        />

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {MUSCLES.map((entry) => {
            const active = muscle === entry.slug;
            return (
              <button
                key={entry.slug}
                type="button"
                onClick={() => setMuscle(active ? null : entry.slug)}
                className={cn(
                  "h-9 shrink-0 rounded-full border px-3 text-sm whitespace-nowrap",
                  active
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-border bg-surface text-ink-muted",
                )}
              >
                {entry.displayName}
              </button>
            );
          })}
        </div>

        <ul className="max-h-[46dvh] divide-y divide-border overflow-y-auto">
          {results.isPending ? (
            <li className="py-6 text-center text-sm text-ink-muted">Loading…</li>
          ) : results.isError ? (
            <li className="py-6 text-center text-sm text-danger">
              Couldn&apos;t load exercises. Check your connection and try again.
            </li>
          ) : results.data.length === 0 ? (
            <li className="py-6 text-center text-sm text-ink-muted">
              Nothing matches. Try a different word or muscle.
            </li>
          ) : (
            results.data.map((exercise) => (
              <li key={exercise.id}>
                <button
                  type="button"
                  onClick={() =>
                    onPick({
                      id: exercise.id,
                      name: exercise.name,
                      equipment: exercise.equipment,
                    })
                  }
                  className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left active:bg-border/40"
                >
                  <span className="text-[15px]">{exercise.name}</span>
                  <span className="shrink-0 text-xs text-ink-muted capitalize">
                    {exercise.isCustom ? "Yours" : exercise.equipment}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </Sheet>
  );
}
