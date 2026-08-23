import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isDefinedError, ORPCError } from "@orpc/client";
import { Controller, useForm, useWatch } from "react-hook-form";

import { customExerciseInput, type CustomExerciseInput } from "@/db/validators";
import { orpc } from "@/lib/orpc";
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";

import { MusclePicker } from "./muscle-picker";

const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "kettlebell",
  "bands",
  "body only",
  "other",
] as const;

const PATTERNS = [
  { value: "squat", label: "Squat" },
  { value: "hinge", label: "Hinge" },
  { value: "lunge", label: "Lunge" },
  { value: "horizontal_push", label: "Horizontal push" },
  { value: "vertical_push", label: "Vertical push" },
  { value: "horizontal_pull", label: "Horizontal pull" },
  { value: "vertical_pull", label: "Vertical pull" },
  { value: "carry", label: "Carry" },
  { value: "core", label: "Core" },
  { value: "isolation", label: "Isolation" },
] as const;

type Equipment = (typeof EQUIPMENT)[number];
type Pattern = (typeof PATTERNS)[number]["value"];

/**
 * Why an unnamed failure happened, for the errors the router does not declare.
 *
 * "Check your connection and try again" is right for exactly one cause and
 * misleading for every other, and a wrong diagnosis costs more than none: it
 * sends someone to their wifi settings over a field the server rejected. A
 * rejected input names the field it came from; only a genuinely unrecognisable
 * failure falls through to the network guess.
 */
function reasonFor(error: unknown): string {
  if (error instanceof ORPCError) {
    if (error.code === "BAD_REQUEST") {
      const issues = (error.data as { issues?: Array<{ path?: unknown[]; message: string }> })
        ?.issues;
      const first = issues?.[0];
      if (first) {
        const field = FIELD_LABELS[String(first.path?.[0] ?? "")];
        return field ? `${field}: ${first.message}` : first.message;
      }
    }
    if (error.code === "UNAUTHORIZED") return error.message;
  }

  return "Couldn't save the exercise. Check your connection and try again.";
}

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  equipment: "Equipment",
  movementPattern: "Pattern",
  primaryMuscles: "Muscles trained",
  secondaryMuscles: "Muscles trained",
};

/**
 * Creating an exercise the catalogue does not have.
 *
 * Equipment matters beyond labelling: the plate maths only appears for
 * `barbell`, so getting it right here is what makes the number pad useful for
 * this movement later.
 */
export function CustomExerciseForm({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (exercise: { id: string; name: string; equipment: string | null }) => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<CustomExerciseInput>({
    resolver: zodResolver(customExerciseInput),
    defaultValues: {
      name: "",
      equipment: "barbell",
      movementPattern: null,
      primaryMuscles: [],
      secondaryMuscles: [],
    },
    mode: "onTouched",
    reValidateMode: "onChange",
    criteriaMode: "all",
  });

  const create = useMutation(
    orpc.catalogue.createExercise.mutationOptions({
      onSuccess: (exercise) => {
        // Every search result list is now out of date by exactly one row.
        void queryClient.invalidateQueries({ queryKey: orpc.catalogue.search.key() });
        onCreated({ id: exercise.id, name: exercise.name, equipment: exercise.equipment });
        form.reset();
        onOpenChange(false);
      },
      onError: (mutationError) => {
        form.setError("root.server", {
          type: "server",
          // A named error from the router already carries a reason written for
          // the person reading it. Anything else has to be diagnosed.
          message: isDefinedError(mutationError) ? mutationError.message : reasonFor(mutationError),
        });
      },
    }),
  );

  const primary = useWatch({ control: form.control, name: "primaryMuscles" });
  const serverError = form.formState.errors.root?.server?.message;

  const submit = form.handleSubmit((values) => {
    form.clearErrors("root");
    create.mutate(values);
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !create.isPending) form.reset();
    onOpenChange(nextOpen);
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="mx-auto max-w-[520px]">
        <DrawerHeader>
          <DrawerTitle>New exercise</DrawerTitle>
          <DrawerDescription>
            Yours alone. It shows up in search alongside the catalogue.
          </DrawerDescription>
        </DrawerHeader>

        <form className="overflow-y-auto p-4" onSubmit={submit} noValidate>
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="exercise-name">Name</FieldLabel>
                  <Input
                    {...field}
                    id="exercise-name"
                    placeholder="Safety squat bar squat"
                    autoComplete="off"
                    maxLength={120}
                    aria-invalid={fieldState.invalid}
                    className="h-11 text-base"
                  />
                  {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                </Field>
              )}
            />

            <Field orientation="responsive">
              <Controller
                name="equipment"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="exercise-equipment">Equipment</FieldLabel>
                    <NativeSelect
                      id="exercise-equipment"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      size="touch"
                      value={field.value ?? "barbell"}
                      onChange={(event) => field.onChange(event.target.value as Equipment)}
                      aria-invalid={fieldState.invalid}
                      className="w-full"
                    >
                      {EQUIPMENT.map((option) => (
                        <NativeSelectOption key={option} value={option}>
                          {option}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldDescription>Plate maths only shows for a barbell.</FieldDescription>
                    {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                  </Field>
                )}
              />

              <Controller
                name="movementPattern"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="exercise-pattern">Pattern</FieldLabel>
                    <NativeSelect
                      id="exercise-pattern"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      size="touch"
                      value={field.value ?? ""}
                      onChange={(event) =>
                        field.onChange(
                          event.target.value === "" ? null : (event.target.value as Pattern),
                        )
                      }
                      aria-invalid={fieldState.invalid}
                      className="w-full"
                    >
                      <NativeSelectOption value="">Not set</NativeSelectOption>
                      {PATTERNS.map((option) => (
                        <NativeSelectOption key={option.value} value={option.value}>
                          {option.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                  </Field>
                )}
              />
            </Field>

            <Controller
              name="primaryMuscles"
              control={form.control}
              render={({ field: primaryField, fieldState }) => (
                <Controller
                  name="secondaryMuscles"
                  control={form.control}
                  render={({ field: secondaryField, fieldState: secondaryState }) => (
                    <Field data-invalid={fieldState.invalid || secondaryState.invalid}>
                      <FieldLabel>Muscles trained</FieldLabel>
                      <FieldDescription>
                        Tap once for primary, twice for secondary, three times to clear. The heatmap
                        reads exactly what you set here.
                      </FieldDescription>
                      <MusclePicker
                        primary={primaryField.value}
                        secondary={secondaryField.value}
                        invalid={fieldState.invalid || secondaryState.invalid}
                        onChange={(update) => {
                          // Read back through the form rather than through the
                          // render's props: `getValues` is current the instant
                          // `onChange` returns, so two taps landing in one
                          // render still compose instead of overwriting.
                          const next = update({
                            primary: form.getValues("primaryMuscles"),
                            secondary: form.getValues("secondaryMuscles"),
                          });
                          primaryField.onChange(next.primary);
                          secondaryField.onChange(next.secondary);
                        }}
                      />
                      {fieldState.invalid || secondaryState.invalid ? (
                        <FieldError errors={[fieldState.error, secondaryState.error]} />
                      ) : null}
                    </Field>
                  )}
                />
              )}
            />

            {serverError ? (
              <Alert variant="destructive">
                <AlertTitle>Couldn&apos;t save the exercise</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" size="touch" className="w-full" disabled={create.isPending}>
              {create.isPending ? <Spinner data-icon="inline-start" /> : null}
              {primary.length === 0 ? "Pick a primary muscle" : "Save exercise"}
            </Button>
          </FieldGroup>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
