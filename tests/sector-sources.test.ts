import { describe, expect, it } from "vitest";
import { mergeVenue, parsePools as parseVenuePools } from "../scripts/fetch/geckoterminal-venues";
import { parseHacks } from "../scripts/fetch/llama-hacks";
import { mergeOverview, overviewUrl } from "../scripts/fetch/llama-overview";
import { parsePools } from "../scripts/fetch/llama-yields";
import { parseVaults, vaultsQuery, VAULTS_PAGE } from "../scripts/fetch/morpho-vaults";
import { SOURCE_IDS, type GeckoVenueRecord, type Series } from "@/lib/history-types";
import { projects } from "@/lib/data";
import { computeSourceMetrics, MORPHO_SLUG, type SourceStore } from "@/lib/sector-inputs";
import { blockMetrics, headlineOf, headlineTierInput, sectorConfig, TIER_SLOT } from "@/lib/sector-metrics";
import { normalizeVenue, parseGeckoDexMap, VENUE_MIN_DAYS, venueMetrics } from "@/lib/venues";
import { mkProject } from "./fixtures/project";

const END = "2026-11-09";
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 1000;
const daily = (from: string, n: number, v: number): Series => Array.from({ length: n }, (_, i) => [new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10), v]);
const emptyStore = (over: Partial<SourceStore> = {}): SourceStore => ({ overview: { aggVolume: {}, bridgeAggVolume: {}, openInterest: {}, optionsNotional: {}, optionsPremium: {} }, overviewNames: {}, yields: null, vaults: null, markets: [], marketsAsOf: null, stockAddresses: new Set(), venues: {}, dexMap: [], ...over });
const noNames = new Map<string, string>();

describe("new sources are registered", () => {
  it("lists each sector metric source once", () => {
    for (const id of ["llama-aggregators", "llama-bridge-aggregators", "llama-open-interest", "llama-options", "llama-hacks", "llama-yields", "morpho-vaults", "geckoterminal-venues"]) expect(SOURCE_IDS).toContain(id);
    expect(new Set(SOURCE_IDS).size).toBe(SOURCE_IDS.length);
  });
});

describe("defillama overviews", () => {
  it("builds the chain URL, with the data type when one is given", () => {
    expect(overviewUrl({ kind: "open-interest", file: "open-interest" })).toBe("https://api.llama.fi/overview/open-interest/base");
    expect(overviewUrl({ kind: "options", dataType: "dailyPremiumVolume", file: "options-premium" })).toBe("https://api.llama.fi/overview/options/base?dataType=dailyPremiumVolume");
  });

  it("keeps today's reading for a level and drops the unfinished day for a flow", () => {
    const incoming = { Arcus: [["2026-11-09", 100], ["2026-11-10", 108]] as Series };
    expect(mergeOverview({}, incoming, "2026-11-10", true).Arcus).toEqual([["2026-11-09", 100], ["2026-11-10", 108]]);
    expect(mergeOverview({}, incoming, "2026-11-10", false).Arcus).toEqual([["2026-11-09", 100]]);
  });

  it("revises the trailing 7 days and freezes older days", () => {
    const existing = { A: [["2026-10-01", 1], ["2026-11-08", 5]] as Series, B: [["2026-11-01", 9]] as Series };
    const merged = mergeOverview(existing, { A: [["2026-10-01", 99], ["2026-11-08", 6]] }, "2026-11-10", false);
    expect(merged.A).toEqual([["2026-10-01", 1], ["2026-11-08", 6]]);
    expect(merged.B).toEqual([["2026-11-01", 9]]);
  });
});

describe("hacks", () => {
  it("keeps incidents that list the chain, newest first, with the number of chains they hit", () => {
    const hacks = parseHacks([
      { date: day("2026-10-13"), name: "Locker V2", classification: "Accounting", technique: "Share accounting", amount: 86_000, chain: ["Ethereum", "Base"], source: "", returnedFunds: null },
      { date: day("2026-10-30"), name: "Agent X", classification: null, technique: null, amount: null, chain: ["Base"] },
      { date: day("2026-09-01"), name: "Elsewhere", amount: 5e6, chain: ["Ethereum"] },
      { name: "No date", chain: ["Base"] },
    ]);
    expect(hacks.map((h) => h.name)).toEqual(["Agent X", "Locker V2"]);
    expect(hacks[1]).toMatchObject({ date: "2026-10-13", amount: 86_000, chains: 2, source: null, returned: null });
    expect(hacks[0]).toMatchObject({ amount: null, chains: 1, classification: null });
  });
});

