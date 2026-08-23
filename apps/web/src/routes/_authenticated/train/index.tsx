import { createFileRoute } from "@tanstack/react-router";

import { TrainHome } from "@/components/logger/train-home";
import { prefetch } from "@/lib/prefetch";

/**
 * Four reads, started before the screen mounts and batched into one request.
 *
 * None of them is awaited: Train renders its own skeletons and the decision the
 * screen exists for — start, or carry on — is the first thing to arrive.
 *
 * The profile went with the prompt in phase 6. Nothing on this screen is a
 * function of it any more, and warming a read the screen never makes is a
 * request spent on the way to the gym.
 */
export const Route = createFileRoute("/_authenticated/train/")({
  head: () => ({ meta: [{ title: "Train · Setwise" }] }),
  loader: ({ context: { queryClient } }) =>
    prefetch(({ queries, resolveTimeZone, warm }) => {
      const timeZone = resolveTimeZone();
      warm(queryClient, queries.activeSession());
      warm(queryClient, queries.recentActivity());
      warm(queryClient, queries.upcomingDays());
      warm(queryClient, queries.restToday(timeZone));
    }),
  component: TrainHome,
});
