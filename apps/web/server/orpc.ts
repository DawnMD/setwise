import { ORPCError, os } from "@orpc/server";

import { db } from "@/db";
import { auth, type Session } from "@/lib/auth";
import { recordProcedureLatency } from "./metrics";
import { addTiming, measure } from "./timing";
import "@tanstack/react-start/server-only";

/** Resolves the request's session at most once, however many times it is asked. */
export type SessionResolver = () => Promise<Session | null>;

export type ORPCContext = {
  headers: Headers;
  getSession: SessionResolver;
};

/**
 * One session resolution per request, shared by every procedure in it.
 *
 * A batched read carries up to ten operations, and each of them used to resolve
 * the session for itself. The promise is memoised rather than the value so the
 * ten concurrent procedures in a batch all await the same in-flight resolution
 * instead of starting ten of them and then agreeing on the answer.
 *
 * Created per request. A module-level cache here would leak one user's session
 * into the next request the same warm instance served, which is the worst bug
 * this file could have.
 */
export function createSessionResolver(headers: Headers): SessionResolver {
  let pending: Promise<Session | null> | undefined;
  return () => (pending ??= measure("session", () => auth.api.getSession({ headers })));
}

/**
 * Base builder. Every procedure gets the database and the request headers;
 * authentication is opt-in via `protectedProcedure` so an unauthenticated
 * endpoint has to be written deliberately rather than by forgetting a check.
 */
export const base = os.$context<ORPCContext>();

/**
 * Times every call, against the request and against the procedure.
 *
 * In a `finally`, because a slow failure is still slow and a p95 that quietly
 * drops every error is a p95 that reads better than the app does.
 */
const timedProcedure = base.use(async ({ next, path }) => {
  const started = performance.now();
  try {
    return await next();
  } finally {
    const ms = performance.now() - started;
    addTiming("handler", ms);
    recordProcedureLatency(path.join("."), ms);
  }
});

export const publicProcedure = timedProcedure.use(async ({ next }) => {
  return next({ context: { db } });
});

/**
 * Resolves the session and refuses without one.
 *
 * `userId` is put on the context rather than left for each handler to dig out
 * of the session, so a query can never accidentally read another user's rows by
 * forgetting to narrow.
 */
export const protectedProcedure = publicProcedure.use(async ({ context, next }) => {
  const session = await context.getSession();

  if (!session) {
    throw new ORPCError("UNAUTHORIZED", { message: "Sign in to continue." });
  }

  return next({
    context: {
      session,
      userId: session.user.id,
    },
  });
});
