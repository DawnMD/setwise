export type DatabaseGauges = {
  connectionsTotal: number;
  connectionsIdle: number;
  connectionsWaiting: number;
};

export type DatabaseInstrumentation = {
  recordQuery?: (durationMs: number) => void;
  recordAcquire?: (durationMs: number, gauges: DatabaseGauges) => void;
};

type QueryFn = (...args: unknown[]) => unknown;
type ClientLike = { query: QueryFn };
type PoolLike = {
  query: QueryFn;
  connect: (...args: unknown[]) => unknown;
  totalCount?: number;
  idleCount?: number;
  waitingCount?: number;
};

const now = () => performance.now();

function gauges(pool: PoolLike): DatabaseGauges {
  return {
    connectionsTotal: pool.totalCount ?? 0,
    connectionsIdle: pool.idleCount ?? 0,
    connectionsWaiting: pool.waitingCount ?? 0,
  };
}

export function instrumentPool<T extends object>(
  pool: T,
  instrumentation: DatabaseInstrumentation = {},
): T {
  if (!instrumentation.recordQuery && !instrumentation.recordAcquire) return pool;

  const target = pool as unknown as PoolLike;
  const query = target.query.bind(target) as QueryFn;
  target.query = (...args: unknown[]) => {
    const started = now();
    const result = query(...args);
    return result instanceof Promise
      ? result.finally(() => instrumentation.recordQuery?.(now() - started))
      : result;
  };

  const connect = target.connect.bind(target);
  const instrumented = Symbol.for("setwise.instrumented");
  const instrument = (client: ClientLike, startedAt: number): ClientLike => {
    const marked = client as ClientLike & { [key: symbol]: boolean };
    if (marked[instrumented]) return client;
    marked[instrumented] = true;
    instrumentation.recordAcquire?.(now() - startedAt, gauges(target));

    if (instrumentation.recordQuery) {
      const clientQuery = client.query.bind(client) as QueryFn;
      client.query = (...args: unknown[]) => {
        const started = now();
        const result = clientQuery(...args);
        return result instanceof Promise
          ? result.finally(() => instrumentation.recordQuery?.(now() - started))
          : result;
      };
    }
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
    return Promise.resolve(connect(...args)).then((client) =>
      instrument(client as ClientLike, started),
    );
  };

  return pool;
}
