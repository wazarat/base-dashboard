import { describe, expect, it } from "vitest";
import { chainData, meta, projects } from "@/lib/data";
import { chainTotal, exclusionSentences, fmtCountedTracked, kpiValue, nativeRevenue } from "@/lib/kpi";
import { concentration, concentrationBars, countedMetricValue, sumCounted, topNShare } from "@/lib/metrics";
import { movers, priorFloor } from "@/lib/movers";
import { treemapTiles } from "@/lib/treemap";
import { upsertSeries } from "../scripts/lib/store";
import { mkProject } from "./fixtures/project";

describe("movers on counted values", () => {
  const ps = [
    // Grew from $400K to $1M: passes the $250K starting floor.
    mkProject({ name: "Solid" }, { tvl: 1_000_000 }, { tvl: 1.5 }),
    // Grew 50x from $20K: blocked by the floor.
    mkProject({ name: "Tiny" }, { tvl: 1_000_000 }, { tvl: 49 }),
    // A CEX or double count has no counted TVL, so it never ranks however big its raw TVL.
    mkProject({ name: "Exchange", tvl: 50_000_000 }, { tvl: null }, {}),
    mkProject({ name: "Shrinking" }, { tvl: 500_000 }, { tvl: -0.5 }),
  ];

  it("ranks only counted projects that start above the floor, with the dollar change", () => {
    const m = movers(ps, "tvl", "30d", "any");
    expect(m.risers.map((r) => r.project.name)).toEqual(["Solid"]);
    expect(m.risers[0].delta).toBeCloseTo(600_000, 0);
    expect(m.fallers.map((r) => [r.project.name, Math.round(r.delta)])).toEqual([["Shrinking", -500_000]]);
    expect(m.eligible).toBe(2);
  });

  it("uses $250K for TVL and volume, $10K for fees and revenue, or a higher size filter", () => {
    expect(priorFloor("tvl", "any")).toBe(250_000);
    expect(priorFloor("volume", "any")).toBe(250_000);
    expect(priorFloor("fees", "any")).toBe(10_000);
    expect(priorFloor("revenue", "250k")).toBe(10_000);
    expect(priorFloor("tvl", "1m")).toBe(1_000_000);
  });
});

describe("concentration bars", () => {
  const ps = Array.from({ length: 12 }, (_, i) => mkProject({ name: `P${i + 1}` }, { tvl: (12 - i) * 10 }));

  it("shows the top 10 as shares of the chain total, then all other projects", () => {
    const points = concentration(ps, "tvl", { value: countedMetricValue, total: 1000 });
    const bars = concentrationBars(points, 1000);
    expect(bars).toHaveLength(11);
    expect(bars[0]).toMatchObject({ name: "P1", value: 120, share: 0.12 });
    const top10 = bars.slice(0, 10).reduce((a, b) => a + b.value, 0);
    expect(bars[10]).toMatchObject({ name: "All other projects", value: 1000 - top10, other: true });
    expect(bars.reduce((a, b) => a + b.share, 0)).toBeCloseTo(1, 9);
    expect(topNShare(points, 3)).toBeCloseTo((120 + 110 + 100) / 1000, 9);
  });

  it("with filters on, shares and the last bar use the selection's own total", () => {
    // A filtered selection passes no chain total, so the top bar is its share of the selection.
    const sel = [mkProject({ name: "A" }, { tvl: 50 }), mkProject({ name: "B" }, { tvl: 30 }), mkProject({ name: "C" }, { tvl: 20 })];
    const ranked = concentration(sel, "tvl", { value: countedMetricValue, total: null });
    const bars = concentrationBars(ranked, null);
    expect(bars[0]).toMatchObject({ name: "A", share: 0.5 });
    expect(bars.find((b) => b.other)).toBeUndefined();
    expect(topNShare(ranked, 3)).toBeCloseTo(1, 9);
    const many = Array.from({ length: 12 }, (_, i) => mkProject({ name: `S${i}` }, { tvl: 10 }));
    const mb = concentrationBars(concentration(many, "tvl", { value: countedMetricValue, total: null }), null);
    expect(mb.at(-1)).toMatchObject({ name: "All other projects", value: 20, other: true });
    expect(mb.at(-1)!.share).toBeCloseTo(20 / 120, 9);
  });

  it("falls back to the selection sum without a chain total", () => {
    const bars = concentrationBars(concentration(ps.slice(0, 2), "tvl", { value: countedMetricValue }), null);
    expect(bars.map((b) => b.share)).toEqual([120 / 230, 110 / 230]);
  });
});

