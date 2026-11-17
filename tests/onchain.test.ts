import { describe, expect, it } from "vitest";
import { isLive } from "@/lib/coverage";
import type { Series, StablecoinRecord, TokenSnapRow } from "@/lib/history-types";
import { kpiValue } from "@/lib/kpi";
import { computeOnchain, onchainSupply, parseStablecoinMap, stablecoinSummary, transfers30d, type OnchainStore } from "@/lib/onchain";
import { higherTier, onchainTier } from "@/lib/tier";
import { CIRCLE_USDC_BASE, guardToken } from "@/lib/token-guard";
import { legacyLive, tractionReasons, TRACTION_RULES } from "@/lib/traction";
import type { ChainData } from "@/lib/types";
import { parseChainChart, parseChainCoins, parseCoinHistory } from "../scripts/fetch/stablecoins";
import { countRecent, parseTokenMeta } from "../scripts/fetch/blockscout-tokens";
import { poolsFor, sumDaily } from "../scripts/fetch/geckoterminal-tokens";
import { mkProject } from "./fixtures/project";

const daily = (start: string, values: number[]): Series =>
  values.map((v, i) => [new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10), v]);

const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const LLAMA = {
  peggedAssets: [
    { id: "286", name: "Global Dollar", symbol: "USDG", pegType: "peggedUSD", price: 1, chainCirculating: { "Base": { current: { peggedUSD: 641_000_000 } }, Ethereum: { current: { peggedUSD: 9e9 } } } },
    { id: "146", name: "Ethena USDe", symbol: "USDe", pegType: "peggedUSD", price: 0.999, chainCirculating: { "Base": { current: { peggedUSD: 369_000_000 } } } },
    { id: "1", name: "Tether", symbol: "USDT", pegType: "peggedUSD", price: 1, chainCirculating: { Ethereum: { current: { peggedUSD: 1e11 } } } },
  ],
};

describe("DefiLlama stablecoins", () => {
  it("takes each coin's value on Base only", () => {
    const coins = parseChainCoins(LLAMA);
    expect(coins.map((c) => c.symbol)).toEqual(["USDG", "USDe"]);
    expect(coins[0].usd).toBe(641_000_000);
    expect(coins[1].usd).toBeCloseTo(369_000_000 * 0.999);
  });

  it("parses the chain chart and a coin's chain history", () => {
    expect(parseChainChart([{ date: "1794182400", totalCirculatingUSD: { peggedUSD: 1_000, peggedEUR: 5 } }])).toEqual([["2026-11-09", 1_005]]);
    const hist = parseCoinHistory({ pegType: "peggedUSD", chainBalances: { "Base": { tokens: [{ date: 1794182400, circulating: { peggedUSD: 100 } }] }, Ink: { tokens: [{ date: 1794182400, circulating: { peggedUSD: 9 } }] } } }, 0.5);
    expect(hist).toEqual([["2026-11-09", 50]]);
  });

  it("maps coins to issuers and reconciles against the chain total", () => {
    const map = parseStablecoinMap([{ "DefiLlama id": "286", Symbol: "USDG", Project: "Paxos", Address: USDG.toUpperCase(), Decimals: "6", Source: "https://docs.paxos.com/x" }]);
    expect(map[0]).toMatchObject({ llamaId: "286", project: "Paxos", address: USDG, decimals: 6 });
    const coins: Record<string, StablecoinRecord> = {
      "286": { id: "286", symbol: "USDG", name: "Global Dollar", pegType: "peggedUSD", series: [["2026-11-08", 641e6]] },
      "336": { id: "336", symbol: "U", name: "United Stables", pegType: "peggedUSD", series: [["2026-11-08", 30e6]] },
    };
    const s = stablecoinSummary(coins, [["2026-11-08", 671e6]], map, new Set(["Paxos"]), "2026-11-08");
    expect(s?.total).toBe(671e6);
    expect(s?.mapped).toBe(641e6);
    expect(s?.coins.find((c) => c.symbol === "U")?.project).toBeNull();
    expect(1 - (s?.mappedShare ?? 0)).toBeLessThan(0.05);
  });
});