describe("yield pools", () => {
  it("filters to the chain, turns percent APYs into shares and joins the lending side by pool id", () => {
    const rows = parsePools(
      {
        data: [
          { chain: "Base", project: "morpho-blue", symbol: "STEAKUSDG", tvlUsd: 534e6, apyBase: 3.98, apyReward: 3.04, apy: 7.02, pool: "a" },
          { chain: "Base", project: "layerbank", symbol: "USDG", tvlUsd: 2e6, apyBase: null, apyReward: null, apy: null, pool: "b" },
          { chain: "Ethereum", project: "aave", symbol: "USDC", tvlUsd: 1e9, apy: 4, pool: "c" },
        ],
      },
      [
        { pool: "b", totalSupplyUsd: 3e6, totalBorrowUsd: 1e6, apyBaseBorrow: 5.5, ltv: 0.8 },
        { pool: "c", totalSupplyUsd: 9e9, totalBorrowUsd: 5e9, apyBaseBorrow: 6 },
      ],
    );
    expect(rows.map((r) => r.pool)).toEqual(["a", "b"]);
    expect(rows[0]).toMatchObject({ project: "morpho-blue", apy: 0.0702, apyBase: 0.0398, supplyUsd: null, borrowUsd: null });
    expect(rows[1]).toMatchObject({ apy: null, supplyUsd: 3e6, borrowUsd: 1e6, ltv: 0.8 });
    expect(rows[1].apyBorrow).toBeCloseTo(0.055);
  });
});

describe("morpho vaults", () => {
  it("pages the query and keeps each vault's curator, assets and net APY", () => {
    expect(vaultsQuery(VAULTS_PAGE)).toContain(`first: ${VAULTS_PAGE}, skip: ${VAULTS_PAGE}`);
    const vaults = parseVaults({
      data: {
        vaultV2s: {
          items: [
            { address: "0xAA", name: "Small", symbol: "s", totalAssetsUsd: 10, netApy: 0.1, curators: { items: [] }, asset: null },
            { address: "0xBeEf", name: "Steakhouse USDG", symbol: "steakUSDG", totalAssetsUsd: 534e6, netApy: 0.044, curators: { items: [{ name: "Steakhouse Financial" }] }, asset: { symbol: "USDG", address: "0x5FC5" } },
            { name: "No address" },
          ],
        },
      },
    });
    expect(vaults.map((v) => v.address)).toEqual(["0xbeef", "0xaa"]);
    expect(vaults[0]).toMatchObject({ curators: ["Steakhouse Financial"], assetsUsd: 534e6, netApy: 0.044, asset: { symbol: "USDG", address: "0x5fc5" } });
    expect(() => parseVaults({ errors: [{ message: "bad" }] })).toThrow(/Morpho GraphQL/);
  });
});

