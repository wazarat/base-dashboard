import { describe, expect, it } from "vitest";
import { fitDomain, fmtRangeStats, levelLabel, rangeStats } from "@/lib/level-axis";

describe("level axis", () => {
  it("pads the fitted domain by 10% and never dips below zero for non-negative series", () => {
    const [lo, hi] = fitDomain([100, 110, 120]);
    expect(lo).toBeCloseTo(98);
    expect(hi).toBeCloseTo(122);
    expect(fitDomain([0, 1, 2])[0]).toBe(0);
  });
  it("handles flat, empty and sparse series", () => {
    expect(fitDomain([])).toEqual([0, 1]);
    expect(fitDomain([0, 0])).toEqual([0, 1]);
    const [lo, hi] = fitDomain([50, 50]);
    expect(lo).toBeCloseTo(47.5);
    expect(hi).toBeCloseTo(52.5);
    expect(fitDomain([null, 10, null, 20])).toEqual([9, 21]);
  });
  it("lets negative series keep their range", () => {
    const [lo, hi] = fitDomain([-0.02, 0.01]);
    expect(lo).toBeLessThan(-0.02);
    expect(hi).toBeGreaterThan(0.01);
  });
  it("summarises the visible window", () => {
    const s = rangeStats([null, 100, 90, 110, 120, null]);
    expect(s).toMatchObject({ min: 90, max: 120, first: 100, last: 120 });
    expect(s!.change).toBeCloseTo(0.2);
    expect(fmtRangeStats(s!, (v) => `$${v}`, "90d")).toBe("Low $90, high $120, +20.0% over 90d");
    expect(rangeStats([null, null])).toBeNull();
    expect(rangeStats([0, 5])?.change).toBeNull();
  });
  it("labels the window a level panel shows", () => {
    expect(levelLabel(90, 192)).toBe("90d");
    expect(levelLabel(30, 192)).toBe("30d");
    expect(levelLabel(40, 40)).toBe("all history");
  });
});
