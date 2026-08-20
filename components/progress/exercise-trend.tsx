"use client";

import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import type { StatWindow } from "@/db/validators";
import { formatDelta, formatE1rm } from "@/lib/format";
import { orpc } from "@/lib/orpc";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";

const CHART_CONFIG = {
  e1rm: { label: "Est. 1RM", color: "var(--overload)" },
} satisfies ChartConfig;

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
  const exercises = useQuery(orpc.stats.exercises.queryOptions({ input: { window } }));
  const [chosen, setChosen] = React.useState<string | null>(null);

  const options = exercises.data ?? [];
  // The list is ordered most-recent-first, so the default is whatever the user
  // trained last. It falls back whenever the window changes and the previous
  // choice is no longer in range.
  const selectedId =
    chosen && options.some((e) => e.id === chosen) ? chosen : (options[0]?.id ?? null);

  const history = useQuery({
    ...orpc.stats.exerciseHistory.queryOptions({
      input: { exerciseId: selectedId ?? "", window },
    }),
    enabled: selectedId !== null,
  });

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

          <ChartContainer config={CHART_CONFIG} className="aspect-auto h-44 w-full">
            <LineChart data={points} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={(value: number) =>
                  new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" })
                }
              />
              <YAxis
                dataKey="e1rm"
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                width={36}
                // Anchored to the data, not to zero. The interesting range is
                // the few kilos a lift actually moves over a quarter, and a
                // zero baseline flattens all of it into one line.
                domain={["dataMin - 5", "dataMax + 5"]}
                tickFormatter={(value: number) => String(Math.round(value))}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) =>
                      new Date(payload?.[0]?.payload?.date ?? 0).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                      })
                    }
                  />
                }
              />
              <Line
                dataKey="e1rm"
                type="monotone"
                stroke="var(--color-e1rm)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--color-e1rm)" }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>

          <p className="text-xs text-muted-foreground">
            Best Epley estimate per session, from {points.length} sessions.
          </p>
        </div>
      )}
    </div>
  );
}