describe("treemap counts", () => {
  it("adds up to the filtered project count for every metric", () => {
    for (const m of ["count", "tvl", "volume", "fees", "revenue"] as const) {
      const r = treemapTiles(projects, m, null, countedMetricValue);
      expect(r.tiles.reduce((a, t) => a + t.count, 0)).toBe(projects.length);
    }
  });
});

describe("trailing revisions", () => {
  it("overwrites the last 7 days by default and keeps older days", () => {
    const today = "2026-11-09";
    const existing: Array<[string, number]> = [["2026-11-01", 1], ["2026-11-02", 2], ["2026-11-08", 8]];
    const out = upsertSeries(existing, [["2026-11-01", 10], ["2026-11-02", 20], ["2026-11-08", 80]], { today });
    expect(out).toEqual([["2026-11-01", 1], ["2026-11-02", 20], ["2026-11-08", 80]]);
  });
});

describe("KPI cards match the chain charts", () => {
  const last = (xs: Array<number | null>, n: number) => xs.slice(-n).reduce<number>((a, v) => a + (v ?? 0), 0);

  it("30-day KPI totals equal the chart's daily values summed over the same window", () => {
    if (!chainData.dates.length) return;
    expect(chainData.dates.at(-1)).toBe(chainData.latest.asOf);
    expect(chainData.latest.volume30d).toBe(last(chainData.defillama.volume, 30));
    expect(chainData.latest.fees30d).toBe(last(chainData.defillama.fees, 30));
    expect(chainData.latest.revenue30d).toBe(last(chainData.defillama.revenue, 30));
    expect(chainData.latest.tvl).toBe(chainData.defillama.tvl.at(-1));
  });

  it("unfiltered cards show the chain totals, filtered ones the counted sum", () => {
    // With no chain total yet (snapshot-only build) the unfiltered card falls back to the counted sum.
    expect(kpiValue(projects, "fees", true, chainData.latest)).toBe(chainTotal(chainData.latest, "fees") ?? sumCounted(projects, "fees"));
    const one = projects.filter((p) => p.counted?.values.fees);
    expect(kpiValue(one.slice(0, 1), "fees", false, chainData.latest)).toBe(one[0]?.counted?.values.fees ?? null);
    expect(fmtCountedTracked(3, 1038)).toBe("Tracked for 3/1038 projects");
  });

  it("filtered sums of every project stay within DefiLlama's chain totals", () => {
    if (!meta.chainTotals) return;
    for (const m of ["volume", "fees", "revenue"] as const) {
      const sum = kpiValue(projects, m, false, chainData.latest) ?? 0;
      expect(sum).toBeLessThanOrEqual((chainTotal(chainData.latest, m) ?? 0) * 1.01);
    }
  });
});

describe("generated InfoTip sentences", () => {
  const groups = [
    { reason: "doublecounted", label: "Double counted by DefiLlama", names: ["Steakhouse Financial", "Fables", "Snuggle"], value: 600e6, count: 40 },
    { reason: "locker", label: "Token lockers", names: ["UNCX Network V3"], value: 5e6, count: 1 },
  ];

  it("explains each group in one sentence and drops lockers from the unfiltered chain total", () => {
    expect(exclusionSentences(groups, false)).toEqual([
      "Double counted by DefiLlama, 40 apps worth $600.0M, such as Steakhouse Financial, Fables and Snuggle, are left out because their deposits already sit in another app DefiLlama counts.",
      "Token lockers, 1 app worth $5.0M, such as UNCX Network V3, is left out because locked tokens are not working capital, though DefiLlama's chain TVL keeps them.",
    ]);
    expect(exclusionSentences(groups, true)).toHaveLength(1);
    for (const s of exclusionSentences(groups, false)) expect(s).not.toMatch(/[:—]/);
  });

  it("names the largest native revenue contributors and the share without Arcus", () => {
    const ps = [mkProject({ name: "Arcus" }, { revenue: 60 }), mkProject({ name: "Other native" }, { revenue: 20 }), mkProject({ name: "Imported", chain: "Other EVM" }, { revenue: 20 })];
    const n = nativeRevenue(ps);
    expect(n.share).toBeCloseTo(0.8, 9);
    expect(n.top.map((t) => t.name)).toEqual(["Arcus", "Other native"]);
    expect(n.withoutArcus).toBeCloseTo(0.5, 9);
  });
});