describe("trading venues", () => {
  const raw = (address: string, vol: string, liq: string, created: string | null, dex = "pons-v2") => ({ attributes: { address, pool_created_at: created, reserve_in_usd: liq, volume_usd: { h24: vol } }, relationships: { dex: { data: { id: dex } } } });

  it("reads pools with their venue, creation day, 24-hour volume and liquidity", () => {
    const pools = parseVenuePools({ data: [raw("0xAB", "1500.5", "20000", "2026-11-01T10:00:00Z"), raw("0xCD", "", "", null), { attributes: {} }] });
    expect(pools).toEqual([
      { address: "0xab", dex: "pons-v2", created: "2026-11-01", volume24h: 1500.5, liquidity: 20000 },
      { address: "0xcd", dex: "pons-v2", created: null, volume24h: 0, liquidity: 0 },
    ]);
  });

  it("stores the 24-hour volume on the day that just ended, and only the first reading of a day", () => {
    const pools = parseVenuePools({ data: [raw("0xab", "1000", "5000", "2026-11-01T00:00:00Z"), raw("0xcd", "500", "2500", "2026-10-01T00:00:00Z")] });
    const first = mergeVenue(undefined, "pons-v2", "Pons V2", pools, "2026-11-10");
    expect(first.volume).toEqual([["2026-11-09", 1500]]);
    expect(first.liquidity).toEqual([["2026-11-09", 7500]]);
    expect(first.pools).toEqual({ "0xab": "2026-11-01", "0xcd": "2026-10-01" });
    const again = mergeVenue(first, "pons-v2", "Pons V2", parseVenuePools({ data: [raw("0xef", "9", "9", "2026-11-10T01:00:00Z")] }), "2026-11-10");
    expect(again.volume).toEqual([["2026-11-09", 1500]]);
    expect(Object.keys(again.pools)).toHaveLength(3);
  });

  it("stores no daily volume from a run late in the UTC day, only the pools and the liquidity level", () => {
    const pools = parseVenuePools({ data: [raw("0xab", "1000", "5000", "2026-11-01T00:00:00Z")] });
    const late = mergeVenue(undefined, "pons-v2", "Pons V2", pools, "2026-11-10", false);
    expect(late.volume).toEqual([]);
    expect(late.liquidity).toEqual([["2026-11-09", 5000]]);
    expect(Object.keys(late.pools)).toEqual(["0xab"]);
    // The next early run still records that day's volume.
    expect(mergeVenue(late, "pons-v2", "Pons V2", pools, "2026-11-10", true).volume).toEqual([["2026-11-09", 1000]]);
  });

  it("shows a 30-day venue volume only once enough daily readings exist", () => {
    const venue = (volume: Series): GeckoVenueRecord => ({ id: "v", name: "V", volume, liquidity: [[END, 40]], pools: { a: "2026-11-01", b: "2026-09-01", c: "2026-10-11", d: "2026-10-10" } });
    const thin = venueMetrics([venue(daily("2026-11-01", 9, 10))], END);
    expect(thin).toMatchObject({ volume30d: null, days: 9, liquidity: 40, pools: 4, launched30d: 2, asOf: END });
    const full = venueMetrics([venue(daily("2026-10-11", 30, 10))], END);
    expect(full?.volume30d).toBe(300);
    expect(VENUE_MIN_DAYS).toBe(27);
    expect(venueMetrics([{ id: "e", name: "E", volume: [], liquidity: [], pools: {} }], END)).toBeNull();
    expect(venueMetrics([], END)).toBeNull();
  });

  it("parses the venue map and treats an empty project as left out", () => {
    const rows = parseGeckoDexMap([{ Project: "Pons", "Dex id": "pons-v2", "Dex name": "Pons V2", Kind: "launchpad" }, { Project: "", "Dex id": "hoodit", "Dex name": "Hoodit", Kind: "" }, { Project: "X", "Dex id": "", Kind: "dex" }]);
    expect(rows).toEqual([{ project: "Pons", dexId: "pons-v2", dexName: "Pons V2", kind: "launchpad" }, { project: "", dexId: "hoodit", dexName: "Hoodit", kind: "" }]);
  });

  it("normalizes venue names by dropping the chain tag and version words", () => {
    expect(normalizeVenue("Pancakeswap Infinity CLMM (Robinhood)")).toBe("pancakeswap");
    expect(normalizeVenue("Ramses V3 (Robinhood)")).toBe("ramses");
    expect(normalizeVenue("Pons V2 Dex")).toBe("pons");
  });
});

