import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isDefinedError } from "@orpc/client";
import { useNavigate } from "@tanstack/react-router";
import { BedDouble, ChevronDown, ChevronUp, MoreVertical, Play, Plus } from "lucide-react";
import * as React from "react";

import { orpc } from "@/lib/orpc";
import { describeTargets, type Targets } from "@/lib/targets";
import { ExercisePicker } from "@/components/logger/exercise-picker";
import { LogRestDialog, type RestLogTarget } from "@/components/logger/log-rest-dialog";
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
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { RoutineNameForm } from "./routine-name-form";
import { TargetsForm } from "./targets-form";

type PlannedExercise = {
  id: string;
  exerciseId: string;
  name: string;
  equipment: string | null;
} & Targets;

type Dialog =
  | { kind: "rename-routine" }
  | { kind: "add-workout-day" }
  | { kind: "add-rest-day" }
  | { kind: "rename-day"; dayId: string; name: string }
  | { kind: "delete-day"; dayId: string; name: string }
  | { kind: "delete-routine" }
  | { kind: "targets"; planned: PlannedExercise }
  | null;

/**
 * Building one routine.
 *
 * Days are tabs rather than a stacked list. A push/pull/legs split is three
 * short lists, and stacking them means scrolling past the two you are not
 * editing every time you add an exercise to the third.
 */
