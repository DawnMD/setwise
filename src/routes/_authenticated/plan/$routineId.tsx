import { createFileRoute } from "@tanstack/react-router";

import { RoutineEditor } from "@/components/plan/routine-editor";

export const Route = createFileRoute("/_authenticated/plan/$routineId")({
  head: () => ({ meta: [{ title: "Routine · Setwise" }] }),
  component: RoutinePage,
});

function RoutinePage() {
  const { routineId } = Route.useParams();
  return <RoutineEditor routineId={routineId} />;
}
