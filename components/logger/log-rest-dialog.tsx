"use client";

import { isDefinedError } from "@orpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import * as React from "react";

import { orpc } from "@/lib/orpc";
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
import { Spinner } from "@/components/ui/spinner";

export type RestLogTarget = {
  id: string;
  routineDayId: string | null;
  dayName?: string;
  routineName?: string;
};

export function LogRestDialog({
  target,
  onOpenChange,
  onLogged,
}: {
  target: RestLogTarget | null;
  onOpenChange: (open: boolean) => void;
  onLogged?: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [timeZone] = React.useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );

  const logRest = useMutation(
    orpc.session.logRestDay.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: orpc.plan.upcoming.key() });
        void queryClient.invalidateQueries({ queryKey: orpc.session.recent.key() });
        void queryClient.invalidateQueries({ queryKey: orpc.session.restToday.key() });
        void queryClient.invalidateQueries({ queryKey: orpc.plan.list.key() });
        onLogged?.();
        onOpenChange(false);
      },
      onError: (error) => {
        if (isDefinedError(error) && error.code === "SESSION_ALREADY_ACTIVE") {
          router.push(`/train/${error.data.sessionId}`);
          return;
        }
        if (isDefinedError(error) && error.code === "REST_ALREADY_LOGGED") {
          void queryClient.invalidateQueries({ queryKey: orpc.session.restToday.key() });
        }
      },
    }),
  );

  const planned = target !== null && target.routineDayId !== null;

  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !logRest.isPending) {
          logRest.reset();
          onOpenChange(false);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {planned && target?.dayName ? `Log ${target.dayName} as rest?` : "Log a rest day?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {planned && target?.routineName ? `${target.routineName}. ` : ""}
            This records rest at the current time. Completed rest entries are read-only.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {logRest.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t log the rest day</AlertTitle>
            <AlertDescription>
              {isDefinedError(logRest.error) && logRest.error.code === "REST_ALREADY_LOGGED"
                ? "Rest has already been logged today."
                : "Check your connection and try again."}
            </AlertDescription>
          </Alert>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel size="touch" disabled={logRest.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            size="touch"
            disabled={!target || logRest.isPending}
            onClick={() => {
              if (target) {
                logRest.mutate({
                  id: target.id,
                  routineDayId: target.routineDayId,
                  timeZone,
                });
              }
            }}
          >
            {logRest.isPending ? <Spinner data-icon="inline-start" /> : null}
            {logRest.isPending ? "Logging…" : "Log rest"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