export function RoutineEditor({ routineId }: { routineId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const options = orpc.plan.get.queryOptions({ input: { id: routineId } });
  const routine = useQuery(options);

  const [activeDay, setActiveDay] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [restTarget, setRestTarget] = React.useState<RestLogTarget | null>(null);
  const [timeZone] = React.useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [startError, setStartError] = React.useState<string | null>(null);
  const restToday = useQuery(
    orpc.session.restToday.queryOptions({ input: { timeZone }, staleTime: 60_000 }),
  );

  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: options.queryKey });
    void queryClient.invalidateQueries({ queryKey: orpc.plan.list.key() });
  }, [queryClient, options.queryKey]);

  const close = () => setDialog(null);
  const afterWrite = {
    onSuccess: () => {
      refresh();
      close();
    },
  };

  const renameRoutine = useMutation(orpc.plan.renameRoutine.mutationOptions(afterWrite));
  const archiveRoutine = useMutation(
    orpc.plan.archiveRoutine.mutationOptions({ onSuccess: refresh }),
  );
  const addDay = useMutation(orpc.plan.addDay.mutationOptions(afterWrite));
  const renameDay = useMutation(orpc.plan.renameDay.mutationOptions(afterWrite));
  const deleteDay = useMutation(orpc.plan.deleteDay.mutationOptions(afterWrite));
  const moveDay = useMutation(orpc.plan.moveDay.mutationOptions({ onSuccess: refresh }));
  const addExercise = useMutation(orpc.plan.addExercise.mutationOptions({ onSuccess: refresh }));
  const updateTargets = useMutation(orpc.plan.updateTargets.mutationOptions(afterWrite));
  const removeExercise = useMutation(
    orpc.plan.removeExercise.mutationOptions({ onSuccess: refresh }),
  );
  const moveExercise = useMutation(orpc.plan.moveExercise.mutationOptions({ onSuccess: refresh }));

  const deleteRoutine = useMutation(
    orpc.plan.deleteRoutine.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: orpc.plan.list.key() });
        void navigate({ to: "/plan", replace: true });
      },
    }),
  );

  const startSession = useMutation(
    orpc.session.start.mutationOptions({
      onSuccess: (session) =>
        void navigate({ to: "/train/$sessionId", params: { sessionId: session.id } }),
      onError: (error) => {
        if (isDefinedError(error) && error.code === "SESSION_ALREADY_ACTIVE") {
          void navigate({
            to: "/train/$sessionId",
            params: { sessionId: error.data.sessionId },
          });
          return;
        }
        setStartError("Couldn't start a workout. Check your connection and try again.");
      },
    }),
  );

  if (routine.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-[520px] flex-col gap-3 px-4 py-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (routine.isError || !routine.data) {
    return (
      <div className="mx-auto w-full max-w-[520px] px-4 py-10">
        <Empty className="border">
          <EmptyTitle>That routine couldn&apos;t be loaded</EmptyTitle>
          <EmptyDescription>It may have been deleted. Check your connection.</EmptyDescription>
          <EmptyContent>
            <Button
              variant="outline"
              size="touch"
              onClick={() => void navigate({ to: "/plan", replace: true })}
            >
              Back to plan
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const detail = routine.data;
  const days = detail.days;
  const currentDayId = days.some((day) => day.id === activeDay)
    ? (activeDay as string)
    : (days[0]?.id ?? null);
  const currentDay = days.find((day) => day.id === currentDayId) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col gap-3 px-4 py-4">
      <header className="flex items-start justify-between gap-3 py-2">
        <div className="min-w-0">
          <h1 className="truncate font-heading text-2xl font-semibold tracking-tight">
            {detail.name}
          </h1>
          <p className="text-xs text-muted-foreground">
            {days.length} {days.length === 1 ? "day" : "days"}
            {detail.isArchived ? " · archived" : ""}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-touch" aria-label="Routine options">
                <MoreVertical />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setDialog({ kind: "rename-routine" })}>
                Rename routine
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog({ kind: "add-workout-day" })}>
                Add workout day
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog({ kind: "add-rest-day" })}>
                Add rest day
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  archiveRoutine.mutate({ id: detail.id, isArchived: !detail.isArchived })
                }
              >
                {detail.isArchived ? "Unarchive routine" : "Archive routine"}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDialog({ kind: "delete-routine" })}
              >
                Delete routine
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {days.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyTitle>No days yet</EmptyTitle>
          <EmptyDescription>
            Add the first one — Push, Upper, Legs, whatever it is.
          </EmptyDescription>
          <EmptyContent>
            <Button size="touch" onClick={() => setDialog({ kind: "add-workout-day" })}>
              <Plus data-icon="inline-start" />
              Add workout day
            </Button>
            <Button
              variant="secondary"
              size="touch"
              onClick={() => setDialog({ kind: "add-rest-day" })}
            >
              <BedDouble data-icon="inline-start" />
              Add rest day
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Tabs value={currentDayId ?? undefined} onValueChange={setActiveDay}>
          <TabsList className="w-full overflow-x-auto overflow-y-hidden group-data-horizontal/tabs:h-auto">
            {days.map((day) => (
              <TabsTrigger key={day.id} value={day.id} className="h-11 shrink-0">
                {day.name}
                {day.kind === "rest" ? <Badge variant="secondary">Rest</Badge> : null}
              </TabsTrigger>
            ))}
          </TabsList>

          {days.map((day) => (
            <TabsContent key={day.id} value={day.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <ButtonGroup>
                  <Button
                    variant="outline"
                    size="icon-touch"
                    aria-label={`Move ${day.name} earlier`}
                    disabled={day.dayIndex === days[0].dayIndex || moveDay.isPending}
                    onClick={() => moveDay.mutate({ id: day.id, direction: "up" })}
                  >
                    <ChevronUp />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-touch"
                    aria-label={`Move ${day.name} later`}
                    disabled={day.dayIndex === days.at(-1)?.dayIndex || moveDay.isPending}
                    onClick={() => moveDay.mutate({ id: day.id, direction: "down" })}
                  >
                    <ChevronDown />
                  </Button>
                </ButtonGroup>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="ghost" size="touch" aria-label={`${day.name} options`}>
                        Edit day
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        onClick={() =>
                          setDialog({ kind: "rename-day", dayId: day.id, name: day.name })
                        }
                      >
                        Rename day
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() =>
                          setDialog({ kind: "delete-day", dayId: day.id, name: day.name })
                        }
                      >
                        Delete day
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {day.kind === "rest" ? (
                <Empty className="border border-dashed">
                  <EmptyMedia variant="icon">
                    <BedDouble />
                  </EmptyMedia>
                  <EmptyTitle>Recovery day</EmptyTitle>
                  <EmptyDescription>
                    Take the day off training and come back recovered for the next one.
                  </EmptyDescription>
                </Empty>
              ) : day.exercises.length === 0 ? (
                <Empty className="border border-dashed">
                  <EmptyTitle>Nothing on {day.name} yet</EmptyTitle>
                  <EmptyDescription>
                    Add exercises in the order you want to do them.
                  </EmptyDescription>
                </Empty>
              ) : (
                day.exercises.map((planned, index) => (
                  <Item key={planned.id} variant="outline" className="min-h-14">
                    <ItemContent>
                      <ItemTitle className="text-[15px]">{planned.name}</ItemTitle>
                      <ItemDescription className="numeric">
                        {describeTargets(planned) ?? "No targets set"}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDialog({ kind: "targets", planned })}
                      >
                        Targets
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-touch"
                              aria-label={`${planned.name} options`}
                            >
                              <MoreVertical />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              disabled={index === 0}
                              onClick={() =>
                                moveExercise.mutate({ id: planned.id, direction: "up" })
                              }
                            >
                              Move up
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={index === day.exercises.length - 1}
                              onClick={() =>
                                moveExercise.mutate({ id: planned.id, direction: "down" })
                              }
                            >
                              Move down
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => removeExercise.mutate({ id: planned.id })}
                            >
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </ItemActions>
                  </Item>
                ))
              )}

              {day.kind === "workout" ? (
                <Button
                  variant="secondary"
                  size="touch"
                  className="w-full"
                  onClick={() => setPickerOpen(true)}
                >
                  <Plus data-icon="inline-start" />
                  Add exercise
                </Button>
              ) : null}
            </TabsContent>
          ))}
        </Tabs>
      )}

      {startError ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t start a workout</AlertTitle>
          <AlertDescription>{startError}</AlertDescription>
        </Alert>
      ) : null}

      {currentDay?.kind === "rest" && restToday.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t check today&apos;s rest</AlertTitle>
          <AlertDescription>Check your connection and try again.</AlertDescription>
        </Alert>
      ) : null}

      {/* Running the day is the point of the screen, so it sits in the bottom
          third under the thumb rather than beside the day's name. */}
      {currentDay &&
      (currentDay.kind === "rest" ||
        (currentDay.kind === "workout" && currentDay.exercises.length > 0)) ? (
        <div className="sticky bottom-0 -mx-4 mt-auto border-t bg-card px-4 py-3">
          <Button
            size="touch"
            className="w-full"
            disabled={
              (currentDay.kind === "workout" && startSession.isPending) ||
              (currentDay.kind === "rest" &&
                (restToday.isPending || restToday.isError || restToday.data !== null))
            }
            onClick={() => {
              if (currentDay.kind === "rest") {
                setRestTarget({
                  routineDayId: currentDay.id,
                  dayName: currentDay.name,
                  routineName: detail.name,
                });
              } else {
                setStartError(null);
                startSession.mutate({ routineDayId: currentDay.id, notes: null });
              }
            }}
          >
            {currentDay.kind === "rest" && restToday.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : currentDay.kind === "rest" ? (
              <BedDouble data-icon="inline-start" />
            ) : (
              <Play data-icon="inline-start" />
            )}
            {currentDay.kind === "rest"
              ? restToday.data
                ? "Rest logged today"
                : restToday.isPending
                  ? "Checking today’s rest…"
                  : "Log rest day"
              : `Start ${currentDay.name}`}
          </Button>
        </div>
      ) : null}

      <ExercisePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(exercise) => {
          setPickerOpen(false);
          if (currentDayId) {
            addExercise.mutate({ routineDayId: currentDayId, exerciseId: exercise.id });
          }
        }}
      />

      <RoutineNameForm
        open={dialog?.kind === "rename-routine"}
        onOpenChange={(open) => !open && close()}
        title="Rename routine"
        initialValue={detail.name}
        saveLabel="Save name"
        pending={renameRoutine.isPending}
        onSave={(name) => renameRoutine.mutateAsync({ id: detail.id, name })}
      />

      <RoutineNameForm
        open={dialog?.kind === "add-workout-day"}
        onOpenChange={(open) => !open && close()}
        title="Add workout day"
        kind="day"
        label="Day name"
        placeholder="Push"
        saveLabel="Add day"
        pending={addDay.isPending}
        onSave={(name) => addDay.mutateAsync({ routineId: detail.id, name, kind: "workout" })}
      />

      <RoutineNameForm
        open={dialog?.kind === "add-rest-day"}
        onOpenChange={(open) => !open && close()}
        title="Add rest day"
        kind="day"
        label="Day name"
        initialValue="Rest day"
        saveLabel="Add rest day"
        pending={addDay.isPending}
        onSave={(name) => addDay.mutateAsync({ routineId: detail.id, name, kind: "rest" })}
      />

      <RoutineNameForm
        open={dialog?.kind === "rename-day"}
        onOpenChange={(open) => !open && close()}
        title="Rename day"
        kind="day"
        label="Day name"
        initialValue={dialog?.kind === "rename-day" ? dialog.name : ""}
        saveLabel="Save name"
        pending={renameDay.isPending}
        onSave={(name) => {
          if (dialog?.kind === "rename-day") {
            return renameDay.mutateAsync({ id: dialog.dayId, name });
          }
        }}
      />

      {dialog?.kind === "targets" ? (
        <TargetsForm
          key={dialog.planned.id}
          open
          onOpenChange={(open) => !open && close()}
          exerciseName={dialog.planned.name}
          initial={dialog.planned}
          pending={updateTargets.isPending}
          onSave={(targets) => updateTargets.mutateAsync({ id: dialog.planned.id, targets })}
        />
      ) : null}

      <AlertDialog open={dialog?.kind === "delete-day"} onOpenChange={(open) => !open && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {dialog?.kind === "delete-day" ? dialog.name : "this day"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Its exercises and targets go with it. Workouts already logged against it are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="touch">Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              size="touch"
              onClick={() => {
                if (dialog?.kind === "delete-day") deleteDay.mutate({ id: dialog.dayId });
              }}
            >
              Delete day
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={dialog?.kind === "delete-routine"}
        onOpenChange={(open) => !open && close()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {detail.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every day and target in it goes. Workouts you ran off it are kept, but they stop
              saying which day they came from. Archiving keeps that.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="touch">Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="secondary"
              size="touch"
              onClick={() => {
                archiveRoutine.mutate({ id: detail.id, isArchived: true });
                close();
              }}
            >
              Archive instead
            </AlertDialogAction>
            <AlertDialogAction
              variant="destructive"
              size="touch"
              onClick={() => deleteRoutine.mutate({ id: detail.id })}
            >
              Delete routine
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LogRestDialog
        target={restTarget}
        onOpenChange={(open) => !open && setRestTarget(null)}
        onLogged={refresh}
      />
    </div>
  );
}
