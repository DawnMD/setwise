import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CalendarCheck, Pencil, Plus, Trash2 } from "lucide-react";
import type { DayButton } from "react-day-picker";
import * as React from "react";

import type { HabitCalendarDay, HabitCalendarMonth, HabitListItem } from "@/server/queries/habits";
import { useCriticalData } from "@/hooks/use-critical-data";
import { useTimeZone } from "@/hooks/use-time-zone";
import {
  addHabitListItem,
  afterWrite,
  archiveHabitListItem,
  removeHabitListItem,
  renameHabitListItem,
} from "@/lib/cache";
import { orpc } from "@/lib/orpc";
import { queries } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { parseIsoDay, toIsoDay } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

const HabitNameDrawer = React.lazy(() => import("./habit-name-drawer"));

type Editor = { kind: "create" } | { kind: "rename"; habit: HabitListItem } | null;

const monthDate = (month: string) => parseIsoDay(`${month}-01`);
const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const formatDay = (day: string, options?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, options ?? { month: "long", day: "numeric" }).format(
    parseIsoDay(day),
  );

export function HabitsScreen() {
  const timeZone = useTimeZone();
  const queryClient = useQueryClient();
  const currentMonth = React.useMemo(() => monthKey(new Date()), []);
  const [month, setMonth] = React.useState(currentMonth);
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);
  const [editor, setEditor] = React.useState<Editor>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const list = useQuery(queries.habitList(timeZone));
  const calendar = useQuery(queries.habitCalendar(month, timeZone));
  useCriticalData(!list.isPending && !calendar.isPending);

  const create = useMutation(orpc.habit.create.mutationOptions());
  const rename = useMutation(orpc.habit.rename.mutationOptions());
  const archive = useMutation(orpc.habit.archive.mutationOptions());
  const remove = useMutation(orpc.habit.delete.mutationOptions());

  const saveName = async (name: string) => {
    if (editor?.kind === "rename") {
      const result = await rename.mutateAsync({ id: editor.habit.id, name });
      renameHabitListItem(queryClient, timeZone, result.id, result.name);
    } else {
      const item = await create.mutateAsync({ name, timeZone });
      addHabitListItem(queryClient, timeZone, item);
    }
    afterWrite.habitDefinitionChanged(queryClient);
    setEditor(null);
  };

  const archiveOne = async (id: string) => {
    setActionError(null);
    try {
      const item = await archive.mutateAsync({ id, timeZone });
      archiveHabitListItem(queryClient, timeZone, item);
      afterWrite.habitDefinitionChanged(queryClient);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Couldn't archive this habit.");
    }
  };

  const deleteOne = async (id: string) => {
    setActionError(null);
    try {
      await remove.mutateAsync({ id });
      removeHabitListItem(queryClient, timeZone, id);
      afterWrite.habitDeleted(queryClient);
      if (selectedDay) setSelectedDay(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Couldn't delete this habit.");
    }
  };

  const active = list.data?.active ?? [];
  const archived = list.data?.archived ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col gap-4 px-4 py-4">
      <header className="flex items-center justify-between py-2">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Habits</h1>
          <p className="text-xs text-muted-foreground">Every day counts once.</p>
        </div>
        {active.length + archived.length > 0 ? (
          <Button variant="outline" size="touch" onClick={() => setEditor({ kind: "create" })}>
            <Plus data-icon="inline-start" />
            Add
          </Button>
        ) : null}
      </header>

      {actionError ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t update habits</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      <OverallCalendar
        month={month}
        currentMonth={currentMonth}
        data={calendar.data}
        pending={calendar.isPending}
        error={calendar.isError}
        selectedDay={selectedDay}
        onMonthChange={(next) => {
          setMonth(next);
          setSelectedDay(null);
        }}
        onSelect={setSelectedDay}
      />

      {list.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : list.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load your habits</AlertTitle>
          <AlertDescription>Check your connection and try again.</AlertDescription>
        </Alert>
      ) : active.length === 0 && archived.length === 0 ? (
        <Empty className="border">
          <EmptyMedia variant="icon">
            <CalendarCheck />
          </EmptyMedia>
          <EmptyTitle>No habits yet</EmptyTitle>
          <EmptyDescription>
            Add one daily promise. Check it from Home after you keep it.
          </EmptyDescription>
          <EmptyContent>
            <Button size="touch" onClick={() => setEditor({ kind: "create" })}>
              <Plus data-icon="inline-start" />
              Add your first habit
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-5">
          {active.length > 0 ? (
            <section className="flex flex-col gap-3" aria-labelledby="active-habits-heading">
              <h2 id="active-habits-heading" className="font-heading text-sm font-semibold">
                Active
              </h2>
              {active.map((habit) => (
                <ActiveHabitCard
                  key={habit.id}
                  habit={habit}
                  archiving={archive.isPending && archive.variables?.id === habit.id}
                  onRename={() => setEditor({ kind: "rename", habit })}
                  onArchive={() => void archiveOne(habit.id)}
                />
              ))}
            </section>
          ) : null}

          {archived.length > 0 ? (
            <section className="flex flex-col gap-3" aria-labelledby="archived-habits-heading">
              <h2
                id="archived-habits-heading"
                className="font-heading text-sm font-semibold text-muted-foreground"
              >
                Archived
              </h2>
              {archived.map((habit) => (
                <ArchivedHabitCard
                  key={habit.id}
                  habit={habit}
                  deleting={remove.isPending && remove.variables?.id === habit.id}
                  onDelete={() => void deleteOne(habit.id)}
                />
              ))}
            </section>
          ) : null}
        </div>
      )}

      {editor ? (
        <React.Suspense fallback={null}>
          <HabitNameDrawer
            open
            onOpenChange={(open) => !open && setEditor(null)}
            initialValue={editor.kind === "rename" ? editor.habit.name : ""}
            title={editor.kind === "rename" ? "Rename habit" : "Add habit"}
            description={
              editor.kind === "rename"
                ? "The new name also appears on past calendar readouts."
                : "This habit starts today and is expected every day."
            }
            saveLabel={editor.kind === "rename" ? "Save name" : "Add habit"}
            onSave={saveName}
          />
        </React.Suspense>
      ) : null}
    </div>
  );
}

