import { Delete } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";

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

  // `touch-manipulation` kills the 300ms double-tap-to-zoom delay, which is
  // very noticeable when someone taps four digits in a row.
  const keyClass = "numeric-display h-14 flex-1 text-2xl touch-manipulation";

  return (
    <div className="flex flex-col gap-2">
      <ButtonGroup className="w-full">
        <Button
          variant="outline"
          size="touch"
          className="numeric flex-1 touch-manipulation"
          onClick={() => onChange((current) => stepValue(current, -step, min, max, decimals))}
        >
          −{step}
        </Button>
        <Button
          variant="outline"
          size="touch"
          className="flex-1 touch-manipulation"
          onClick={() => onChange("")}
        >
          Clear
        </Button>
        <Button
          variant="outline"
          size="touch"
          className="numeric flex-1 touch-manipulation"
          onClick={() => onChange((current) => stepValue(current, step, min, max, decimals))}
        >
          +{step}
        </Button>
      </ButtonGroup>

      <div className="grid grid-cols-3 gap-2">
        {DIGITS.map((digit) => (
          <Button
            key={digit}
            variant="outline"
            size="touch"
            className={keyClass}
            onClick={() => append(digit)}
          >
            {digit}
          </Button>
        ))}

        {allowDecimal ? (
          <Button variant="outline" size="touch" className={keyClass} onClick={() => append(".")}>
            .
          </Button>
        ) : (
          <span aria-hidden className="h-14" />
        )}

        <Button variant="outline" size="touch" className={keyClass} onClick={() => append("0")}>
          0
        </Button>

        <Button
          variant="ghost"
          size="touch"
          className="h-14 flex-1 touch-manipulation text-muted-foreground"
          aria-label="Backspace"
          onClick={backspace}
        >
          <Delete />
        </Button>
      </div>
    </div>
  );
}
