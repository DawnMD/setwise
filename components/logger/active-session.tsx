import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import * as React from "react";

import type { CreateSetInput, UpdateSetInput } from "@/db/validators";
import { useRestTimer } from "@/hooks/use-rest-timer";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { formatWeight } from "@/lib/format";
import { orpc } from "@/lib/orpc";
import type { Targets } from "@/lib/targets";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

import { Elapsed } from "./elapsed";
import { ExerciseBlock } from "./exercise-block";
import { ExercisePicker } from "./exercise-picker";
import { FinishedSummary } from "./finished-summary";
import { RestTimer } from "./rest-timer";
import type { SetDraft } from "./set-sheet";
import { SetSheetForExercise } from "./set-sheet-for-exercise";
import type { LoggerExercise, LoggerSet } from "./types";

type Editing = { exercise: LoggerExercise; set: LoggerSet | null };

export function ActiveSession({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rest = useRestTimer();

  const options = orpc.session.get.queryOptions({ input: { id: sessionId } });
  const sessionQuery = useQuery(options);
  const detail = sessionQuery.data;
  const isOpen = detail !== undefined && detail.endedAt === null;

  useWakeLock(isOpen);

  const [picked, setPicked] = React.useState<LoggerExercise[] | null>(null);
  const [prSetIds, setPrSetIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [saveError, setSaveError] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<"finish" | "discard" | null>(null);

  const plannedLineup = React.useMemo(
    () =>
      detail?.plan?.exercises.map((entry) => ({
        id: entry.exerciseId,
        name: entry.name,
        equipment: entry.equipment,
      })) ?? [],
    [detail],
  );

  const lineup = React.useMemo(() => {
    const server = detail?.exercises ?? [];
    const byId = new Map(server.map((entry) => [entry.id, entry]));
    const merged: LoggerExercise[] = [];
    const seen = new Set<string>();

    for (const entry of picked ?? plannedLineup) {
      merged.push(byId.get(entry.id) ?? entry);
      seen.add(entry.id);
    }
    for (const entry of server) {
      if (!seen.has(entry.id)) merged.push(entry);
    }
    return merged;
  }, [detail, picked, plannedLineup]);

  const targetsByExercise = React.useMemo(() => {
    const map = new Map<string, Targets>();
    for (const entry of detail?.plan?.exercises ?? []) {
      map.set(entry.exerciseId, {
        targetSets: entry.targetSets,
        targetRepLow: entry.targetRepLow,
        targetRepHigh: entry.targetRepHigh,
        targetRpe: entry.targetRpe,
      });
    }
    return map;
  }, [detail]);

  const setsByExercise = React.useMemo(() => {
    const map = new Map<string, LoggerSet[]>();
    for (const set of detail?.sets ?? []) {
      const list = map.get(set.exerciseId);
      if (list) list.push(set);
      else map.set(set.exerciseId, [set]);
    }
    for (const list of map.values()) list.sort((a, b) => a.setIndex - b.setIndex);
    return map;
  }, [detail]);

  const afterSave = React.useCallback(
    async (result: { set: LoggerSet; records: Array<{ previous: number | null }> }) => {
      await queryClient.invalidateQueries({ queryKey: options.queryKey });
      if (result.records.some((record) => record.previous !== null)) {
        setPrSetIds((current) => new Set(current).add(result.set.id));
      }
      if (!result.set.isWarmup) rest.start();
      setSaveError(false);
      setSheetOpen(false);
    },
    [options.queryKey, queryClient, rest],
  );

  const createSet = useMutation(
    orpc.session.createSet.mutationOptions({
      onSuccess: afterSave,
      onError: () => setSaveError(true),
    }),
  );
  const updateSet = useMutation(
    orpc.session.updateSet.mutationOptions({
      onSuccess: afterSave,
      onError: () => setSaveError(true),
    }),
  );
  const finish = useMutation(orpc.session.finish.mutationOptions());
  const discard = useMutation(orpc.session.discard.mutationOptions());

  const saving = createSet.isPending || updateSet.isPending;

  const submit = (exercise: LoggerExercise, draft: SetDraft, existing: LoggerSet | null) => {
    setSaveError(false);
    const siblings = setsByExercise.get(exercise.id) ?? [];
    const values: CreateSetInput = {
      sessionId,
      exerciseId: exercise.id,
      setIndex: existing?.setIndex ?? siblings.length,
      weight: draft.weight,
      reps: draft.reps,
      rpe: draft.rpe,
      isWarmup: draft.isWarmup,
    };

    if (existing) {
      const input: UpdateSetInput = { ...values, id: existing.id };
      updateSet.mutate(input);
    } else {
      createSet.mutate(values);
    }
  };

  const doFinish = () => {
    setConfirm(null);
    finish.mutate(
      { id: sessionId, notes: null },
      {
        onSuccess: () => {
          rest.stop();
          void queryClient.invalidateQueries({ queryKey: options.queryKey });
        },
      },
    );
  };

  const doDiscard = () => {
    setConfirm(null);
    discard.mutate(
      { id: sessionId },
      {
        onSuccess: () => {
          rest.stop();
          void navigate({ to: "/train", replace: true });
        },
      },
    );
  };

  if (sessionQuery.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-[520px] flex-col gap-3 px-4 py-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (sessionQuery.isError || !detail) {
    return (
      <div className="mx-auto w-full max-w-[520px] px-4 py-10">
        <Empty className="border">
          <EmptyTitle>That workout couldn&apos;t be loaded</EmptyTitle>
          <EmptyDescription>
            It may have been discarded on another device. Check your connection and try again.
          </EmptyDescription>
          <EmptyContent>
            <Button
              variant="outline"
              size="touch"
              onClick={() => void navigate({ to: "/train", replace: true })}
            >
              Back to training
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  if (detail.endedAt) {
    return <FinishedSummary detail={detail} records={finish.data?.records ?? []} />;
  }

  const working = detail.sets.filter((set) => !set.isWarmup);
  const tonnage = working.reduce((total, set) => total + set.weight * set.reps, 0);

  return (
    <>
      <div className="mx-auto w-full max-w-[520px] px-4 pb-4">
        <header className="flex items-center justify-between gap-3 py-3">
          <div>
            <h1 className="font-heading text-lg font-semibold">
              {detail.plan ? detail.plan.dayName : "Workout"}
            </h1>
            <p className="numeric text-xs text-muted-foreground">
              {detail.plan ? `${detail.plan.routineName} · ` : ""}
              <Elapsed since={detail.startedAt} /> · {working.length} sets ·{" "}
              {formatWeight(Math.round(tonnage))} kg
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setConfirm("discard")}>
            Discard
          </Button>
        </header>

        {lineup.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyTitle>No exercises yet</EmptyTitle>
            <EmptyDescription>Add the first one and log a set against it.</EmptyDescription>
            <EmptyContent>
              <Button size="touch" onClick={() => setPickerOpen(true)}>
                <Plus data-icon="inline-start" />
                Add exercise
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {lineup.map((exercise) => (
              <ExerciseBlock
                key={exercise.id}
                exercise={exercise}
                sessionId={sessionId}
                sets={setsByExercise.get(exercise.id) ?? []}
                target={targetsByExercise.get(exercise.id) ?? null}
                prSetIds={prSetIds}
                onAddSet={(target) => {
                  setSaveError(false);
                  setEditing({ exercise: target, set: null });
                  setSheetOpen(true);
                }}
                onEditSet={(set) => {
                  setSaveError(false);
                  setEditing({ exercise, set });
                  setSheetOpen(true);
                }}
                onRemove={(exerciseId) =>
                  setPicked((current) =>
                    (current ?? plannedLineup).filter((entry) => entry.id !== exerciseId),
                  )
                }
              />
            ))}

            <Button
              variant="secondary"
              size="touch"
              className="w-full"
              onClick={() => setPickerOpen(true)}
            >
              <Plus data-icon="inline-start" />
              Add exercise
            </Button>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-10 mt-auto">
        {rest.running ? (
          <RestTimer
            remaining={rest.remaining}
            duration={rest.duration}
            done={rest.done}
            onExtend={rest.extend}
            onSkip={rest.stop}
            onRestart={rest.start}
          />
        ) : null}
        <div className="border-t bg-card px-4 py-3">
          <Button
            size="touch"
            className="mx-auto w-full max-w-[520px]"
            disabled={finish.isPending}
            onClick={() => setConfirm("finish")}
          >
            {finish.isPending ? <Spinner data-icon="inline-start" /> : null}
            {finish.isPending ? "Finishing…" : "Finish workout"}
          </Button>
        </div>
      </div>

      <ExercisePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(exercise) => {
          setPickerOpen(false);
          setPicked((current) =>
            (current ?? plannedLineup).some((entry) => entry.id === exercise.id)
              ? (current ?? plannedLineup)
              : [...(current ?? plannedLineup), exercise],
          );
          setSaveError(false);
          setEditing({ exercise, set: null });
          setSheetOpen(true);
        }}
      />

      {editing ? (
        <SetSheetForExercise
          key={editing.set?.id ?? `new-${editing.exercise.id}`}
          sessionId={sessionId}
          exercise={editing.exercise}
          siblings={setsByExercise.get(editing.exercise.id) ?? []}
          editingSet={editing.set}
          open={sheetOpen}
          pending={saving}
          saveError={saveError}
          onOpenChange={(open) => {
            if (!saving) setSheetOpen(open);
          }}
          onClosed={() => setEditing(null)}
          onSave={(draft) => submit(editing.exercise, draft, editing.set)}
        />
      ) : null}

      <AlertDialog open={confirm === "finish"} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finish workout?</AlertDialogTitle>
            <AlertDialogDescription>
              {working.length} working sets, {formatWeight(Math.round(tonnage))} kg total.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="touch">Keep going</AlertDialogCancel>
            <AlertDialogAction size="touch" onClick={doFinish}>
              Finish workout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirm === "discard"} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this workout?</AlertDialogTitle>
            <AlertDialogDescription>
              Every set in it is deleted. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="touch">Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" size="touch" onClick={doDiscard}>
              Discard workout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