describe("source metrics", () => {
  it("sums routed volume over 30 days and reads open interest on the day, joined through the map's slugs", () => {
    const store = emptyStore({
      overview: { aggVolume: { "Rialto Aggregator": daily("2026-10-11", 30, 8e6) }, bridgeAggVolume: { "LI.FI Bridge Aggregator": daily("2026-10-01", 40, 1e6) }, openInterest: { "Arcus Perps": [["2026-11-08", 100e6], [END, 108e6]], "Arcus Spot": [[END, 2e6]] }, optionsNotional: {}, optionsPremium: {} },
      overviewNames: { "rialto-aggregator": "Rialto Aggregator", "li.fi-bridge-aggregator": "LI.FI Bridge Aggregator" },
    });
    const names = new Map([["arcus-perps", "Arcus Perps"], ["arcus-spot", "Arcus Spot"]]);
    expect(computeSourceMetrics({ name: "Rialto", tokens: [], stables: [] }, ["rialto-aggregator"], noNames, store, END).aggVolume).toEqual({ v: 240e6, asOf: END });
    expect(computeSourceMetrics({ name: "LI.FI", tokens: [], stables: [] }, ["li.fi-bridge-aggregator"], noNames, store, END).bridgeAggVolume.v).toBe(30e6);
    expect(computeSourceMetrics({ name: "Arcus", tokens: [], stables: [] }, ["arcus-perps", "arcus-spot"], names, store, END).openInterest).toEqual({ v: 110e6, asOf: END });
    // A slug with no listing in these overviews adds nothing.
    expect(computeSourceMetrics({ name: "Other", tokens: [], stables: [] }, ["other"], noNames, store, END)).toEqual({});
  });

  it("weights APYs by size and counts a curator's Morpho vaults as double counted", () => {
    const store = emptyStore({
      yields: { asOf: "2026-11-10", pools: [{ pool: "a", project: "lend", symbol: "A", tvlUsd: 300, apyBase: null, apyReward: null, apy: 0.04, supplyUsd: 400, borrowUsd: 100, apyBorrow: 0.06, ltv: null }, { pool: "b", project: "lend", symbol: "B", tvlUsd: 100, apyBase: null, apyReward: null, apy: 0.08, supplyUsd: null, borrowUsd: null, apyBorrow: null, ltv: null }] },
      vaults: { asOf: "2026-11-10", vaults: [{ address: "0x1", name: "V1", symbol: "v1", assetsUsd: 500, netApy: 0.05, curators: ["Curator Co"], asset: null }, { address: "0x2", name: "V2", symbol: "v2", assetsUsd: 500, netApy: 0.03, curators: ["curator co", "Other"], asset: null }] },
    });
    const lend = computeSourceMetrics({ name: "Lend", tokens: [], stables: [] }, ["lend"], noNames, store, END);
    expect(lend.supplyApy.v).toBeCloseTo(0.05);
    expect(lend.netApy.v).toBeCloseTo(0.05);
    expect(lend.borrowApy.v).toBeCloseTo(0.06);
    expect(lend.yieldPools).toEqual({ v: 2, asOf: "2026-11-10" });
    const curator = computeSourceMetrics({ name: "Curator Co", tokens: [], stables: [] }, [], noNames, store, END);
    expect(curator.vaultAssets).toEqual({ v: 1000, asOf: "2026-11-10", flag: "doublecounted" });
    expect(curator.netApy.v).toBeCloseTo(0.04);
    expect(curator.yieldPools.v).toBe(2);
  });

  it("reads Morpho's use of a token by address, and never counts a look-alike as stock collateral", () => {
    const store = emptyStore({
      marketsAsOf: "2026-11-10",
      markets: [
        { loan: "0xusdg", collateral: "0xnvda", supplyUsd: 100, borrowUsd: 60, collateralUsd: 150 },
        { loan: "0xusdg", collateral: "0xrwa", supplyUsd: 50, borrowUsd: 30, collateralUsd: 70 },
        // A look-alike market arrives with its collateral address cleared by the build.
        { loan: "0xusdg", collateral: null, supplyUsd: 10, borrowUsd: 10, collateralUsd: 20 },
      ],
      stockAddresses: new Set(["0xnvda"]),
    });
    expect(computeSourceMetrics({ name: "Morpho", tokens: [], stables: [] }, [MORPHO_SLUG], noNames, store, END).stockBacked).toEqual({ v: 0.6, asOf: "2026-11-10" });
    expect(computeSourceMetrics({ name: "Issuer", tokens: ["0xrwa"], stables: [] }, [], noNames, store, END).morphoCollateral.v).toBe(70);
    expect(computeSourceMetrics({ name: "Paxos", tokens: [], stables: ["0xusdg"] }, [], noNames, store, END).morphoLoan.v).toBe(160);
  });

  it("gives venue volume only to launchpads and agent platforms, and liquidity to any mapped venue", () => {
    const venues = { pad: { id: "pad", name: "Pad", volume: daily("2026-10-11", 30, 1e6), liquidity: [[END, 5e5]] as Series, pools: { a: "2026-11-02" } }, amm: { id: "amm", name: "Amm", volume: daily("2026-10-11", 30, 9e6), liquidity: [[END, 7e6]] as Series, pools: {} } };
    const store = emptyStore({ venues, dexMap: [{ project: "Pad", dexId: "pad", dexName: "Pad", kind: "launchpad" }, { project: "Amm", dexId: "amm", dexName: "Amm", kind: "dex" }] });
    expect(computeSourceMetrics({ name: "Pad", tokens: [], stables: [] }, [], noNames, store, END)).toEqual({ venueVolume: { v: 30e6, asOf: END }, tokensLaunched: { v: 1, asOf: END }, venueLiquidity: { v: 5e5, asOf: END } });
    expect(computeSourceMetrics({ name: "Amm", tokens: [], stables: [] }, [], noNames, store, END)).toEqual({ venueLiquidity: { v: 7e6, asOf: END } });
  });
});

