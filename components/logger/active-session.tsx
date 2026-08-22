import { isDefinedError } from "@orpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import * as React from "react";

import type { CreateSetInput, UpdateSetInput } from "@/db/validators";
import { useCriticalData } from "@/hooks/use-critical-data";
import { useLazyMount } from "@/hooks/use-lazy-mount";
import { useRestRunning, useRestTimer } from "@/hooks/use-rest-timer";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { afterWrite, clearActiveSession, markSessionFinished, putSet } from "@/lib/cache";
import { formatWeight } from "@/lib/format";
import { newId } from "@/lib/ids";
import { orpc } from "@/lib/orpc";
import { endSpan, startSpan } from "@/lib/perf";
import { queries } from "@/lib/queries";
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
import { FinishedSummary } from "./finished-summary";
import { RestTimer } from "./rest-timer";
import type { SetDraft } from "./set-sheet";
import { SetSheetForExercise } from "./set-sheet-for-exercise";
import type { LoggerExercise, LoggerSet } from "./types";

/**
 * The picker is a drawer over 800 exercises with its own search and its own
 * create form. It is closed when the screen opens and most workouts never open
 * it, so it is not part of what a workout has to download to start.
 */
const ExercisePicker = React.lazy(() =>
  import("./exercise-picker").then((module) => ({ default: module.ExercisePicker })),
);

type Editing = {
  exercise: LoggerExercise;
  set: LoggerSet | null;
  /**
   * The id the row will be saved under.
   *
   * Chosen when the sheet opens rather than when Save is tapped, so a retry
   * after a failure restates the same set instead of logging a second one. A
   * new sheet is a new set and gets a new id.
   */
  setId: string;
};

const editNew = (exercise: LoggerExercise): Editing => ({
  exercise,
  set: null,
  setId: newId(),
});

