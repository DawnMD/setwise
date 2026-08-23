import { useNow } from "@/hooks/use-now";
import { formatElapsed } from "@/lib/format";

/**
 * How long a workout has been running.
 *
 * Ticks once a minute. A session timer counting seconds is a stopwatch, and a
 * stopwatch is a thing to race, which is not what anyone should be doing with
 * their rest periods.
 */
export function Elapsed({ since }: { since: Date | string }) {
  const now = useNow(30_000);
  const started = new Date(since).getTime();
  // Null on the server and on the very first client paint, where there is no
  // clock to read without risking a hydration mismatch.
  return <>{now === null ? "—" : formatElapsed(now - started)}</>;
}
