import { RPCHandler } from "@orpc/server/fetch";
import { BatchHandlerPlugin } from "@orpc/server/plugins";
import { createFileRoute } from "@tanstack/react-router";

import { reportColdStart } from "@/server/metrics";
import { createSessionResolver } from "@/server/orpc";
import { router } from "@/server/router";
import { createTimings, runWithTimings, serverTimingHeader } from "@/server/timing";

/**
 * The batch plugin unpacks `/api/rpc/__batch__` into the individual operations
 * and runs them against this same handler, so every procedure is reachable
 * exactly one way whether or not the client batched it.
 *
 * Ten is the ceiling because the widest screen in the app asks for five reads.
 * A larger batch would only ever be a mistake arriving in one request.
 */
const handler = new RPCHandler(router, {
  plugins: [new BatchHandlerPlugin({ maxSize: 10 })],
});

async function handle(request: Request) {
  reportColdStart();

  const timings = createTimings();

  const { response } = await runWithTimings(timings, () =>
    handler.handle(request, {
      prefix: "/api/rpc",
      context: {
        headers: request.headers,
        // One resolver per request. Every procedure in a batch shares it, so a
        // five-query screen resolves the session once.
        getSession: createSessionResolver(request.headers),
      },
    }),
  );

  if (!response) return new Response("Not found", { status: 404 });

  // Measured at the point the response is handed back, not when its body has
  // finished streaming: a batched response streams its items as they resolve,
  // and waiting to report would mean not reporting until the slowest one lands.
  response.headers.append("Server-Timing", serverTimingHeader(timings));

  return response;
}

export const Route = createFileRoute("/api/rpc/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
      PUT: ({ request }) => handle(request),
      PATCH: ({ request }) => handle(request),
      DELETE: ({ request }) => handle(request),
    },
  },
});
