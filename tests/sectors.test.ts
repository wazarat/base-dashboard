import { describe, expect, it } from "vitest";
import { CARD_LEADERS, nativeText, sectorCards } from "@/components/charts/sector-grid";
import { isLive } from "@/lib/coverage";
import { projects } from "@/lib/data";
import { sectorConfig, sectorLeaders } from "@/lib/sector-metrics";
import { mkProject } from "./fixtures/project";

describe("sector cards", () => {
  it("counts projects and Base native as a count with its share, largest sector first", () => {
    const ps = [
      mkProject({ name: "A", sector: "DEXs & Liquidity", hasTraction: true }),
      mkProject({ name: "B", sector: "DEXs & Liquidity", chain: "Other EVM" }),
      mkProject({ name: "C", sector: "DEXs & Liquidity" }),
      mkProject({ name: "D", sector: "Wallets & Custody" }),
    ];
    const cards = sectorCards(ps, null);
    expect(cards.map((c) => c.sector)).toEqual(["DEXs & Liquidity", "Wallets & Custody"]);
    expect(cards[0]).toMatchObject({ sector: "DEXs & Liquidity", measured: true, count: 3, native: 2 });
    expect(cards[1].measured).toBe(false);
    expect(nativeText(cards[0])).toBe("2 (67%)");
    // The With traction stat is gone from the cards (docs/SECTOR-METRICS.md, section 1b).
    expect(cards[0]).not.toHaveProperty("live");
  });

  it("ranks a measured sector's three leaders by its headline metric and shows the figure with its label", () => {
    const dex = (name: string, volume: number | null, leaderRank: number | null = null) => mkProject({ name, sector: "DEXs & Liquidity", volume, leaderRank, metricSource: { tvl: "none", volume: volume === null ? "none" : "live", fees: "none", revenue: "none" } });
    const ps = [dex("Small", 5e6, 1), dex("Big", 9e9), dex("Mid", 2e8, 3), dex("Curated only", null, 2), dex("Unranked", null)];
    const [card] = sectorCards(ps, null);
    expect(card.leaders.map((l) => l.name)).toEqual(["Big", "Mid", "Small"]);
    expect(card.leaders[0]).toMatchObject({ figure: "$9.0B", label: "30d volume", role: null });
    // A filter that drops the leader moves the next one up; a curated leader with no figure fills in after the measured ones.
    expect(sectorCards(ps.filter((p) => p.name !== "Big"), null)[0].leaders.map((l) => l.name)).toEqual(["Mid", "Small", "Curated only"]);
  });

  it("ranks an unmeasured sector by the curated rank and shows the role in place of a figure", () => {
    const w = (name: string, leaderRank: number | null, subcategory: string) => mkProject({ name, sector: "Wallets & Custody", leaderRank, subcategory, tvl: 5e6 });
    const [card] = sectorCards([w("Third", 3, "Hardware wallets"), w("First", 1, "Wallets"), w("Not curated", null, "Wallets"), w("Second", 2, "Custody and wallet infrastructure")], null);
    expect(card.leaders.map((l) => l.name)).toEqual(["First", "Second", "Third"]);
    expect(card.leaders.map((l) => l.role)).toEqual(["Wallets", "Custody and wallet infrastructure", "Hardware wallets"]);
    expect(card.leaders.every((l) => l.figure === null && l.label === null)).toBe(true);
  });

  it("covers every project, and every card lists the top of the registry's ranking", () => {
    const cards = sectorCards(projects);
    expect(cards).toHaveLength(22);
    expect(cards.reduce((a, c) => a + c.count, 0)).toBe(projects.length);
    for (const c of cards) {
      expect(c.measured).toBe(sectorConfig(c.sector).measured);
      const ranked = sectorLeaders(projects, c.sector);
      expect(c.leaders.map((l) => l.id)).toEqual(ranked.slice(0, CARD_LEADERS).map((l) => l.project.id));
      // Measured sectors show a figure or Not tracked, never a role; unmeasured sectors never show a figure.
      for (const l of c.leaders) expect(c.measured ? l.role : l.figure).toBeNull();
    }
  });

  it("uses one live definition, DefiLlama metric or a sourced signal", () => {
    expect(isLive(mkProject({ name: "X", otherTraction: "signal", tractionSources: ["https://x.com/someone"] }))).toBe(false);
    expect(isLive(mkProject({ name: "Y", otherTraction: "signal", tractionSources: ["https://x.com/someone/status/123"] }))).toBe(true);
  });
});
