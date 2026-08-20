"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { isDefinedError } from "@orpc/client";
import { Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { formatWeight, formatWhen } from "@/lib/format";
import { orpc } from "@/lib/orpc";
import { uuidv7 } from "@/lib/uuid";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

import { Elapsed } from "./elapsed";

/**
 * The screen the app opens on.
 *
 * One decision: start, or carry on. Everything else here is history, and it is
 * history rather than statistics because the stats screen is phase 3 and a
 * half-built version of it would be worse than none.
 */
export function TrainHome() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  const active = useQuery(orpc.session.active.queryOptions({ staleTime: 0 }));
  const recent = useQuery(orpc.session.recent.queryOptions({ input: { limit: 10 } }));
  const upcoming = useQuery(orpc.plan.upcoming.queryOptions({ staleTime: 60_000 }));

  const start = useMutation(
    orpc.session.start.mutationOptions({
      onSuccess: (session) => router.push(`/train/${session.id}`),
      onError: (mutationError) => {
        // A typed error, matched rather than string-parsed: if a workout is
        // already open, the only sensible thing is to go to it.
        if (isDefinedError(mutationError) && mutationError.code === "SESSION_ALREADY_ACTIVE") {
          router.push(`/train/${mutationError.data.sessionId}`);
          return;
        }
        setError("Couldn't start a workout. Check your connection and try again.");
      },
    }),
  );

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4 px-4 py-4">
      <header className="flex items-center justify-between py-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Setwise</h1>
        <Button
          variant="ghost"
          size="icon-touch"
          aria-label="Settings"
          render={<Link href="/settings" />}
        >
          <Settings />
        </Button>
      </header>

      {active.data ? (
        <Card>
          <CardHeader>
            <CardTitle>Workout in progress</CardTitle>
            <CardDescription className="numeric">
              Started {formatWhen(new Date(active.data.startedAt)).toLowerCase()} ·{" "}
              <Elapsed since={active.data.startedAt} /> in
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              size="touch"
              className="w-full"
              render={<Link href={`/train/${active.data.id}`} />}
            >
              Carry on
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Least recently run first, so the day at the top is almost always
              the right one and the rotation looks after itself. */}
          {upcoming.data?.map((day, index) => (
            <Item key={day.id} variant="outline" className="min-h-14">
              <ItemContent>
                <ItemTitle className="text-[15px]">{day.name}</ItemTitle>
                <ItemDescription>
                  {day.routineName} · {day.exerciseCount}{" "}
                  {day.exerciseCount === 1 ? "exercise" : "exercises"}
                  {day.lastRunAt
                    ? ` · last run ${formatWhen(new Date(day.lastRunAt)).toLowerCase()}`
                    : " · never run"}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  variant={index === 0 ? "default" : "outline"}
                  size="touch"
                  disabled={start.isPending || active.isPending}
                  onClick={() => {
                    setError(null);
                    start.mutate({ id: uuidv7(), routineDayId: day.id, notes: null });
                  }}
                >
                  Start
                </Button>
              </ItemActions>
            </Item>
          ))}

          <Button
            variant={upcoming.data && upcoming.data.length > 0 ? "secondary" : "default"}
            size="touch"
            className="w-full"
            disabled={start.isPending || active.isPending}
            onClick={() => {
              setError(null);
              start.mutate({ id: uuidv7(), routineDayId: null, notes: null });
            }}
          >
            {start.isPending ? <Spinner data-icon="inline-start" /> : null}
            {start.isPending
              ? "Starting…"
              : upcoming.data && upcoming.data.length > 0
                ? "Start an empty workout"
                : "Start workout"}
          </Button>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Couldn&apos;t start a workout</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      )}

      <section className="mt-4 flex flex-col gap-2">
        <h2 className="font-heading text-sm font-semibold">Recent workouts</h2>

        {recent.isPending ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-14 w-full" />
            ))}
          </div>
        ) : recent.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t load your history</AlertTitle>
            <AlertDescription>Check your connection and try again.</AlertDescription>
          </Alert>
        ) : recent.data.length === 0 ? (
          <Empty className="border">
            <EmptyTitle>No workouts yet</EmptyTitle>
            <EmptyDescription>Start one and it will show up here.</EmptyDescription>
          </Empty>
        ) : (
          recent.data.map((session) => (
            <Item
              key={session.id}
              variant="outline"
              className="min-h-14"
              render={<Link href={`/train/${session.id}`} />}
            >
              <ItemContent>
                <ItemTitle className="text-[15px]">
                  {formatWhen(new Date(session.startedAt))}
                  {session.endedAt === null ? " · unfinished" : ""}
                </ItemTitle>
                <ItemDescription>
                  {session.exerciseNames.length > 0
                    ? session.exerciseNames.slice(0, 3).join(", ")
                    : "No sets logged"}
                </ItemDescription>
              </ItemContent>
              <ItemContent className="numeric flex-none text-right">
                <ItemTitle className="text-xs text-muted-foreground">
                  {session.workingSetCount} sets
                </ItemTitle>
                <ItemDescription>{formatWeight(Math.round(session.tonnage))} kg</ItemDescription>
              </ItemContent>
            </Item>
          ))
        )}
      </section>
    </div>
  );
}
