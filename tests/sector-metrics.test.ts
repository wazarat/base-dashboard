import { describe, expect, it } from "vitest";
import { HAS_HISTORY } from "./helpers";
import { meta, projects } from "@/lib/data";
import type { LlamaMethodology, MorphoTotalsRow } from "@/lib/history-types";
import { auditedBy, computeMetricFlags, computeSectorMetrics, MORPHO_SLUG, statesZeroRevenue, zeroRevenueReason, type SectorInputStore } from "@/lib/sector-inputs";
import { applies, blockMetrics, headlineOf, headlineTierInput, isMeasured, METRIC_DEFS, resolveMetric, SECTOR_CONFIGS, sectorConfig, sectorLeaders, utilization } from "@/lib/sector-metrics";
import { recomputeTier } from "@/lib/tier";
import { mkProject } from "./fixtures/project";

const END = "2026-11-09";
const liveSource = { tvl: "live", volume: "live", fees: "live", revenue: "live" } as const;
const noSource = { tvl: "none", volume: "none", fees: "none", revenue: "none" } as const;
const emptyStore = (over: Partial<SectorInputStore> = {}): SectorInputStore => ({ extras: { borrowed: {}, staking: {}, pool2: {}, vesting: {} }, methodology: {}, nameOfSlug: new Map(), morphoTotals: [], exclusionOf: new Map(), ...over });

describe("sector metric registry", () => {
  it("has one config per sector in the dataset, with every id defined", () => {
    expect(SECTOR_CONFIGS.map((c) => c.sector).sort()).toEqual([...meta.sectors].sort());
    expect(SECTOR_CONFIGS).toHaveLength(22);
    for (const c of SECTOR_CONFIGS) {
      for (const id of [...c.metrics, ...c.headline]) expect(METRIC_DEFS[id], `${c.sector} ${id}`).toBeDefined();
      // A measured sector names a headline it also lists (or a core fallback); an unmeasured one has none and no tier kind.
      expect(c.headline.length > 0).toBe(c.measured);
      if (!c.measured) expect(c.tierKind).toBe("none");
      for (const id of c.metrics) expect(METRIC_DEFS[id].block).not.toBe("financials");
    }
  });

  it("names eight unmeasured sectors, the ones the Base prompt lists", () => {
    expect(SECTOR_CONFIGS.filter((c) => !c.measured).map((c) => c.sector).sort()).toEqual(["DAOs, Governance & Public Goods", "Data & Analytics", "Ecosystem, Funding & Education", "Exchanges & On/Off-Ramps", "Infrastructure & Dev Tools", "Other", "Security, Risk & Compliance", "Wallets & Custody"]);
    expect(isMeasured({ sector: "A sector the registry has never seen" })).toBe(false);
  });

  it("never names a data source in a label, only in the InfoTip text", () => {
    // Morpho may appear as the place a token is used (posted as Morpho collateral), never as where a figure came from.
    for (const d of Object.values(METRIC_DEFS)) for (const s of [d.label, d.short]) expect(s, d.id).not.toMatch(/DefiLlama|GeckoTerminal|Blockscout|Morpho API|\bAPI\b/);
  });
});

