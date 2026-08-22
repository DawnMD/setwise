import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import * as React from "react";

import { useTimeZone } from "@/hooks/use-time-zone";
import { afterWrite, putHabitHome } from "@/lib/cache";
import { orpc } from "@/lib/orpc";
import { queries } from "@/lib/queries";
import type { HabitHomeSummary } from "@/server/queries/habits";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";

const HabitAdherenceChart = React.lazy(() => import("./habit-adherence-chart"));

export function HabitHome() {
  const timeZone = useTimeZone();
  const queryClient = useQueryClient();
  const summary = useQuery(queries.habitHome(timeZone));
  const setToday = useMutation(orpc.habit.setToday.mutationOptions());
  const [pending, setPending] = React.useState<Set<string>>(() => new Set());
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const change = async (id: string, completed: boolean) => {
    setPending((current) => new Set(current).add(id));
    setErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });

    try {
      const refreshed = await setToday.mutateAsync({ id, completed, timeZone });
      putHabitHome(queryClient, timeZone, refreshed);
      afterWrite.habitTodayChanged(queryClient);
    } catch {
      setErrors((current) => ({ ...current, [id]: "Couldn't save this check-off. Try again." }));
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  if (summary.isPending) return <Skeleton className="h-56 w-full" />;
  if (summary.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t load your habits</AlertTitle>
        <AlertDescription>Check your connection and try again.</AlertDescription>
      </Alert>
    );
  }

  const data = summary.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Habits</CardTitle>
        <CardAction>
          <Link to="/habits" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Manage
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <section className="flex flex-col gap-2" aria-labelledby="today-habits-heading">
          <h3 id="today-habits-heading" className="text-xs font-medium text-muted-foreground">
            Today
          </h3>
          {data.habits.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active habits. Add one from Manage and it will appear here every day.
            </p>
          ) : (
            <FieldGroup className="gap-1">
              {data.habits.map((habit) => (
                <div key={habit.id} className="flex flex-col gap-1">
                  <Field orientation="horizontal" data-disabled={pending.has(habit.id)}>
                    <Checkbox
                      id={`habit-${habit.id}`}
                      checked={habit.completed}
                      disabled={pending.has(habit.id)}
                      onCheckedChange={(checked) => void change(habit.id, checked === true)}
                    />
                    <FieldLabel
                      htmlFor={`habit-${habit.id}`}
                      className="min-h-10 flex-1 font-normal"
                    >
                      {habit.name}
                    </FieldLabel>
                  </Field>
                  {errors[habit.id] ? (
                    <p className="pl-7 text-xs text-destructive" role="alert">
                      {errors[habit.id]}
                    </p>
                  ) : null}
                </div>
              ))}
            </FieldGroup>
          )}
        </section>

        <ConsistencyHeadline latest={data.latestSevenDayRate} previous={data.priorSevenDayRate} />
        <DeferredChart summary={data} />
      </CardContent>
    </Card>
  );
}

function ConsistencyHeadline({
  latest,
  previous,
}: {
  latest: number | null;
  previous: number | null;
}) {
  if (latest === null) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-muted-foreground">7-day consistency</span>
        <span className="text-sm">Not enough history yet</span>
      </div>
    );
  }

  const delta = previous === null ? null : Math.round(latest - previous);
  const rounded = Math.round(latest);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">7-day consistency</span>
        <span className="numeric-display text-2xl">{rounded}%</span>
      </div>
      {delta !== null ? (
        <span className="text-xs text-muted-foreground">
          {delta === 0
            ? "Level with the prior week"
            : `${Math.abs(delta)} percentage ${Math.abs(delta) === 1 ? "point" : "points"} ${delta > 0 ? "above" : "below"} the prior week`}
        </span>
      ) : null}
    </div>
  );
}

function DeferredChart({ summary }: { summary: HabitHomeSummary }) {
  const target = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const element = target.current;
    if (!element || visible) return;
    if (!("IntersectionObserver" in window)) {
      const timer = globalThis.setTimeout(() => setVisible(true), 0);
      return () => globalThis.clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={target} className="min-h-[24rem]" data-testid="habit-chart-boundary">
      {visible ? (
        <React.Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <HabitAdherenceChart points={summary.trend} />
        </React.Suspense>
      ) : (
        <Skeleton className="h-96 w-full" />
      )}
    </div>
  );
}