function OverallCalendar({
  month,
  currentMonth,
  data,
  pending,
  error,
  selectedDay,
  onMonthChange,
  onSelect,
}: {
  month: string;
  currentMonth: string;
  data: HabitCalendarMonth | undefined;
  pending: boolean;
  error: boolean;
  selectedDay: string | null;
  onMonthChange: (month: string) => void;
  onSelect: (day: string) => void;
}) {
  if (pending && !data) return <Skeleton className="h-[410px] w-full" />;
  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t load the calendar</AlertTitle>
        <AlertDescription>Check your connection and try again.</AlertDescription>
      </Alert>
    );
  }

  const byDay = new Map(data.days.map((day) => [day.day, day]));
  const selected = selectedDay ? byDay.get(selectedDay) : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Overall consistency</CardTitle>
        <CardDescription>Completed habits among the habits expected each day.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Calendar
          mode="single"
          month={monthDate(month)}
          startMonth={monthDate(data.earliestMonth)}
          endMonth={monthDate(currentMonth)}
          showOutsideDays={false}
          selected={selectedDay ? parseIsoDay(selectedDay) : undefined}
          onMonthChange={(date) => onMonthChange(monthKey(date))}
          onSelect={(date) => {
            if (!date) return;
            const point = byDay.get(toIsoDay(date));
            if (point?.isTracked) onSelect(point.day);
          }}
          className="w-full [--cell-size:--spacing(10)]"
          classNames={{ month: "w-full", month_grid: "w-full" }}
          components={{
            DayButton: (props) => <HabitCalendarDayButton {...props} points={byDay} />,
          }}
        />
        <CalendarLegend />
        <DayReadout day={selected} />
      </CardContent>
    </Card>
  );
}

