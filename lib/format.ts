/**
 * Display formatting. Everything is stored in kilograms; conversion happens
 * here and nowhere else, so a unit preference can never reach a stored row.
 */

import { kgToLb } from "./math";

export type UnitPref = "kg" | "lb";

export function toUnit(kg: number, unit: UnitPref): number {
  return unit === "lb" ? kgToLb(kg) : kg;
}

/**
 * Trims the trailing zeroes a weight input produces. 62.5 stays 62.5, 60.00
 * becomes 60, because a set row that reads "60.00" wastes two of the digits a
 * phone on the floor has to render legibly.
 */
export function formatWeight(kg: number, unit: UnitPref = "kg"): string {
  const value = toUnit(kg, unit);
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export function formatWeightWithUnit(kg: number, unit: UnitPref = "kg"): string {
  return `${formatWeight(kg, unit)} ${unit}`;
}

/** Signed, for the overload delta. The sign is the point, so it is never dropped. */
export function formatDelta(deltaKg: number, unit: UnitPref = "kg"): string {
  const value = toUnit(deltaKg, unit);
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${rounded} ${unit}`;
}

export function formatE1rm(e1rm: number | null, unit: UnitPref = "kg"): string {
  if (e1rm === null) return "—";
  return `${Math.round(toUnit(e1rm, unit) * 10) / 10} ${unit}`;
}

/**
 * Effective sets, which are fractional because a secondary muscle is credited
 * half a set. One decimal place at most, and none when the number is whole:
 * "12" rather than "12.0", because the extra glyph carries nothing.
 */
export function formatEffectiveSets(sets: number): string {
  const rounded = Math.round(sets * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Tonnage runs to five and six figures over a 90-day window, so it is grouped
 * and never given decimals. Nobody has an opinion about the last kilogram of
 * forty tonnes.
 */
export function formatTonnage(kg: number, unit: UnitPref = "kg"): string {
  const value = Math.round(toUnit(kg, unit));
  return `${value.toLocaleString()} ${unit}`;
}

/** Relative intensity, reported as a percentage of your own recent best. */
export function formatPercent(ratio: number | null): string {
  if (ratio === null) return "—";
  return `${Math.round(ratio * 100)}%`;
}

/** RPE is a half-point scale, so one decimal, and no trailing zero on a whole. */
export function formatRpe(rpe: number | null): string {
  if (rpe === null) return "—";
  const rounded = Math.round(rpe * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** "1:30", counting down. Minutes never zero-pad; seconds always do. */
export function formatDuration(totalSeconds: number): string {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** "1h 12m" for a finished workout. Hours are dropped when there are none. */
export function formatElapsed(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

const DAY_MS = 86_400_000;

/**
 * "Today", "Yesterday", "3 days ago", then a date. The ghost value's whole job
 * is to say when you last did this, and "12 Aug" makes you do the arithmetic.
 */
export function formatWhen(date: Date, now: Date = new Date()): string {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / DAY_MS);

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return `${days} days ago`;

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
