import { createFileRoute } from "@tanstack/react-router";

import { TrainHome } from "@/components/logger/train-home";

export const Route = createFileRoute("/_authenticated/train/")({
  head: () => ({ meta: [{ title: "Train · Setwise" }] }),
  component: TrainHome,
});
