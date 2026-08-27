import { Plus } from "lucide-react";
import * as React from "react";

import { formatWeight, formatWhen } from "@setwise/domain/format";
import { ghostForPosition } from "@setwise/domain/overload";
import { describeTargets, type Targets } from "@setwise/domain/targets";
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
import type { LoggerExercise, LoggerLastPerformance, LoggerSet } from "./types";

/**
 * One exercise and its sets.
 *
 * The ghost arrives with the workout rather than being fetched here. It used to
 * be a query per block, which meant six requests on a six-exercise day for the
 * one number the screen is built around — and every one of them behind the
 * session that had to load first.
 */
export function ExerciseBlock({
  exercise,
  sets,
  target,
  last,
  prSetIds,
  onAddSet,
  onEditSet,
  onRemove,
}: {
  exercise: LoggerExercise;
  sets: LoggerSet[];
  /** What the routine day asks for here, if this session came from one. */
  target: Targets | null;
  /** The last time this was trained, or null for the first time. */
  last: LoggerLastPerformance | null;
  prSetIds: ReadonlySet<string>;
  onAddSet: (exercise: LoggerExercise) => void;
  onEditSet: (set: LoggerSet) => void;
  onRemove: (exerciseId: string) => void;
}) {
  const lastSets = last?.sets ?? [];

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
          {last
            ? `Last ${formatWhen(new Date(last.performedAt)).toLowerCase()} · ${summarise(last.sets)}`
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
              ghost={ghostForPosition(lastSets, ordinals.get(set.id) ?? 0, set.isWarmup)}
              isPr={prSetIds.has(set.id)}
              onEdit={() => onEditSet(set)}
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
