import type { MuscleSlug } from "@setwise/domain/muscles";

/**
 * free-exercise-db tags each exercise with seventeen coarse muscle names. Ours
 * are eighteen finer regions, so the mapping is lossy in three specific ways
 * worth knowing about before you trust a heatmap built on it:
 *
 * 1. `shoulders` is one tag for what we treat as three separate training
 *    decisions. It is split across front and side delts at half credit each so
 *    a set never counts twice, but the split is a guess. Every exercise where
 *    the delt head actually matters is corrected by hand in `overrides.ts`.
 * 2. `abductors` has no region of its own. Hip abduction is mostly glute
 *    medius, so it lands on glutes.
 * 3. `neck` has no region either, and folds into traps.
 *
 * The weights here are shares of a single set, not the plan's primary/secondary
 * factors. An unambiguous tag maps 1:1 and keeps its full credit; only an
 * ambiguous tag splits.
 */
export type SourceMuscleTag =
  | "abdominals"
  | "abductors"
  | "adductors"
  | "biceps"
  | "calves"
  | "chest"
  | "forearms"
  | "glutes"
  | "hamstrings"
  | "lats"
  | "lower back"
  | "middle back"
  | "neck"
  | "quadriceps"
  | "shoulders"
  | "traps"
  | "triceps";

export const SOURCE_MUSCLE_MAP: Record<SourceMuscleTag, Array<[MuscleSlug, number]>> = {
  abdominals: [["abs", 1]],
  abductors: [["glutes", 1]],
  adductors: [["adductors", 1]],
  biceps: [["biceps", 1]],
  calves: [["calves", 1]],
  chest: [["chest", 1]],
  forearms: [["forearms", 1]],
  glutes: [["glutes", 1]],
  hamstrings: [["hamstrings", 1]],
  lats: [["lats", 1]],
  "lower back": [["lower_back", 1]],
  "middle back": [["upper_back", 1]],
  neck: [["traps", 1]],
  quadriceps: [["quads", 1]],
  shoulders: [
    ["front_delts", 0.5],
    ["side_delts", 0.5],
  ],
  traps: [["traps", 1]],
  triceps: [["triceps", 1]],
};

/** Per the plan: a primary mover earns a full set, a secondary earns half. */
export const PRIMARY_FACTOR = 1;
export const SECONDARY_FACTOR = 0.5;
