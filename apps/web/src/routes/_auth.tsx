import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth")({ component: AuthLayout });

function AuthLayout() {
  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-5 py-10">
      <Outlet />
    </main>
  );
}
