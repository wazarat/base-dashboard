import { describe, expect, it } from "vitest";
import { labelColorFor, relativeLuminance } from "@/lib/color-utils";
import { projects } from "@/lib/data";
import { fitLabel, subcategoryMembers, treemapTable, treemapTiles, UNCLASSIFIED } from "@/lib/treemap";
import type { Project } from "@/lib/types";

function mk(partial: Partial<Project> & { name: string }): Project {
  return {
    id: partial.name.toLowerCase().replace(/\s+/g, "-"),
    website: null,
    sector: "Prediction Markets",
    subcategory: null,
    chain: "Base native",
    chainDetail: null,
    chainConfidence: "High",
    tier: "Not tracked",
    tvl: null,
    volume: null,
    fees: null,
    revenue: null,
    otherTraction: null,
    tractionSources: [],
    fundingType: "Not researched",
    fundingTypes: ["Not researched"],
    investors: null,
    amountRaised: null,
    amountDisclosed: false,
    token: null,
    tokenRaw: null,
    fundingSourceUrl: null,
    risk: "Not researched",
    audits: null,
    incidents: null,
    redFlags: null,
    securitySourceUrl: null,
    description: "",
    status: "Mainnet",
    statusGroup: "Mainnet",
    xHandle: null,
    discoveredVia: "DefiLlama",
    sourceUrl: null,
    hasTraction: partial.tvl != null,
    revenueCapture: null,
    leaderRank: null,
    snapshot: { tvl: null, volume: null, fees: null, revenue: null, tier: "Not tracked", asOf: "2026-11-07" },
    live: null,
    metricSource: { tvl: "none", volume: "none", fees: "none", revenue: "none" },
    contracts: [],
    ...partial,
  };
}

const small: Project[] = [
  mk({ name: "Alpha", subcategory: "Binary", tvl: 800, chain: "Other EVM" }),
  mk({ name: "Beta", subcategory: "Binary", tvl: 200 }),
  mk({ name: "Gamma", subcategory: "Sports" }),
];

