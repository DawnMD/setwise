import { createFileRoute } from "@tanstack/react-router";

import { ProgressHome } from "@/components/progress/progress-home";

export const Route = createFileRoute("/_authenticated/progress")({
  head: () => ({ meta: [{ title: "Progress · Setwise" }] }),
  component: ProgressHome,
});
