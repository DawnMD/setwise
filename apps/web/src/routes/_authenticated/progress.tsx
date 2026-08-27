import { createFileRoute } from "@tanstack/react-router";

import { ProgressHome } from "@/components/progress/progress-home";
import { prefetch } from "@/lib/prefetch";
import { PROGRESS_DEFAULT_WINDOW } from "@setwise/domain/windows";

export const Route = createFileRoute("/_authenticated/progress")({
  head: () => ({ meta: [{ title: "Progress · Setwise" }] }),
  loader: ({ context: { queryClient } }) =>
    prefetch(({ queries, warm }) => {
      // The window the screen opens on. A different one is a deliberate tap,
      // and guessing at it here would warm two windows to use one.
      warm(queryClient, queries.muscleVolume(PROGRESS_DEFAULT_WINDOW));
      warm(queryClient, queries.intensity(PROGRESS_DEFAULT_WINDOW));
      warm(queryClient, queries.trainedExercises(PROGRESS_DEFAULT_WINDOW));
    }),
  component: ProgressHome,
});
