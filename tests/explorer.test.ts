import { describe, expect, it } from "vitest";
import { tierText } from "@/components/atlas/plain-label";
import { investors, projects, rounds } from "@/lib/data";
import { applyMoreFilters, buildContext, describeMoreFilters, NO_MORE_FILTERS, subcategoryOptions, type MoreFilters } from "@/lib/explorer-filters";
import { DEFAULT_EXPLORER_SORT, parseSort, serializeSort } from "@/lib/explorer-sort";
import { applyFilters, searchText } from "@/lib/filters";
import { countedMetricValue } from "@/lib/metrics";
import { tierLabel } from "@/lib/tier";
import { treemapTiles } from "@/lib/treemap";
import { mkProject } from "./fixtures/project";

const ctx = buildContext(rounds);
const more = (f: Partial<MoreFilters>) => applyMoreFilters(projects, { ...NO_MORE_FILTERS, ...f }, ctx);

describe("explorer search", () => {
  const p = mkProject({ name: "Alpha", description: "A lending market", xHandle: "@alphafi", website: "https://alpha.fi", subcategory: "Money markets", token: "ALP", investors: "Pantera Capital" });

  it("matches every searched field", () => {
    for (const q of ["alpha", "lending", "@alphafi", "alpha.fi", "money markets", "alp", "pantera"]) expect(applyFilters([p], { q })).toHaveLength(1);
    expect(applyFilters([p], { q: "nothing like this" })).toHaveLength(0);
  });

  it("finds a project by an investor named only in the rounds file, under either spelling", () => {
    const veranta = projects.find((x) => x.name === "Veranta (formerly Avantis)")!;
    expect(searchText(veranta)).toContain("founders fund");
    const a16z = applyFilters(projects, { q: "a16z crypto" }).map((x) => x.name);
    expect(a16z.length).toBeGreaterThan(0);
  });
});

describe("more filters", () => {
  it("limits subcategory options to the selected sectors", () => {
    const all = subcategoryOptions(projects, []).map((o) => o.value);
    const dex = subcategoryOptions(projects, ["DEXs & Liquidity"]).map((o) => o.value);
    expect(dex).toEqual(["AMM DEXs", "DEX aggregators and routing", "Hooks and DEX infrastructure", "Liquidity management", "Order book DEXs"]);
    expect(all.length).toBe(100);
  });

  it("each filter narrows the list as described", () => {
    expect(more({ xsub: ["AMM DEXs"] }).every((p) => p.subcategory === "AMM DEXs")).toBe(true);
    expect(more({ xtvl: "10m" }).every((p) => (p.tvl ?? 0) >= 10_000_000)).toBe(true);
    expect(more({ xhas: ["fees", "revenue"] }).every((p) => p.fees !== null && p.revenue !== null)).toBe(true);
    expect(more({ xtok: "yes" }).length + more({ xtok: "no" }).length).toBe(projects.length);
    expect(more({ xfund: "yes" }).every((p) => p.fundingType !== "Not disclosed")).toBe(true);
    expect(more({ xfund: "no" })).toHaveLength(74);
    const founders = investors.find((i) => i.name === "Founders Fund")!;
    expect(more({ xinv: founders.id }).map((p) => p.name)).toContain("Veranta (formerly Avantis)");
    expect(more({ xrh: "yes" }).map((p) => p.name)).toContain("Limitless");
  });

  it("describes active filters in one plain line", () => {
    expect(describeMoreFilters({ ...NO_MORE_FILTERS, xsub: ["AMM DEXs"], xtvl: "1m" }, investors)).toBe("Filtered by Subcategory AMM DEXs, Minimum TVL $1M+");
    expect(describeMoreFilters(NO_MORE_FILTERS, investors)).toBeNull();
  });
});

describe("explorer sort", () => {
  it("defaults to TVL descending, then volume, then name, and keeps a clicked sort in the URL", () => {
    expect(parseSort(null)).toEqual(DEFAULT_EXPLORER_SORT);
    expect(DEFAULT_EXPLORER_SORT[0]).toEqual({ id: "tvl", desc: true });
    expect(serializeSort(DEFAULT_EXPLORER_SORT)).toBeNull();
    expect(serializeSort([{ id: "fees", desc: true }])).toBe("fees.desc");
    expect(parseSort("fees.desc")).toEqual([{ id: "fees", desc: true }]);
  });
});

describe("TBD tier label", () => {
  it("shows TBD for untracked projects while the data keeps Not tracked", () => {
    expect(tierLabel("Not tracked")).toBe("TBD");
    expect(tierText("Not tracked")).toBe("TBD");
    expect(tierLabel("Tier 1 - Leader")).toBe("Tier 1 - Leader");
    expect(projects.some((p) => p.tier === "Not tracked")).toBe(true);
    expect(projects.some((p) => (p.tier as string) === "TBD")).toBe(false);
  });
});

describe("explorer map", () => {
  it("covers exactly the rows the table shows for the same filters", () => {
    const rows = applyMoreFilters(applyFilters(projects, { sector: ["DEXs & Liquidity"] }), { ...NO_MORE_FILTERS, xtvl: "100k" }, ctx);
    for (const m of ["count", "tvl"] as const) {
      expect(treemapTiles(rows, m, null, countedMetricValue).tiles.reduce((a, t) => a + t.count, 0)).toBe(rows.length);
    }
    const sub = treemapTiles(rows, "count", "DEXs & Liquidity", countedMetricValue, "AMM DEXs");
    expect(sub.mode).toBe("projects");
    expect(sub.tiles.reduce((a, t) => a + t.count, 0)).toBe(rows.filter((p) => p.subcategory === "AMM DEXs").length);
    expect(new Set(sub.tiles.map((t) => t.size)).size).toBe(1);
  });
});
