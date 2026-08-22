import { createFileRoute } from "@tanstack/react-router";

import { PlanHome } from "@/components/plan/plan-home";
import { prefetch } from "@/lib/prefetch";

export const Route = createFileRoute("/_authenticated/plan/")({
  head: () => ({ meta: [{ title: "Plan · Setwise" }] }),
  loader: ({ context: { queryClient } }) =>
    prefetch(({ queries, warm }) => {
      warm(queryClient, queries.routineList());
    }),
  component: PlanHome,
});
