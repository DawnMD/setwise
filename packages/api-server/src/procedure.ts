import { implement, ORPCError } from "@orpc/server";

import { appContract } from "@setwise/api-contract";
import type { Database } from "@setwise/db";

export type ApiPrincipal = {
  userId: string;
};

export type SessionResolver = () => Promise<ApiPrincipal | null>;

export type ApiRequestContext = {
  headers: Headers;
  getPrincipal: SessionResolver;
};

export type ApiDependencies = {
  db: Database;
  recordTiming?: (procedure: string, durationMs: number) => void;
};

/** Shares both an in-flight lookup and its result within one request. */
export function memoizeSessionResolver(resolver: SessionResolver): SessionResolver {
  let pending: Promise<ApiPrincipal | null> | undefined;
  return () => (pending ??= resolver());
}

export function createProcedureImplementers(dependencies: ApiDependencies) {
  const api = implement(appContract).$context<ApiRequestContext>();

  const timed = api.middleware(async ({ next, path }) => {
    const started = performance.now();
    try {
      return await next();
    } finally {
      dependencies.recordTiming?.(path.join("."), performance.now() - started);
    }
  });

  const publicApi = api.use(timed).use(async ({ next }) => {
    return next({ context: { db: dependencies.db } });
  });

  const protectedApi = publicApi.use(async ({ context, next }) => {
    const principal = await context.getPrincipal();
    if (!principal) {
      throw new ORPCError("UNAUTHORIZED", { message: "Sign in to continue." });
    }

    return next({
      context: {
        principal,
        userId: principal.userId,
      },
    });
  });

  return { publicApi, protectedApi };
}

export type ProcedureImplementers = ReturnType<typeof createProcedureImplementers>;
