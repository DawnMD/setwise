import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BedDouble, ChevronRight, Settings } from "lucide-react";
import * as React from "react";

import type { HomeSummary } from "@/server/queries/home";
import { formatTonnageValue, formatWeight, formatWhen, parseIsoDay } from "@/lib/format";
import { queries } from "@/lib/queries";
import { useCriticalData } from "@/hooks/use-critical-data";
import { useStartWorkout } from "@/hooks/use-start-workout";
import { useTimeZone } from "@/hooks/use-time-zone";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Elapsed } from "@/components/logger/elapsed";
import { LogRestDialog, type RestLogTarget } from "@/components/logger/log-rest-dialog";
import { ProfilePrompt } from "@/components/profile/profile-prompt";

/**
 * The first screen.
 *
 * Home answers one question — what is today — and then gets out of the way.
 * Nothing here can be edited. Every number is a link to the screen that owns
 * it, because a second place to change a weigh-in is a second place for the two
 * to disagree.
 *
 * The order is the order of the day: the workout, then whether the week has
 * been enough of one, then the scale, then what to eat, then what has been
 * missed. It fits a 390px screen without scrolling as far as the week, which is
 * the point of it existing at all.
 */
export function HomeScreen() {
  const timeZone = useTimeZone();
  const [restTarget, setRestTarget] = React.useState<RestLogTarget | null>(null);

  const summary = useQuery(queries.homeSummary(timeZone));
  const profile = useQuery(queries.profile(timeZone));
  useCriticalData(!summary.isPending);

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4 px-4 py-4">
      <header className="flex items-center justify-between py-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Setwise</h1>
        <Link
          to="/settings"
          aria-label="Settings"
          className={buttonVariants({ variant: "ghost", size: "icon-touch" })}
        >
          <Settings />
        </Link>
      </header>

      {/*
        Dismissible here and nowhere else. This is the screen the app opens on,
        and being asked for your date of birth every time you arrive to lift is
        how a good prompt becomes furniture people stop reading. Body and
        Settings keep the permanent copy.
      */}
      <ProfilePrompt dismissible />

      {summary.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : summary.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load your day</AlertTitle>
          <AlertDescription>Check your connection and try again.</AlertDescription>
        </Alert>
      ) : (
        <>
          <Today summary={summary.data} onLogRest={setRestTarget} />
          <Week week={summary.data.week} />
          <WeightDirection weight={summary.data.weight} />
          <TodaysTargets targets={profile.data?.targets ?? null} pending={profile.isPending} />
          <Untrained week={summary.data.week} />
        </>
      )}

      <LogRestDialog target={restTarget} onOpenChange={(open) => !open && setRestTarget(null)} />
    </div>
  );
}

/**
 * The one decision on the screen: carry on, start the next day, or rest.
 *
 * An open workout wins outright. Someone who closed the tab mid-session and
 * came back is not being offered a choice about what to train.
 */
function Today({
  summary,
  onLogRest,
}: {
  summary: HomeSummary;
  onLogRest: (target: RestLogTarget) => void;
}) {
  const { startWorkout, isPending, error } = useStartWorkout();

  if (summary.active) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Workout in progress</span>
          <span className="numeric-display text-3xl leading-none">
            <Elapsed since={summary.active.startedAt} />
          </span>
          <span className="numeric text-xs text-muted-foreground">
            Started {formatWhen(new Date(summary.active.startedAt)).toLowerCase()}
          </span>
        </div>
        <Link
          to="/train/$sessionId"
          params={{ sessionId: summary.active.id }}
          className={buttonVariants({ size: "touch", className: "w-full" })}
        >
          Carry on
        </Link>
      </section>
    );
  }

  const day = summary.nextDay;

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{day ? "Up next" : "Nothing planned"}</span>
        <span className="font-heading text-2xl leading-tight font-semibold">
          {day ? day.name : "Start an empty workout"}
          {day?.kind === "rest" ? <Badge variant="secondary">Rest</Badge> : null}
        </span>
        <span className="text-xs text-muted-foreground">
          {day
            ? `${day.routineName}${day.kind === "workout" ? ` · ${day.exerciseCount} ${day.exerciseCount === 1 ? "exercise" : "exercises"}` : ""}${
                day.lastRunAt
                  ? ` · last ${day.kind === "rest" ? "rested" : "run"} ${formatWhen(new Date(day.lastRunAt)).toLowerCase()}`
                  : ` · never ${day.kind === "rest" ? "rested" : "run"}`
              }`
            : "Build a routine on Plan and the next day shows up here."}
        </span>
      </div>

      {/* One tap. Not a link to Train followed by a tap there. */}
      {day?.kind === "rest" ? (
        <Button
          size="touch"
          className="w-full"
          disabled={summary.restLoggedToday}
          onClick={() =>
            onLogRest({
              routineDayId: day.id,
              dayName: day.name,
              routineName: day.routineName,
            })
          }
        >
          {summary.restLoggedToday ? (
            "Rest logged today"
          ) : (
            <>
              <BedDouble data-icon="inline-start" />
              Log rest
            </>
          )}
        </Button>
      ) : (
        <Button
          size="touch"
          className="w-full"
          disabled={isPending}
          onClick={() => startWorkout(day?.id ?? null)}
        >
          {isPending ? <Spinner data-icon="inline-start" /> : null}
          {isPending ? "Starting…" : day ? `Start ${day.name}` : "Start workout"}
        </Button>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t start a workout</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* Everything else the rotation holds. Home shows one day; Train shows the list. */}
      <Link
        to="/train"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "w-full" })}
      >
        {summary.restLoggedToday && day?.kind !== "rest"
          ? "Rest is logged today · all options"
          : "Other days and rest"}
      </Link>
    </section>
  );
}