describe("spoof guard", () => {
  it("rejects a USDC-named 18-decimal token", () => {
    const meta = { name: "USD Coin", symbol: "USDC", decimals: 18, type: "ERC-20", checked: "2026-11-09" };
    const issues = guardToken({ project: "Circle", address: "0x1111111111111111111111111111111111111111", role: "stablecoin", symbol: "USDC", decimals: 18, name: "USD Coin" }, meta);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.join(" ")).toMatch(/copy/);
  });

  it("accepts Circle's USDC on Base and rejects a USDC-named copy at any other address", () => {
    const meta = { name: "USD Coin", symbol: "USDC", decimals: 6, type: "ERC-20", checked: "2026-11-17" };
    expect(guardToken({ project: "USDC", address: CIRCLE_USDC_BASE, role: "stablecoin", symbol: "USDC", decimals: 6, name: "USD Coin" }, meta)).toEqual([]);
    const copy = guardToken({ project: "USDC", address: "0x2222222222222222222222222222222222222222", role: "stablecoin", symbol: "USDC", decimals: 6, name: "USD Coin" }, meta);
    expect(copy.join(" ")).toMatch(/is a copy/);
  });

  it("rejects decimals or names that contradict the source, and accepts a match", () => {
    const meta = { name: "Global Dollar", symbol: "USDG", decimals: 6, type: "ERC-20", checked: "2026-11-09" };
    expect(guardToken({ project: "Paxos", address: USDG, role: "stablecoin", symbol: "USDG", decimals: 6, name: "Global Dollar" }, meta)).toEqual([]);
    expect(guardToken({ project: "Paxos", address: USDG, role: "stablecoin", symbol: "USDG", decimals: 18, name: null }, meta).length).toBeGreaterThan(0);
    expect(guardToken({ project: "X", address: USDG, role: "project-token", symbol: "ABC", decimals: 6, name: "Something Else" }, meta).length).toBe(2);
    expect(guardToken({ project: "X", address: USDG, role: "nft-collection", symbol: null, decimals: null, name: null }, meta)).toHaveLength(1);
  });
});

const store = (over: Partial<OnchainStore> = {}): OnchainStore => ({ coins: {}, meta: {}, snaps: {}, dex: {}, ...over });

