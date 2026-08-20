"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // A phone in a gym drops connection constantly. Refetching on every
            // window focus would mean a burst of requests every time the screen
            // wakes, so focus refetching stays off and staleness is set per
            // query instead.
            refetchOnWindowFocus: false,
            staleTime: 30_000,
            retry: 2,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/*
        The theme is a class on <html>, which is what the shadcn tokens key off.
        System preference is the default because gym lighting is unpredictable,
        with a manual override in Settings for when it guesses wrong.
      */}
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
