"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isDefinedError } from "@orpc/client";
import * as React from "react";

import type { MuscleSlug } from "@/lib/muscles";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
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

  const [name, setName] = React.useState("");
  const [equipment, setEquipment] = React.useState<Equipment>("barbell");
  const [pattern, setPattern] = React.useState<Pattern | "">("");
  const [primary, setPrimary] = React.useState<MuscleSlug[]>([]);
  const [secondary, setSecondary] = React.useState<MuscleSlug[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const create = useMutation(
    orpc.catalogue.createExercise.mutationOptions({
      onSuccess: (exercise) => {
        // Every search result list is now out of date by exactly one row.
        void queryClient.invalidateQueries({ queryKey: orpc.catalogue.search.key() });
        onCreated({ id: exercise.id, name: exercise.name, equipment: exercise.equipment });
        onOpenChange(false);
      },
      onError: (mutationError) => {
        setError(
          isDefinedError(mutationError)
            ? mutationError.message
            : "Couldn't save the exercise. Check your connection and try again.",
        );
      },
    }),
  );

  const canSave = name.trim().length > 0 && primary.length > 0 && !create.isPending;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[520px]">
        <DrawerHeader>
          <DrawerTitle>New exercise</DrawerTitle>
          <DrawerDescription>
            Yours alone. It shows up in search alongside the catalogue.
          </DrawerDescription>
        </DrawerHeader>

        <form
          className="overflow-y-auto p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSave) return;
            setError(null);
            create.mutate({
              name: name.trim(),
              equipment,
              movementPattern: pattern === "" ? null : pattern,
              primaryMuscles: primary,
              secondaryMuscles: secondary,
            });
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="exercise-name">Name</FieldLabel>
              <Input
                id="exercise-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Safety squat bar squat"
                autoComplete="off"
                className="h-11 text-base"
              />
            </Field>

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="exercise-equipment">Equipment</FieldLabel>
                <NativeSelect
                  id="exercise-equipment"
                  size="touch"
                  value={equipment}
                  onChange={(event) => setEquipment(event.target.value as Equipment)}
                  className="w-full"
                >
                  {EQUIPMENT.map((option) => (
                    <NativeSelectOption key={option} value={option}>
                      {option}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldDescription>Plate maths only shows for a barbell.</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="exercise-pattern">Pattern</FieldLabel>
                <NativeSelect
                  id="exercise-pattern"
                  size="touch"
                  value={pattern}
                  onChange={(event) => setPattern(event.target.value as Pattern | "")}
                  className="w-full"
                >
                  <NativeSelectOption value="">Not set</NativeSelectOption>
                  {PATTERNS.map((option) => (
                    <NativeSelectOption key={option.value} value={option.value}>
                      {option.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </Field>

            <Field>
              <FieldLabel>Muscles trained</FieldLabel>
              <FieldDescription>
                Tap once for primary, twice for secondary, three times to clear. The heatmap reads
                exactly what you set here.
              </FieldDescription>
              <MusclePicker
                primary={primary}
                secondary={secondary}
                onChange={(next) => {
                  setPrimary(next.primary);
                  setSecondary(next.secondary);
                }}
              />
            </Field>

            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Couldn&apos;t save the exercise</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" size="touch" className="w-full" disabled={!canSave}>
              {create.isPending ? <Spinner data-icon="inline-start" /> : null}
              {primary.length === 0 ? "Pick a primary muscle" : "Save exercise"}
            </Button>
          </FieldGroup>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
