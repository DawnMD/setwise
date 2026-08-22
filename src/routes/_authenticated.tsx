import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { BottomNav } from "@/components/bottom-nav";
import { Spinner } from "@/components/ui/spinner";
import { authSessionQuery } from "@/lib/session-query";

export const Route = createFileRoute("/_authenticated")({
  ssr: "data-only",
  beforeLoad: async ({ context }) => {
    // Resolved through the query cache, so navigating between tabs inside the
    // freshness window costs nothing. See `authSessionQuery` for the window.
    const session = await context.queryClient.ensureQueryData(authSessionQuery);
    if (!session) throw redirect({ to: "/sign-in" });
    return { session };
  },
  pendingComponent: AuthenticatedPending,
  component: AuthenticatedLayout,
});

function AuthenticatedPending() {
  return (
    <main className="flex flex-1 items-center justify-center" aria-label="Loading">
      <Spinner />
    </main>
  );
}

function AuthenticatedLayout() {
  return (
    <>
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
      <BottomNav />
    </>
  );
}
