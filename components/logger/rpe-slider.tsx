"use client";

import { RPE_MAX, RPE_MIN, RPE_STEP } from "@/db/validators";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";

/**
 * RPE on a 6-to-10 scale with half steps.
 *
 * A slider, not a dropdown, and definitely not a text field: it is a bounded
 * continuous judgement, and eight discrete options in a menu is eight taps to
 * express one. Optional, because plenty of sets are logged without it and a
 * forced number would be a made-up one.
 */
export function RpeSlider({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const active = value !== null;

  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel htmlFor="rpe">RPE</FieldLabel>
        <Button type="button" variant="link" size="sm" onClick={() => onChange(active ? null : 8)}>
          {active ? "Clear" : "Add RPE"}
        </Button>
      </div>

      {active ? (
        <div className="flex items-center gap-4">
          <Slider
            id="rpe"
            size="touch"
            value={value}
            onValueChange={(next) => onChange(Array.isArray(next) ? next[0] : next)}
            min={RPE_MIN}
            max={RPE_MAX}
            step={RPE_STEP}
            largeStep={1}
            aria-label="RPE"
            className="flex-1"
          />
          <span className="numeric-display w-10 text-right text-xl">{value}</span>
        </div>
      ) : null}
    </Field>
  );
}
