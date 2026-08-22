import { createFileRoute } from "@tanstack/react-router";

import { OnboardingWizard } from "@/components/profile/onboarding-wizard";
import { prefetch } from "@/lib/prefetch";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Set up · Setwise" }] }),
  loader: ({ context: { queryClient } }) =>
    prefetch(({ queries, resolveTimeZone, warm }) => {
      warm(queryClient, queries.profile(resolveTimeZone()));
    }),
  component: OnboardingWizard,
});
