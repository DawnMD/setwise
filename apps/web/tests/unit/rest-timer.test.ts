import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRestTimer, DEFAULT_REST_SECONDS } from "../../hooks/use-rest-timer";

/**
 * The property this file exists to protect: a running rest timer must not
 * re-render the workout.
 *
 * It cannot be asserted against React from here, so it is asserted against the
 * mechanism that guarantees it. `ActiveSession` subscribes to `subscribeRunning`
 * and the bar subscribes to `subscribeTick`; if a tick ever reached the running
 * channel, every exercise card would re-render four times a second and this
 * test would fail.
 */
describe("rest timer store", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("notifies the countdown on every tick and the workout only on start and stop", () => {
    const timer = createRestTimer();
    let ticks = 0;
    let runningChanges = 0;

    timer.subscribeTick(() => (ticks += 1));
    timer.subscribeRunning(() => (runningChanges += 1));

    timer.start(60);
    expect(timer.isRunning()).toBe(true);
    expect(runningChanges).toBe(1);

    const ticksAfterStart = ticks;
    vi.advanceTimersByTime(2_000);

    // Four a second for two seconds, and none of them on the other channel.
    expect(ticks - ticksAfterStart).toBe(8);
    expect(runningChanges).toBe(1);

    timer.stop();
    expect(runningChanges).toBe(2);
    expect(timer.isRunning()).toBe(false);

    const ticksAfterStop = ticks;
    vi.advanceTimersByTime(2_000);
    // Stopped means stopped: no interval left running behind the screen.
    expect(ticks).toBe(ticksAfterStop);

    timer.dispose();
  });

  it("counts down, reports done once the rest is over, and extends from now", () => {
    const timer = createRestTimer();
    timer.start(60);

    vi.advanceTimersByTime(30_000);
    expect(timer.getSnapshot().remaining).toBeCloseTo(30, 1);
    expect(timer.getSnapshot().done).toBe(false);

    vi.advanceTimersByTime(31_000);
    expect(timer.getSnapshot().remaining).toBe(0);
    expect(timer.getSnapshot().done).toBe(true);

    // "+30s" past the end buys thirty seconds, not thirty seconds minus however
    // long the phone sat on the bench.
    timer.extend(30);
    expect(timer.getSnapshot().remaining).toBeCloseTo(30, 1);
    expect(timer.getSnapshot().done).toBe(false);

    timer.dispose();
  });

  it("starts idle, at the default length, with a stable snapshot", () => {
    const timer = createRestTimer();
    const first = timer.getSnapshot();

    expect(first).toEqual({
      remaining: 0,
      duration: DEFAULT_REST_SECONDS,
      running: false,
      done: false,
    });
    // Referentially stable between changes, which is what useSyncExternalStore
    // requires and what stops it looping.
    expect(timer.getSnapshot()).toBe(first);

    timer.dispose();
  });
});
