"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { formatWhen } from "@/lib/format";
import { orpc } from "@/lib/orpc";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";

import { RoutineNameForm } from "./routine-name-form";

/**
 * The list of routines.
 *
 * Archived routines stay at the bottom rather than disappearing: "what was I
 * running in March" is a question people ask, and the answer costs one row.
 */
export function PlanHome() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [creating, setCreating] = React.useState(false);

  const routines = useQuery(orpc.plan.list.queryOptions());

  const create = useMutation(
    orpc.plan.createRoutine.mutationOptions({
      onSuccess: (routine) => {
        void queryClient.invalidateQueries({ queryKey: orpc.plan.list.key() });
        setCreating(false);
        router.push(`/plan/${routine.id}`);
      },
    }),
  );

  const live = routines.data?.filter((routine) => !routine.isArchived) ?? [];
  const archived = routines.data?.filter((routine) => routine.isArchived) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col gap-4 px-4 py-4">
      <header className="flex items-center justify-between py-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Plan</h1>
        {live.length > 0 ? (
          <Button variant="outline" size="touch" onClick={() => setCreating(true)}>
            <Plus data-icon="inline-start" />
            New
          </Button>
        ) : null}
      </header>

      {routines.isPending ? (
        <div className="flex flex-col gap-2">
          {[0, 1].map((row) => (
            <Skeleton key={row} className="h-16 w-full" />
          ))}
        </div>
      ) : routines.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load your routines</AlertTitle>
          <AlertDescription>Check your connection and try again.</AlertDescription>
        </Alert>
      ) : live.length === 0 && archived.length === 0 ? (
        <Empty className="border">
          <EmptyMedia variant="icon">
            <CalendarDays />
          </EmptyMedia>
          <EmptyTitle>No routines yet</EmptyTitle>
          <EmptyDescription>
            A routine is a set of days, each with its exercises and target sets. Start one from a
            workout instead if you would rather build it as you go.
          </EmptyDescription>
          <EmptyContent>
            <Button size="touch" onClick={() => setCreating(true)}>
              <Plus data-icon="inline-start" />
              Build a routine
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          {live.map((routine) => (
            <RoutineRow key={routine.id} routine={routine} />
          ))}

          {archived.length > 0 ? (
            <section className="mt-4 flex flex-col gap-2">
              <h2 className="font-heading text-sm font-semibold text-muted-foreground">Archived</h2>
              {archived.map((routine) => (
                <RoutineRow key={routine.id} routine={routine} />
              ))}
            </section>
          ) : null}
        </>
      )}

      <RoutineNameForm
        open={creating}
        onOpenChange={setCreating}
        title="New routine"
        description="Push/pull/legs, upper/lower, whatever you call yours."
        saveLabel="Create routine"
        pending={create.isPending}
        onSave={(name) => create.mutateAsync({ name })}
      />
    </div>
  );
}

function RoutineRow({
  routine,
}: {
  routine: {
    id: string;
    name: string;
    isArchived: boolean;
    dayCount: number;
    restDayCount: number;
    exerciseCount: number;
    lastActivityAt: Date | null;
  };
}) {
  return (
    <Item variant="outline" className="min-h-16" render={<Link href={`/plan/${routine.id}`} />}>
      <ItemContent>
        <ItemTitle className="text-[15px]">{routine.name}</ItemTitle>
        <ItemDescription>
          {routine.dayCount} {routine.dayCount === 1 ? "day" : "days"} · {routine.restDayCount}{" "}
          {routine.restDayCount === 1 ? "rest day" : "rest days"} · {routine.exerciseCount}{" "}
          {routine.exerciseCount === 1 ? "exercise" : "exercises"}
          {routine.lastActivityAt
            ? ` · last activity ${formatWhen(new Date(routine.lastActivityAt)).toLowerCase()}`
            : " · no activity yet"}
        </ItemDescription>
      </ItemContent>
      {routine.isArchived ? (
        <ItemActions>
          <Badge variant="secondary">Archived</Badge>
        </ItemActions>
      ) : null}
    </Item>
  );
}
