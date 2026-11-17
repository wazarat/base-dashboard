import { describe, expect, it } from "vitest";
import { applyFilters, FACETS, filterParsers } from "@/lib/filters";
import { projects } from "@/lib/data";

describe("applyFilters on the real dataset", () => {
  it("returns everything with no filters", () => {
    expect(applyFilters(projects, {})).toHaveLength(1038);
  });
  it("filters by sector and chain", () => {
    const dex = applyFilters(projects, { sector: ["DEXs & Liquidity"] });
    expect(dex).toHaveLength(102);
    const nativeDex = applyFilters(projects, { sector: ["DEXs & Liquidity"], chain: ["Base native"] });
    expect(nativeDex).toHaveLength(30);
  });
  it("matches compound funding types individually", () => {
    const vc = applyFilters(projects, { funding: ["VC-backed"] });
    // Every project listing VC-backed anywhere in a compound cell, not only as its primary type (114).
    expect(vc).toHaveLength(projects.filter((p) => p.fundingTypes.includes("VC-backed")).length);
    expect(vc.length).toBeGreaterThan(projects.filter((p) => p.fundingTypes[0] === "VC-backed").length);
  });
  it("searches name, description and handle", () => {
    expect(applyFilters(projects, { q: "uniswap" }).some((p) => p.name === "Uniswap")).toBe(true);
    expect(applyFilters(projects, { q: "@centralcityai" })).toHaveLength(1);
  });
  it("can return an empty set without throwing", () => {
    expect(applyFilters(projects, { q: "zzzz-no-such-project" })).toEqual([]);
  });
});

describe("global controls", () => {
  it("has no security-risk facet and no global metric", () => {
    expect(FACETS.map((f) => f.key)).toEqual(["sector", "chain", "tier", "status", "funding", "via"]);
    expect(Object.keys(filterParsers)).not.toContain("metric");
    expect(Object.keys(filterParsers)).not.toContain("risk");
    expect(Object.keys(filterParsers)).not.toContain("cols");
  });
});
