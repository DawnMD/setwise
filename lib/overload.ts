/**
 * The signature interaction, defined once.
 *
 * Progressive overload is the entire sport, so the most motivating thing this
 * app can do is put last session's number against the field where you type this
 * session's. This decides when that delta appears.
 */

export type Ghost = { weight: number; reps: number; rpe: number | null } | null;

export type Overload =
  | { kind: "weight"; delta: number }
  | { kind: "reps"; delta: number }
  | null;

/**
 * Strict on purpose. More weight beats last time; the same weight for more reps
 * beats last time. Anything else — less weight for more reps, more weight for
 * fewer reps — is a trade, not a win, and calling it one would make the accent
 * colour mean nothing.
 */
export function overloadDelta(
  current: { weight: number; reps: number },
  ghost: Ghost,
): Overload {
  if (ghost === null) return null;

  if (current.weight > ghost.weight) {
    return { kind: "weight", delta: Math.round((current.weight - ghost.weight) * 100) / 100 };
  }

  if (current.weight === ghost.weight && current.reps > ghost.reps) {
    return { kind: "reps", delta: current.reps - ghost.reps };
  }

  return null;
}

/**
 * Which set from last session sits behind this one.
 *
 * Matched by position within its own kind: the third working set is compared to
 * the third working set, not to the third row. Warm-ups drifting in and out
 * between sessions would otherwise shift every ghost by one.
 */
export function ghostForPosition(
  lastSets: ReadonlyArray<{ weight: number; reps: number; rpe: number | null; isWarmup: boolean }>,
  ordinal: number,
  isWarmup: boolean,
): Ghost {
  const sameKind = lastSets.filter((set) => set.isWarmup === isWarmup);
  const match = sameKind[ordinal];
  if (!match) return null;
  return { weight: match.weight, reps: match.reps, rpe: match.rpe };
}
