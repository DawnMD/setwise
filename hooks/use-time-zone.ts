import * as React from "react";

/**
 * The reader's IANA zone, resolved once per component and then held.
 *
 * Held rather than read on every render because it is a query input: a fresh
 * string on each pass would be a fresh cache key, and TanStack Query would
 * refetch the bodyweight chart for no reason. The fallback matters on the
 * server pass, where `Intl` answers UTC anyway.
 */
export function useTimeZone(): string {
  const [timeZone] = React.useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  return timeZone;
}
