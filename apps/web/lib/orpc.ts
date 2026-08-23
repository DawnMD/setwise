import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { BatchLinkPlugin } from "@orpc/client/plugins";
import {
  createTanstackQueryUtils,
  OPERATION_CONTEXT_SYMBOL,
  type OperationContext,
} from "@orpc/tanstack-query";
import type { RouterClient } from "@orpc/server";

import type { AppRouter } from "@/server/router";
import { BATCH_RPC } from "./flags";
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
function isRead(context: OperationContext | undefined): boolean {
  const operation = context?.[OPERATION_CONTEXT_SYMBOL];
  return operation !== undefined && operation.type !== "mutation";
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ORPCError && error.code === "UNAUTHORIZED";
}

const link = new RPCLink<OperationContext>({
  url: () => {
    if (typeof window === "undefined") {
      throw new Error("This client is browser-only. Call the router directly on the server.");
    }
    return `${window.location.origin}/api/rpc`;
  },
  interceptors: [
    async (options) => {
      try {
        return await options.next();
      } catch (error) {
        if (isUnauthorized(error)) reportUnauthorized();
        throw error;
      }
    },
  ],
  plugins: BATCH_RPC
    ? [
        new BatchLinkPlugin({
          groups: [{ condition: ({ context }) => isRead(context), context: {} }],
          // One batch path rather than the plugin's default of appending
          // `/__batch__` to whichever procedure happened to be first in the
          // batch. A stable path is something a log, a cache rule or a network
          // panel can be read against.
          url: () => `${window.location.origin}/api/rpc/__batch__`,
          maxSize: 10,
          // Streaming, so the first read to resolve renders while the slowest
          // one is still running. Buffered would hold the whole screen behind
          // whichever query happened to be worst.
          mode: "streaming",
        }),
      ]
    : [],
});

export const client: RouterClient<AppRouter> = createORPCClient(link);

/**
 * `orpc.stats.muscleVolume.queryOptions({ input })` is the whole wiring between
 * a procedure and TanStack Query. No generated hooks, no key strings to keep in
 * sync.
 */
export const orpc = createTanstackQueryUtils(client);
