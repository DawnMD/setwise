import { createSetwiseApiClient } from "@setwise/api-client";
import { reportUnauthorized } from "./unauthorized";

/**
 * Reads batch, writes do not.
 *
 * Batching is a latency trade: several requests wait for each other so they can
 * share one round trip. That is unambiguously right for the four or five reads
 * a screen fires on mount, and wrong for a set save, which is one request that
 * should leave immediately and has a person watching it.
 *
 * The operation type comes from the TanStack Query integration, which tags
 * every call it makes. A call with no tag is something else entirely and is
 * left alone.
 */
const baseUrl = typeof window === "undefined" ? "http://setwise.invalid" : window.location.origin;

export const { client, orpc } = createSetwiseApiClient({
  baseUrl,
  credentials: "include",
  client: "web",
  getHeaders: () => ({}),
  onUnauthorized: reportUnauthorized,
});

/**
 * `orpc.stats.muscleVolume.queryOptions({ input })` is the whole wiring between
 * a procedure and TanStack Query. No generated hooks, no key strings to keep in
 * sync.
 */
export { isTransportError, isUnauthorized } from "@setwise/api-client";
