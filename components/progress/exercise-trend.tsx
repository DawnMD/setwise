import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import type { StatWindow } from "@/db/validators";
import { formatDelta, formatE1rm } from "@/lib/format";
import { queries } from "@/lib/queries";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { MiniChart } from "@/components/ui/mini-chart";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Per-exercise history, plotted as an estimated 1RM trend.
 *
 * One point per session, not per set: "was last Tuesday better than the Tuesday
 * before" is the comparison people make, and five dots on one date would turn
 * the line into noise.
 *
 * Sessions whose every set ran past twelve reps have no trustworthy Epley
 * estimate and are left out rather than plotted at a made-up value. The count
 * under the chart says how many points it is actually drawn from, so a line
 * through two dots cannot pass for a trend.
 */
export function ExerciseTrend({ window }: { window: StatWindow }) {
  const exercises = useQuery(queries.trainedExercises(window));
  const [chosen, setChosen] = React.useState<string | null>(null);

  const options = exercises.data ?? [];
  // The list is ordered most-recent-first, so the default is whatever the user
  // trained last. It falls back whenever the window changes and the previous
  // choice is no longer in range.
  const selectedId =
    chosen && options.some((e) => e.id === chosen) ? chosen : (options[0]?.id ?? null);

  const history = useQuery(queries.exerciseHistory(selectedId, window));

  const points = React.useMemo(
    () =>
      (history.data ?? [])
        .filter((point) => point.bestE1rm !== null)
        .map((point) => ({
          date: new Date(point.performedAt).getTime(),
          e1rm: Math.round(point.bestE1rm! * 10) / 10,
          sets: point.sets,
        })),
    [history.data],
  );

  if (exercises.isPending) return <Skeleton className="h-56 w-full" />;

  if (exercises.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t load your exercises</AlertTitle>
        <AlertDescription>Check your connection and try again.</AlertDescription>
      </Alert>
    );
  }

  if (options.length === 0) {
    return (
      <p className="rounded-lg border bg-card px-3 py-4 text-xs text-muted-foreground">
        No exercises logged in this window. Widen it, or log a workout.
      </p>
    );
  }

  const first = points[0]?.e1rm ?? null;
  const last = points[points.length - 1]?.e1rm ?? null;
  const delta = first !== null && last !== null && points.length > 1 ? last - first : null;

  return (
    <div className="flex flex-col gap-3">
      <NativeSelect
        size="touch"
        className="w-full"
        value={selectedId ?? ""}
        onChange={(event) => setChosen(event.target.value)}
        aria-label="Exercise"
      >
        {options.map((exercise) => (
          <NativeSelectOption key={exercise.id} value={exercise.id}>
            {exercise.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>

      {history.isPending ? (
        <Skeleton className="h-44 w-full" />
      ) : history.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load that history</AlertTitle>
          <AlertDescription>Check your connection and try again.</AlertDescription>
        </Alert>
      ) : points.length === 0 ? (
        <p className="rounded-lg border bg-card px-3 py-4 text-xs text-muted-foreground">
          Nothing here can be turned into a 1RM estimate. Epley only holds to twelve reps, so a
          window of high-rep work has no trend to draw.
        </p>
      ) : points.length === 1 ? (
        <div className="rounded-lg border bg-card px-3 py-4">
          <p className="numeric-display text-2xl">{formatE1rm(points[0].e1rm)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            One session in this window. Widen it to see a trend.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="numeric-display text-2xl">{formatE1rm(last)}</span>
            {delta !== null && delta !== 0 ? (
              <Badge variant={delta > 0 ? "overload" : "secondary"} className="numeric">
                {formatDelta(delta)} over {points.length} sessions
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">
                Flat over {points.length} sessions
              </span>
            )}
          </div>

          <MiniChart
            height={176}
            // Sessions are not evenly spaced, and a chart that pretends they
            // are would show a fortnight off as one step like any other.
            positions={points.map((point) => point.date)}
            labels={points.map((point) =>
              new Date(point.date).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
              }),
            )}
            series={[
              {
                key: "e1rm",
                label: "Est. 1RM",
                kind: "line",
                color: "var(--overload)",
                showPoints: true,
                values: points.map((point) => point.e1rm),
                format: (value) => formatE1rm(value),
              },
            ]}
            // Anchored to the data, not to zero. The interesting range is the
            // few kilos a lift actually moves over a quarter, and a zero
            // baseline flattens all of it into one line.
            leftDomain={(min, max) => [min - 5, max + 5]}
            summary={`Estimated one-rep max over ${points.length} sessions, from ${formatE1rm(first)} to ${formatE1rm(last)}.`}
          />

          <p className="text-xs text-muted-foreground">
            Best Epley estimate per session, from {points.length} sessions.
          </p>
        </div>
      )}
    </div>
  );
}
