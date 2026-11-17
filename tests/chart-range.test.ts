import { describe, expect, it } from "vitest";
import { CHART_METRIC_KEYS } from "@/lib/chart-metric";
import { CHART_RANGE_KEYS, CHART_RANGE_OPTIONS, chartRangeParser, DEFAULT_RANGE } from "@/lib/chart-range";
import { CARRIED_PARAMS, filterParsers } from "@/lib/filters";
import { rangeDays } from "@/lib/ranges";

describe("per-card time range", () => {
  it("opens every card at 30 days", () => {
    expect(DEFAULT_RANGE).toBe("30d");
    for (const k of CHART_RANGE_KEYS) expect(chartRangeParser(k).defaultValue).toBe("30d");
  });
  it("offers All only where the card has more than a fixed window to show", () => {
    expect(CHART_RANGE_OPTIONS.cr).toContain("all");
    expect(CHART_RANGE_OPTIONS.pr).toContain("all");
    for (const k of ["mr", "hr", "xr"] as const) {
      expect(CHART_RANGE_OPTIONS[k]).toEqual(["7d", "30d", "90d"]);
      expect(chartRangeParser(k).parse("all")).toBeNull();
      expect(chartRangeParser(k).parse("7d")).toBe("7d");
    }
    expect(chartRangeParser("cr").parse("all")).toBe("all");
    expect(chartRangeParser("cr").parse("1y")).toBeNull();
  });
  it("uses keys that collide with nothing else in the URL", () => {
    const taken = new Set<string>([...Object.keys(filterParsers), ...CHART_METRIC_KEYS, "tz", "expand", "nc", "event"]);
    for (const k of CHART_RANGE_KEYS) expect(taken.has(k), `${k} is already a URL key`).toBe(false);
    expect(new Set(CHART_RANGE_KEYS).size).toBe(CHART_RANGE_KEYS.length);
  });
  it("has no global range, and carries only the ranges of cards that live on more than one page", () => {
    expect(Object.keys(filterParsers)).not.toContain("range");
    expect(CARRIED_PARAMS).not.toContain("range");
    expect(CARRIED_PARAMS).toContain("mr");
    expect(CARRIED_PARAMS).toContain("xr");
  });
  it("turns a range into a number of days", () => {
    expect(rangeDays("7d", 192)).toBe(7);
    expect(rangeDays("30d", 192)).toBe(30);
    expect(rangeDays("all", 192)).toBe(192);
    expect(rangeDays("90d", 40)).toBe(40);
  });
});
