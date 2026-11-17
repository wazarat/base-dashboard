import { describe, expect, it } from "vitest";
import { generateInsights } from "@/lib/insights";
import { concentration, nativeShare, sumMetric, topNShare } from "@/lib/metrics";
import type { Project } from "@/lib/types";

function mk(partial: Partial<Project> & { name: string }): Project {
  return {
    id: partial.name.toLowerCase().replace(/\s+/g, "-"),
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
    hasTraction: [partial.tvl, partial.volume, partial.fees, partial.revenue].some((v) => v != null),
    revenueCapture:
      partial.fees != null && partial.revenue != null && partial.fees > 0 ? partial.revenue / partial.fees : null,
    leaderRank: null,
    snapshot: { tvl: null, volume: null, fees: null, revenue: null, tier: "Not tracked", asOf: "2026-11-07" },
    live: null,
    metricSource: { tvl: "none", volume: "none", fees: "none", revenue: "none" },
    contracts: [],
    ...partial,
  };
}

const fixture: Project[] = [
  mk({ name: "Big", chain: "Other EVM", tvl: 800, fees: 100, revenue: 5 }),
  mk({ name: "Mid", chain: "Base native", tvl: 150, fees: 50, revenue: 45 }),
  mk({ name: "Small", chain: "Base native", tvl: 50, fees: 20, revenue: 18 }),
  mk({ name: "Quiet", chain: "Base native", sector: "Launchpads" }),
  mk({ name: "Silent", chain: "Centralized / off-chain", sector: "Launchpads" }),
];

describe("metrics", () => {
  it("sums ignoring nulls and returns null when nothing has data", () => {
    expect(sumMetric(fixture, "tvl")).toBe(1000);
    expect(sumMetric(fixture, "volume")).toBeNull();
    expect(sumMetric(fixture, "count")).toBe(5);
  });
  it("computes concentration shares", () => {
    const c = concentration(fixture, "tvl");
    expect(c.map((p) => p.name)).toEqual(["Big", "Mid", "Small"]);
    expect(topNShare(c, 1)).toBeCloseTo(0.8);
    expect(topNShare(c, 3)).toBeCloseTo(1);
    expect(topNShare([], 3)).toBeNull();
  });
  it("native share treats blanks as missing, not zero", () => {
    expect(nativeShare(fixture, "tvl")).toBeCloseTo(0.2);
    expect(nativeShare(fixture, "volume")).toBeNull();
  });
});

describe("generateInsights", () => {
  it("returns an empty-state sentence for no projects", () => {
    expect(generateInsights([], "tvl")).toEqual([{ id: "empty", text: "No projects match the current filters." }]);
  });
  it("produces 5 to 7 sentences computed from the data", () => {
    const out = generateInsights(fixture, "tvl");
    expect(out.length).toBeGreaterThanOrEqual(4);
    expect(out.length).toBeLessThanOrEqual(7);
    const text = out.map((i) => i.text).join("\n");
    expect(text).toContain("Top 3 projects hold 100% of TVL");
    expect(text).toContain("Big alone is 80% of TVL");
    expect(text).toContain("Base-native projects are 60% of the selection but earn 93% of revenue and hold 20% of TVL");
    expect(text).toContain("3 of 5 projects (60%) have traction");
  });
  it("follows the selected metric", () => {
    const out = generateInsights(fixture, "fees");
    expect(out[0].text).toContain("30d fees");
  });
  it("counts red flags from the research notes instead of rating projects", () => {
    const flagged = mk({ name: "Flagged", fundingType: "VC-backed", fundingTypes: ["VC-backed"], risk: "Unknown", redFlags: "No audit or team disclosure found", audits: "No audit found (quick check)", incidents: "None found", tvl: 10 });
    const clean = mk({ name: "Clean", fundingType: "Bootstrapped", fundingTypes: ["Bootstrapped"], risk: "Low", website: "https://clean.example", audits: "Paladin, 2026", incidents: "None found", redFlags: "Known team", tvl: 5 });
    const out = generateInsights([flagged, clean], "tvl");
    expect(out.find((i) => i.id === "coverage")?.text).toBe("2 of 2 were researched for funding and security; 1 lists at least one red flag.");
    expect(out.map((i) => i.text).join("\n")).not.toContain("High or Medium");
  });
  it("handles a selection with a single project", () => {
    const out = generateInsights([fixture[0]], "tvl");
    expect(out.find((i) => i.id === "native")?.text).toBe("No Base-native projects in this selection.");
  });
});
