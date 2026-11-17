import { describe, expect, it } from "vitest";
import { generateInsights } from "@/lib/insights";
import { countedMetricValue } from "@/lib/metrics";
import { activityTakeaway, chainTakeaway, dailyAverage, levelChange, points } from "@/lib/takeaways";
import { mkProject } from "./fixtures/project";

const DATE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}\b|\b20\d\d\b/;

describe("card takeaways", () => {
  const days = (n: number, f: (i: number) => number | null) => Array.from({ length: n }, (_, i) => f(i));

  it("gives chain over time one row per metric with 7d, 30d and 90d columns", () => {
    // 100 days: TVL climbs 1 a day from 100; volume is 10 a day for the last 7 days and 1 before.
    const tvl = days(100, (i) => 100 + i);
    const volume = days(100, (i) => (i >= 93 ? 10e6 : 1e6));
    const t = chainTakeaway({ tvl, volume, fees: days(100, () => 2e6), revenue: days(100, () => null) });
    expect(t.points).toEqual([]);
    expect(t.table?.columns).toEqual(["7d", "30d", "90d"]);
    expect(t.table?.rows.map((r) => r.label)).toEqual(["Chain TVL change", "Daily DEX volume, average", "Daily fees, average", "Daily revenue, average"]);
    expect(t.table?.rows[0].values).toEqual(["+3.1%", "+17.1%", "+80.9%"]);
    expect(t.table?.rows[1].values).toEqual(["$10.0M", "$3.1M", "$1.7M"]);
    expect(t.table?.rows[3].values).toEqual(["none", "none", "none"]);
    expect(levelChange([null, 100, 110], 2)).toBeCloseTo(0.1);
    expect(dailyAverage([1, null, 3], 3)).toBe(2);
    expect(JSON.stringify(t)).not.toMatch(DATE);
  });

  it("gives chain activity the same three windows", () => {
    const t = activityTakeaway({ activeChange: { 7: 0.05, 30: -0.26, 90: null }, newAccounts: days(90, () => 50_000), txns: days(90, () => 7e6), userOps: days(90, (i) => 100 - i * 0.5) });
    expect(t.table?.rows.map((r) => r.values)).toEqual([
      ["+5.0%", "-26.0%", "none"],
      ["50.0K", "50.0K", "50.0K"],
      ["7.0M", "7.0M", "7.0M"],
      ["-5.1%", "-20.7%", "-44.5%"],
    ]);
    expect(points("A.", false, null, "B.")).toEqual({ points: ["A.", "B."] });
  });
});

describe("filtered insights", () => {
  const ps = [mkProject({ name: "Big", chain: "Other EVM" }, { tvl: 600 }), mkProject({ name: "Small" }, { tvl: 200 })];
  it("compares against the chain total only when unfiltered", () => {
    const chain = generateInsights(ps, "tvl", { value: countedMetricValue, total: { tvl: 1000 } });
    expect(chain.find((i) => i.id === "leader")?.text ?? chain.map((i) => i.text).join(" ")).toContain("60%");
    const sel = generateInsights(ps, "tvl", { value: countedMetricValue });
    expect(sel.map((i) => i.text).join(" ")).toContain("75%");
    expect(sel.map((i) => i.text).join(" ")).not.toContain("on Base");
  });
});
