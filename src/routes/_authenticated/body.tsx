import { createFileRoute } from "@tanstack/react-router";

import { BodyHome } from "@/components/body/body-home";

export const Route = createFileRoute("/_authenticated/body")({
  head: () => ({ meta: [{ title: "Body · Setwise" }] }),
  component: BodyHome,
});
