import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { RouterClient } from "@orpc/server";

import type { AppRouter } from "@/server/router";

const link = new RPCLink({
  url: () => {
    if (typeof window === "undefined") {
      throw new Error("This client is browser-only. Call the router directly on the server.");
    }
    return `${window.location.origin}/api/rpc`;
  },
});

export const client: RouterClient<AppRouter> = createORPCClient(link);

/**
 * `orpc.stats.muscleVolume.queryOptions({ input })` is the whole wiring between
 * a procedure and TanStack Query. No generated hooks, no key strings to keep in
 * sync.
 */
export const orpc = createTanstackQueryUtils(client);
