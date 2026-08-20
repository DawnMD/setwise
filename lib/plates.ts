/**
 * Plate math, and the only place in the app that uses more than one colour.
 *
 * Competition plates are standardised, and every lifter reads them without
 * thinking. Here the colours carry real meaning, so they earn their place; the
 * rest of the interface stays neutral with a single accent.
 */

export type Plate = {
  /** Kilograms, per plate. */
  kg: number;
  /** IWF competition colour, or the chrome of the small change plates. */
  color: string;
  /** Needed because the white and yellow plates vanish on a light surface. */
  ring: string;
  label: string;
};

/**
 * Descending, because the loading algorithm is greedy and reads this in order.
 * The 25/20/15/10/5 discs are the full-size rubber plates; below that they are
 * the metal change plates, which follow the same colour cycle at a tenth of the
 * weight.
 */
export const PLATES: readonly Plate[] = [
  { kg: 25, color: "#c8102e", ring: "#8c0b20", label: "25" },
  { kg: 20, color: "#0033a0", ring: "#00246f", label: "20" },
  { kg: 15, color: "#ffd100", ring: "#b39200", label: "15" },
  { kg: 10, color: "#00843d", ring: "#005c2a", label: "10" },
  { kg: 5, color: "#ffffff", ring: "#9a9a95", label: "5" },
  { kg: 2.5, color: "#c8102e", ring: "#8c0b20", label: "2.5" },
  { kg: 2, color: "#0033a0", ring: "#00246f", label: "2" },
  { kg: 1.5, color: "#ffd100", ring: "#b39200", label: "1.5" },
  { kg: 1.25, color: "#b6b8bb", ring: "#7d7f82", label: "1.25" },
  { kg: 1, color: "#00843d", ring: "#005c2a", label: "1" },
  { kg: 0.5, color: "#ffffff", ring: "#9a9a95", label: "0.5" },
];

/** A men's competition bar. Anything else is a per-lift decision, not a default. */
export const DEFAULT_BAR_KG = 20;

export type Loading = {
  barKg: number;
  /** One entry per plate that goes on each sleeve, heaviest first. */
  perSide: Plate[];
  /** What the plates on hand could not make up. Zero when the load is exact. */
  remainderKg: number;
  /** The weight the bar actually ends up at: bar + 2 × the plates listed. */
  achievedKg: number;
};

/**
 * Greedy from the heaviest plate down.
 *
 * Greedy is optimal for this set because every plate divides evenly into the
 * ones above it, and it is also what a lifter does at the rack, so the answer
 * matches what they would have loaded anyway.
 *
 * Returns null when the target is below the bar: "you cannot load 15 kg on a
 * 20 kg bar" is a real answer, and inventing a loading for it would be a lie.
 */
export function loadBar(
  targetKg: number,
  barKg: number = DEFAULT_BAR_KG,
  available: readonly Plate[] = PLATES,
): Loading | null {
  if (!Number.isFinite(targetKg) || !Number.isFinite(barKg)) return null;
  if (targetKg < barKg) return null;

  // Work in half-kilos-per-side as integer hundredths, so 2.5 + 1.25 does not
  // drift into 3.7499999999999996 and leave a phantom remainder.
  let remainingPerSide = Math.round(((targetKg - barKg) / 2) * 100);
  const perSide: Plate[] = [];

  for (const plate of available) {
    const step = Math.round(plate.kg * 100);
    while (remainingPerSide >= step) {
      perSide.push(plate);
      remainingPerSide -= step;
    }
  }

  const remainderKg = (remainingPerSide / 100) * 2;
  return {
    barKg,
    perSide,
    remainderKg,
    achievedKg: targetKg - remainderKg,
  };
}

/** Collapses the loading into "2 × 20, 1 × 5" for a screen reader and the CSV. */
export function describeLoading(loading: Loading): string {
  if (loading.perSide.length === 0) return "Empty bar";
  const counts = new Map<string, { plate: Plate; count: number }>();
  for (const plate of loading.perSide) {
    const entry = counts.get(plate.label);
    if (entry) entry.count += 1;
    else counts.set(plate.label, { plate, count: 1 });
  }
  return [...counts.values()].map(({ plate, count }) => `${count} × ${plate.label}`).join(", ");
}
