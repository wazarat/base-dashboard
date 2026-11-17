import { describe, expect, it } from "vitest";
import type { Series } from "@/lib/history-types";
import { alignSeries, applyLive, computeLive, flowChange, pctChange, stockChange, sumWindow, valueAt, windowEnd, type HistoryStore } from "@/lib/live";
import { recomputeTier } from "@/lib/tier";
import type { Project } from "@/lib/types";
import { validate } from "@/lib/validate";
import { movers, passesMinSize, priorFloor } from "@/lib/movers";

const daily = (start: string, values: number[]): Series =>
  values.map((v, i) => [new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10), v]);

describe("windows", () => {
  it("window end is the day before the last run", () => {
    expect(windowEnd("2026-11-08")).toBe("2026-11-07");
  });
  it("sums a trailing window with gaps as zero and null when empty", () => {
    const s: Series = [["2026-11-01", 10], ["2026-11-03", 5], ["2026-11-07", 1]];
    expect(sumWindow(s, "2026-11-07", 7)).toEqual({ value: 16, days: 3 });
    expect(sumWindow(s, "2026-11-07", 3)).toEqual({ value: 1, days: 1 });
    expect(sumWindow(s, "2026-10-20", 7)).toEqual({ value: null, days: 0 });
  });
  it("valueAt tolerates short gaps only", () => {
    const s: Series = [["2026-11-01", 100], ["2026-11-05", 120]];
    expect(valueAt(s, "2026-11-05")).toBe(120);
    expect(valueAt(s, "2026-11-07")).toBe(120);
    expect(valueAt(s, "2026-11-09")).toBeNull();
    expect(valueAt(s, "2026-10-31")).toBeNull();
  });
  it("pctChange guards nulls and zero", () => {
    expect(pctChange(110, 100)).toBeCloseTo(0.1);
    expect(pctChange(null, 100)).toBeNull();
    expect(pctChange(5, 0)).toBeNull();
  });
  it("flow change needs half the prior window and stock change compares endpoints", () => {
    const s = daily("2026-10-01", Array.from({ length: 38 }, (_, i) => (i < 31 ? 10 : 20)));
    // end 2026-11-07: last 7 days = 20 each (140), prior 7 days = 10 each (70)
    expect(flowChange(s, "2026-11-07", 7)).toBeCloseTo(1);
    expect(flowChange([["2026-11-07", 5]], "2026-11-07", 7)).toBeNull();
    const tvl: Series = [["2026-10-31", 100], ["2026-11-07", 150]];
    expect(stockChange(tvl, "2026-11-07", 7)).toBeCloseTo(0.5);
  });
  it("aligns flows with gaps and forward-fills stocks up to 3 days", () => {
    const dates = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];
    const s: Series = [["2026-11-01", 1], ["2026-11-05", 2]];
    expect(alignSeries(s, dates, "flow")).toEqual([1, null, null, null, 2, null]);
    expect(alignSeries(s, dates, "stock")).toEqual([1, 1, 1, 1, 2, 2]);
  });
});

describe("tier", () => {
  it("applies thresholds inclusively and treats nulls as no data", () => {
    expect(recomputeTier({ tvl: 50_000_000, volume: null, fees: null, revenue: null })).toBe("Tier 1 - Leader");
    expect(recomputeTier({ tvl: 49_999_999, volume: 500_000_000, fees: null, revenue: null })).toBe("Tier 1 - Leader");
    expect(recomputeTier({ tvl: null, volume: null, fees: 1_000_000, revenue: null })).toBe("Tier 1 - Leader");
    expect(recomputeTier({ tvl: 2_000_000, volume: null, fees: null, revenue: null })).toBe("Tier 2 - Strong");
    expect(recomputeTier({ tvl: null, volume: 50_000_000, fees: 99_999, revenue: null })).toBe("Tier 2 - Strong");
    expect(recomputeTier({ tvl: null, volume: null, fees: null, revenue: 12 })).toBe("Tier 3 - Emerging");
    expect(recomputeTier({ tvl: 0, volume: null, fees: null, revenue: null })).toBe("Tracked, negligible");
    expect(recomputeTier({ tvl: null, volume: null, fees: null, revenue: null })).toBe("Not tracked");
  });
});

