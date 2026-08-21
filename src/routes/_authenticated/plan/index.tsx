import { createFileRoute } from "@tanstack/react-router";

import { PlanHome } from "@/components/plan/plan-home";

export const Route = createFileRoute("/_authenticated/plan/")({
  head: () => ({ meta: [{ title: "Plan · Setwise" }] }),
  component: PlanHome,
});
