import { createFileRoute } from "@tanstack/react-router";

import { OnboardingWizard } from "@/components/profile/onboarding-wizard";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Set up · Setwise" }] }),
  component: OnboardingWizard,
});
