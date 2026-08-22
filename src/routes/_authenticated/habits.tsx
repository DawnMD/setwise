import { createFileRoute } from "@tanstack/react-router";

import { HabitsScreen } from "@/components/habits/habits-screen";
import { prefetch } from "@/lib/prefetch";

function currentMonth(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

export const Route = createFileRoute("/_authenticated/habits")({
  head: () => ({ meta: [{ title: "Habits · Setwise" }] }),
  loader: ({ context: { queryClient } }) =>
    prefetch(({ queries, resolveTimeZone, warm }) => {
      const timeZone = resolveTimeZone();
      warm(queryClient, queries.habitList(timeZone));
      warm(queryClient, queries.habitCalendar(currentMonth(), timeZone));
    }),
  component: HabitsScreen,
});
