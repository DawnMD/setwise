"use client";

import Link from "next/link";

import { formatElapsed, formatWeight, formatWhen } from "@/lib/format";
import { estimateOneRepMax } from "@/lib/math";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";

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
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4 px-4 py-4">
      <header className="py-2">
        <h1 className="font-heading text-lg font-semibold">Workout saved</h1>
        <p className="text-xs text-muted-foreground">
          {formatWhen(new Date(detail.startedAt))}
          {duration ? ` · ${duration}` : ""}
        </p>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Sets" value={String(working.length)} />
        <Stat label="Exercises" value={String(detail.exercises.length)} />
        <Stat label="Volume" value={`${formatWeight(Math.round(tonnage))} kg`} />
      </div>

      {beaten.length > 0 ? (
        <Card className="border-pr/30 bg-pr/5">
          <CardHeader>
            <CardTitle className="text-pr">Most volume yet</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {beaten.map((record) => (
              <div key={record.exerciseId} className="numeric flex justify-between gap-3 text-sm">
                <span className="truncate">{record.exerciseName}</span>
                <span className="shrink-0 text-muted-foreground">
                  {formatWeight(Math.round(record.value))} kg, was{" "}
                  {formatWeight(Math.round(record.previous ?? 0))}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

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
          <Card key={exercise.id}>
            <CardHeader>
              <CardTitle className="truncate text-[15px]">{exercise.name}</CardTitle>
              {best !== null ? (
                <CardDescription className="numeric">
                  best e1RM {Math.round(best * 10) / 10} kg
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="numeric flex flex-col gap-0.5 text-sm text-muted-foreground">
              {sets.map((set) => (
                <span key={set.id}>
                  {set.isWarmup ? "W " : ""}
                  {formatWeight(set.weight)} kg × {set.reps}
                  {set.rpe !== null ? ` @ ${set.rpe}` : ""}
                </span>
              ))}
            </CardContent>
          </Card>
        );
      })}

      <Button size="touch" className="mt-2 w-full" render={<Link href="/train" />}>
        Done
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Item variant="outline" size="xs" className="flex-col items-start gap-0">
      <ItemContent>
        <ItemDescription className="text-xs">{label}</ItemDescription>
        <ItemTitle className="numeric-display text-xl">{value}</ItemTitle>
      </ItemContent>
    </Item>
  );
}
