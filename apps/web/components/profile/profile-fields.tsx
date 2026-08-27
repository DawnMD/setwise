import * as React from "react";
import { CalendarIcon } from "lucide-react";
import type { z } from "zod";

import {
  calorieOverride as calorieOverrideSchema,
  fatPerKg as fatPerKgSchema,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  heightCm as heightCmSchema,
  MAX_AGE,
  MIN_AGE,
  proteinPerKg as proteinPerKgSchema,
  TARGET_RATE_MAX,
  TARGET_RATE_STEP,
} from "@setwise/domain/validators";
import { parseIsoDay, toIsoDay } from "@setwise/domain/format";
import {
  ACTIVITY_DESCRIPTIONS,
  ACTIVITY_LEVELS,
  DEFAULT_FAT_PER_KG,
  DEFAULT_PROTEIN_PER_KG,
  GOAL_LABELS,
  GOALS,
  SEXES,
  type ActivityLevel,
  type Goal,
  type Sex,
} from "@setwise/domain/nutrition";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";

/**
 * The profile questions, one component each.
 *
 * Split this finely because the wizard asks them one or two at a time and the
 * edit sheet asks all of them at once. Two layouts over one set of controls,
 * rather than the same date picker written twice and fixed once.
 *
 * Every one of them is controlled and every one accepts null, because null is
 * what "skipped" looks like all the way down to the column.
 */

