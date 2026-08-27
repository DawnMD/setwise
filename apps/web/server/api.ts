import "@tanstack/react-start/server-only";

import { createApiRouter, memoizeSessionResolver } from "@setwise/api-server";

import { db } from "@/db";
import { auth } from "@/lib/auth";
import { recordProcedureLatency } from "./metrics";
import { addTiming, measure } from "./timing";

export const router = createApiRouter({
  db,
  recordTiming(procedure, durationMs) {
    addTiming("handler", durationMs);
    recordProcedureLatency(procedure, durationMs);
  },
});

export function createPrincipalResolver(headers: Headers) {
  return memoizeSessionResolver(async () => {
    const session = await measure("session", () => auth.api.getSession({ headers }));
    return session ? { userId: session.user.id } : null;
  });
}
