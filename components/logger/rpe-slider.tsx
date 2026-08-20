"use client";

import { Slider } from "@base-ui/react/slider";

import { RPE_MAX, RPE_MIN, RPE_STEP } from "@/db/validators";
import { cn } from "@/lib/cn";

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
    <div>
      <div className="flex h-9 items-baseline justify-between">
        <span className="text-sm text-ink-muted">RPE</span>
        {active ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-sm text-ink-muted underline underline-offset-4"
          >
            Clear
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onChange(8)}
            className="text-sm text-accent underline underline-offset-4"
          >
            Add RPE
          </button>
        )}
      </div>

      {active ? (
        <Slider.Root
          value={value}
          onValueChange={(next) => onChange(Array.isArray(next) ? next[0] : next)}
          min={RPE_MIN}
          max={RPE_MAX}
          step={RPE_STEP}
          largeStep={1}
        >
          <div className="flex items-center gap-4">
            <Slider.Control className="flex h-11 flex-1 touch-none items-center select-none">
              <Slider.Track className="h-1.5 w-full rounded-full bg-border select-none">
                <Slider.Indicator className="rounded-full bg-accent select-none" />
                <Slider.Thumb
                  aria-label="RPE"
                  className={cn(
                    "size-6 rounded-full border-2 border-accent bg-surface-raised select-none",
                    "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                  )}
                />
              </Slider.Track>
            </Slider.Control>
            <Slider.Value className="numeric-display w-10 text-right text-xl" />
          </div>
          <div className="numeric flex justify-between text-xs text-ink-muted">
            <span>6</span>
            <span>8</span>
            <span>10</span>
          </div>
        </Slider.Root>
      ) : null}
    </div>
  );
}
