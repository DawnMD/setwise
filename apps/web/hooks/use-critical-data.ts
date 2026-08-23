import * as React from "react";

import { endSpan } from "@/lib/perf";

/**
 * Closes the route's data span once the screen has what it needs.
 *
 * The router opens the span when a navigation commits; only the screen knows
 * which of its queries it cannot be read without. An error counts as ready:
 * the screen is showing its final state either way, and dropping the failures
 * would make the percentile a report on the successful half of a bad network.
 */
export function useCriticalData(ready: boolean): void {
  React.useEffect(() => {
    if (ready) endSpan("route-data");
  }, [ready]);
}
