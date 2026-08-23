import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import * as React from "react";

import { ThemeProvider } from "@/components/theme-provider";
import { buttonVariants } from "@/components/ui/button-variants";
import { setUnauthorizedHandler } from "@/lib/unauthorized";
import type { RouterContext } from "@/src/router";
import styles from "../styles.css?url";

/**
 * The toaster arrives after the first paint.
 *
 * It is mounted on every screen and raised by none of them yet, and it brought
 * a Base UI provider and six icons — 18 KB gzip — into the first script every
 * visitor downloads. Lazily, it costs nothing until the browser is idle, and
 * the first thing to actually raise a toast will still find it there.
 */
const Toaster = React.lazy(() =>
  import("@/components/ui/toast").then((module) => ({ default: module.Toaster })),
);

/**
 * False while the server renders and through hydration, true after.
 *
 * `useSyncExternalStore` rather than a state-setting effect because that is
 * exactly the question it answers, and because it never renders a mismatch:
 * the server snapshot and the hydration snapshot are the same value.
 */
const neverChanges = () => () => {};
function useHydrated(): boolean {
  return React.useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}

/**
 * The toaster, kept out of the server-rendered document entirely.
 *
 * A `Suspense` boundary in the streamed shell whose fallback is nothing is an
 * empty segment, and React says so on every render. Nothing here needs to be
 * server-rendered — it is an overlay for messages that can only be raised by an
 * interaction — so it waits until there is a browser to be in.
 */
function DeferredToaster() {
  if (!useHydrated()) return null;

  return (
    <React.Suspense fallback={null}>
      <Toaster />
    </React.Suspense>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { title: "Setwise" },
      { name: "description", content: "A workout log built around progressive overload." },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
    links: [
      { rel: "stylesheet", href: styles },
      { rel: "icon", href: "/favicon.ico" },
    ],
  }),
  component: RootDocument,
  notFoundComponent: NotFoundPage,
});

/**
 * One place that decides what an expired session means.
 *
 * Any procedure can come back UNAUTHORIZED, and before this each screen dealt
 * with that on its own — which mostly meant a signed-out user staring at a
 * retry button on a query that was never going to succeed. Registered once,
 * here, because this is the only component that outlives every route.
 */
function useUnauthorizedRedirect(queryClient: QueryClient) {
  const router = useRouter();

  React.useEffect(() => {
    setUnauthorizedHandler(() => {
      // In flight first: a query that resolves after the cache is cleared would
      // write another account's shape straight back into it.
      void queryClient.cancelQueries();
      queryClient.clear();
      void router.invalidate();
      void router.navigate({ to: "/sign-in", replace: true });
    });

    return () => setUnauthorizedHandler(null);
  }, [queryClient, router]);
}

function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-muted-foreground">
          The page you were looking for does not exist or may have moved.
        </p>
      </div>
      <Link to="/" className={buttonVariants({ size: "touch" })}>
        Return home
      </Link>
    </main>
  );
}

function RootDocument() {
  const { queryClient } = Route.useRouteContext();
  useUnauthorizedRedirect(queryClient);

  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-full">
        <QueryClientProvider client={queryClient}>
          <ThemeProvider defaultTheme="system" storageKey="theme">
            <div className="app-root">
              <Outlet />
            </div>
            <DeferredToaster />
          </ThemeProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
