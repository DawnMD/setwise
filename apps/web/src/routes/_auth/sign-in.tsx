import { createFileRoute } from "@tanstack/react-router";

import { AuthForm } from "@/components/auth-form";

export const Route = createFileRoute("/_auth/sign-in")({
  head: () => ({ meta: [{ title: "Sign in · Setwise" }] }),
  component: () => <AuthForm mode="sign-in" />,
});
