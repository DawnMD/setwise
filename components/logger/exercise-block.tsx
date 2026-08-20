"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import * as React from "react";

import { formatWeight, formatWhen } from "@/lib/format";
import { ghostForPosition } from "@/lib/overload";
import { orpc } from "@/lib/orpc";
import { describeTargets, type Targets } from "@/lib/targets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  target,
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
  /** What the routine day asks for here, if this session came from one. */
  target: Targets | null;
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

  const workingSets = sets.filter((set) => !set.isWarmup);
  const targetLabel = target ? describeTargets(target) : null;
  const hitTarget =
    target?.targetSets !== null &&
    target?.targetSets !== undefined &&
    workingSets.length >= target.targetSets;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="truncate text-[15px]">{exercise.name}</CardTitle>
        <CardDescription className="numeric">
          {last.data
            ? `Last ${formatWhen(last.data.performedAt).toLowerCase()} · ${summarise(last.data.sets)}`
            : last.isPending
              ? " "
              : "First time"}
        </CardDescription>
        <CardAction>
          {targetLabel ? (
            // The count comes first because that is what you check between
            // sets. The range behind it is the reminder of what you agreed to.
            <Badge variant={hitTarget ? "pr" : "outline"} className="numeric">
              {workingSets.length}
              {target?.targetSets !== null && target?.targetSets !== undefined
                ? ` / ${target.targetSets}`
                : ""}{" "}
              · {targetLabel}
            </Badge>
          ) : sets.length === 0 ? (
            <Button variant="ghost" size="sm" onClick={() => onRemove(exercise.id)}>
              Remove
            </Button>
          ) : null}
        </CardAction>
      </CardHeader>

      {sets.length > 0 ? (
        <CardContent className="flex flex-col gap-1 px-1">
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
        </CardContent>
      ) : null}

      <CardFooter>
        <Button
          variant="secondary"
          size="touch"
          className="w-full"
          onClick={() => onAddSet(exercise)}
        >
          <Plus data-icon="inline-start" />
          Add set
        </Button>
      </CardFooter>
    </Card>
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