describe("computeLive / applyLive", () => {
  const store: HistoryStore = {
    tvl: { "uni-v3": daily("2026-10-01", Array(38).fill(60_000_000)), "uni-v4": daily("2026-10-01", Array(38).fill(40_000_000)) },
    volume: { "Uniswap V3": daily("2026-10-01", Array(38).fill(1_000_000)), "Uniswap V4": daily("2026-10-01", Array(38).fill(2_000_000)) },
    fees: { "Uniswap V3": daily("2026-10-01", Array(38).fill(1000)) },
    revenue: {},
    holdersRevenue: {},
    supplySideRevenue: {},
    nameOfSlug: new Map([["uni-v3", "Uniswap V3"], ["uni-v4", "Uniswap V4"]]),
    mcapOfSlug: new Map([["uni-v3", 5_000_000_000], ["uni-v4", 5_000_000_000]]),
  };
  it("sums several slugs and computes 30d windows", () => {
    const live = computeLive(["uni-v3", "uni-v4"], store, "2026-11-07")!;
    expect(live.tvl).toBe(100_000_000);
    expect(live.volume).toBe(90_000_000);
    expect(live.fees).toBe(30_000);
    expect(live.revenue).toBeNull();
    expect(live.annualisedRevenue).toBeNull();
    expect(live.tokenMarketCap).toBe(5_000_000_000);
    expect(live.psRatio).toBeNull();
    expect(live.change.volume.d7).toBeCloseTo(0);
  });
  it("returns null when nothing is mapped and falls back to the snapshot", () => {
    expect(computeLive(["nope"], store, "2026-11-07")).toBeNull();
    const base = { tvl: 5, volume: null, fees: 7, revenue: 3, tier: "Not tracked", snapshot: { tvl: 5, volume: null, fees: 7, revenue: 3, tier: "Not tracked", asOf: "2026-11-07" } } as unknown as Project;
    const out = applyLive(base, null);
    expect(out.metricSource).toEqual({ tvl: "snapshot", volume: "none", fees: "snapshot", revenue: "snapshot" });
    // no daily data: the researched tier is kept as is
    expect(out.tier).toBe("Not tracked");
    const live = computeLive(["uni-v3"], store, "2026-11-07");
    const out2 = applyLive(base, live);
    expect(out2.metricSource.tvl).toBe("live");
    expect(out2.metricSource.revenue).toBe("snapshot");
    expect(out2.tier).toBe("Tier 1 - Leader");
  });
});

describe("validate", () => {
  const expected = { static: { projects: 607 }, snapshot: { tvl: 100 }, liveSanity: { maxDayOverDayRatio: 10 } };
  const base = { static: { projects: 607 }, snapshot: { tvl: 100 }, live: { tvl: 120 }, liveVsSnapshot: { tvl: 1.2 }, dayOverDay: { tvl: 1.01 }, sourceErrors: [], lastRunAgeDays: 1 };
  it("fails on static or snapshot mismatch and negative live totals", () => {
    expect(validate(expected, { ...base, static: { projects: 606 } }).failures.length).toBe(1);
    expect(validate(expected, { ...base, snapshot: { tvl: 99 } }).failures.length).toBe(1);
    expect(validate(expected, { ...base, live: { tvl: -1 } }).failures.length).toBe(1);
  });
  it("only warns on big jumps, source errors and stale runs", () => {
    const r = validate(expected, { ...base, liveVsSnapshot: { tvl: 12 }, dayOverDay: { tvl: 0.05 }, sourceErrors: ["x: boom"], lastRunAgeDays: 5 });
    expect(r.failures).toEqual([]);
    expect(r.warnings.length).toBe(4);
  });
});

describe("movers", () => {
  const mk = (id: string, tvl: number, d30: number | null, fees = 0): Project =>
    ({
      id,
      name: id,
      sector: "DEXs",
      tvl,
      fees,
      volume: null,
      revenue: null,
      live: { change: { tvl: { d7: null, d30, d90: null }, volume: { d7: null, d30: null, d90: null }, fees: { d7: null, d30: null, d90: null }, revenue: { d7: null, d30: null, d90: null } } },
      // Movers rank counted values (what DefiLlama counts in its chain total).
      counted: { values: { tvl, volume: null, fees, revenue: null }, change: { tvl: { d7: null, d30, d90: null }, volume: { d7: null, d30: null, d90: null }, fees: { d7: null, d30: null, d90: null }, revenue: { d7: null, d30: null, d90: null } } },
    }) as unknown as Project;
  it("applies the size filter and a floor on the prior value", () => {
    expect(passesMinSize(mk("a", 300_000, 0.1), "250k")).toBe(true);
    expect(passesMinSize(mk("b", 100_000, 0.1), "250k")).toBe(false);
    expect(passesMinSize(mk("b", 100_000, 0.1, 20_000), "250k")).toBe(true);
    expect(priorFloor("tvl", "250k")).toBe(250_000);
    expect(priorFloor("fees", "any")).toBe(10_000);
  });
  it("ranks risers and fallers and drops tiny bases and nulls", () => {
    const list = [mk("up", 3_000_000, 0.5), mk("spike", 3_100_000, 3830), mk("down", 2_000_000, -0.4), mk("none", 5_000_000, null)];
    const m = movers(list, "tvl", "30d", "250k");
    expect(m.risers.map((r) => r.project.id)).toEqual(["up"]);
    expect(m.fallers.map((r) => r.project.id)).toEqual(["down"]);
    expect(m.eligible).toBe(2);
  });
});
