"use client";

import * as React from "react";

import { RPE_MAX, RPE_MIN, RPE_STEP } from "@/db/validators";
import type { Targets } from "@/lib/targets";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";

const toField = (value: number | null) => (value === null ? "" : String(value));
const toNumber = (value: string) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Sets, a rep range and an optional RPE.
 *
 * A range rather than a number because "8 to 12" is how anyone who trains
 * actually thinks, and it is what makes double progression legible in the
 * logger: fill the range, then add weight and drop back to the bottom of it.
 *
 * Everything here can be left blank. A routine that demands an RPE target for
 * every accessory is a routine nobody finishes building.
 */
export function TargetsForm({
  open,
  onOpenChange,
  exerciseName,
  initial,
  pending = false,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exerciseName: string;
  initial: Targets;
  pending?: boolean;
  onSave: (targets: Targets) => void;
}) {
  const [sets, setSets] = React.useState(() => toField(initial.targetSets));
  const [low, setLow] = React.useState(() => toField(initial.targetRepLow));
  const [high, setHigh] = React.useState(() => toField(initial.targetRepHigh));
  const [rpe, setRpe] = React.useState<number | null>(initial.targetRpe);

  const parsed: Targets = {
    targetSets: toNumber(sets),
    targetRepLow: toNumber(low),
    targetRepHigh: toNumber(high),
    targetRpe: rpe,
  };

  const rangeInverted =
    parsed.targetRepLow !== null &&
    parsed.targetRepHigh !== null &&
    parsed.targetRepLow > parsed.targetRepHigh;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[520px]">
        <DrawerHeader>
          <DrawerTitle>Targets</DrawerTitle>
          <DrawerDescription>{exerciseName}</DrawerDescription>
        </DrawerHeader>

        <form
          className="overflow-y-auto p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!rangeInverted && !pending) onSave(parsed);
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="target-sets">Sets</FieldLabel>
              <Input
                id="target-sets"
                inputMode="numeric"
                value={sets}
                onChange={(event) => setSets(event.target.value.replace(/\D/g, ""))}
                placeholder="3"
                className="numeric h-11 text-base"
              />
            </Field>

            <Field orientation="horizontal">
              <Field>
                <FieldLabel htmlFor="target-rep-low">Reps from</FieldLabel>
                <Input
                  id="target-rep-low"
                  inputMode="numeric"
                  aria-invalid={rangeInverted}
                  value={low}
                  onChange={(event) => setLow(event.target.value.replace(/\D/g, ""))}
                  placeholder="8"
                  className="numeric h-11 text-base"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="target-rep-high">to</FieldLabel>
                <Input
                  id="target-rep-high"
                  inputMode="numeric"
                  value={high}
                  onChange={(event) => setHigh(event.target.value.replace(/\D/g, ""))}
                  placeholder="12"
                  className="numeric h-11 text-base"
                />
              </Field>
            </Field>

            {rangeInverted ? (
              <FieldDescription className="text-destructive">
                The low end of the range has to come first.
              </FieldDescription>
            ) : null}

            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="target-rpe">RPE</FieldLabel>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => setRpe(rpe === null ? 8 : null)}
                >
                  {rpe === null ? "Add a target" : "Clear"}
                </Button>
              </div>
              {rpe !== null ? (
                <div className="flex items-center gap-4">
                  <Slider
                    id="target-rpe"
                    size="touch"
                    value={rpe}
                    onValueChange={(next) => setRpe(Array.isArray(next) ? next[0] : next)}
                    min={RPE_MIN}
                    max={RPE_MAX}
                    step={RPE_STEP}
                    largeStep={1}
                    aria-label="Target RPE"
                    className="flex-1"
                  />
                  <span className="numeric-display w-10 text-right text-xl">{rpe}</span>
                </div>
              ) : (
                <FieldDescription>
                  Left off unless the exercise is meant to be run at a specific effort.
                </FieldDescription>
              )}
            </Field>

            <Button type="submit" size="touch" className="w-full" disabled={rangeInverted || pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Save targets
            </Button>
          </FieldGroup>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
