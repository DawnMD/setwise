import { isDefinedError } from "@orpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";

import { afterWrite } from "@/lib/cache";
import { newId } from "@/lib/ids";
import { orpc } from "@/lib/orpc";
import { queries } from "@/lib/queries";

/**
 * Opening a workout, from either of the two screens that offer it.
 *
 * Home and Train both put a Start button in front of the same rotation, and the
 * interesting part of this is not the mutation — it is the typed
 * `SESSION_ALREADY_ACTIVE` branch, which sends you to the workout you already
 * have instead of reporting a failure for something that is not one. Two copies
 * of that would eventually become one copy of it.
 */
export function useStartWorkout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);

  const start = useMutation(
    orpc.session.start.mutationOptions({
      onSuccess: (session) => {
        queryClient.setQueryData(queries.activeSession().queryKey, session);
        afterWrite.sessionLifecycle(queryClient);
        // Started before the navigation rather than by the route it lands on,
        // so the fetch and the transition overlap instead of queueing. The
        // route's own loader finds it already in flight and waits on the same
        // promise.
        void queryClient.prefetchQuery(queries.sessionDetail(session.id));
        void navigate({ to: "/train/$sessionId", params: { sessionId: session.id } });
      },
      onError: (mutationError) => {
        // A typed error, matched rather than string-parsed: if a workout is
        // already open, the only sensible thing is to go to it.
        if (isDefinedError(mutationError) && mutationError.code === "SESSION_ALREADY_ACTIVE") {
          void navigate({
            to: "/train/$sessionId",
            params: { sessionId: mutationError.data.sessionId },
          });
          return;
        }
        setError("Couldn't start a workout. Check your connection and try again.");
      },
    }),
  );

  return {
    isPending: start.isPending,
    error,
    clearError: () => setError(null),
    /** Named by the client, so a retried start cannot open a second workout. */
    startWorkout: (routineDayId: string | null) => {
      setError(null);
      start.mutate({ id: newId(), routineDayId, notes: null });
    },
  };
}
