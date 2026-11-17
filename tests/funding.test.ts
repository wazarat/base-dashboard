import { describe, expect, it } from "vitest";
import { projects } from "@/lib/data";
import { fundingCounts, fundingSlices } from "@/lib/funding";
import type { Project } from "@/lib/types";

function mk(name: string, fundingType: string, fundingTypes: string[] = [fundingType]): Project {
  return {
    id: name.toLowerCase(),
    name,
    website: null,
    sector: "DEXs & Liquidity",
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
    fundingType,
    fundingTypes,
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
    hasTraction: false,
    revenueCapture: null,
    leaderRank: null,
    snapshot: { tvl: null, volume: null, fees: null, revenue: null, tier: "Not tracked", asOf: "2026-11-07" },
    live: null,
    metricSource: { tvl: "none", volume: "none", fees: "none", revenue: "none" },
    contracts: [],
  };
}

const fixture: Project[] = [
  mk("A", "VC-backed"),
  mk("B", "VC-backed"),
  mk("C", "Corporate/parent; VC-backed", ["Corporate/parent", "VC-backed"]),
  mk("D", "Acquired"),
  mk("E", "Angel/pre-seed"),
  mk("F", "Not disclosed"),
  mk("G", "Not researched"),
  mk("H", "Not researched"),
];

describe("funding donut grouping", () => {
  it("keeps undisclosed and unresearched projects out of the donut", () => {
    const slices = fundingSlices(fixture);
    expect(slices.map((s) => s.name)).toEqual(["VC-backed", "Corporate/parent", "Acquired", "Other"]);
    expect(slices.map((s) => s.value)).toEqual([2, 1, 1, 1]);
    expect(slices.some((s) => s.name === "Not disclosed" || s.name === "Not researched")).toBe(false);
  });
  it("counts each coverage state once and words the line", () => {
    const c = fundingCounts(fixture);
    expect(c).toEqual({ total: 8, researched: 6, disclosed: 5, notDisclosed: 1, notResearched: 2 });
  });
  it("matches the funding research on the real dataset, by primary type", () => {
    const c = fundingCounts(projects);
    expect(c.total).toBe(1038);
    expect(c.notResearched).toBe(708);
    const byPrimary: Record<string, number> = {};
    for (const p of projects) byPrimary[p.fundingTypes[0] ?? p.fundingType] = (byPrimary[p.fundingTypes[0] ?? p.fundingType] ?? 0) + 1;
    expect(byPrimary).toEqual({
      "Not researched": 708,
      "VC-backed": 187,
      "Not disclosed": 74,
      "Token-funded": 31,
      "Corporate/parent": 16,
      "Grant/Program": 13,
      Acquired: 6,
      "Public company/subsidiary": 1,
      "Token/DAO treasury": 1,
      "Angel/pre-seed": 1,
    });
    expect(fundingSlices(projects).reduce((a, s) => a + s.value, 0)).toBe(c.disclosed);
  });
});
