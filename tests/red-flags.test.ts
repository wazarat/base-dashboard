import { describe, expect, it } from "vitest";
import { projects } from "@/lib/data";
import { flagsBySector, RED_FLAG_TYPES, redFlagCounts, redFlagTypes, securityResearched } from "@/lib/red-flags";
import type { Project } from "@/lib/types";

function mk(partial: Partial<Project> & { name: string }): Project {
  return {
    id: partial.name.toLowerCase().replace(/\s+/g, "-"),
    website: "https://example.com",
    sector: "Launchpads",
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
    fundingType: "Not disclosed",
    fundingTypes: ["Not disclosed"],
    investors: null,
    amountRaised: null,
    amountDisclosed: false,
    token: null,
    tokenRaw: null,
    fundingSourceUrl: null,
    risk: "Unknown",
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
    ...partial,
  };
}

describe("red flag rules", () => {
  it("flags a missing audit from either note, but not an audit that was simply not checked", () => {
    expect(redFlagTypes(mk({ name: "A", audits: "No audit found (quick check)" }))).toContain("noAudit");
    expect(redFlagTypes(mk({ name: "B", redFlags: "No team or audit disclosure found" }))).toContain("noAudit");
    expect(redFlagTypes(mk({ name: "C", audits: "Not checked in this pass", redFlags: "Known team" }))).not.toContain("noAudit");
    expect(redFlagTypes(mk({ name: "D", audits: "Paladin (per Camelot docs Security Measures page)" }))).not.toContain("noAudit");
  });
  it("reads team disclosure and website notes", () => {
    expect(redFlagTypes(mk({ name: "E", redFlags: "Pseudonymous team; no audit found" }))).toEqual(expect.arrayContaining(["teamUnnamed", "noAudit"]));
    expect(redFlagTypes(mk({ name: "F", website: null }))).toContain("noWebsite");
    expect(redFlagTypes(mk({ name: "G", redFlags: "No product website; social/link page only" }))).toContain("noWebsite");
  });
  it("records pauses, shutdowns and impersonation", () => {
    expect(redFlagTypes(mk({ name: "H", status: "Defunct" }))).toContain("pausedOrShutDown");
    expect(redFlagTypes(mk({ name: "I", status: "Mainnet (impaired)" }))).toContain("pausedOrShutDown");
    expect(redFlagTypes(mk({ name: "J", incidents: "Jul 2 2026: an impersonating honeypot token was documented, not the project's own contracts" }))).toEqual(expect.arrayContaining(["impersonation"]));
    expect(redFlagTypes(mk({ name: "J", incidents: "Jul 2 2026: an impersonating honeypot token was documented, not the project's own contracts" }))).not.toContain("pastIncident");
  });
  it("counts a dated incident only when it affected the project itself", () => {
    expect(redFlagTypes(mk({ name: "K", incidents: "Dec 17 2023: pool drained via a bug in a partner bridge" }))).toContain("pastIncident");
    expect(redFlagTypes(mk({ name: "L", incidents: "None found in the sources checked" }))).not.toContain("pastIncident");
    expect(redFlagTypes(mk({ name: "M", incidents: "A caller-reported incident could not be located in any source" }))).not.toContain("pastIncident");
    expect(redFlagTypes(mk({ name: "N", incidents: "Listed among launches flagged on Sep 27 2026; any link to the team is not established" }))).not.toContain("pastIncident");
  });
  it("ignores text on projects that were never researched", () => {
    expect(redFlagTypes(mk({ name: "O", risk: "Not researched", website: null, audits: "No audit found", redFlags: "anonymous team" }))).toEqual([]);
    expect(securityResearched(mk({ name: "P", risk: "Not researched" }))).toBe(false);
  });
  it("aggregates by type and sector", () => {
    const set = [mk({ name: "Q", audits: "No audit found" }), mk({ name: "R", sector: "DEXs & Liquidity", website: null }), mk({ name: "S", risk: "Not researched", website: null })];
    const counts = redFlagCounts(set);
    expect(counts.map((c) => c.type)).toHaveLength(RED_FLAG_TYPES.length);
    expect(counts.find((c) => c.type === "noAudit")?.count).toBe(1);
    expect(counts.find((c) => c.type === "noWebsite")?.count).toBe(1);
    const sectors = flagsBySector(set);
    expect(sectors.map((s) => s.sector).sort()).toEqual(["DEXs & Liquidity", "Launchpads"]);
    expect(sectors.every((s) => s.researched === 1 && s.flagged === 1)).toBe(true);
  });
});

describe("red flags on the real dataset", () => {
  const byName = (n: string) => projects.find((p) => p.name === n)!;
  it("flags only researched projects and finds the known patterns", () => {
    const flagged = projects.filter((p) => redFlagTypes(p).length > 0);
    expect(flagged.every(securityResearched)).toBe(true);
    expect(redFlagCounts(projects).find((c) => c.type === "noAudit")!.count).toBeGreaterThanOrEqual(50);
    expect(redFlagTypes(byName("Moonwell"))).toContain("pastIncident");
    expect(redFlagTypes(byName("Garden"))).toContain("pastIncident");
    expect(redFlagCounts(projects).find((c) => c.type === "pastIncident")!.count).toBeGreaterThanOrEqual(50);
  });
});
