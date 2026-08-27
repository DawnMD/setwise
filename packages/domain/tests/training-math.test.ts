import { describe, expect, it } from "vitest";

import { estimateOneRepMax, kgToLb, lbToKg, relativeIntensity, volumeBand } from "../src/math";
import { ghostForPosition, overloadDelta } from "../src/overload";
import { DEFAULT_BAR_KG, describeLoading, loadBar } from "../src/plates";
import { describeTargets } from "../src/targets";

describe("estimateOneRepMax", () => {
  it("applies Epley inside the trustworthy rep range", () => {
    expect(estimateOneRepMax(100, 1)).toBeCloseTo(103.333, 3);
    expect(estimateOneRepMax(100, 12)).toBeCloseTo(140);
  });

  it("refuses rather than guessing outside it", () => {
    expect(estimateOneRepMax(100, 13)).toBeNull();
    expect(estimateOneRepMax(100, 0)).toBeNull();
    expect(estimateOneRepMax(100, 5.5)).toBeNull();
    expect(estimateOneRepMax(0, 5)).toBeNull();
    expect(estimateOneRepMax(Number.NaN, 5)).toBeNull();
  });
});

describe("volumeBand", () => {
  it("keeps an untrained muscle in its own band", () => {
    expect(volumeBand(0)).toBe("none");
    expect(volumeBand(0.5)).toBe("low");
  });

  it("bands on the landmark boundaries", () => {
    expect(volumeBand(9.5)).toBe("low");
    expect(volumeBand(10)).toBe("productive");
    expect(volumeBand(19.5)).toBe("productive");
    expect(volumeBand(20)).toBe("high");
  });
});

describe("relativeIntensity", () => {
  it("is a share of the trailing best", () => {
    expect(relativeIntensity(90, 120)).toBeCloseTo(0.75);
  });

  it("has no answer without a best to divide by", () => {
    expect(relativeIntensity(90, null)).toBeNull();
    expect(relativeIntensity(90, 0)).toBeNull();
  });
});

describe("kg/lb conversion", () => {
  it("round-trips", () => {
    expect(lbToKg(kgToLb(62.5))).toBeCloseTo(62.5, 10);
  });

  it("uses the international pound", () => {
    expect(kgToLb(100)).toBeCloseTo(220.462, 3);
  });
});

describe("overloadDelta", () => {
  const ghost = { weight: 60, reps: 8, rpe: 8 };

  it("counts more weight, and more reps at the same weight", () => {
    expect(overloadDelta({ weight: 62.5, reps: 5 }, ghost)).toEqual({ kind: "weight", delta: 2.5 });
    expect(overloadDelta({ weight: 60, reps: 10 }, ghost)).toEqual({ kind: "reps", delta: 2 });
  });

  it("calls a trade a trade", () => {
    expect(overloadDelta({ weight: 55, reps: 12 }, ghost)).toBeNull();
    expect(overloadDelta({ weight: 60, reps: 8 }, ghost)).toBeNull();
    expect(overloadDelta({ weight: 60, reps: 6 }, ghost)).toBeNull();
  });

  it("has nothing to say without a previous set", () => {
    expect(overloadDelta({ weight: 60, reps: 8 }, null)).toBeNull();
  });
});

describe("ghostForPosition", () => {
  const lastSets = [
    { weight: 20, reps: 10, rpe: null, isWarmup: true },
    { weight: 60, reps: 8, rpe: 8, isWarmup: false },
    { weight: 60, reps: 7, rpe: 9, isWarmup: false },
  ];

  it("matches by position within its own kind", () => {
    expect(ghostForPosition(lastSets, 1, false)).toEqual({ weight: 60, reps: 7, rpe: 9 });
    expect(ghostForPosition(lastSets, 0, true)).toEqual({ weight: 20, reps: 10, rpe: null });
  });

  it("returns null past the end of that kind", () => {
    expect(ghostForPosition(lastSets, 2, false)).toBeNull();
    expect(ghostForPosition(lastSets, 1, true)).toBeNull();
  });
});

describe("loadBar", () => {
  it("loads greedily from the heaviest plate", () => {
    const loading = loadBar(100);
    expect(loading?.perSide.map((plate) => plate.kg)).toEqual([25, 15]);
    expect(loading?.remainderKg).toBe(0);
    expect(loading?.achievedKg).toBe(100);
  });

  it("does not drift on the change plates", () => {
    const loading = loadBar(87.5);
    expect(loading?.perSide.map((plate) => plate.kg)).toEqual([25, 5, 2.5, 1.25]);
    expect(loading?.remainderKg).toBe(0);
  });

  it("reports what the plates could not make up", () => {
    const loading = loadBar(20.4);
    expect(loading?.perSide).toEqual([]);
    expect(loading?.remainderKg).toBeCloseTo(0.4);
    expect(loading?.achievedKg).toBeCloseTo(20);
  });

  it("refuses a target under the bar", () => {
    expect(loadBar(15)).toBeNull();
    expect(loadBar(Number.NaN)).toBeNull();
  });

  it("takes the bar as an empty loading", () => {
    const loading = loadBar(DEFAULT_BAR_KG);
    expect(loading?.perSide).toEqual([]);
    expect(describeLoading(loading!)).toBe("Empty bar");
  });
});

describe("describeLoading", () => {
  it("collapses repeats", () => {
    expect(describeLoading(loadBar(120)!)).toBe("2 × 25");
  });
});

describe("describeTargets", () => {
  it("reads as a plan", () => {
    expect(
      describeTargets({ targetSets: 3, targetRepLow: 8, targetRepHigh: 12, targetRpe: 8 }),
    ).toBe("3 × 8–12 @ 8");
  });

  it("drops what was left blank", () => {
    expect(
      describeTargets({ targetSets: 3, targetRepLow: null, targetRepHigh: null, targetRpe: null }),
    ).toBe("3 ×");
    expect(
      describeTargets({ targetSets: null, targetRepLow: 5, targetRepHigh: 5, targetRpe: null }),
    ).toBe("5");
    expect(
      describeTargets({ targetSets: null, targetRepLow: 8, targetRepHigh: null, targetRpe: null }),
    ).toBe("8+");
    expect(
      describeTargets({ targetSets: null, targetRepLow: null, targetRepHigh: 12, targetRpe: null }),
    ).toBe("up to 12");
  });

  it("is null when nothing was set", () => {
    expect(
      describeTargets({
        targetSets: null,
        targetRepLow: null,
        targetRepHigh: null,
        targetRpe: null,
      }),
    ).toBeNull();
  });
});