describe("registry with the new sources", () => {
  it("holds open interest to the TVL thresholds and routed or venue volume to the volume thresholds", () => {
    expect(TIER_SLOT).toMatchObject({ openInterest: "tvl", deposited: "tvl", aggVolume: "volume", bridgeAggVolume: "volume", venueVolume: "volume" });
    const perp = mkProject({ name: "Perp", sector: "Perps, Options & Derivatives", tvl: 1e6, metricSource: { tvl: "live", volume: "none", fees: "none", revenue: "none" }, sectorMetrics: { openInterest: { v: 108e6, asOf: END } } });
    expect(headlineOf(perp)?.def.id).toBe("openInterest");
    expect(headlineTierInput(perp)).toEqual({ tvl: 108e6, volume: null });
    const bridge = mkProject({ name: "Agg", sector: "Bridges & Interoperability", sectorMetrics: { bridgeAggVolume: { v: 60e6, asOf: END } } });
    expect(headlineTierInput(bridge)).toEqual({ tvl: null, volume: 60e6 });
    // With no aggregator volume, a bridge falls back to its TVL, held to the TVL thresholds.
    const lock = mkProject({ name: "Lock", sector: "Bridges & Interoperability", tvl: 3e6, metricSource: { tvl: "live", volume: "none", fees: "none", revenue: "none" } });
    expect(headlineTierInput(lock)).toEqual({ tvl: 3e6, volume: null });
  });

  it("prefers a launchpad's own venue volume and falls back to its 30d fees for venues with no GeckoTerminal id", () => {
    const base = { name: "Pad", sector: "Launchpads", volume: 5e6, fees: 2e5, metricSource: { tvl: "none", volume: "live", fees: "live", revenue: "none" } as const };
    expect(headlineOf(mkProject(base))?.def.id).toBe("fees");
    expect(headlineOf(mkProject({ ...base, sectorMetrics: { venueVolume: { v: 9e6, asOf: END } } }))?.def.id).toBe("venueVolume");
    // The venue row reads Not tracked while its month fills up; an optional row with no figure is left off.
    const ids = (p: ReturnType<typeof mkProject>) => blockMetrics(p, "traction", END).map((r) => `${r.def.id}:${r.state}`);
    expect(ids(mkProject(base))).toContain("venueVolume:not-tracked");
    expect(ids(mkProject({ ...base, volume: null, metricSource: { tvl: "none", volume: "none", fees: "none", revenue: "none" } }))).not.toContain("volume:not-tracked");
    expect(sectorConfig("Launchpads").optional).toContain("volume");
  });

  it("flags routed volume and curator vault assets wherever they appear", () => {
    const router = mkProject({ name: "Router", sector: "DEXs & Liquidity", sectorMetrics: { aggVolume: { v: 5e8, asOf: END } } });
    expect(headlineOf(router)).toMatchObject({ def: { id: "aggVolume" }, flag: "routed" });
    for (const p of projects.filter((x) => x.sectorMetrics?.vaultAssets)) expect(p.sectorMetrics?.vaultAssets.flag, p.name).toBe("doublecounted");
  });

  it("keeps every new figure out of the chain KPIs", () => {
    for (const p of projects.filter((x) => x.sectorMetrics)) {
      // Counted values still come only from the four core metrics DefiLlama includes in its chain totals.
      expect(Object.keys(p.counted?.values ?? { tvl: 0, volume: 0, fees: 0, revenue: 0 }).sort()).toEqual(["fees", "revenue", "tvl", "volume"]);
    }
  });
});
