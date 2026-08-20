import { RPCHandler } from "@orpc/server/fetch";

import { router } from "@/server/router";

const handler = new RPCHandler(router);

async function handle(request: Request) {
  const { response } = await handler.handle(request, {
    prefix: "/api/rpc",
    context: { headers: request.headers },
  });

  return response ?? new Response("Not found", { status: 404 });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
