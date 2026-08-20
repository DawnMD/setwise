"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
