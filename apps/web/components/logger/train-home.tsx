import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BedDouble } from "lucide-react";
import * as React from "react";

import { formatWeight, formatWhen } from "@setwise/domain/format";
import { queries } from "@/lib/queries";
import { useCriticalData } from "@/hooks/use-critical-data";
import { useStartWorkout } from "@/hooks/use-start-workout";
import { useTimeZone } from "@/hooks/use-time-zone";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

import { Elapsed } from "./elapsed";
import { LogRestDialog, type RestLogTarget } from "./log-rest-dialog";

/**
 * The logger's front door.
 *
 * One decision: start, or carry on. Everything else here is history, and it is
 * history rather than statistics because Progress owns those.
 *
 * Phase 6 took two things off this screen. The app now opens on Home, so the
 * "Setwise" title and the settings gear moved there with it, and so did the
 * dismissible profile prompt. What is left is the whole rotation rather than
 * Home's single next day: this is the screen for the week someone wants to run
 * out of order.
 */
export function TrainHome() {
  const [restTarget, setRestTarget] = React.useState<RestLogTarget | null>(null);
  const timeZone = useTimeZone();
  const { startWorkout, isPending: starting, error, clearError } = useStartWorkout();

  const active = useQuery(queries.activeSession());
  const recent = useQuery(queries.recentActivity());
  const upcoming = useQuery(queries.upcomingDays());
  const restToday = useQuery(queries.restToday(timeZone));
  const hasPlannedRest = upcoming.data?.some((day) => day.kind === "rest") ?? false;

  useCriticalData(!active.isPending && !upcoming.isPending && !recent.isPending);

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4 px-4 py-4">
      <h1 className="py-2 font-heading text-2xl font-semibold tracking-tight">Train</h1>

      {active.isPending ? (
        <Skeleton className="h-28 w-full" />
      ) : active.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t check your workout</AlertTitle>
          <AlertDescription>Check your connection and try again.</AlertDescription>
        </Alert>
      ) : active.data ? (
        <Card>
          <CardHeader>
            <CardTitle>Workout in progress</CardTitle>
            <CardDescription className="numeric">
              Started {formatWhen(new Date(active.data.startedAt)).toLowerCase()} ·{" "}
              <Elapsed since={active.data.startedAt} /> in
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              to="/train/$sessionId"
              params={{ sessionId: active.data.id }}
              className={buttonVariants({ size: "touch", className: "w-full" })}
            >
              Carry on
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Least recently run first, so the day at the top is almost always
              the right one and the rotation looks after itself. */}
          {upcoming.isPending ? (
            <div className="flex flex-col gap-2">
              {[0, 1].map((row) => (
                <Skeleton key={row} className="h-14 w-full" />
              ))}
            </div>
          ) : upcoming.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Couldn&apos;t load upcoming days</AlertTitle>
              <AlertDescription>Check your connection and try again.</AlertDescription>
            </Alert>
          ) : (
            upcoming.data.map((day, index) => (
              <Item key={day.id} variant="outline" className="min-h-14">
                <ItemContent>
                  <ItemTitle className="text-[15px]">
                    {day.name}
                    {day.kind === "rest" ? <Badge variant="secondary">Rest</Badge> : null}
                  </ItemTitle>
                  <ItemDescription>
                    {day.routineName}
                    {day.kind === "workout"
                      ? ` · ${day.exerciseCount} ${day.exerciseCount === 1 ? "exercise" : "exercises"}`
                      : ""}
                    {day.lastRunAt
                      ? ` · last ${day.kind === "rest" ? "rested" : "run"} ${formatWhen(new Date(day.lastRunAt)).toLowerCase()}`
                      : ` · never ${day.kind === "rest" ? "rested" : "run"}`}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    variant={index === 0 ? "default" : "outline"}
                    size="touch"
                    disabled={
                      starting ||
                      (day.kind === "rest" &&
                        (restToday.isPending || restToday.isError || restToday.data !== null))
                    }
                    onClick={() => {
                      clearError();
                      if (day.kind === "rest") {
                        setRestTarget({
                          routineDayId: day.id,
                          dayName: day.name,
                          routineName: day.routineName,
                        });
                      } else {
                        startWorkout(day.id);
                      }
                    }}
                  >
                    {day.kind === "rest" && restToday.isPending ? (
                      <Spinner data-icon="inline-start" />
                    ) : null}
                    {day.kind === "rest"
                      ? restToday.data
                        ? "Rest logged"
                        : restToday.isPending
                          ? "Checking…"
                          : "Log rest"
                      : "Start"}
                  </Button>
                </ItemActions>
              </Item>
            ))
          )}

          <Button
            variant={upcoming.data && upcoming.data.length > 0 ? "secondary" : "default"}
            size="touch"
            className="w-full"
            disabled={starting}
            onClick={() => startWorkout(null)}
          >
            {starting ? <Spinner data-icon="inline-start" /> : null}
            {starting
              ? "Starting…"
              : upcoming.data && upcoming.data.length > 0
                ? "Start an empty workout"
                : "Start workout"}
          </Button>
          {upcoming.data && hasPlannedRest && restToday.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Couldn&apos;t check today&apos;s rest</AlertTitle>
              <AlertDescription>Check your connection and try again.</AlertDescription>
            </Alert>
          ) : null}
          {upcoming.data && !hasPlannedRest ? (
            restToday.isError ? (
              <Alert variant="destructive">
                <AlertTitle>Couldn&apos;t check today&apos;s rest</AlertTitle>
                <AlertDescription>Check your connection and try again.</AlertDescription>
              </Alert>
            ) : (
              <Button
                variant="outline"
                size="touch"
                className="w-full"
                disabled={starting || restToday.isPending || restToday.data !== null}
                onClick={() => {
                  clearError();
                  setRestTarget({ routineDayId: null });
                }}
              >
                {restToday.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <BedDouble data-icon="inline-start" />
                )}
                {restToday.data
                  ? "Rest logged today"
                  : restToday.isPending
                    ? "Checking today’s rest…"
                    : "Log rest day"}
              </Button>
            )
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Couldn&apos;t start a workout</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      )}

      <section className="mt-4 flex flex-col gap-2">
        <h2 className="font-heading text-sm font-semibold">Recent activity</h2>

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
            <EmptyTitle>No activity yet</EmptyTitle>
            <EmptyDescription>
              Start a workout or log rest and it will show up here.
            </EmptyDescription>
          </Empty>
        ) : (
          recent.data.map((session) => (
            <Item
              key={session.id}
              variant="outline"
              className="min-h-14"
              render={<Link to="/train/$sessionId" params={{ sessionId: session.id }} />}
            >
              <ItemContent>
                <ItemTitle className="text-[15px]">
                  {session.kind === "rest"
                    ? (session.dayName ?? "Rest day")
                    : formatWhen(new Date(session.startedAt))}
                  {session.kind === "workout" && session.endedAt === null ? " · unfinished" : ""}
                </ItemTitle>
                <ItemDescription>
                  {session.kind === "rest"
                    ? session.routineName
                      ? `${session.routineName} · ${formatWhen(new Date(session.startedAt))}`
                      : formatWhen(new Date(session.startedAt))
                    : session.exerciseNames.length > 0
                      ? session.exerciseNames.slice(0, 3).join(", ")
                      : "No sets logged"}
                </ItemDescription>
              </ItemContent>
              {session.kind === "rest" ? (
                <ItemActions>
                  <Badge variant="secondary">Rest</Badge>
                </ItemActions>
              ) : (
                <ItemContent className="numeric flex-none text-right">
                  <ItemTitle className="text-xs text-muted-foreground">
                    {session.workingSetCount} sets
                  </ItemTitle>
                  <ItemDescription>{formatWeight(Math.round(session.tonnage))} kg</ItemDescription>
                </ItemContent>
              )}
            </Item>
          ))
        )}
      </section>

      <LogRestDialog target={restTarget} onOpenChange={(open) => !open && setRestTarget(null)} />
    </div>
  );
}
