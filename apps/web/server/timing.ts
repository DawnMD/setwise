import { AsyncLocalStorage } from "node:async_hooks";

import "@tanstack/react-start/server-only";

/**
 * Per-request server timing.
 *
 * The four numbers are the four places a slow RPC can actually be slow:
 * resolving the session, running the handler, waiting on Postgres, and turning
 * the result into bytes. Without the split, a 400 ms response is one number and
 * every fix for it is a guess.
 *
 * Held in an `AsyncLocalStorage` rather than threaded through every function,
 * because the database time has to be collected inside the driver — several
 * layers below anything that knows what a request is.
 */
export type RequestTimings = {
  startedAt: number;
  /** Time inside `auth.api.getSession`, summed across a batch. */
  session: number;
  sessionCalls: number;
  /**
   * Time waiting on Postgres, summed across queries.
   *
   * Overlaps `handler`, and can exceed the request's own wall time when queries
   * run concurrently — which is the point of a pool bigger than one, and is why
   * this is reported next to the total rather than as a share of it.
   */
  db: number;
  dbCalls: number;
  /** Time from procedure entry to procedure exit. Includes `session` and `db`. */
  handler: number;
  handlerCalls: number;
};

const store = new AsyncLocalStorage<RequestTimings>();

const now = () => performance.now();

export function createTimings(): RequestTimings {
  return {
    startedAt: now(),
    session: 0,
    sessionCalls: 0,
    db: 0,
    dbCalls: 0,
    handler: 0,
    handlerCalls: 0,
  };
}

export function runWithTimings<T>(timings: RequestTimings, fn: () => T): T {
  return store.run(timings, fn);
}

export function currentTimings(): RequestTimings | undefined {
  return store.getStore();
}

type Bucket = "session" | "db" | "handler";

export function addTiming(bucket: Bucket, ms: number): void {
  const timings = store.getStore();
  if (!timings) return;
  timings[bucket] += ms;
  timings[`${bucket}Calls`] += 1;
}

/** Times one awaited step into a bucket, including the failing case. */
export async function measure<T>(bucket: Bucket, fn: () => Promise<T>): Promise<T> {
  const started = now();
  try {
    return await fn();
  } finally {
    addTiming(bucket, now() - started);
  }
}

/**
 * `Server-Timing`, as the browser's own network panel reads it.
 *
 * Serialization is what is left after the handlers are accounted for: encoding
 * and framing are not something the app calls, so they can only be measured by
 * subtraction. It goes slightly high on a batch, since it also carries the
 * handler's own dispatch overhead, and that is the right direction for a number
 * whose job is to say "look here next".
 */
export function serverTimingHeader(timings: RequestTimings): string {
  const total = now() - timings.startedAt;
  const serialize = Math.max(0, total - timings.handler);
  const round = (value: number) => Math.round(value * 10) / 10;

  return [
    `session;dur=${round(timings.session)};desc="${timings.sessionCalls} resolved"`,
    `handler;dur=${round(timings.handler)};desc="${timings.handlerCalls} ops"`,
    `db;dur=${round(timings.db)};desc="${timings.dbCalls} queries"`,
    `serialize;dur=${round(serialize)}`,
    `total;dur=${round(total)}`,
  ].join(", ");
}
