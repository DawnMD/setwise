import { createFileRoute } from "@tanstack/react-router";

import { TrainHome } from "@/components/logger/train-home";
import { prefetch } from "@/lib/prefetch";

/**
 * Five reads, started before the screen mounts and batched into one request.
 *
 * None of them is awaited: Train renders its own skeletons and the decision the
 * screen exists for — start, or carry on — is the first thing to arrive.
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
      warm(queryClient, queries.profile(timeZone));
    }),
  component: TrainHome,
});
