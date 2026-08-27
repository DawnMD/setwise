import { ghostForPosition } from "@setwise/domain/overload";

import { SetSheet, type SetDraft } from "./set-sheet";
import type { LoggerExercise, LoggerLastPerformance, LoggerSet } from "./types";

/**
 * Wires the ghost value into the set sheet.
 *
 * The ghost is handed down rather than fetched: it came with the workout, so
 * opening the sheet costs nothing and cannot show a spinner where a number
 * should be. Kept separate from `ActiveSession` because the sheet only exists
 * while an exercise is selected.
 */
export function SetSheetForExercise({
  exercise,
  siblings,
  editingSet,
  last,
  open,
  pending,
  saveError,
  onOpenChange,
  onClosed,
  onSave,
}: {
  exercise: LoggerExercise;
  /** Sets already logged for this exercise in this session, by set index. */
  siblings: LoggerSet[];
  /** The set being edited, or null when adding a new one. */
  editingSet: LoggerSet | null;
  /** The last time this exercise was trained, or null for the first time. */
  last: LoggerLastPerformance | null;
  open: boolean;
  pending: boolean;
  saveError: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires once the sheet has finished sliding away. */
  onClosed: () => void;
  onSave: (draft: SetDraft) => void;
}) {
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
      ghost={ghostForPosition(last?.sets ?? [], ordinal, isWarmup)}
      ghostWhen={last ? new Date(last.performedAt) : null}
      initial={initial}
      saveLabel={editingSet ? "Save changes" : "Save set"}
      pending={pending}
      saveError={saveError}
      onSave={onSave}
    />
  );
}
