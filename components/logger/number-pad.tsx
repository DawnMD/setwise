"use client";

import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * The custom number pad.
 *
 * The OS keyboard covers half the screen, has no decimal key on several Android
 * layouts, and produces constant mistypes with wet hands. This is bigger,
 * always in the bottom third, and carries the two increment buttons that make
 * up most of what a lifter actually does between sets.
 *
 * The pad holds no value of its own: it only sends updates, and the field
 * buttons above it do the rendering. Values are edited as strings so a
 * half-typed "62." survives a keystroke, and the caller parses on save.
 */

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export type NumberPadProps = {
  /**
   * Takes the updater form, not a plain value. Two taps landing in one React
   * batch would otherwise both compute from the same stale string and the first
   * digit would vanish.
   */
  onChange: React.Dispatch<React.SetStateAction<string>>;
  /** Reps take whole numbers, so the decimal key is replaced by a spacer. */
  allowDecimal?: boolean;
  /** The two increment buttons: 2.5 for weight, 1 for reps. */
  step: number;
  min?: number;
  max?: number;
};

function stepValue(value: string, delta: number, min: number, max: number, decimals: number) {
  const current = Number.parseFloat(value);
  const base = Number.isFinite(current) ? current : 0;
  const next = Math.min(max, Math.max(min, base + delta));
  // Round to the step's own precision, or 20 + 2.5 lands on 22.500000000000004.
  const rounded = Math.round(next * 10 ** decimals) / 10 ** decimals;
  return String(rounded);
}

export function NumberPad({
  onChange,
  allowDecimal = false,
  step,
  min = 0,
  max = 9999,
}: NumberPadProps) {
  const decimals = allowDecimal ? 2 : 0;

  const append = (char: string) => {
    onChange((current) => {
      if (char === "." && (!allowDecimal || current.includes("."))) return current;
      const next = current === "0" && char !== "." ? char : current + char;
      // Guard the column width rather than the value: `numeric(6, 2)` is
      // enforced at the boundary; this only stops the display overflowing.
      return next.replace(/[^0-9]/g, "").length > 6 ? current : next;
    });
  };

  const backspace = () => onChange((current) => (current.length <= 1 ? "" : current.slice(0, -1)));

  const key = (
    label: React.ReactNode,
    onClick: () => void,
    options: { extra?: string; ariaLabel?: string } = {},
  ) => (
    <button
      key={options.ariaLabel ?? String(label)}
      type="button"
      onClick={onClick}
      aria-label={options.ariaLabel}
      // `touch-manipulation` kills the 300ms double-tap-to-zoom delay, which is
      // very noticeable when someone taps four digits in a row.
      className={cn(
        "numeric-display flex h-14 items-center justify-center rounded-lg text-2xl",
        "bg-surface-raised border border-border touch-manipulation select-none",
        "active:bg-border/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        options.extra,
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="grid grid-cols-3 gap-2">
      <button
        type="button"
        onClick={() => onChange((current) => stepValue(current, -step, min, max, decimals))}
        className={cn(
          "numeric col-span-1 h-12 rounded-lg border border-border bg-surface text-base font-medium",
          "touch-manipulation select-none active:bg-border/50",
        )}
      >
        −{step}
      </button>
      <button
        type="button"
        onClick={() => onChange("")}
        className="col-span-1 h-12 rounded-lg border border-border bg-surface text-base font-medium touch-manipulation select-none active:bg-border/50"
      >
        Clear
      </button>
      <button
        type="button"
        onClick={() => onChange((current) => stepValue(current, step, min, max, decimals))}
        className={cn(
          "numeric col-span-1 h-12 rounded-lg border border-border bg-surface text-base font-medium",
          "touch-manipulation select-none active:bg-border/50",
        )}
      >
        +{step}
      </button>

      {DIGITS.map((digit) => key(digit, () => append(digit)))}

      {allowDecimal ? (
        key(".", () => append("."))
      ) : (
        <span aria-hidden className="h-14" />
      )}
      {key("0", () => append("0"))}
      {key(<span aria-hidden>⌫</span>, backspace, {
        extra: "text-ink-muted",
        ariaLabel: "Backspace",
      })}
    </div>
  );
}
