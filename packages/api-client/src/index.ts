import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { BatchLinkPlugin } from "@orpc/client/plugins";
import {
  createTanstackQueryUtils,
  OPERATION_CONTEXT_SYMBOL,
  type OperationContext,
} from "@orpc/tanstack-query";

import type { ContractRouterClient } from "@setwise/api-contract";

export type ApiClientOptions = {
  baseUrl: string;
  getHeaders: () => HeadersInit | Promise<HeadersInit>;
  credentials: RequestCredentials;
  client: "web" | "mobile";
  version?: string;
  onUnauthorized: () => void;
};

function isRead(context: OperationContext | undefined): boolean {
  const operation = context?.[OPERATION_CONTEXT_SYMBOL];
  return operation !== undefined && operation.type !== "mutation";
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ORPCError && error.code === "UNAUTHORIZED";
}

const TRANSPORT_CODES = new Set([
  "TIMEOUT",
  "CLIENT_CLOSED_REQUEST",
  "BAD_GATEWAY",
  "SERVICE_UNAVAILABLE",
  "GATEWAY_TIMEOUT",
]);

/** Distinguishes connectivity failures from named domain and authorization errors. */
export function isTransportError(error: unknown): boolean {
  if (error instanceof ORPCError) return TRANSPORT_CODES.has(error.code);
  if (!(error instanceof Error)) return false;
  return ["AbortError", "NetworkError", "TimeoutError", "TypeError"].includes(error.name);
}

function rpcUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/api/rpc") ? normalized : `${normalized}/api/rpc`;
}

export function createSetwiseApiClient(options: ApiClientOptions) {
  const url = rpcUrl(options.baseUrl);
  const headers = async () => {
    const result = new Headers(await options.getHeaders());
    result.set("X-Setwise-Client", options.client);
    if (options.version) result.set("X-Setwise-Version", options.version);
    return result;
  };

  const link = new RPCLink<OperationContext>({
    url,
    headers,
    fetch: (request, init) => fetch(request, { ...init, credentials: options.credentials }),
    interceptors: [
      async (interceptor) => {
        try {
          return await interceptor.next();
        } catch (error) {
          if (isUnauthorized(error)) options.onUnauthorized();
          throw error;
        }
      },
    ],
    plugins: [
      new BatchLinkPlugin({
        groups: [{ condition: ({ context }) => isRead(context), context: {} }],
        url: `${url}/__batch__`,
        maxSize: 10,
        mode: "streaming",
      }),
    ],
  });

  const client: ContractRouterClient = createORPCClient(link);
  return {
    client,
    orpc: createTanstackQueryUtils(client),
  };
}

export { STALE } from "./stale";
export type { ContractRouterClient } from "@setwise/api-contract";