describe("onchain metrics", () => {
  it("gives Paxos supply, holders and a Tier 1 from USDG on the chain", () => {
    const s = store({
      coins: { "286": { id: "286", symbol: "USDG", name: "Global Dollar", pegType: "peggedUSD", series: [["2026-11-08", 641e6]] } },
      snaps: { [USDG]: [["2026-11-08", 446_235, 640e6, 1, 274e6, null]] },
    });
    const o = computeOnchain([], [{ llamaId: "286", symbol: "USDG", project: "Paxos", address: USDG, decimals: 6, source: "" }], s, "2026-11-08");
    expect(o?.stableSupply).toBe(641e6);
    expect(o?.signals[0]).toMatchObject({ kind: "stablecoin", symbol: "USDG", usd: 641e6, holders: 446_235 });
    const paxos = mkProject({ name: "Paxos", sector: "Stablecoins & Payments", onchain: o });
    expect(isLive(paxos)).toBe(true);
    expect(legacyLive(paxos)).toBe(false);
    expect(tractionReasons(paxos)).toEqual(["stablecoin"]);
    expect(onchainTier({ supply: onchainSupply(o), tokenVolume: o?.tokenVolume30d ?? null }, TRACTION_RULES)).toBe("Tier 1 - Leader");
  });

  it("sums 30-day token volume over pools and counts it like volume", () => {
    const tok = "0x2222222222222222222222222222222222222222";
    const o = computeOnchain([{ address: tok, role: "project-token", symbol: "ABC" }], [], store({ dex: { [tok]: { pools: 2, liquidity: [["2026-11-08", 50_000]], volume: daily("2026-10-01", Array(39).fill(10_000)) } } }), "2026-11-08");
    expect(o?.tokenVolume30d).toBe(300_000);
    expect(o?.tokenLiquidity).toBe(50_000);
    expect(tractionReasons(mkProject({ name: "ABC", onchain: o }))).toEqual(["token-volume"]);
    expect(onchainTier({ supply: null, tokenVolume: 60_000_000 }, TRACTION_RULES)).toBe("Tier 2 - Strong");
    // Below the traction rule a metric sets no tier.
    expect(onchainTier({ supply: 900_000, tokenVolume: 90_000 }, TRACTION_RULES)).toBe("Not tracked");
    expect(higherTier("Tier 3 - Emerging", "Tier 1 - Leader")).toBe("Tier 1 - Leader");
  });

  it("needs both 1,000 holders and 100 transfers in 30 days for an NFT collection", () => {
    const nft = "0x3333333333333333333333333333333333333333";
    const rows: TokenSnapRow[] = [["2026-11-08", 35_700, null, null, 90_000, 100]];
    const o = computeOnchain([{ address: nft, role: "nft-collection", symbol: "HASH" }], [], store({ snaps: { [nft]: rows } }), "2026-11-08");
    expect(tractionReasons(mkProject({ name: "Cats", onchain: o }))).toEqual(["nft"]);
    const quiet = computeOnchain([{ address: nft, role: "nft-collection", symbol: "HASH" }], [], store({ snaps: { [nft]: [["2026-11-08", 35_700, null, null, 90_000, 12]] } }), "2026-11-08");
    expect(tractionReasons(mkProject({ name: "Cats", onchain: quiet }))).toEqual([]);
  });

  it("uses the running transfer total once history reaches 30 days back", () => {
    const rows: TokenSnapRow[] = [
      ["2026-10-09", 10, null, null, 1_000, 100],
      ["2026-11-08", 10, null, null, 1_450, 100],
    ];
    expect(transfers30d(rows, "2026-11-08")).toBe(450);
    expect(transfers30d([rows[1]], "2026-11-08")).toBe(100);
  });

  it("keeps stablecoin supply out of the chain TVL KPI", () => {
    const latest = { asOf: "2026-11-08", tvl: 1_073e6, volume30d: 1, fees30d: 1, revenue30d: 1, activeUsers: null, activeAccounts: null, txns: null, change: {} } as unknown as ChainData["latest"];
    const paxos = mkProject({ name: "Paxos", onchain: { asOf: "2026-11-08", stableSupply: 641e6, rwaSupply: null, tokenVolume30d: null, tokenLiquidity: null, holders: null, nftHolders: null, nftTransfers30d: null, signals: [] } });
    expect(kpiValue([paxos], "tvl", true, latest)).toBe(1_073e6);
    expect(kpiValue([paxos], "tvl", false, latest)).toBeNull();
  });
});

describe("fetcher helpers", () => {
  it("reads token identity and counts recent transfers until an older one", () => {
    expect(parseTokenMeta({ name: "Global Dollar", symbol: "USDG", decimals: "6", type: "ERC-20" }, "2026-11-09")).toEqual({ name: "Global Dollar", symbol: "USDG", decimals: 6, type: "ERC-20", checked: "2026-11-09" });
    expect(countRecent([{ timestamp: "2026-11-09T01:00:00Z" }, { timestamp: "2026-10-20T00:00:00Z" }, { timestamp: "2026-10-01T00:00:00Z" }], "2026-10-10")).toEqual({ count: 2, older: true });
  });

  it("sums pools on network robinhood for one token and drops today", () => {
    const tok = "0x2222222222222222222222222222222222222222";
    const pool = (base: string, reserve: number, vol: number) => ({ address: `0x${reserve}`, dex: "uni", name: "x", createdAt: "", base, quote: "0xweth", reserveUsd: reserve, volume24h: vol });
    const r = poolsFor([pool(tok, 5_000, 100), pool(tok, 200, 0), pool("0xother", 9e6, 9e6)], tok, 3);
    expect(r.liquidity).toBe(5_200);
    expect(r.pools).toHaveLength(1);
    expect(sumDaily([[["2026-11-07", 5], ["2026-11-08", 1]], [["2026-11-07", 2]]], "2026-11-08")).toEqual([["2026-11-07", 7]]);
  });
});

