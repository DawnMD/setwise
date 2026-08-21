import { useQuery } from "@tanstack/react-query";

import { ghostForPosition } from "@/lib/overload";
import { orpc } from "@/lib/orpc";

import { SetSheet, type SetDraft } from "./set-sheet";
import type { LoggerExercise, LoggerSet } from "./types";

/**
 * Wires the ghost value into the set sheet.
 *
 * The lookup is the same query the exercise block already ran, so opening the
 * sheet costs nothing: TanStack serves it from cache under the same key. Kept
 * separate from `ActiveSession` because the query is per exercise and the sheet
 * only exists while one is selected.
 */
export function SetSheetForExercise({
  sessionId,
  exercise,
  siblings,
  editingSet,
  open,
  pending,
  saveError,
  onOpenChange,
  onClosed,
  onSave,
}: {
  sessionId: string;
  exercise: LoggerExercise;
  /** Sets already logged for this exercise in this session, by set index. */
  siblings: LoggerSet[];
  /** The set being edited, or null when adding a new one. */
  editingSet: LoggerSet | null;
  open: boolean;
  pending: boolean;
  saveError: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires once the sheet has finished sliding away. */
  onClosed: () => void;
  onSave: (draft: SetDraft) => void;
}) {
  const last = useQuery(
    orpc.session.lastPerformance.queryOptions({
      input: { exerciseId: exercise.id, excludeSessionId: sessionId },
      staleTime: Infinity,
    }),
  );

  const isWarmup = editingSet?.isWarmup ?? false;
  const ordinal = editingSet
    ? siblings.filter(
        (entry) => entry.isWarmup === isWarmup && entry.setIndex < editingSet.setIndex,
      ).length
    : siblings.filter((entry) => !entry.isWarmup).length;

  const label = editingSet
    ? `${isWarmup ? "Warm-up" : "Set"} ${ordinal + 1}`
    : `Set ${ordinal + 1}`;

  const previous = siblings.at(-1);
  const initial: SetDraft = editingSet
    ? {
        weight: editingSet.weight,
        reps: editingSet.reps,
        rpe: editingSet.rpe,
        isWarmup: editingSet.isWarmup,
      }
    : previous
      ? // A new set starts from the last one on this exercise: the second set of
        // five is almost always the same as the first. RPE is not carried over,
        // because how hard it felt is the one thing that changes every set.
        { weight: previous.weight, reps: previous.reps, rpe: null, isWarmup: false }
      : { weight: 0, reps: 0, rpe: null, isWarmup: false };

  return (
    <SetSheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => !isOpen && onClosed()}
      exerciseName={exercise.name}
      isBarbell={exercise.equipment === "barbell"}
      setLabel={label}
      ghost={ghostForPosition(last.data?.sets ?? [], ordinal, isWarmup)}
      ghostWhen={last.data?.performedAt ?? null}
      initial={initial}
      saveLabel={editingSet ? "Save changes" : "Save set"}
      pending={pending}
      saveError={saveError}
      onSave={onSave}
    />
  );
}