function HabitCalendarDayButton({
  day,
  modifiers,
  points,
  className,
  ...props
}: React.ComponentProps<typeof DayButton> & { points: Map<string, HabitCalendarDay> }) {
  const key = toIsoDay(day.date);
  const point = points.get(key);
  const band =
    !point?.isTracked || point.rate === null
      ? "bg-muted"
      : point.rate === 0
        ? "bg-[var(--band-none)]"
        : point.rate < 50
          ? "bg-[var(--band-low)]"
          : point.rate < 100
            ? "bg-[var(--band-productive)] text-white"
            : "bg-[var(--band-high)] text-white";
  const label = !point
    ? formatDay(key)
    : point.isFuture
      ? `${formatDay(key)}, future date`
      : !point.isTracked
        ? `${formatDay(key)}, tracking had not begun`
        : `${formatDay(key)}, ${point.completed} of ${point.eligible} habits completed`;

  return (
    <Button
      {...props}
      variant="ghost"
      size="icon"
      aria-label={label}
      disabled={!point?.isTracked}
      className={cn(
        "relative size-(--cell-size) rounded-none",
        band,
        modifiers.today && "ring-2 ring-overload ring-inset",
        modifiers.selected && "outline-2 outline-offset-2 outline-foreground",
        className,
      )}
    >
      {day.date.getDate()}
    </Button>
  );
}

function CalendarLegend() {
  return (
    <div
      className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"
      aria-label="Calendar bands"
    >
      {[
        ["var(--band-none)", "None"],
        ["var(--band-low)", "Under half"],
        ["var(--band-productive)", "At least half"],
        ["var(--band-high)", "All"],
      ].map(([color, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="size-2.5" style={{ backgroundColor: color }} aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );
}

function DayReadout({ day }: { day?: HabitCalendarDay }) {
  if (!day) {
    return (
      <p className="text-xs text-muted-foreground">Select a tracked day to see what happened.</p>
    );
  }
  return (
    <section className="flex flex-col gap-2" aria-live="polite">
      <h3 className="text-sm font-medium">
        {formatDay(day.day)} · {day.completed} of {day.eligible} habits completed.
      </h3>
      <div className="grid grid-cols-2 gap-4 text-xs">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">Completed</span>
          <span>{day.completedNames.length ? day.completedNames.join(", ") : "None"}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">Missed</span>
          <span>{day.missedNames.length ? day.missedNames.join(", ") : "None"}</span>
        </div>
      </div>
    </section>
  );
}

function Stats({ habit, archived = false }: { habit: HabitListItem; archived?: boolean }) {
  const stats = habit.stats;
  return (
    <dl className="grid grid-cols-2 gap-3">
      {!archived ? <Stat label="Current streak" value={`${stats.currentStreak}d`} /> : null}
      <Stat label="Best streak" value={`${stats.bestStreak}d`} />
      <Stat
        label={archived ? "Final 30-day rate" : "30-day rate"}
        value={
          stats.trailingThirtyDayRate === null ? "—" : `${Math.round(stats.trailingThirtyDayRate)}%`
        }
      />
      <Stat label="Total completed" value={String(stats.totalCompleted)} />
    </dl>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dd className="numeric-display text-xl">{value}</dd>
      <dt className="text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}

function ActiveHabitCard({
  habit,
  archiving,
  onRename,
  onArchive,
}: {
  habit: HabitListItem;
  archiving: boolean;
  onRename: () => void;
  onArchive: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{habit.name}</CardTitle>
        <CardAction className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Rename ${habit.name}`}
            onClick={onRename}
          >
            <Pencil />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label={`Archive ${habit.name}`} />
              }
            >
              <Archive />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Archive {habit.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  It disappears from Home after today. Its check-offs stay in the calendar and
                  statistics.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep active</AlertDialogCancel>
                <AlertDialogAction onClick={onArchive} disabled={archiving}>
                  {archiving ? <Spinner data-icon="inline-start" /> : null}
                  Archive habit
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Stats habit={habit} />
      </CardContent>
    </Card>
  );
}

function ArchivedHabitCard({
  habit,
  deleting,
  onDelete,
}: {
  habit: HabitListItem;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{habit.name}</CardTitle>
        <CardDescription>Archived {formatDay(habit.archivedOn!)}</CardDescription>
        <CardAction>
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label={`Delete ${habit.name}`} />}
            >
              <Trash2 />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {habit.name} permanently?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the habit and every check-off. Calendar ratios will change. This
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={onDelete} disabled={deleting}>
                  {deleting ? <Spinner data-icon="inline-start" /> : null}
                  Delete permanently
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Stats habit={habit} archived />
      </CardContent>
    </Card>
  );
}
