import { createFileRoute } from "@tanstack/react-router";

import { AuthForm } from "@/components/auth-form";

export const Route = createFileRoute("/_auth/sign-up")({
  head: () => ({ meta: [{ title: "Create an account · Setwise" }] }),
  component: () => <AuthForm mode="sign-up" />,
});
