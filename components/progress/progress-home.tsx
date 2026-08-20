"use client";

import { useQuery } from "@tanstack/react-query";
import { ChartNoAxesColumn } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import type { StatWindow } from "@/db/validators";
import type { MuscleSlug } from "@/lib/muscles";
import { orpc } from "@/lib/orpc";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

import { BodyweightSection } from "@/components/bodyweight/bodyweight-section";

import { ExerciseTrend } from "./exercise-trend";
import { IntensitySummary } from "./intensity-summary";
import { MuscleHeatmap } from "./muscle-heatmap";
import { MuscleVolumeList } from "./muscle-volume-list";
import { WindowToggle } from "./window-toggle";

/**
 * The stats screen.
 *
 * One window toggle governs everything below it, because a screen where the
 * heatmap says 7 days and the trend says 90 is a screen that lies quietly. The
 * selected muscle is shared between the figure and the list for the same
 * reason: two controls over one piece of state, not two states.
 */
export function ProgressHome() {
  const [window, setWindow] = React.useState<StatWindow>(7);
  const [selected, setSelected] = React.useState<MuscleSlug | null>(null);

  const volume = useQuery(orpc.stats.muscleVolume.queryOptions({ input: { window } }));
  const intensity = useQuery(orpc.stats.intensity.queryOptions({ input: { window } }));

  const muscles = volume.data?.muscles ?? [];
  const trained = muscles.filter((muscle) => muscle.effectiveSets > 0);
  const untrained = muscles.filter((muscle) => muscle.effectiveSets === 0);

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col gap-4 px-4 py-4">
      <h1 className="py-2 font-heading text-2xl font-semibold tracking-tight">Progress</h1>

      <WindowToggle value={window} onChange={setWindow} />

      {volume.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : volume.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load your stats</AlertTitle>
          <AlertDescription>Check your connection and try again.</AlertDescription>
        </Alert>
      ) : trained.length === 0 ? (
        <Empty className="border">
          <EmptyMedia variant="icon">
            <ChartNoAxesColumn />
          </EmptyMedia>
          <EmptyTitle>No working sets in this window</EmptyTitle>
          <EmptyDescription>
            Warm-ups don&apos;t count toward volume. Log a workout, or widen the window to 90 days.
          </EmptyDescription>
          <EmptyContent>
            <Button size="touch" render={<Link href="/train" />}>
              Start a workout
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <MuscleHeatmap muscles={muscles} selected={selected} onSelect={setSelected} />

          {/*
            The zero list is the single most actionable thing on this screen, so
            it is stated in words above the numbers rather than left for someone
            to notice as an absence of colour on a silhouette.
          */}
          {untrained.length > 0 ? (
            <Alert>
              <AlertTitle>
                {untrained.length} {untrained.length === 1 ? "muscle" : "muscles"} untrained in{" "}
                {window} days
              </AlertTitle>
              <AlertDescription>
                {untrained.map((muscle) => muscle.displayName).join(", ")}.
              </AlertDescription>
            </Alert>
          ) : null}

          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-sm font-semibold text-muted-foreground">Volume</h2>
            <div className="overflow-hidden rounded-lg border bg-card">
              <MuscleVolumeList muscles={muscles} selected={selected} onSelect={setSelected} />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-sm font-semibold text-muted-foreground">Intensity</h2>
            {intensity.isPending ? (
              <Skeleton className="h-20 w-full" />
            ) : intensity.isError ? (
              <Alert variant="destructive">
                <AlertTitle>Couldn&apos;t load intensity</AlertTitle>
                <AlertDescription>Check your connection and try again.</AlertDescription>
              </Alert>
            ) : (
              <IntensitySummary data={intensity.data} />
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-sm font-semibold text-muted-foreground">
              Exercise trend
            </h2>
            <ExerciseTrend window={window} />
          </section>
        </>
      )}

      {/*
        Outside the volume branch, not inside it. A week with no working sets is
        exactly the week someone is most likely to be watching the scale, and
        an empty heatmap is no reason to hide their weigh-ins.
      */}
      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-sm font-semibold text-muted-foreground">Bodyweight</h2>
        <BodyweightSection window={window} />
      </section>
    </div>
  );
}
