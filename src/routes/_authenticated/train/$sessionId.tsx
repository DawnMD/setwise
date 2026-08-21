import { createFileRoute } from "@tanstack/react-router";

import { ActiveSession } from "@/components/logger/active-session";

export const Route = createFileRoute("/_authenticated/train/$sessionId")({
  head: () => ({ meta: [{ title: "Workout · Setwise" }] }),
  component: SessionPage,
});

function SessionPage() {
  const { sessionId } = Route.useParams();
  return <ActiveSession sessionId={sessionId} />;
}
