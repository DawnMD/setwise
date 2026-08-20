"use client";

import * as React from "react";

import {
  BODYWEIGHT_MAX,
  BODYWEIGHT_MIN,
  BODYWEIGHT_STEP,
  bodyweightKg,
  type BodyweightLogInput,
} from "@/db/validators";
import { formatWeight, formatWhen, parseIsoDay, toIsoDay } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { NumberPad } from "@/components/logger/number-pad";

export type WeighIn = {
  loggedOn: string;
  weight: number | null;
  note: string | null;
};

type BodyweightSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The day being edited, and its values if it already has some. */
  initial: WeighIn;
  /** The most recent weigh-in before this one, shown the way sets show a ghost. */
  ghost?: { weight: number; loggedOn: string } | null;
  pending?: boolean;
  onSave: (input: BodyweightLogInput) => unknown | Promise<unknown>;
  onDelete?: () => unknown | Promise<unknown>;
};

/**
 * One weigh-in, in the same bottom sheet and on the same pad as a set.
 *
 * The OS keyboard is the wrong tool here for the reason it is wrong in the
 * logger: it covers half the screen and several Android layouts have no decimal
 * key, which is most of the number. Notes are the exception — they are words,
 * they are rare, and they get the real keyboard.
 */
export function BodyweightSheet({ open, onOpenChange, ...rest }: BodyweightSheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* Mounted per open, so the draft is seeded once and no effect races
          whatever is being typed. */}
      {open ? <OpenBodyweightSheet {...rest} /> : null}
    </Drawer>
  );
}

function OpenBodyweightSheet({
  initial,
  ghost,
  pending = false,
  onSave,
  onDelete,
}: Omit<BodyweightSheetProps, "open" | "onOpenChange">) {
  const isEdit = initial.weight !== null;
  const [weight, setWeight] = React.useState(() =>
    initial.weight === null ? "" : formatWeight(initial.weight),
  );
  const [loggedOn, setLoggedOn] = React.useState(initial.loggedOn);
  const [note, setNote] = React.useState(initial.note ?? "");
  const [failed, setFailed] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const parsed = Number.parseFloat(weight);
  const check = bodyweightKg.safeParse(parsed);
  // Only once something is typed. "That doesn't look like a bodyweight" under an
  // empty field is an accusation about nothing.
  const problem = weight === "" || check.success ? null : check.error.issues[0]?.message;

  const busy = pending || saving;

  const save = async () => {
    if (!check.success) return;
    setFailed(false);
    setSaving(true);
    try {
      await onSave({
        loggedOn,
        weight: check.data,
        note: note.trim() === "" ? null : note.trim(),
      });
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerContent className="mx-auto max-w-[520px]">
      <DrawerHeader>
        <DrawerTitle>{isEdit ? "Edit weigh-in" : "Log weight"}</DrawerTitle>
        <DrawerDescription>
          {ghost
            ? `Last ${formatWeight(ghost.weight)} kg · ${formatWhen(parseIsoDay(ghost.loggedOn)).toLowerCase()}`
            : "Weigh yourself at the same time of day, and the line means something."}
        </DrawerDescription>
      </DrawerHeader>

      <div className="flex flex-col gap-3 overflow-y-auto p-4">
        <div className="flex flex-col gap-0.5 rounded-lg border bg-muted px-3 py-2">
          <span className="text-xs text-muted-foreground">Weight (kg)</span>
          <span
            className={`numeric-display text-3xl leading-tight ${weight === "" ? "text-muted-foreground/50" : ""}`}
          >
            {weight === "" ? (ghost ? formatWeight(ghost.weight) : "0") : weight}
          </span>
        </div>

        {problem ? <p className="text-xs text-destructive">{problem}</p> : null}

        <NumberPad
          onChange={setWeight}
          allowDecimal
          step={BODYWEIGHT_STEP}
          min={BODYWEIGHT_MIN}
          max={BODYWEIGHT_MAX}
        />

        <div className="grid grid-cols-2 gap-2">
          <Field>
            <FieldLabel htmlFor="bodyweight-day">Day</FieldLabel>
            {/* A real date input, not the custom pad: this is a picker rather
                than a keyboard, and it already knows what today is. */}
            <Input
              id="bodyweight-day"
              type="date"
              className="h-11 text-base"
              value={loggedOn}
              max={toIsoDay()}
              disabled={isEdit}
              onChange={(event) => setLoggedOn(event.target.value || initial.loggedOn)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="bodyweight-note">Note</FieldLabel>
            <Input
              id="bodyweight-note"
              className="h-11 text-base"
              placeholder="Optional"
              maxLength={280}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
        </div>

        {failed ? (
          <Alert variant="destructive">
            <AlertTitle>Weigh-in didn&apos;t save</AlertTitle>
            <AlertDescription>Check your connection and tap save again.</AlertDescription>
          </Alert>
        ) : null}

        <Button size="touch" className="w-full" disabled={!check.success || busy} onClick={save}>
          {busy ? <Spinner data-icon="inline-start" /> : null}
          Save weigh-in
        </Button>

        {isEdit && onDelete ? (
          <Button
            variant="ghost"
            size="touch"
            className="w-full"
            disabled={busy}
            onClick={onDelete}
          >
            Delete this weigh-in
          </Button>
        ) : null}
      </div>
    </DrawerContent>
  );
}
