import { ORPCError, os } from "@orpc/server";

import { db } from "@/db";
import { auth } from "@/lib/auth";

export type ORPCContext = {
  headers: Headers;
};

/**
 * Base builder. Every procedure gets the database and the request headers;
 * authentication is opt-in via `protectedProcedure` so an unauthenticated
 * endpoint has to be written deliberately rather than by forgetting a check.
 */
export const base = os.$context<ORPCContext>();

export const publicProcedure = base.use(async ({ next }) => {
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
  const session = await auth.api.getSession({ headers: context.headers });

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
