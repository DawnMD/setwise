import { createFileRoute } from "@tanstack/react-router";

import { ActiveSession } from "@/components/logger/active-session";
import { prefetch } from "@/lib/prefetch";

export const Route = createFileRoute("/_authenticated/train/$sessionId")({
  head: () => ({ meta: [{ title: "Workout · Setwise" }] }),
  /**
   * Awaited, and only when the cache is empty.
   *
   * The workout is the whole screen, so committing early would show a skeleton
   * where a header will be. A session started from Train seeds this cache
   * before navigating, so the common path does not wait at all.
   */
  loader: ({ context: { queryClient }, params }) =>
    prefetch(({ ensureCritical, queries }) =>
      ensureCritical(queryClient, queries.sessionDetail(params.sessionId)),
    ),
  component: SessionPage,
});

function SessionPage() {
  const { sessionId } = Route.useParams();
  return <ActiveSession sessionId={sessionId} />;
}
