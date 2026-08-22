import { createFileRoute } from "@tanstack/react-router";

import { RoutineEditor } from "@/components/plan/routine-editor";
import { prefetch } from "@/lib/prefetch";

export const Route = createFileRoute("/_authenticated/plan/$routineId")({
  head: () => ({ meta: [{ title: "Routine · Setwise" }] }),
  loader: ({ context: { queryClient }, params }) =>
    prefetch(async ({ ensureCritical, queries, resolveTimeZone, warm }) => {
      // Today's rest decides whether the bottom button is enabled, but the
      // screen is legible without it, so it does not hold the commit back.
      warm(queryClient, queries.restToday(resolveTimeZone()));
      await ensureCritical(queryClient, queries.routineDetail(params.routineId));
    }),
  component: RoutinePage,
});

function RoutinePage() {
  const { routineId } = Route.useParams();
  return <RoutineEditor routineId={routineId} />;
}
