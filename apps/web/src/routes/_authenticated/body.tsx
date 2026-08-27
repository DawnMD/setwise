import { createFileRoute } from "@tanstack/react-router";

import { BodyHome } from "@/components/body/body-home";
import { prefetch } from "@/lib/prefetch";
import { BODY_DEFAULT_WINDOW } from "@setwise/domain/windows";

export const Route = createFileRoute("/_authenticated/body")({
  head: () => ({ meta: [{ title: "Body · Setwise" }] }),
  loader: ({ context: { queryClient } }) =>
    prefetch(({ queries, resolveTimeZone, warm }) => {
      const timeZone = resolveTimeZone();
      warm(queryClient, queries.profile(timeZone));
      warm(queryClient, queries.bodyweightSeries(BODY_DEFAULT_WINDOW, timeZone));
    }),
  component: BodyHome,
});
