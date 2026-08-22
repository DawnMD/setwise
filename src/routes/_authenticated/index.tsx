import { createFileRoute } from "@tanstack/react-router";

import { HomeScreen } from "@/components/home/home-screen";
import { prefetch } from "@/lib/prefetch";

/**
 * `/` is the Home screen, and it sits inside the authenticated boundary rather
 * than in front of it. The redirect that used to live here duplicated the guard
 * one level down; a signed-out visit still lands on `/sign-in`, from the same
 * server-side check every other private route uses.
 *
 * Two reads, neither awaited. The summary is Home's own; the profile is the
 * shared one Body and the prompt already use, so the targets on this screen are
 * the same cached answer rather than a second copy the profile's writes could
 * not patch. Both leave in one batched request.
 */
export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Setwise" }] }),
  loader: ({ context: { queryClient } }) =>
    prefetch(({ queries, resolveTimeZone, warm }) => {
      const timeZone = resolveTimeZone();
      warm(queryClient, queries.homeSummary(timeZone));
      warm(queryClient, queries.profile(timeZone));
      warm(queryClient, queries.habitHome(timeZone));
    }),
  component: HomeScreen,
});