export function ActiveSession({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const timer = useRestTimer();
  const restRunning = useRestRunning(timer);

  const options = queries.sessionDetail(sessionId);
  const sessionQuery = useQuery(options);
  const detail = sessionQuery.data;
  const isOpen = detail !== undefined && detail.endedAt === null;

  useCriticalData(sessionQuery.isSuccess || sessionQuery.isError);
  useWakeLock(isOpen);

  const [picked, setPicked] = React.useState<LoggerExercise[] | null>(null);
  const [prSetIds, setPrSetIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [saveError, setSaveError] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const pickerMounted = useLazyMount(pickerOpen);
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

  const lastPerformances = detail?.lastPerformances ?? {};

  /**
   * The set is on screen as soon as the server confirms it.
   *
   * The row comes back from the write, so the cached workout is patched with it
   * rather than thrown away and fetched again. Waiting for a refetch put a
   * whole round trip between the tap and the row appearing, on the one action
   * that happens forty times a workout with someone standing over it.
   */
  const afterSave = React.useCallback(
    (result: { set: LoggerSet; records: Array<{ previous: number | null }> }) => {
      const exercise = lineup.find((entry) => entry.id === result.set.exerciseId) ?? null;
      putSet(queryClient, result.set, exercise);

      if (result.records.some((record) => record.previous !== null)) {
        setPrSetIds((current) => new Set(current).add(result.set.id));
      }
      if (!result.set.isWarmup) timer.start();
      setSaveError(false);
      setSheetOpen(false);

      // Everything downstream — the history list, the heatmap, the weight
      // chart — is now out of date but is not on screen. Marked, not fetched.
      afterWrite.setSaved(queryClient);

      // Measured to the paint that shows the row, not to the response.
      requestAnimationFrame(() => endSpan("set-confirm"));
    },
    [lineup, queryClient, timer],
  );

  const onSaveError = React.useCallback(() => {
    setSaveError(true);
    endSpan("set-confirm");
  }, []);

  const createSet = useMutation(
    orpc.session.createSet.mutationOptions({
      onSuccess: afterSave,
      onError: onSaveError,
      // The client names the row, so a retry restates the same set rather than
      // logging a second one. Only worth doing for a lost connection: a typed
      // error is an answer, and asking again would get the same one.
      retry: (failureCount, error) => failureCount < 1 && !isDefinedError(error),
      retryDelay: 300,
    }),
  );
  const updateSet = useMutation(
    orpc.session.updateSet.mutationOptions({
      onSuccess: afterSave,
      onError: onSaveError,
      retry: (failureCount, error) => failureCount < 1 && !isDefinedError(error),
      retryDelay: 300,
    }),
  );
  const finish = useMutation(orpc.session.finish.mutationOptions());
  const discard = useMutation(orpc.session.discard.mutationOptions());

  const saving = createSet.isPending || updateSet.isPending;

  const submit = (target: Editing, draft: SetDraft) => {
    setSaveError(false);
    startSpan("set-confirm");

    const siblings = setsByExercise.get(target.exercise.id) ?? [];
    const values = {
      id: target.setId,
      sessionId,
      exerciseId: target.exercise.id,
      setIndex: target.set?.setIndex ?? siblings.length,
      weight: draft.weight,
      reps: draft.reps,
      rpe: draft.rpe,
      isWarmup: draft.isWarmup,
    };

    if (target.set) {
      updateSet.mutate(values satisfies UpdateSetInput);
      return;
    }

    createSet.mutate(values satisfies CreateSetInput);
  };

  const doFinish = () => {
    setConfirm(null);
    startSpan("finish-summary");
    finish.mutate(
      { id: sessionId, notes: null },
      {
        onSuccess: (result) => {
          timer.stop();
          markSessionFinished(queryClient, sessionId, result.session);
          clearActiveSession(queryClient);
          afterWrite.workoutFinished(queryClient);
          requestAnimationFrame(() => endSpan("finish-summary"));
        },
        onError: () => endSpan("finish-summary"),
      },
    );
  };

  const doDiscard = () => {
    setConfirm(null);
    discard.mutate(
      { id: sessionId },
      {
        onSuccess: () => {
          timer.stop();
          queryClient.removeQueries({ queryKey: options.queryKey });
          clearActiveSession(queryClient);
          afterWrite.sessionLifecycle(queryClient);
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

  const openPicker = () => setPickerOpen(true);

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
              <Button size="touch" onClick={openPicker}>
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
                sets={setsByExercise.get(exercise.id) ?? []}
                target={targetsByExercise.get(exercise.id) ?? null}
                last={lastPerformances[exercise.id] ?? null}
                prSetIds={prSetIds}
                onAddSet={(target) => {
                  setSaveError(false);
                  setEditing(editNew(target));
                  setSheetOpen(true);
                }}
                onEditSet={(set) => {
                  setSaveError(false);
                  setEditing({ exercise, set, setId: set.id });
                  setSheetOpen(true);
                }}
                onRemove={(exerciseId) =>
                  setPicked((current) =>
                    (current ?? plannedLineup).filter((entry) => entry.id !== exerciseId),
                  )
                }
              />
            ))}

            <Button variant="secondary" size="touch" className="w-full" onClick={openPicker}>
              <Plus data-icon="inline-start" />
              Add exercise
            </Button>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-10 mt-auto">
        {restRunning ? <RestTimer timer={timer} /> : null}
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

      {pickerMounted ? (
        <React.Suspense fallback={null}>
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
              setEditing(editNew(exercise));
              setSheetOpen(true);
            }}
          />
        </React.Suspense>
      ) : null}

      {editing ? (
        <SetSheetForExercise
          key={editing.set?.id ?? `new-${editing.exercise.id}`}
          exercise={editing.exercise}
          siblings={setsByExercise.get(editing.exercise.id) ?? []}
          editingSet={editing.set}
          last={lastPerformances[editing.exercise.id] ?? null}
          open={sheetOpen}
          pending={saving}
          saveError={saveError}
          onOpenChange={(open) => {
            if (!saving) setSheetOpen(open);
          }}
          onClosed={() => setEditing(null)}
          onSave={(draft) => submit(editing, draft)}
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
