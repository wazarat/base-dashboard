import { describe, expect, it } from "vitest";
import { alignByFirstData, compareMatrix, compareRatios, compareSentences, indexTo100, normalizeSelection, ratio, suggestPeers } from "@/lib/compare";
import { resolvePreset } from "@/lib/presets";
import type { Project } from "@/lib/types";

const mk = (id: string, sector: string, tvl: number | null, fees: number | null, revenue: number | null, d30: number | null = null): Project =>
  ({
    id,
    name: id.toUpperCase(),
    sector,
    tvl,
    fees,
    revenue,
    volume: null,
    revenueCapture: fees && revenue ? revenue / fees : null,
    hasTraction: true,
    tier: "Tier 3 - Emerging",
    live: { change: { tvl: { d7: null, d30, d90: null }, volume: { d7: null, d30: null, d90: null }, fees: { d7: null, d30: null, d90: null }, revenue: { d7: null, d30: null, d90: null } }, annualisedRevenue: null, tokenMarketCap: null, psRatio: null, txns24h: null, uniqueSenders7d: null, holders: null },
  }) as unknown as Project;

const all = [mk("a", "DEXs", 1000, 50, 10, 0.2), mk("b", "DEXs", 500, 40, 30, -0.1), mk("c", "DEXs", 200, 1, 0), mk("d", "Lending", 800, 8, 8)];

describe("compare", () => {
  it("normalises the selection: known ids, deduped, capped at 4", () => {
    const known = new Set(["a", "b", "c", "d", "e"]);
    expect(normalizeSelection(["a", "x", "a", "b", "c", "d", "e"], known)).toEqual(["a", "b", "c", "d"]);
  });
  it("suggests same-sector peers by metric", () => {
    expect(suggestPeers(all[0], "tvl", all, ["a"]).map((p) => p.id)).toEqual(["b", "c"]);
    expect(suggestPeers(all[0], "tvl", all, ["a", "b"]).map((p) => p.id)).toEqual(["c"]);
  });
  it("ranks within each project's sector and marks the best cell", () => {
    const rows = compareMatrix([all[1], all[3]], all);
    const tvl = rows.find((r) => r.key === "tvl")!;
    expect(tvl.cells[0]).toMatchObject({ value: 500, rank: 2, of: 3, best: false });
    expect(tvl.cells[0].share).toBeCloseTo(500 / 1700);
    expect(tvl.cells[1]).toMatchObject({ value: 800, rank: 1, of: 1, best: true });
  });
  it("computes size-independent ratios with null guards", () => {
    expect(ratio(10, 0)).toBeNull();
    const rows = compareRatios([all[0], all[1]]);
    const f = rows.find((r) => r.key === "feesPerTvl")!;
    expect(f.values[0]).toBeCloseTo(0.05);
    expect(f.values[1]).toBeCloseTo(0.08);
    expect(f.best).toEqual([false, true]);
    expect(rows.find((r) => r.key === "capture")!.values).toEqual([0.2, 0.75]);
  });
  it("indexes to 100 from the first shared date and aligns by first data", () => {
    const s = [[null, 10, 20, 30], [5, 5, 10, null]];
    const { start, indexed } = indexTo100(s);
    expect(start).toBe(1);
    expect(indexed[0]).toEqual([null, 100, 200, 300]);
    expect(indexed[1]).toEqual([null, 100, 200, null]);
    expect(alignByFirstData(s)).toEqual([[100, 200, 300], [100, 100, 200, null]]);
    const partial = indexTo100([[null, null], [1, 2]]);
    expect(partial.start).toBe(0);
    expect(partial.skipped).toEqual([0]);
    expect(partial.indexed[1]).toEqual([100, 200]);
    expect(indexTo100([[null, null]]).start).toBe(-1);
  });
  it("writes two or three sentences from the numbers", () => {
    const s = compareSentences([all[0], all[1]], "tvl");
    expect(s.length).toBeGreaterThanOrEqual(2);
    expect(s[0]).toContain("A leads on TVL");
    expect(s[0]).toContain("2.0× B");
    expect(s[1]).toMatch(/B earns 1\.6× more fees per dollar of TVL than A/);
    expect(s[2]).toMatch(/A grew \+20\.0%/);
    expect(compareSentences([all[0]], "tvl")).toEqual([]);
  });
  it("resolves presets by name and skips missing projects", () => {
    const lookup = new Map([["arcus", "arcus"], ["lighter", "lighter"]]);
    expect(resolvePreset(["Arcus", "Lighter", "Meridian"], lookup)).toEqual(["arcus", "lighter"]);
  });
});