describe("the four states", () => {
  const lender = mkProject({ name: "Lender", sector: "Lending & Credit", tvl: 60, fees: 5, metricSource: { ...noSource, tvl: "live", fees: "live" }, live: { asOf: END } as never, sectorMetrics: { borrowed: { v: 40, asOf: END }, revenueZero: { v: 0, asOf: END, zero: "No revenue for this protocol." } } });

  it("value carries the figure and its day", () => {
    expect(resolveMetric(lender, "borrowed", END)).toMatchObject({ state: "value", value: 40, asOf: END, stale: false });
    expect(resolveMetric(lender, "tvl", END)).toMatchObject({ state: "value", value: 60, asOf: END });
  });

  it("zero by design is a zero with the source's own reason, never Not tracked", () => {
    expect(resolveMetric(lender, "revenue", END)).toMatchObject({ state: "zero-by-design", value: 0, reason: "No revenue for this protocol." });
    // Without the source's statement the same blank is a coverage gap.
    expect(resolveMetric({ ...lender, sectorMetrics: {} }, "revenue", END).state).toBe("not-tracked");
  });

  it("not applicable hides the row, so a lender has no DEX volume line", () => {
    expect(applies(lender, "volume")).toBe(false);
    expect(resolveMetric(lender, "volume", END).state).toBe("not-applicable");
    expect(blockMetrics(lender, "traction", END).map((r) => r.def.id)).toEqual(["deposited", "borrowed", "tvl", "utilization", "fees", "revenue"]);
  });

  it("not tracked is a metric that applies with no figure yet", () => {
    expect(resolveMetric(lender, "deposited", END)).toMatchObject({ state: "not-tracked", value: null });
    // A figure only a paid feed carries is always Not tracked.
    expect(resolveMetric(mkProject({ name: "Perp", sector: "Perps, Options & Derivatives", subcategory: "Perps" }), "perpsVolume", END).state).toBe("not-tracked");
  });

  it("marks a figure more than three days behind the window as stale", () => {
    const old = { ...lender, sectorMetrics: { borrowed: { v: 40, asOf: "2026-11-05" } } };
    expect(resolveMetric(old, "borrowed", END).stale).toBe(true);
    expect(resolveMetric({ ...lender, sectorMetrics: { borrowed: { v: 40, asOf: "2026-11-06" } } }, "borrowed", END).stale).toBe(false);
  });

  it("carries the reason a figure sits outside the chain total", () => {
    expect(resolveMetric({ ...lender, metricFlags: { tvl: "doublecounted" } }, "tvl", END).flag).toBe("doublecounted");
    const bot = mkProject({ name: "Bot", sector: "Trading Tools & Bots", volume: 10, metricSource: { ...noSource, volume: "live" }, live: { asOf: END } as never });
    expect(resolveMetric(bot, "volume", END).flag).toBe("routed");
  });
});

describe("lending math", () => {
  it("utilization is borrowed over TVL plus borrowed", () => {
    expect(utilization(40, 60)).toBeCloseTo(0.4);
    expect(utilization(0, 60)).toBe(0);
    expect(utilization(null, 60)).toBeNull();
    expect(utilization(40, null)).toBeNull();
    expect(utilization(0, 0)).toBeNull();
  });

  it("derives total deposited and utilization from DefiLlama's borrowed series", () => {
    const store = emptyStore({ extras: { borrowed: { lender: [["2026-11-08", 30], [END, 40]] }, staking: {}, pool2: {}, vesting: { lender: [[END, 7]] } } });
    const m = computeSectorMetrics({ tvl: 60, fees: 5, revenue: 1 }, ["lender"], store, END);
    expect(m.borrowed).toEqual({ v: 40, asOf: END });
    expect(m.deposited.v).toBe(100);
    expect(m.utilization.v).toBeCloseTo(0.4);
    expect(m.vesting.v).toBe(7);
    expect(m.revenueZero).toBeUndefined();
  });

  it("uses Morpho's own totals for Morpho, with lending supply as the utilization base", () => {
    const totals: MorphoTotalsRow[] = [["2026-11-10", 524, 474, 538]];
    const store = emptyStore({ morphoTotals: totals, extras: { borrowed: { [MORPHO_SLUG]: [[END, 471]] }, staking: {}, pool2: {}, vesting: {} } });
    const m = computeSectorMetrics({ tvl: 604, fees: 2, revenue: null }, [MORPHO_SLUG], store, END);
    expect(m.deposited.v).toBe(1062);
    expect(m.borrowed.v).toBe(474);
    expect(m.utilization.v).toBeCloseTo(474 / 524);
    // DefiLlama's reading is kept beside it for the source gap check.
    expect(m.borrowedLlama.v).toBe(471);
  });
});

