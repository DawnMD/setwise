import "@tanstack/react-start/server-only";

import { recordProcedureLatency } from "@/server/metrics";
import { addTiming } from "@/server/timing";

/**
 * Database timing, collected in the driver rather than at the call sites.
 *
 * Every query in the app goes through Drizzle, and Drizzle goes through the
 * pool's `query`. Wrapping it once is the only way to get a truthful "how much
 * of this request was Postgres" without a timer around several hundred call
 * sites, and the only way to see the time a transaction spends holding a
 * connection it acquired from the pool.
 */

type QueryFn = (...args: unknown[]) => unknown;

type ClientLike = { query: QueryFn };

type PoolLike = {
  query: QueryFn;
  connect: (...args: unknown[]) => Promise<ClientLike>;
  totalCount?: number;
  idleCount?: number;
  waitingCount?: number;
};

const now = () => performance.now();

/**
 * Wraps a promise-returning call and books its duration against the request.
 *
 * A query that throws still cost the time it took, so the timing is taken in a
 * `finally`: a slow failure is a performance problem too.
 */
function timedQuery(fn: QueryFn, args: unknown[]): unknown {
  const started = now();
  const result = fn(...args);

  if (result instanceof Promise) {
    return result.finally(() => addTiming("db", now() - started));
  }

  // Callback style. Nothing in the app uses it, and charging it zero is better
  // than pretending the synchronous return was the whole query.
  return result;
}

function gauges(pool: PoolLike): Record<string, number> {
  return {
    connectionsTotal: pool.totalCount ?? 0,
    connectionsIdle: pool.idleCount ?? 0,
    connectionsWaiting: pool.waitingCount ?? 0,
  };
}

/**
 * Instruments a pg-compatible pool in place and returns it.
 *
 * Acquisition time is recorded separately from query time because they fail
 * differently: queries get slower when the data grows, acquisition gets slower
 * when the pool is too small, and a single "database time" number hides which
 * of the two is happening.
 */
export function instrumentPool<T extends object>(pool: T): T {
  // Cast once at the boundary. Both drivers expose the same two entry points,
  // and their published overloads are too specific to describe structurally
  // without dragging one driver's types into the other's build.
  const target = pool as unknown as PoolLike;

  const query = target.query.bind(target) as QueryFn;
  target.query = (...args: unknown[]) => timedQuery(query, args);

  const connect = target.connect.bind(target);

  /**
   * `connect` has two shapes and the drivers use both.
   *
   * Called with a callback it returns nothing; called without one it returns a
   * promise — and the promise form is implemented by calling the callback form
   * back through `this.connect`, which is now this wrapper. Awaiting the return
   * of the callback form yields `undefined`, which is what the first version of
   * this did, and every transaction in the app failed on it.
   *
   * So: both shapes are handled, and the client is marked once instrumented so
   * the round trip through both does not wrap it twice or count the acquisition
   * twice.
   */
  const instrumented = Symbol.for("setwise.instrumented");

  const instrument = (client: ClientLike, startedAt: number): ClientLike => {
    const marked = client as ClientLike & { [key: symbol]: boolean };
    if (marked[instrumented]) return client;
    marked[instrumented] = true;

    recordProcedureLatency("db.acquire", now() - startedAt, gauges(target));

    const clientQuery = client.query.bind(client) as QueryFn;
    client.query = (...queryArgs: unknown[]) => timedQuery(clientQuery, queryArgs);

    return client;
  };

  target.connect = (...args: unknown[]) => {
    const started = now();

    if (typeof args[0] === "function") {
      const callback = args[0] as (error: unknown, client?: ClientLike, done?: unknown) => void;
      return connect((error: unknown, client?: ClientLike, done?: unknown) => {
        if (client) instrument(client, started);
        callback(error, client, done);
      });
    }

    return Promise.resolve(connect(...args)).then((client) => instrument(client, started));
  };

  return pool;
}