describe("treemapTiles", () => {
  it("shows every sector with a value at the root", () => {
    const r = treemapTiles(projects, "count", null);
    expect(r.mode).toBe("sectors");
    expect(r.tiles).toHaveLength(22);
    expect(r.tiles.every((t) => t.kind === "sector")).toBe(true);
  });
  it("groups a sector with three or more subcategories, folding untracked projects into one tile", () => {
    const r = treemapTiles(projects, "volume", "Exchanges & On/Off-Ramps");
    expect(r.mode).toBe("subcategories");
    expect(r.untracked).toBe(30);
    expect(r.tiles.filter((t) => t.kind === "untracked")).toHaveLength(1);
    const tvl = treemapTiles(projects, "tvl", "Exchanges & On/Off-Ramps");
    expect(tvl.tiles.some((t) => t.kind === "subcategory")).toBe(true);
    const inTrackedSubs = tvl.tiles.filter((t) => t.kind === "subcategory").reduce((a, t) => a + t.count, 0);
    expect(tvl.untracked).toBe(32 - inTrackedSubs);
    expect(tvl.untracked).toBeGreaterThan(0);
    const un = tvl.tiles.find((t) => t.kind === "untracked")!;
    expect(un.notToScale).toBe(true);
    expect(un.members).toHaveLength(tvl.untracked);
  });
  it("shows individual projects when a sector has fewer than three subcategories", () => {
    const r = treemapTiles(small, "tvl", "Prediction Markets");
    expect(r.mode).toBe("projects");
    expect(r.tiles.map((t) => t.kind)).toEqual(["project", "project", "untracked"]);
    expect(r.tiles[0].name).toBe("Alpha");
    expect(r.tiles[0].projectId).toBe("alpha");
    expect(r.tiles[2].size).toBeCloseTo(200);
    expect(r.untracked).toBe(1);
  });
  it("never adds an untracked tile for the project count", () => {
    const r = treemapTiles(small, "count", "Prediction Markets");
    expect(r.tiles).toHaveLength(3);
    expect(r.tiles.every((t) => t.kind === "project")).toBe(true);
  });
  it("lists the projects behind one subcategory tile, with Unclassified for projects that have none", () => {
    expect(subcategoryMembers(small, "Prediction Markets", "Binary").map((p) => p.name)).toEqual(["Alpha", "Beta"]);
    expect(subcategoryMembers(small, "Prediction Markets", "Sports").map((p) => p.name)).toEqual(["Gamma"]);
    expect(subcategoryMembers(small, "Launchpads", "Binary")).toEqual([]);
    const loose = [...small, mk({ name: "Delta", subcategory: null })];
    expect(subcategoryMembers(loose, "Prediction Markets", UNCLASSIFIED).map((p) => p.name)).toEqual(["Delta"]);
    // Every subcategory tile on real data stands for exactly the projects its count reports.
    const zoom = treemapTiles(projects, "count", "DEXs & Liquidity");
    for (const tile of zoom.tiles.filter((x) => x.kind === "subcategory")) {
      expect(subcategoryMembers(projects, "DEXs & Liquidity", tile.name)).toHaveLength(tile.count);
    }
  });
  it("returns an empty result for a sector with no matching projects", () => {
    expect(treemapTiles(small, "tvl", "Launchpads").tiles).toEqual([]);
  });
  it("builds a table with the right columns per mode", () => {
    const root = treemapTable(treemapTiles(small, "count", null), "count");
    expect(root.columns.map((c) => c.key)).toEqual(["name", "count", "nativeShare"]);
    const proj = treemapTable(treemapTiles(small, "tvl", "Prediction Markets"), "tvl");
    expect(proj.columns.map((c) => c.key)).toEqual(["name", "subcategory", "count", "withData", "value", "nativeShare"]);
    expect(proj.rows[2]).toMatchObject({ name: "Not tracked", value: null });
    expect(proj.rows[1].subcategory).toBe("Binary");
    expect(treemapTable(treemapTiles([mk({ name: "Solo", tvl: 1 })], "tvl", "Prediction Markets"), "tvl").rows[0].subcategory).toBe(UNCLASSIFIED);
  });
});

describe("fitLabel", () => {
  it("wraps a long sector name to two lines when the tile allows", () => {
    expect(fitLabel("Exchanges & On/Off-Ramps", 120, 60)).toEqual(["Exchanges &", "On/Off-Ramps"]);
  });
  it("truncates with an ellipsis when the words do not fit", () => {
    const lines = fitLabel("Exchanges & On/Off-Ramps", 70, 60);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
    expect(fitLabel("Bridges & Interoperability", 120, 24)).toEqual(["Bridges & Inte…"]);
  });
  it("hides the label on tiles that cannot hold it", () => {
    expect(fitLabel("DEXs & Liquidity", 30, 60)).toEqual([]);
    expect(fitLabel("DEXs & Liquidity", 120, 20)).toEqual([]);
  });
});

describe("label colour by luminance", () => {
  it("measures luminance on the WCAG scale", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1);
    expect(relativeLuminance("#000000")).toBeCloseTo(0);
  });
  it("puts light ink on dark tiles and dark ink on light tiles", () => {
    expect(labelColorFor("#0d366b")).toBe("var(--label-on-dark)");
    expect(labelColorFor("#cde2fb")).toBe("var(--label-on-light)");
    expect(labelColorFor(null)).toBe("var(--label-on-dark)");
  });
});

describe("cleaned subcategories", () => {
  it("leave no Unclassified tile in any sector of the real data", async () => {
    const { countedMetricValue } = await import("@/lib/metrics");
    for (const s of new Set(projects.map((p) => p.sector))) {
      for (const m of ["count", "tvl"] as const) expect(treemapTiles(projects, m, s, countedMetricValue).tiles.map((t) => t.name)).not.toContain(UNCLASSIFIED);
    }
    expect(projects.every((p) => p.subcategory)).toBe(true);
  });
});