describe("zero by design", () => {
  const meth = (revenue30d: number | null, revenue: string | null): LlamaMethodology => ({ revenue30d, revenue, fees: null });

  it("reads only sentences that say the protocol keeps nothing", () => {
    for (const yes of ["No revenue for Morpho protocol.", "Protocol revenue is 0.", "Zero protocol revenue, all interest goes to lenders."]) expect(statesZeroRevenue(yes), yes).toBe(true);
    for (const no of [
      "From 28 Dec 2025, 17% (0% before) fees on Ethereum shared to buy back and burn UNI.",
      "Yields are collected by curators.",
      "Revenue is disabled for now",
      "Includes swap fees and bribes going to holders",
      "All protocol fees go to the Stryke feeTo address.",
      null,
    ])
      expect(statesZeroRevenue(no), String(no)).toBe(false);
  });

  it("needs fees above zero, a reported zero on every listing, and the sentence", () => {
    const m = { A: meth(0, "No revenue for A."), B: meth(0, null), C: meth(12, "No revenue for C.") };
    expect(zeroRevenueReason(["A"], 100, m)).toBe("No revenue for A.");
    expect(zeroRevenueReason(["A", "B"], 100, m)).toBe("No revenue for A.");
    expect(zeroRevenueReason(["A"], 0, m)).toBeNull();
    expect(zeroRevenueReason(["A"], null, m)).toBeNull();
    expect(zeroRevenueReason(["A", "C"], 100, m)).toBeNull();
    expect(zeroRevenueReason(["B"], 100, m)).toBeNull();
    expect(zeroRevenueReason(["Unlisted"], 100, m)).toBeNull();
  });

  it.skipIf(!HAS_HISTORY)("finds Morpho in the live data and leaves projects with real revenue alone", () => {
    const zero = projects.filter((p) => p.sectorMetrics?.revenueZero);
    expect(zero.map((p) => p.name)).toContain("Morpho");
    for (const p of zero) {
      expect(p.revenue).toBeNull();
      expect(p.fees ?? 0).toBeGreaterThan(0);
      expect(statesZeroRevenue(p.sectorMetrics?.revenueZero.zero)).toBe(true);
    }
  });
});

describe("flags", () => {
  it("leaves a counted figure unflagged and names why an uncounted one is left out", () => {
    const ex = new Map<string, "doublecounted" | "cex" | "chain-income" | null>([["vault", "doublecounted"], ["cex", "cex"], ["amm", null], ["nitro", "chain-income"]]);
    const tvlOf = (s: string) => ({ vault: 90, amm: 10, cex: 5, nitro: 0 })[s] ?? 0;
    expect(computeMetricFlags(mkProject({ name: "A", tvl: 100 }, { tvl: 100 }), ["amm"], tvlOf, ex)).toEqual({});
    expect(computeMetricFlags(mkProject({ name: "B", tvl: 100 }, { tvl: 10 }), ["vault", "amm"], tvlOf, ex)).toEqual({ tvl: "doublecounted" });
    expect(computeMetricFlags(mkProject({ name: "C", tvl: 5 }), ["cex"], tvlOf, ex)).toEqual({ tvl: "cex" });
    expect(computeMetricFlags(mkProject({ name: "D", volume: 50, fees: 2 }, { fees: 2 }), ["amm"], tvlOf, ex)).toEqual({ volume: "outside-total" });
    expect(computeMetricFlags(mkProject({ name: "E", fees: 9 }), ["nitro"], tvlOf, ex)).toEqual({ fees: "chain-income" });
  });

  it("counts audit notes that name a firm, whole words only", () => {
    const ps = [{ name: "Halborn", audits: null }, { name: "X", audits: "Audited by Halborn (2026)" }, { name: "Y", audits: "halbornish review" }, { name: "Z", audits: "Spearbit; Halborn" }];
    expect(auditedBy("Halborn", ps)).toBe(2);
    expect(auditedBy("OZ", ps)).toBe(0);
  });
});

