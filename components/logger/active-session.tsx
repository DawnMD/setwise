"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import type { SetInput } from "@/db/validators";
import { useRestTimer } from "@/hooks/use-rest-timer";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { formatWeight } from "@/lib/format";
import { orpc } from "@/lib/orpc";
import type { Targets } from "@/lib/targets";
import { uuidv7 } from "@/lib/uuid";
import { Button } from "@/components/ui/button";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import type { LoggerExercise, LoggerSession, LoggerSet, RowStatus } from "./types";

type PendingWrite = { status: RowStatus; input: SetInput };

/** Which set the sheet is pointed at. Null when it is closed and unmounted. */
type Editing = { exercise: LoggerExercise; set: LoggerSet | null };

const lineupKey = (sessionId: string) => `setwise:lineup:${sessionId}`;

/**
 * Exercises picked but not yet logged against exist only on the client: an
 * exercise with no sets is not part of anyone's training history, so it does
 * not earn a row in the database. Keeping the pick order in `localStorage` is
 * what stops a stray refresh from wiping a lineup someone just set up.
 */
function readLineup(sessionId: string): LoggerExercise[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(lineupKey(sessionId));
    return raw ? (JSON.parse(raw) as LoggerExercise[]) : null;
  } catch {
    return null;
  }
}

