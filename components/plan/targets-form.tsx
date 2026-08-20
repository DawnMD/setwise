"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";

import {
  RPE_MAX,
  RPE_MIN,
  RPE_STEP,
  routineExerciseTargets,
  type RoutineExerciseTargets,
} from "@/db/validators";
import type { Targets } from "@/lib/targets";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";

const toNumber = (value: string) => {
  const parsed = Number.parseInt(value.replace(/\D/g, ""), 10);
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
  onSave: (targets: Targets) => unknown | Promise<unknown>;
}) {
  const form = useForm<RoutineExerciseTargets>({
    resolver: zodResolver(routineExerciseTargets),
    defaultValues: initial,
    mode: "onTouched",
    reValidateMode: "onChange",
    criteriaMode: "all",
  });

  const submit = form.handleSubmit(async (targets) => {
    form.clearErrors("root");

    try {
      await onSave(targets);
    } catch {
      form.setError("root.server", {
        type: "server",
        message: "Couldn't save those targets. Check your connection and try again.",
      });
    }
  });

  const busy = pending || form.formState.isSubmitting;
  const serverError = form.formState.errors.root?.server?.message;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[520px]">
        <DrawerHeader>
          <DrawerTitle>Targets</DrawerTitle>
          <DrawerDescription>{exerciseName}</DrawerDescription>
        </DrawerHeader>

        <form className="overflow-y-auto p-4" onSubmit={submit} noValidate>
          <FieldGroup>
            <Controller
              name="targetSets"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="target-sets">Sets</FieldLabel>
                  <Input
                    id="target-sets"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    inputMode="numeric"
                    value={field.value ?? ""}
                    onChange={(event) => field.onChange(toNumber(event.target.value))}
                    placeholder="3"
                    aria-invalid={fieldState.invalid}
                    className="numeric h-11 text-base"
                  />
                  {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                </Field>
              )}
            />

            <Field orientation="horizontal">
              <Controller
                name="targetRepLow"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="target-rep-low">Reps from</FieldLabel>
                    <Input
                      id="target-rep-low"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      inputMode="numeric"
                      value={field.value ?? ""}
                      onChange={(event) => field.onChange(toNumber(event.target.value))}
                      placeholder="8"
                      aria-invalid={fieldState.invalid}
                      className="numeric h-11 text-base"
                    />
                    {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                  </Field>
                )}
              />
              <Controller
                name="targetRepHigh"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="target-rep-high">to</FieldLabel>
                    <Input
                      id="target-rep-high"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      inputMode="numeric"
                      value={field.value ?? ""}
                      onChange={(event) => field.onChange(toNumber(event.target.value))}
                      placeholder="12"
                      aria-invalid={fieldState.invalid}
                      className="numeric h-11 text-base"
                    />
                    {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                  </Field>
                )}
              />
            </Field>

            <Controller
              name="targetRpe"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <div className="flex items-center justify-between">
                    <FieldLabel htmlFor="target-rpe">RPE</FieldLabel>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => field.onChange(field.value === null ? 8 : null)}
                    >
                      {field.value === null ? "Add a target" : "Clear"}
                    </Button>
                  </div>
                  {field.value !== null ? (
                    <div className="flex items-center gap-4">
                      <Slider
                        id="target-rpe"
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        size="touch"
                        value={field.value}
                        onValueChange={(next) =>
                          field.onChange(Array.isArray(next) ? next[0] : next)
                        }
                        min={RPE_MIN}
                        max={RPE_MAX}
                        step={RPE_STEP}
                        largeStep={1}
                        aria-label="Target RPE"
                        aria-invalid={fieldState.invalid}
                        className="flex-1"
                      />
                      <output
                        htmlFor="target-rpe"
                        className="numeric-display w-10 text-right text-xl"
                      >
                        {field.value}
                      </output>
                    </div>
                  ) : (
                    <FieldDescription>
                      Left off unless the exercise is meant to be run at a specific effort.
                    </FieldDescription>
                  )}
                  {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                </Field>
              )}
            />

            {serverError ? (
              <Alert variant="destructive">
                <AlertTitle>Couldn&apos;t save targets</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" size="touch" className="w-full" disabled={busy}>
              {busy ? <Spinner data-icon="inline-start" /> : null}
              Save targets
            </Button>
          </FieldGroup>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
