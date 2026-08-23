import { isDefinedError } from "@orpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";

import { useTimeZone } from "@/hooks/use-time-zone";
import { afterWrite, cacheKeys, refreshNow } from "@/lib/cache";
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
  routineDayId: string | null;
  dayName?: string;
  routineName?: string;
};

export function LogRestDialog({
  target,
  onOpenChange,
}: {
  target: RestLogTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const timeZone = useTimeZone();

  const logRest = useMutation(
    orpc.session.logRestDay.mutationOptions({
      onSuccess: () => {
        afterWrite.restLogged(queryClient);
        onOpenChange(false);
      },
      onError: (error) => {
        if (isDefinedError(error) && error.code === "SESSION_ALREADY_ACTIVE") {
          void navigate({
            to: "/train/$sessionId",
            params: { sessionId: error.data.sessionId },
          });
          return;
        }
        if (isDefinedError(error) && error.code === "REST_ALREADY_LOGGED") {
          // The screen was out of date, which is the whole reason this failed.
          void refreshNow(queryClient, [cacheKeys.restToday()]);
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
