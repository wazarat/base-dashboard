import { describe, expect, it } from "vitest";
import { bizCounts, bizPoints } from "@/components/charts/business-model-scatter";
import { listedVsLiveRows } from "@/components/charts/listed-vs-live";
import { TRACKED_TIERS, tierRows } from "@/components/charts/tier-by-sector";
import { TIER_LINES } from "@/components/atlas/tier-info";
import { isLive } from "@/lib/coverage";
import { projects } from "@/lib/data";
import { mkProject } from "./fixtures/project";

describe("tier distribution", () => {
  it("drops Not tracked and sorts sectors by tracked count", () => {
    const rows = tierRows([
      mkProject({ name: "A", sector: "S1", tier: "Tier 1 - Leader" }),
      mkProject({ name: "B", sector: "S2", tier: "Tier 3 - Emerging" }),
      mkProject({ name: "C", sector: "S2", tier: "Tier 2 - Strong" }),
      mkProject({ name: "D", sector: "S3", tier: "Not tracked" }),
    ]);
    expect(TRACKED_TIERS).not.toContain("Not tracked");
    expect(rows.map((r) => [r.sector, r.total])).toEqual([["S2", 2], ["S1", 1]]);
    expect(rows.flatMap((r) => Object.keys(r))).not.toContain("Not tracked");
  });

  it("explains each tier from the thresholds in code", () => {
    expect(TIER_LINES.map((t) => t.rule)).toEqual([
      "TVL of $50M or more, or 30-day DEX volume of $500M or more, or 30-day fees of $1M or more.",
      "TVL of $2M or more, or 30-day volume of $50M or more, or 30-day fees of $100K or more.",
      "Any tracked TVL, volume, fees or revenue below Tier 2.",
    ]);
  });
});

describe("business model points", () => {
  const ps = [
    mkProject({ name: "Dex", sector: "DEXs", biz: { d7: { fees: 10, revenue: 1 }, d30: { fees: 100, revenue: 10 } } }),
    mkProject({ name: "Perp", sector: "Perps", chain: "Other EVM", biz: { d30: { fees: 50, revenue: 45 } } }),
    mkProject({ name: "Broken", sector: "Perps", biz: { d30: { fees: 10, revenue: 20, error: true } } }),
    mkProject({ name: "FeesOnly", sector: "DEXs" }, { fees: 99 }),
  ];

  it("recomputes for the picked window and honours the sector and chain filters", () => {
    expect(bizPoints(ps, "d30").map((x) => x.p.name)).toEqual(["Dex", "Perp"]);
    expect(bizPoints(ps, "d7").map((x) => x.p.name)).toEqual(["Dex"]);
    expect(bizPoints(ps, "d30", [], ["Perps"]).map((x) => x.p.name)).toEqual(["Perp"]);
    expect(bizPoints(ps, "d30", ["Base native"]).map((x) => x.p.name)).toEqual(["Dex"]);
  });

  it("counts plotted, fees-only and data-error projects for the InfoTip", () => {
    expect(bizCounts(ps, "d30")).toEqual({ plotted: 2, feesOnly: 1, errors: 1 });
  });

  it("never plots Arbitrum Nitro, which is chain income", () => {
    expect(bizPoints(projects, "d30").some((x) => x.p.name === "Arbitrum")).toBe(false);
  });
});

describe("listed vs live", () => {
  it("bars and subtitle share one definition", () => {
    const rows = listedVsLiveRows(projects);
    expect(rows.reduce((a, r) => a + r.live, 0)).toBe(projects.filter(isLive).length);
    expect(rows.reduce((a, r) => a + r.listed, 0)).toBe(projects.length);
  });
});