describe("headline ranking and tiers", () => {
  const end = meta.live?.windowEnd ?? null;

  it("ranks every measured sector by its headline, largest first, then the curated rank", () => {
    for (const c of SECTOR_CONFIGS.filter((x) => x.measured)) {
      const ranked = sectorLeaders(projects, c.sector, end);
      const values = ranked.map((r) => r.headline?.value ?? null);
      const firstBlank = values.indexOf(null);
      const withFigure = firstBlank === -1 ? values : values.slice(0, firstBlank);
      expect(withFigure, c.sector).toEqual([...withFigure].sort((a, b) => (b as number) - (a as number)));
      // Once the figures run out, only curated leaders remain, in rank order.
      const rest = firstBlank === -1 ? [] : ranked.slice(firstBlank);
      expect(rest.every((r) => r.headline === null && r.project.leaderRank !== null), c.sector).toBe(true);
      expect(rest.map((r) => r.project.leaderRank)).toEqual([...rest.map((r) => r.project.leaderRank)].sort((a, b) => (a as number) - (b as number)));
      for (const r of ranked) if (r.headline) expect(c.headline).toContain(r.headline.def.id);
    }
  });

  it("ranks unmeasured sectors by the curated rank alone, with no headline", () => {
    for (const c of SECTOR_CONFIGS.filter((x) => !x.measured)) {
      const ranked = sectorLeaders(projects, c.sector, end);
      expect(ranked.every((r) => r.headline === null && r.project.leaderRank !== null), c.sector).toBe(true);
      expect(ranked.map((r) => r.project.leaderRank)).toEqual([...ranked.map((r) => r.project.leaderRank)].sort((a, b) => (a as number) - (b as number)));
    }
  });

  it.skipIf(!HAS_HISTORY)("puts Morpho first in lending by total deposited, above its own TVL", () => {
    const [top] = sectorLeaders(projects, "Lending & Credit", end);
    expect(top.project.name).toBe("Morpho");
    expect(top.headline?.def.id).toBe("deposited");
    expect(top.headline?.value ?? 0).toBeGreaterThan(top.project.tvl ?? 0);
  });

  it("feeds the headline to the same thresholds, deposits like TVL and routed volume like 30-day volume", () => {
    const lender = mkProject({ name: "L", sector: "Lending & Credit", tvl: 40e6, metricSource: { ...noSource, tvl: "live" }, sectorMetrics: { deposited: { v: 60e6, asOf: END } } });
    expect(headlineOf(lender)?.def.id).toBe("deposited");
    expect(headlineTierInput(lender)).toEqual({ tvl: 60e6, volume: null });
    expect(recomputeTier({ ...headlineTierInput(lender), fees: null, revenue: null })).toBe("Tier 1 - Leader");
    const dex = mkProject({ name: "D", sector: "DEXs & Liquidity", volume: 60e6, metricSource: liveSource });
    expect(headlineTierInput(dex)).toEqual({ tvl: null, volume: 60e6 });
  });

  it("never lets holders or an unmeasured sector set a tier, and leaves supply and token volume to the onchain rule", () => {
    const onchain = { asOf: END, stableSupply: 5e8, rwaSupply: null, tokenVolume30d: 9e8, tokenLiquidity: null, holders: 9e5, nftHolders: 9e5, nftTransfers30d: 500, signals: [] };
    expect(headlineTierInput(mkProject({ name: "N", sector: "NFTs, Gaming & Collectibles", onchain }))).toEqual({ tvl: null, volume: null });
    expect(headlineTierInput(mkProject({ name: "S", sector: "Stablecoins & Payments", onchain }))).toEqual({ tvl: null, volume: null });
    expect(headlineTierInput(mkProject({ name: "M", sector: "Memecoins & Community", onchain }))).toEqual({ tvl: null, volume: null });
    expect(headlineTierInput(mkProject({ name: "W", sector: "Wallets & Custody", tvl: 9e9, metricSource: liveSource }))).toEqual({ tvl: null, volume: null });
  });

  it("gives every project in an unmeasured sector the tier Not applicable, and no measured project that tier", () => {
    for (const p of projects) expect(p.tier === "Not applicable", p.name).toBe(!sectorConfig(p.sector).measured);
    expect(meta.tierCounts["Not applicable"]).toBe(projects.filter((p) => !isMeasured(p)).length);
  });

  it.skipIf(!HAS_HISTORY)("keeps sector metrics out of the chain KPIs", () => {
    // Deposits, borrowed and the rest live beside the counted values and never inside them.
    const morpho = projects.find((p) => p.name === "Morpho");
    expect(morpho?.sectorMetrics?.deposited.v ?? 0).toBeGreaterThan(morpho?.counted?.values.tvl ?? 0);
    expect(morpho?.counted?.values.tvl).toBe(morpho?.live?.tvl);
  });
});
