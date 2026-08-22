import "@tanstack/react-start/server-only";

/**
 * Latency percentiles per procedure and deployment region.
 *
 * Emitted as one structured log line rather than pushed to a metrics service:
 * the deployment is a set of short-lived functions, and a line in the platform
 * log is the one sink that is guaranteed to exist and guaranteed to be already
 * retained under the same policy as everything else.
 *
 * A sample is a procedure path, a duration and a region. Never an input, never
 * a user, never a row. "session.createSet took 41 ms in sin1" is the whole of
 * what is knowable from this, by design.
 */

const MAX_SAMPLES = 200;
/** Flush cadence. Small enough that a function that dies young still reports. */
const FLUSH_EVERY = 20;
const FLUSH_AFTER_MS = 30_000;

type Reservoir = {
  values: number[];
  flushedAt: number;
  since: number;
  /** Last-seen gauges, flushed alongside the percentiles. Pool depth, and so on. */
  gauges: Record<string, number>;
};

const reservoirs = new Map<string, Reservoir>();

export const deploymentRegion = () =>
  process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? "local";

function percentile(sorted: readonly number[], p: number): number {
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export type ProcedureLatency = {
  procedure: string;
  region: string;
  count: number;
  p50: number;
  p75: number;
  p95: number;
};

function summarise(procedure: string, reservoir: Reservoir): ProcedureLatency {
  const sorted = [...reservoir.values].sort((a, b) => a - b);
  const round = (value: number) => Math.round(value * 10) / 10;

  return {
    procedure,
    region: deploymentRegion(),
    count: sorted.length,
    p50: round(percentile(sorted, 50)),
    p75: round(percentile(sorted, 75)),
    p95: round(percentile(sorted, 95)),
  };
}

/**
 * Records one procedure call.
 *
 * `procedure` is the dotted router path — "session.createSet" — and nothing
 * else is ever passed here.
 */
export function recordProcedureLatency(
  procedure: string,
  ms: number,
  gauges?: Record<string, number>,
): void {
  if (!Number.isFinite(ms) || ms < 0) return;

  const at = Date.now();
  const reservoir = reservoirs.get(procedure) ?? {
    values: [],
    flushedAt: at,
    since: at,
    gauges: {},
  };
  reservoir.values.push(ms);
  if (reservoir.values.length > MAX_SAMPLES) reservoir.values.shift();
  if (gauges) Object.assign(reservoir.gauges, gauges);
  reservoirs.set(procedure, reservoir);

  const due =
    reservoir.values.length % FLUSH_EVERY === 0 || at - reservoir.flushedAt >= FLUSH_AFTER_MS;
  if (!due) return;

  reservoir.flushedAt = at;
  console.info(
    JSON.stringify({
      metric: "orpc.latency",
      ...summarise(procedure, reservoir),
      ...reservoir.gauges,
    }),
  );
}

/**
 * A cold start, reported once per instance.
 *
 * The gap between the module being evaluated and the first request arriving is
 * the part of a slow first tap that no query tuning can reach, so it is worth
 * being able to see separately from the request it happened to land on.
 */
let coldStartReported = false;
const moduleLoadedAt = Date.now();

export function reportColdStart(): void {
  if (coldStartReported) return;
  coldStartReported = true;
  console.info(
    JSON.stringify({
      metric: "function.coldstart",
      region: deploymentRegion(),
      ms: Date.now() - moduleLoadedAt,
    }),
  );
}

/** Everything currently held, for a test or a one-off read. */
export function latencyReport(): ProcedureLatency[] {
  return [...reservoirs.entries()]
    .filter(([, reservoir]) => reservoir.values.length > 0)
    .map(([procedure, reservoir]) => summarise(procedure, reservoir));
}

export function resetLatency(): void {
  reservoirs.clear();
}