/** A list picker rendered as buttons, not a select. Thumb-sized, no second tap. */
function OptionList<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T | null;
  onChange: (next: T | null) => void;
  options: { value: T; label: string; hint?: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-col gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            // Tapping the chosen answer clears it. Skipping a step leaves the
            // field null, so un-answering has to be possible too.
            onClick={() => onChange(selected ? null : option.value)}
            className={`flex min-h-11 flex-col justify-center rounded-none border px-3 py-2 text-left transition-colors ${
              selected ? "border-primary bg-primary/10" : "bg-card hover:bg-accent"
            }`}
          >
            <span className="text-sm font-medium">{option.label}</span>
            {option.hint ? (
              <span className="text-xs text-muted-foreground">{option.hint}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function HeightField({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const [draft, setDraft] = React.useState(value === null ? "" : String(value));

  const commit = (text: string) => {
    setDraft(text);
    if (text.trim() === "") {
      onChange(null);
      return;
    }
    const parsed = heightCmSchema.safeParse(Number.parseFloat(text));
    onChange(parsed.success ? parsed.data : null);
  };

  const parsed = draft.trim() === "" ? null : heightCmSchema.safeParse(Number.parseFloat(draft));
  const problem = parsed && !parsed.success ? parsed.error.issues[0]?.message : null;

  return (
    <Field data-invalid={problem !== null || undefined}>
      <FieldLabel htmlFor="profile-height">Height (cm)</FieldLabel>
      <Input
        id="profile-height"
        // The real keyboard, not the number pad. Height is typed once in a
        // lifetime, sitting down, and the pad exists for hands covered in chalk.
        inputMode="decimal"
        className="numeric h-11 text-base"
        placeholder="178"
        value={draft}
        aria-invalid={problem !== null}
        onChange={(event) => commit(event.target.value)}
      />
      {problem ? (
        <FieldDescription className="text-destructive">{problem}</FieldDescription>
      ) : (
        <FieldDescription>
          Between {HEIGHT_MIN_CM} and {HEIGHT_MAX_CM}. Only BMI and BMR read it.
        </FieldDescription>
      )}
    </Field>
  );
}

export function SexField({
  value,
  onChange,
}: {
  value: Sex | null;
  onChange: (next: Sex | null) => void;
}) {
  return (
    <Field>
      <FieldLabel>Sex</FieldLabel>
      <OptionList
        name="Sex"
        value={value}
        onChange={onChange}
        options={SEXES.map((option) => ({
          value: option,
          label: option === "male" ? "Male" : "Female",
        }))}
      />
      <FieldDescription>
        A constant in the BMR formula, which only has the two. Skip it and the screen shows
        everything that does not need it.
      </FieldDescription>
    </Field>
  );
}

export function BirthDateField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const today = parseIsoDay(toIsoDay());
  const oldest = new Date(today.getFullYear() - MAX_AGE, today.getMonth(), today.getDate());
  const youngest = new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate());
  const selected = value === null ? undefined : parseIsoDay(value);

  return (
    <Field>
      <FieldLabel htmlFor="profile-birth-date">Date of birth</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id="profile-birth-date"
              variant="outline"
              size="touch"
              className="w-full justify-between font-normal"
            />
          }
        >
          {selected
            ? selected.toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "Not set"}
          <CalendarIcon data-icon="inline-end" />
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            // Opening on today would mean thirty taps of a month arrow. The
            // month a plausible user was born in is a better first screen.
            defaultMonth={selected ?? new Date(today.getFullYear() - 30, 0, 1)}
            captionLayout="dropdown"
            startMonth={oldest}
            endMonth={youngest}
            disabled={{ before: oldest, after: youngest }}
            onSelect={(date) => {
              if (!date) return;
              onChange(toIsoDay(date));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      <FieldDescription>
        Age moves BMR by five calories a year. Setwise stores the date and reads nothing else from
        it.
      </FieldDescription>
    </Field>
  );
}

export function ActivityField({
  value,
  onChange,
}: {
  value: ActivityLevel | null;
  onChange: (next: ActivityLevel | null) => void;
}) {
  return (
    <Field>
      <FieldLabel>Activity outside the gym</FieldLabel>
      <OptionList
        name="Activity level"
        value={value}
        onChange={onChange}
        options={ACTIVITY_LEVELS.map((level) => ({
          value: level,
          label: level.charAt(0).toUpperCase() + level.slice(1),
          hint: ACTIVITY_DESCRIPTIONS[level],
        }))}
      />
      <FieldDescription>
        Nearly everyone picks one band too high. If you are unsure between two, the lower one is the
        better guess, and the scale will correct it within a fortnight.
      </FieldDescription>
    </Field>
  );
}

export function GoalField({
  value,
  onChange,
}: {
  value: Goal | null;
  onChange: (next: Goal | null) => void;
}) {
  return (
    <Field>
      <FieldLabel>Goal</FieldLabel>
      <OptionList
        name="Goal"
        value={value}
        onChange={onChange}
        options={GOALS.map((option) => ({ value: option, label: GOAL_LABELS[option] }))}
      />
    </Field>
  );
}

/**
 * The rate, in kilograms a week.
 *
 * Hidden entirely when the goal is to hold weight, because a rate of zero is
 * not a choice anyone should have to make twice.
 */
export function RateField({
  goal,
  value,
  onChange,
}: {
  goal: Goal | null;
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  if (goal === null || goal === "maintain") return null;

  const rate = value ?? 0.5;
  const verb = goal === "lose" ? "Lose" : "Gain";

  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel htmlFor="profile-rate">Rate</FieldLabel>
        <output htmlFor="profile-rate" className="numeric-display text-lg">
          {rate.toFixed(2)} kg / week
        </output>
      </div>
      <Slider
        id="profile-rate"
        size="touch"
        value={rate}
        onValueChange={(next) => onChange(Array.isArray(next) ? next[0] : next)}
        min={0}
        max={TARGET_RATE_MAX}
        step={TARGET_RATE_STEP}
        largeStep={0.25}
        aria-label={`${verb} per week, kilograms`}
      />
      <FieldDescription>
        {goal === "lose"
          ? "Around 0.5 kg a week keeps most of the muscle you have. Faster than 1 kg and what you lose stops being mostly fat."
          : "Around 0.25 kg a week is as fast as anyone gains without gaining fat alongside it."}
      </FieldDescription>
    </Field>
  );
}

/**
 * The overrides, for people who arrived with numbers.
 *
 * Blank means the default, which is the right way round: someone who never
 * opens this inherits any later correction to the defaults rather than a value
 * frozen at signup.
 */
export function OverrideFields({
  calorieOverride,
  proteinPerKg,
  fatPerKg,
  onChange,
}: {
  calorieOverride: number | null;
  proteinPerKg: number | null;
  fatPerKg: number | null;
  onChange: (patch: {
    calorieOverride?: number | null;
    proteinPerKg?: number | null;
    fatPerKg?: number | null;
  }) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <NumberOverride
        id="profile-calorie-override"
        label="Calorie target"
        placeholder="Calculated"
        suffix="kcal"
        value={calorieOverride}
        schema={calorieOverrideSchema}
        whole
        onChange={(next) => onChange({ calorieOverride: next })}
        description="Set this and it wins over the calculation above."
      />
      <NumberOverride
        id="profile-protein"
        label="Protein"
        placeholder={String(DEFAULT_PROTEIN_PER_KG)}
        suffix="g / kg"
        value={proteinPerKg}
        schema={proteinPerKgSchema}
        onChange={(next) => onChange({ proteinPerKg: next })}
        description={`Blank uses ${DEFAULT_PROTEIN_PER_KG} g/kg.`}
      />
      <NumberOverride
        id="profile-fat"
        label="Fat"
        placeholder={String(DEFAULT_FAT_PER_KG)}
        suffix="g / kg"
        value={fatPerKg}
        schema={fatPerKgSchema}
        onChange={(next) => onChange({ fatPerKg: next })}
        description={`Blank uses ${DEFAULT_FAT_PER_KG} g/kg. Carbohydrate takes whatever is left.`}
      />
    </div>
  );
}

/**
 * One optional number, validated against the same schema the API will use.
 *
 * A blank field reports null and is not an error. That distinction is the whole
 * point of an override: not filling it in is the expected case.
 */
function NumberOverride({
  id,
  label,
  placeholder,
  suffix,
  value,
  schema,
  whole = false,
  onChange,
  description,
}: {
  id: string;
  label: string;
  placeholder: string;
  suffix: string;
  value: number | null;
  schema: z.ZodType<number, unknown>;
  whole?: boolean;
  onChange: (next: number | null) => void;
  description: string;
}) {
  const [draft, setDraft] = React.useState(value === null ? "" : String(value));

  const read = (text: string) =>
    schema.safeParse(whole ? Number.parseInt(text, 10) : Number.parseFloat(text));

  const result = draft.trim() === "" ? null : read(draft);
  const problem = result?.success === false ? (result.error.issues[0]?.message ?? null) : null;

  return (
    <Field data-invalid={problem !== null}>
      <FieldLabel htmlFor={id}>
        {label} <span className="font-normal text-muted-foreground">({suffix})</span>
      </FieldLabel>
      <Input
        id={id}
        inputMode={whole ? "numeric" : "decimal"}
        className="numeric h-11 text-base"
        placeholder={placeholder}
        value={draft}
        aria-invalid={problem !== null}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          if (text.trim() === "") {
            onChange(null);
            return;
          }
          const next = read(text);
          if (next.success) onChange(next.data);
        }}
      />
      <FieldDescription className={problem ? "text-destructive" : undefined}>
        {problem ?? description}
      </FieldDescription>
    </Field>
  );
}