export function ActiveSession({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const rest = useRestTimer();

  const options = orpc.session.get.queryOptions({ input: { id: sessionId } });
  const sessionQuery = useQuery(options);
  const queryKey = options.queryKey;
  const detail = sessionQuery.data;
  const isOpen = detail !== undefined && detail.endedAt === null;

  useWakeLock(isOpen);

  const [picked, setPicked] = React.useState<LoggerExercise[] | null>(() => readLineup(sessionId));
  const [pending, setPending] = React.useState<Record<string, PendingWrite>>({});
  const [prSetIds, setPrSetIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<"finish" | "unsaved" | "discard" | null>(null);

  /**
   * The pick order wins, with anything the server knows about appended.
   *
   * Derived rather than synced into state: an effect merging the two would let
   * the order flip for a beat every time a set saves and the server's list
   * grows. The tail covers a lost `localStorage` — a reload on another phone
   * still shows the whole workout, just in logged order.
   */
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
  }, [picked, plannedLineup, detail]);

  React.useEffect(() => {
    if (!isOpen) return;
    window.localStorage.setItem(lineupKey(sessionId), JSON.stringify(lineup));
  }, [lineup, sessionId, isOpen]);

  /** Targets by exercise id, so a block can find its own without a scan. */
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

  const failedIds = React.useMemo(
    () => Object.keys(pending).filter((id) => pending[id].status === "failed"),
    [pending],
  );

  const writeSetToCache = React.useCallback(
    (set: LoggerSet, exercise: LoggerExercise) => {
      queryClient.setQueryData(queryKey, (old: LoggerSession | undefined) => {
        if (!old) return old;
        const known = old.sets.some((entry) => entry.id === set.id);
        return {
          ...old,
          sets: known
            ? old.sets.map((entry) => (entry.id === set.id ? set : entry))
            : [...old.sets, set],
          exercises: old.exercises.some((entry) => entry.id === exercise.id)
            ? old.exercises
            : [...old.exercises, exercise],
        };
      });
    },
    [queryClient, queryKey],
  );

  const dropFromCache = React.useCallback(
    (setId: string) => {
      queryClient.setQueryData(queryKey, (old: LoggerSession | undefined) =>
        old ? { ...old, sets: old.sets.filter((entry) => entry.id !== setId) } : old,
      );
    },
    [queryClient, queryKey],
  );

  /**
   * Optimistic, and deliberately not rolled back on failure.
   *
   * The plan says to roll the cache back and show a retry affordance. Removing
   * the row would take the user's numbers off the screen at the exact moment
   * they need to read them back, so the row stays and turns red instead. Same
   * contract — nothing that failed is ever shown as saved — with the data still
   * in front of them.
   */
  const logSet = useMutation(
    orpc.session.logSet.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey });
        setPending((current) => ({ ...current, [input.id]: { status: "saving", input } }));
      },
      onError: (_error, input) => {
        setPending((current) => ({ ...current, [input.id]: { status: "failed", input } }));
      },
      onSuccess: (result, input) => {
        setPending((current) => {
          const next = { ...current };
          delete next[input.id];
          return next;
        });

        const exercise = lineup.find((entry) => entry.id === input.exerciseId) ?? {
          id: input.exerciseId,
          name: "Exercise",
          equipment: null,
        };
        writeSetToCache(result.set, exercise);

        // Only celebrate records that beat something. A first-ever set is
        // stored as a record so the history is complete, but telling someone
        // every set of their first workout is a PR makes the badge worthless.
        if (result.records.some((record) => record.previous !== null)) {
          setPrSetIds((current) => new Set(current).add(result.set.id));
        }

        if (!result.set.isWarmup) rest.start();
      },
    }),
  );

  const deleteSet = useMutation(
    orpc.session.deleteSet.mutationOptions({
      onSuccess: (_result, input) => dropFromCache(input.id),
    }),
  );

  const finish = useMutation(orpc.session.finish.mutationOptions());
  const discard = useMutation(orpc.session.discard.mutationOptions());

  const submit = (exercise: LoggerExercise, draft: SetDraft, existing: LoggerSet | null) => {
    const siblings = setsByExercise.get(exercise.id) ?? [];
    const input: SetInput = {
      // A new set gets a client-generated id; an edit keeps the one it has, so
      // the upsert rewrites that row rather than adding a second one.
      id: existing?.id ?? uuidv7(),
      sessionId,
      exerciseId: exercise.id,
      setIndex: existing?.setIndex ?? siblings.length,
      weight: draft.weight,
      reps: draft.reps,
      rpe: draft.rpe,
      isWarmup: draft.isWarmup,
      clientCreatedAt: existing?.clientCreatedAt ?? new Date(),
    };

    // Into the cache before the request, so the row is on screen immediately and
    // the UI never waits on the network.
    writeSetToCache({ ...input, performedAt: existing?.performedAt ?? new Date() }, exercise);
    setSheetOpen(false);
    logSet.mutate(input);
  };

  const retry = (setId: string) => {
    const write = pending[setId];
    if (write) logSet.mutate(write.input);
  };

  const removeSet = (setId: string) => {
    if (pending[setId]?.status === "failed") {
      // It never reached the server, so there is nothing there to delete.
      setPending((current) => {
        const next = { ...current };
        delete next[setId];
        return next;
      });
      dropFromCache(setId);
      return;
    }
    deleteSet.mutate({ id: setId, sessionId });
  };

  const doFinish = () => {
    setConfirm(null);
    finish.mutate(
      { id: sessionId, notes: null },
      {
        onSuccess: () => {
          window.localStorage.removeItem(lineupKey(sessionId));
          rest.stop();
          void queryClient.invalidateQueries({ queryKey });
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
          window.localStorage.removeItem(lineupKey(sessionId));
          rest.stop();
          router.replace("/train");
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
            <Button variant="outline" size="touch" onClick={() => router.replace("/train")}>
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
                statusOf={(setId) => pending[setId]?.status ?? "saved"}
                prSetIds={prSetIds}
                onAddSet={(target) => {
                  setEditing({ exercise: target, set: null });
                  setSheetOpen(true);
                }}
                onEditSet={(set) => {
                  setEditing({ exercise, set });
                  setSheetOpen(true);
                }}
                onRetrySet={retry}
                onDeleteSet={removeSet}
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

        {failedIds.length > 0 ? (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>
              {failedIds.length === 1
                ? "1 set didn't save"
                : `${failedIds.length} sets didn't save`}
            </AlertTitle>
            <AlertDescription>Tap the red row to retry.</AlertDescription>
          </Alert>
        ) : null}
      </div>

      {/* The rest timer and the finish button both sit above the nav, in the
          bottom third. There is never a top-right save button. */}
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
            onClick={() => setConfirm(failedIds.length > 0 ? "unsaved" : "finish")}
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
          // Straight into the set sheet: picking an exercise and then not
          // logging against it is not something anyone does mid-workout.
          setEditing({ exercise, set: null });
          setSheetOpen(true);
        }}
      />

      {editing ? (
        <SetSheetForExercise
          // Keyed per target, so opening a different row starts from that row's
          // values rather than the previous one's.
          key={editing.set?.id ?? `new-${editing.exercise.id}`}
          sessionId={sessionId}
          exercise={editing.exercise}
          siblings={setsByExercise.get(editing.exercise.id) ?? []}
          editingSet={editing.set}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
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

      <AlertDialog
        // Derived, not just `confirm === "unsaved"`: retrying the last failed
        // set from inside this dialog should dismiss it, not leave it up saying
        // zero sets are unsaved.
        open={confirm === "unsaved" && failedIds.length > 0}
        onOpenChange={(open) => !open && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Some sets didn&apos;t save</AlertDialogTitle>
            <AlertDialogDescription>
              {failedIds.length} {failedIds.length === 1 ? "set is" : "sets are"} still only on this
              phone. Finishing now loses {failedIds.length === 1 ? "it" : "them"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="touch">Keep going</AlertDialogCancel>
            <Button variant="secondary" size="touch" onClick={() => failedIds.forEach(retry)}>
              Retry all
            </Button>
            <AlertDialogAction variant="destructive" size="touch" onClick={doFinish}>
              Finish anyway
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
