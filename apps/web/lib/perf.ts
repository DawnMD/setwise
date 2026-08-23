/**
 * Client performance instrumentation.
 *
 * Four spans, chosen because they are the four moments the app is judged on: a
 * tap on the nav, a screen filling in, a set landing, and a workout closing.
 * Everything else is a proxy for one of them.
 *
 * Nothing here records a user id, a weight, a rep count, or a query input. A
 * span is a name and a duration, and that is deliberate: performance data that
 * carries training data is training data, and it would have to be governed like
 * it.
 */

export const PERF_SPANS = [
  /** Navigation intent (pointer down on a link) to the route being committed. */
  "navigation",
  /** Route commit to the queries that screen cannot render without. */
  "route-data",
  /** Save Set tap to the confirmed row being on screen. */
  "set-confirm",
  /** Finish Workout tap to the summary being on screen. */
  "finish-summary",
  /** Largest contentful paint, sampled once per document. */
  "lcp",
  /** Interaction to next paint, sampled per interaction. */
  "inp",
] as const;

export type PerfSpan = (typeof PERF_SPANS)[number];

export type PerfBudget = { p75: number; p95?: number };

/**
 * The acceptance thresholds. These are the numbers the work is measured
 * against, so they live in code rather than in a document that drifts.
 */
export const PERF_BUDGETS: Partial<Record<PerfSpan, PerfBudget>> = {
  navigation: { p75: 200 },
  "route-data": { p75: 500 },
  "set-confirm": { p75: 300, p95: 600 },
  lcp: { p75: 2500 },
  inp: { p75: 200 },
};

/** How many samples a span keeps. Enough for a stable p95, small enough to forget. */
const MAX_SAMPLES = 200;

const samples = new Map<PerfSpan, number[]>();
const open = new Map<string, number>();

const enabled = () => typeof performance !== "undefined" && typeof performance.now === "function";

const slot = (span: PerfSpan, id?: string) => (id === undefined ? span : `${span} ${id}`);

export function record(span: PerfSpan, ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  const list = samples.get(span) ?? [];
  list.push(ms);
  if (list.length > MAX_SAMPLES) list.shift();
  samples.set(span, list);
}

/**
 * Opens a span. Starting one that is already open replaces it: the second tap
 * is the one being timed, and a stale start would report the gap between them.
 */
export function startSpan(span: PerfSpan, id?: string): void {
  if (!enabled()) return;
  open.set(slot(span, id), performance.now());
}

/**
 * Opens a span that began earlier than the code noticing it did.
 *
 * A navigation starts at the tap, not at the router event that follows it, and
 * the gap between those two is a real part of what a person waits through.
 */
export function startSpanAt(span: PerfSpan, at: number, id?: string): void {
  if (!enabled()) return;
  open.set(slot(span, id), at);
}

/** Closes a span and returns its duration, or null when it was never opened. */
export function endSpan(span: PerfSpan, id?: string): number | null {
  if (!enabled()) return null;
  const key = slot(span, id);
  const started = open.get(key);
  if (started === undefined) return null;
  open.delete(key);

  const ms = performance.now() - started;
  record(span, ms);

  // A user-timing entry as well as a sample, so the same span is visible in
  // devtools and in a trace without a second instrumentation pass.
  try {
    performance.measure(`setwise:${span}`, { start: started, duration: ms });
  } catch {
    // Some browsers refuse the object form. The sample is the part that matters.
  }

  return ms;
}

export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest-rank. With a few dozen samples an interpolated percentile invents
  // precision the sample size does not support.
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export type PerfSpanReport = {
  span: PerfSpan;
  count: number;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  budget: PerfBudget | null;
  /** Null when the span has no budget, or no samples to judge it by. */
  withinBudget: boolean | null;
};

export function report(): PerfSpanReport[] {
  return PERF_SPANS.map((span) => {
    const values = samples.get(span) ?? [];
    const budget = PERF_BUDGETS[span] ?? null;
    const p75 = percentile(values, 75);
    const p95 = percentile(values, 95);

    return {
      span,
      count: values.length,
      p50: percentile(values, 50),
      p75,
      p95,
      budget,
      withinBudget:
        budget === null || p75 === null
          ? null
          : p75 <= budget.p75 && (budget.p95 === undefined || p95 === null || p95 <= budget.p95),
    };
  });
}

export function resetPerf(): void {
  samples.clear();
  open.clear();
}

declare global {
  interface Window {
    /** Read `__setwisePerf()` from the console to see the current percentiles. */
    __setwisePerf?: () => PerfSpanReport[];
  }
}

let installed = false;

/**
 * Starts the passive observers and exposes the report.
 *
 * LCP and INP are read from `PerformanceObserver` rather than pulled in as a
 * dependency: two entry types and a running maximum is the whole of what this
 * app needs from a web-vitals library.
 */
export function installWebVitals(): void {
  if (installed || typeof PerformanceObserver === "undefined") return;
  installed = true;

  window.__setwisePerf = report;

  try {
    const lcp = new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1);
      // LCP is reported repeatedly with a growing candidate. Only the final one
      // is the metric, so the slot is replaced rather than appended to.
      if (last) samples.set("lcp", [last.startTime]);
    });
    lcp.observe({ type: "largest-contentful-paint", buffered: true });
  } catch {
    // Safari before 16 has no LCP entry type. Nothing else depends on it.
  }

  try {
    const inp = new PerformanceObserver((list) => {
      // `interactionId` is what separates a real interaction from an event that
      // happened to fire. Not in every lib.dom yet, hence the widening.
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & { interactionId?: number; duration: number }
      >) {
        if (entry.interactionId) record("inp", entry.duration);
      }
    });
    inp.observe({
      type: "event",
      buffered: true,
      durationThreshold: 16,
    } as PerformanceObserverInit);
  } catch {
    // Same story: the app does not change behaviour on a missing observer.
  }
}
