import { createFileRoute, redirect } from "@tanstack/react-router";

import { getCurrentSession } from "@/src/server/session.functions";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await getCurrentSession();
    throw redirect({ to: session ? "/train" : "/sign-in" });
  },
});