describe("onchain copy, KPI and filters", () => {
  const sig = (over: Partial<import("@/lib/onchain").OnchainSignal>) => ({ kind: "stablecoin" as const, symbol: "USDG", usd: 641e6, holders: 446_235, transfers30d: null, address: USDG, sources: [], ...over });
  it("writes one generated line per signal", async () => {
    const { signalSentence } = await import("@/lib/onchain-text");
    expect(signalSentence(sig({}))).toBe("USDG on the chain $641M, 446.2K holders");
    expect(signalSentence(sig({ kind: "token", symbol: "AI", usd: 184_900_000, holders: 59_527 }))).toBe("AI DEX volume on the chain $185M in 30 days, 59.5K holders");
    expect(signalSentence(sig({ kind: "nft", symbol: "HASH", usd: null, holders: 35_700, transfers30d: 100 }))).toBe("HASH collection, 35.7K holders, 100+ transfers in 30 days");
  });

  it("shows DefiLlama's chain total unfiltered and the selected issuers filtered", async () => {
    const { stablecoinKpi } = await import("@/lib/kpi");
    const s = { asOf: "2026-11-08", total: 1_053e6, coins: [{ id: "286", symbol: "USDG", name: "Global Dollar", usd: 626e6, project: "Paxos" }, { id: "146", symbol: "USDe", name: "Ethena USDe", usd: 369e6, project: "Ethena" }, { id: "336", symbol: "U", name: "United Stables", usd: 30e6, project: null }, { id: "340", symbol: "rwaUSDi", name: "x", usd: 3.9e6, project: null }], mapped: 995e6, mappedShare: 0.94 };
    const paxos = mkProject({ name: "Paxos", onchain: { asOf: "2026-11-08", stableSupply: 626e6, rwaSupply: null, tokenVolume30d: null, tokenLiquidity: null, holders: null, nftHolders: null, nftTransfers30d: null, signals: [sig({})] } });
    const all = stablecoinKpi([paxos], true, s);
    expect(all.value).toBe(1_053e6);
    expect(all.info).toContain("USDG $626M, USDe $369M, U $30M");
    expect(all.info).not.toContain("rwaUSDi");
    expect(all.sub).toBe("Tracking 4 coins");
    expect(stablecoinKpi([paxos], false, s).sub).toBe("Tracking 1 issuer");
    expect(stablecoinKpi([paxos], false, s).value).toBe(626e6);
    expect(stablecoinKpi([mkProject({ name: "Other" })], false, s).value).toBeNull();
  });

  it("filters to projects with token or supply data", async () => {
    const { applyMoreFilters, NO_MORE_FILTERS } = await import("@/lib/explorer-filters");
    const paxos = mkProject({ name: "Paxos", onchain: { asOf: "2026-11-08", stableSupply: 1, rwaSupply: null, tokenVolume30d: null, tokenLiquidity: null, holders: null, nftHolders: null, nftTransfers30d: null, signals: [sig({})] } });
    const other = mkProject({ name: "Other" });
    const ctx = { investorProjects: new Map(), relatedProjects: new Set<string>() };
    expect(applyMoreFilters([paxos, other], { ...NO_MORE_FILTERS, xonc: "yes" }, ctx).map((p) => p.name)).toEqual(["Paxos"]);
  });

  it("uses the one traction rule for insights and the leaderboard", async () => {
    const { generateInsights } = await import("@/lib/insights");
    const o = { asOf: "2026-11-08", stableSupply: 641e6, rwaSupply: null, tokenVolume30d: null, tokenLiquidity: null, holders: null, nftHolders: null, nftTransfers30d: null, signals: [sig({})] };
    const ps = [mkProject({ name: "Paxos", sector: "Stablecoins & Payments", onchain: o }), mkProject({ name: "Circle", sector: "Stablecoins & Payments" })];
    expect(generateInsights(ps, "count").find((i) => i.id === "live")?.text).toContain("1 of 2 projects (50%) have traction");
    expect(ps.filter(isLive).map((p) => p.name)).toEqual(["Paxos"]);
  });
});
