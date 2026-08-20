"use client";

import * as React from "react";

import { WEIGHT_MAX } from "@/db/validators";
import { cn } from "@/lib/cn";
import { formatDelta, formatWeight, formatWhen } from "@/lib/format";
import { type Ghost, overloadDelta } from "@/lib/overload";
import { DEFAULT_BAR_KG } from "@/lib/plates";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";

import { NumberPad } from "./number-pad";
import { PlateMath } from "./plate-math";
import { RpeSlider } from "./rpe-slider";

export type SetDraft = {
  weight: number;
  reps: number;
  rpe: number | null;
  isWarmup: boolean;
};

type Field = "weight" | "reps";

/** Increments people actually use: the smallest pair of plates, and one rep. */
const WEIGHT_STEP_KG = 2.5;
const REPS_STEP = 1;

const toDraftString = (value: number) => (value === 0 ? "" : formatWeight(value));

/**
 * One sheet for the whole set.
 *
 * The draft lives in local state seeded once at mount, and the caller keys this
 * component per set, so opening a different row gets fresh values without an
 * effect racing whatever is being typed.
 *
 * Splitting weight and reps across two separate pads would double the taps for
 * the most repeated action in the app. Here the pad drives whichever field is
 * selected, the ghost value sits directly above both, and the save button lives
 * in the bottom third under the thumb.
 */
export function SetSheet({
  open,
  onOpenChange,
  exerciseName,
  isBarbell,
  setLabel,
  ghost,
  ghostWhen,
  initial,
  saveLabel = "Save set",
  onSave,
  onOpenChangeComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenChangeComplete?: (open: boolean) => void;
  exerciseName: string;
  isBarbell: boolean;
  /** "Set 3" or "Warm-up 1". Shown as the sheet's title. */
  setLabel: string;
  ghost: Ghost;
  ghostWhen: Date | null;
  initial: SetDraft;
  saveLabel?: string;
  onSave: (draft: SetDraft) => void;
}) {
  const [field, setField] = React.useState<Field>("weight");
  const [weight, setWeight] = React.useState(() => toDraftString(initial.weight));
  const [reps, setReps] = React.useState(() => toDraftString(initial.reps));
  const [rpe, setRpe] = React.useState<number | null>(initial.rpe);
  const [isWarmup, setIsWarmup] = React.useState(initial.isWarmup);

  const weightValue = Number.parseFloat(weight);
  const repsValue = Number.parseInt(reps, 10);
  const parsed = {
    weight: Number.isFinite(weightValue) ? weightValue : 0,
    reps: Number.isFinite(repsValue) ? repsValue : 0,
  };

  const canSave = parsed.reps >= 1 && parsed.weight >= 0 && parsed.weight <= WEIGHT_MAX;
  // Warm-ups are not attempts at anything, so they do not get a delta.
  const overload = isWarmup ? null : overloadDelta(parsed, ghost);

  const save = () => {
    if (!canSave) return;
    onSave({ weight: parsed.weight, reps: parsed.reps, rpe, isWarmup });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      title={setLabel}
      description={exerciseName}
    >
      <div className="mt-3 space-y-3">
        <GhostLine ghost={ghost} when={ghostWhen} isWarmup={isWarmup} />

        <div className="grid grid-cols-2 gap-2">
          <FieldButton
            label="Weight"
            unit="kg"
            value={weight}
            placeholder={ghost ? formatWeight(ghost.weight) : "0"}
            selected={field === "weight"}
            onSelect={() => setField("weight")}
            highlight={overload?.kind === "weight"}
          />
          <FieldButton
            label="Reps"
            value={reps}
            placeholder={ghost ? String(ghost.reps) : "0"}
            selected={field === "reps"}
            onSelect={() => setField("reps")}
            highlight={overload?.kind === "reps"}
          />
        </div>

        <div className="flex h-6 items-center justify-center">
          {overload ? (
            <span className="numeric text-sm font-semibold text-accent">
              {overload.kind === "weight"
                ? formatDelta(overload.delta)
                : `+${overload.delta} rep${overload.delta === 1 ? "" : "s"}`}{" "}
              on last time
            </span>
          ) : null}
        </div>

        {/* Only once a weight is typed. While the field is empty it shows the
            ghost value, and a strip reading "under the bar" beside a greyed-out
            100 is a contradiction. */}
        {isBarbell && field === "weight" && weight !== "" ? (
          <PlateMath targetKg={parsed.weight} barKg={DEFAULT_BAR_KG} />
        ) : null}

        {field === "weight" ? (
          <NumberPad
            key="weight"
            onChange={setWeight}
            allowDecimal
            step={WEIGHT_STEP_KG}
            max={WEIGHT_MAX}
          />
        ) : (
          <NumberPad key="reps" onChange={setReps} step={REPS_STEP} max={1000} />
        )}

        <div className="flex items-center justify-between gap-4">
          <Switch checked={isWarmup} onCheckedChange={setIsWarmup} label="Warm-up" />
          {field === "weight" ? (
            <Button variant="secondary" size="sm" onClick={() => setField("reps")}>
              Next: reps
            </Button>
          ) : null}
        </div>

        {!isWarmup ? <RpeSlider value={rpe} onChange={setRpe} /> : null}

        <Button size="lg" className="w-full" disabled={!canSave} onClick={save}>
          {saveLabel}
        </Button>
      </div>
    </Sheet>
  );
}

function GhostLine({
  ghost,
  when,
  isWarmup,
}: {
  ghost: Ghost;
  when: Date | null;
  isWarmup: boolean;
}) {
  if (!ghost) {
    return (
      <p className="text-sm text-ink-muted">
        {isWarmup ? "No warm-up logged here last time." : "First time logging this one."}
      </p>
    );
  }

  return (
    <p className="numeric text-sm text-ink-muted">
      Last time {formatWeight(ghost.weight)} kg × {ghost.reps}
      {ghost.rpe !== null ? ` @ ${ghost.rpe}` : ""}
      {when ? ` · ${formatWhen(when).toLowerCase()}` : ""}
    </p>
  );
}

function FieldButton({
  label,
  unit,
  value,
  placeholder,
  selected,
  onSelect,
  highlight,
}: {
  label: string;
  unit?: string;
  value: string;
  placeholder: string;
  selected: boolean;
  onSelect: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex flex-col items-start rounded-lg border px-3 py-2 text-left touch-manipulation",
        selected ? "border-accent bg-accent/5" : "border-border bg-surface",
      )}
    >
      <span className="text-xs text-ink-muted">
        {label}
        {unit ? ` (${unit})` : ""}
      </span>
      <span
        className={cn(
          "numeric-display text-3xl leading-tight",
          value === "" && "text-ink-muted/50",
          highlight && "text-accent",
        )}
      >
        {value === "" ? placeholder : value}
      </span>
    </button>
  );
}
