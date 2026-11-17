import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bizModel, capture, pairedSums, plottableBiz } from "@/lib/biz-model";
import { HAS_HISTORY } from "./helpers";
import type { SeriesMap } from "@/lib/history-types";

const days = (start: string, values: number[]): Array<[string, number]> =>
  values.map((v, i) => [new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10), v]);

describe("paired fees and revenue", () => {
  const fees: SeriesMap = { V3: days("2026-11-01", [100, 100, 100]), V4: days("2026-11-01", [1000, 1000, 1000]) };
  const revenue: SeriesMap = { V3: days("2026-11-01", [30, 30, 30]) };

  it("ignores a listing with fees but no revenue, so it cannot drag capture down", () => {
    const p = pairedSums(["V3", "V4"], fees, revenue, "2026-11-03", 7);
    expect(p).toEqual({ fees: 300, revenue: 90 });
    expect(capture(p)).toBeCloseTo(0.3, 9);
  });

  it("only pairs days where both are reported", () => {
    const rev: SeriesMap = { V3: [["2026-11-02", 30]] };
    expect(pairedSums(["V3"], fees, rev, "2026-11-03", 7)).toEqual({ fees: 100, revenue: 30 });
  });

  it("flags revenue above fees as a data error the chart leaves out", () => {
    const p = pairedSums(["V3"], fees, { V3: days("2026-11-01", [200, 200, 200]) }, "2026-11-03", 7);
    expect(p?.error).toBe(true);
    expect(plottableBiz(p)).toBe(false);
  });

  it("recomputes for each window", () => {
    const m = bizModel(["V3"], { V3: days("2026-08-01", Array(100).fill(10)) }, { V3: days("2026-08-01", Array(100).fill(1)) }, "2026-11-08");
    expect([m?.d7?.fees, m?.d30?.fees, m?.d90?.fees]).toEqual([70, 300, 900]);
  });
});

/**
 * DefiLlama /summary/fees/{slug}?dataType=dailyFees and dailyRevenue, Base only, summed Oct 18 to Nov 16 2026,
 * fetched on Nov 17. Listings DefiLlama counts in the chain total for both metrics.
 */
const DEFILLAMA = {
  "Aero Slipstream": { names: ["Aero Slipstream"], fees: 5_514_967, revenue: 5_012_241 },
  "Uniswap V3": { names: ["Uniswap V3"], fees: 10_032_596, revenue: 1_902_756 },
  "Curve DEX": { names: ["Curve DEX"], fees: 1_749_613, revenue: 874_806 },
  Venice: { names: ["Venice"], fees: 1_139_469, revenue: 1_139_469 },
};

describe.skipIf(!HAS_HISTORY)("capture against DefiLlama, Oct 18 to Nov 16", () => {
  const dir = path.join(__dirname, "..", "data", "history", "defillama");
  const read = (f: string) => (HAS_HISTORY ? (JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as SeriesMap) : {});
  const fees = read("fees.json");
  const revenue = read("revenue.json");
  for (const [project, d] of Object.entries(DEFILLAMA)) {
    it(`${project} keeps ${((d.revenue / d.fees) * 100).toFixed(1)}% of fees`, () => {
      const p = pairedSums(d.names, fees, revenue, "2026-11-16", 30);
      // Days inside DefiLlama's 7-day revision window may still move a little until Nov 23.
      expect(p!.fees / d.fees).toBeCloseTo(1, 2);
      expect(p!.revenue / d.revenue).toBeCloseTo(1, 2);
      expect(capture(p)!).toBeCloseTo(d.revenue / d.fees, 2);
    });
  }
});
