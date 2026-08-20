/**
 * The training math, defined once so the client, the API and any export all
 * agree on what a number means.
 */

/** Epley is only trustworthy in this range. Outside it, return null. */
export const E1RM_MIN_REPS = 1;
export const E1RM_MAX_REPS = 12;

/**
 * Estimated one-rep max, Epley: `weight * (1 + reps / 30)`.
 *
 * Returns null above twelve reps rather than a plausible-looking wrong number.
 * Epley drifts badly at high reps, and a silently bad e1RM would show up as a
 * fake PR and a fake trend line.
 */
export function estimateOneRepMax(weight: number, reps: number): number | null {
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) return null;
  if (weight <= 0) return null;
  if (reps < E1RM_MIN_REPS || reps > E1RM_MAX_REPS) return null;
  if (!Number.isInteger(reps)) return null;
  return weight * (1 + reps / 30);
}

/**
 * Heatmap bands by weekly effective sets. Derived from common hypertrophy
 * volume landmarks: a starting point, not gospel.
 *
 * `none` is deliberately its own band rather than the bottom of a ramp. A muscle
 * you did not train is a fact worth stating plainly, and it is the most
 * actionable thing the heatmap can say.
 */
export type VolumeBand = "none" | "low" | "productive" | "high";

export function volumeBand(effectiveSets: number): VolumeBand {
  if (effectiveSets <= 0) return "none";
  if (effectiveSets < 10) return "low";
  if (effectiveSets < 20) return "productive";
  return "high";
}

/** Tonnage for one set. Warm-ups are excluded by the caller, not here. */
export function setTonnage(weight: number, reps: number, factor: number): number {
  return weight * reps * factor;
}

/**
 * Relative intensity: this set's weight against the best e1RM for the exercise
 * in the trailing window. Reported as a window average and always shown beside
 * average RPE, never blended into a single number.
 */
export function relativeIntensity(weight: number, bestE1rm: number | null): number | null {
  if (bestE1rm === null || bestE1rm <= 0) return null;
  return weight / bestE1rm;
}

const KG_PER_LB = 0.45359237;

/** Everything is stored in kilograms; these are display-layer only. */
export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}
