"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import * as React from "react";

import { MUSCLES, type MuscleSlug } from "@/lib/muscles";
import { orpc } from "@/lib/orpc";
import { CustomExerciseForm } from "@/components/catalogue/custom-exercise-form";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import type { LoggerExercise } from "./types";

/**
 * Search over the global catalogue plus the user's own exercises.
 *
 * The muscle chips are the fast path: mid-workout nobody types "Romanian
 * deadlift", they tap Hamstrings and scan. Search is debounced because a
 * per-keystroke round trip on gym wifi is worse than a stale list, and cmdk's
 * own filtering is off — the server has already decided what matches.
 */
export function ExercisePicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (exercise: LoggerExercise) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [muscle, setMuscle] = React.useState<MuscleSlug | null>(null);
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(id);
  }, [query]);

  const results = useQuery(
    orpc.catalogue.search.queryOptions({
      input: { query: debounced, muscle: muscle ?? undefined, limit: 40 },
      enabled: open,
      staleTime: 5 * 60_000,
    }),
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[520px]">
        <DrawerHeader>
          <DrawerTitle>Add exercise</DrawerTitle>
        </DrawerHeader>

        <Command shouldFilter={false} className="gap-3 bg-transparent p-4">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search exercises"
            className="h-11 text-base"
          />

          <div className="-mx-4 overflow-x-auto px-4 pb-1">
            <ToggleGroup
              variant="outline"
              value={muscle ? [muscle] : []}
              onValueChange={([next]) => setMuscle((next as MuscleSlug | undefined) ?? null)}
              aria-label="Filter by muscle"
            >
              {MUSCLES.map((entry) => (
                <ToggleGroupItem key={entry.slug} value={entry.slug} className="h-9 shrink-0">
                  {entry.displayName}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <CommandList className="max-h-[46dvh]">
            {results.isPending ? (
              <div className="flex flex-col gap-2 py-2">
                {[0, 1, 2, 3, 4].map((row) => (
                  <Skeleton key={row} className="h-11 w-full" />
                ))}
              </div>
            ) : results.isError ? (
              <Empty>
                <EmptyTitle>Couldn&apos;t load exercises</EmptyTitle>
                <EmptyDescription>Check your connection and try again.</EmptyDescription>
              </Empty>
            ) : (
              <>
                <CommandEmpty>Nothing matches. Try a different word or muscle.</CommandEmpty>
                <CommandGroup>
                  {results.data.map((exercise) => (
                    <CommandItem
                      key={exercise.id}
                      value={exercise.id}
                      onSelect={() =>
                        onPick({
                          id: exercise.id,
                          name: exercise.name,
                          equipment: exercise.equipment,
                        })
                      }
                      className="min-h-11 justify-between gap-3 text-[15px]"
                    >
                      <span className="truncate">{exercise.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground capitalize">
                        {exercise.isCustom ? "Yours" : exercise.equipment}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>

          {/* Below the results, not above them. Searching first is right almost
              every time: the catalogue has 800 exercises and the one you want
              is usually already in it under a name you did not guess. */}
          <Button variant="outline" size="touch" onClick={() => setCreating(true)}>
            <Plus data-icon="inline-start" />
            Create an exercise
          </Button>
        </Command>

        <CustomExerciseForm
          open={creating}
          onOpenChange={setCreating}
          onCreated={(exercise) => onPick(exercise)}
        />
      </DrawerContent>
    </Drawer>
  );
}
