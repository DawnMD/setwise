import { afterEach, describe, expect, it } from "vitest";

import { PERF_BUDGETS, percentile, record, report, resetPerf } from "../../lib/perf";

/**
 * The budgets are the acceptance criteria for the whole performance pass, so
 * the arithmetic that decides whether they are met is worth its own test.
 */
describe("performance report", () => {
  afterEach(() => resetPerf());

  it("takes percentiles by nearest rank", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 75)).toBe(80);
    expect(percentile(values, 95)).toBe(100);
    // Nearest rank, not interpolation: with ten samples there is no evidence
    // for a value that is not one of them.
    expect(percentile([42], 95)).toBe(42);
    expect(percentile([], 50)).toBeNull();
  });

  it("passes a span whose p75 and p95 are both inside the budget", () => {
    const budget = PERF_BUDGETS["set-confirm"];
    expect(budget).toEqual({ p75: 300, p95: 600 });

    for (const ms of [100, 120, 140, 160, 180, 200, 220, 240, 260, 280]) {
      record("set-confirm", ms);
    }

    const entry = report().find((span) => span.span === "set-confirm");
    expect(entry).toMatchObject({ count: 10, p50: 180, p75: 240, p95: 280 });
    expect(entry?.withinBudget).toBe(true);
  });

  it("fails a span whose tail is over, even when its median is fine", () => {
    // Nine fast saves and one that took a second and a half. The p75 passes and
    // the p95 does not, which is exactly the case the p95 budget exists for.
    for (const ms of [100, 110, 120, 130, 140, 150, 160, 170, 180]) {
      record("set-confirm", ms);
    }
    record("set-confirm", 1_500);

    const entry = report().find((span) => span.span === "set-confirm");
    expect(entry?.p75).toBeLessThan(300);
    expect(entry?.p95).toBe(1_500);
    expect(entry?.withinBudget).toBe(false);
  });

  it("judges nothing without samples, and ignores impossible durations", () => {
    record("navigation", -1);
    record("navigation", Number.NaN);

    const entry = report().find((span) => span.span === "navigation");
    expect(entry?.count).toBe(0);
    // No samples is not a pass and not a failure. Reporting it as either would
    // make a screen nobody visited look like evidence.
    expect(entry?.withinBudget).toBeNull();
  });
});