/**
 * A tile of numbers under a heading that is itself the link to the screen the
 * numbers belong to. Repeated four times below, which is what makes "every
 * number links to its owner" a rule rather than four separate decisions.
 */
function SummaryCard({
  title,
  to,
  linkLabel,
  children,
}: {
  title: string;
  to: "/progress" | "/body";
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-heading text-sm font-semibold text-muted-foreground">{title}</h2>
      <Link
        to={to}
        aria-label={linkLabel}
        className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 text-left"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </section>
  );
}

/**
 * One figure over its label.
 *
 * Two decisions, both forced by the width. Three of these abreast at 390px
 * gives each about 106px, and the widest figure the week can produce is a
 * grouped five-digit tonnage. The unit therefore lives in the label rather than
 * beside the value, and the value is set at `text-xl` rather than `text-2xl`,
 * where "15,720" fills its column and runs into the workout count next to it.
 * Expanded heavy digits are wide, which is the price of the tabular cut the
 * rest of the app uses.
 */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="numeric-display text-xl leading-none">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function Week({ week }: { week: HomeSummary["week"] }) {
  return (
    <SummaryCard title="This week" to="/progress" linkLabel="This week, on Progress">
      {week.workingSets === 0 ? (
        <span className="text-sm text-muted-foreground">
          No working sets in {week.days} days. Warm-ups don&apos;t count.
        </span>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Working sets" value={String(week.workingSets)} />
          <Stat label="Tonnage (kg)" value={formatTonnageValue(week.tonnage)} />
          <Stat
            label={week.sessions === 1 ? "Workout" : "Workouts"}
            value={String(week.sessions)}
          />
        </div>
      )}
    </SummaryCard>
  );
}

/**
 * Weight, as a direction rather than a reading.
 *
 * The number that matters here is kilograms a week, because that is the unit
 * the goal is set in and the only one that answers "is this working". The trend
 * itself is beside it for scale. Both come from the seven-day mean; a raw
 * weigh-in against a raw weigh-in reports Tuesday's salt as progress.
 */
function WeightDirection({ weight }: { weight: HomeSummary["weight"] }) {
  const change = weight.changeKg;
  const rounded = change === null ? null : Math.round(change * 10) / 10;

  return (
    <SummaryCard title="Weight" to="/body" linkLabel="Weight and targets, on Body">
      {weight.trend === null ? (
        <span className="text-sm text-muted-foreground">
          {weight.latest
            ? `Last weighed in ${formatWhen(parseIsoDay(weight.latest.day)).toLowerCase()}. Weigh in to restart the trend.`
            : "No weigh-ins yet. Weigh in and the trend starts."}
        </span>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {/* One decimal. A mean of seven weigh-ins reads 82.93 if you let it,
              and the third digit is a claim the scale never made. */}
          <Stat label="7-day trend (kg)" value={formatWeight(Math.round(weight.trend * 10) / 10)} />
          <Stat
            label={rounded === null ? "Needs another week" : "Change a week (kg)"}
            value={rounded === null ? "—" : `${rounded > 0 ? "+" : ""}${rounded}`}
          />
        </div>
      )}
    </SummaryCard>
  );
}

/**
 * Calories and protein, and nothing else.
 *
 * Fat and carbohydrate live on Body with the working behind them. These two are
 * the ones people check against what they have eaten by mid-afternoon, and a
 * summary that reprints the whole macro card is a second Body screen.
 *
 * Absent rather than empty when the profile cannot produce a number: the
 * prompt at the top of this screen already says which answers are missing, and
 * a row of dashes underneath it would say it a second time, worse.
 */
function TodaysTargets({
  targets,
  pending,
}: {
  targets: { calories: number | null; macros: { proteinG: number } | null } | null;
  pending: boolean;
}) {
  if (pending) return <Skeleton className="h-20 w-full" />;
  if (!targets || targets.calories === null) return null;

  return (
    <SummaryCard title="Today's targets" to="/body" linkLabel="Targets, on Body">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Calories" value={targets.calories.toLocaleString()} />
        {targets.macros ? (
          <Stat label="Protein (g)" value={String(targets.macros.proteinG)} />
        ) : null}
      </div>
    </SummaryCard>
  );
}

/**
 * What has had nothing this week.
 *
 * The most actionable line on Progress, said in words here for the same reason
 * it is said in words there: an absence of colour on a silhouette is not
 * something anyone notices on the way to the gym.
 */
function Untrained({ week }: { week: HomeSummary["week"] }) {
  if (week.untrained.length === 0) return null;

  return (
    <SummaryCard title="Untrained" to="/progress" linkLabel="Untrained muscles, on Progress">
      <span className="text-sm">
        {week.untrained.length} {week.untrained.length === 1 ? "muscle has" : "muscles have"} had
        nothing in {week.days} days
      </span>
      <span className="text-xs text-muted-foreground">
        {week.untrained.map((muscle) => muscle.displayName).join(", ")}.
      </span>
    </SummaryCard>
  );
}
