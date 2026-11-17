import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HAS_HISTORY } from "./helpers";
import { parseAddressCounters, parseContracts, parseCounters, parseLine, parseTokenInfo } from "../scripts/fetch/blockscout";
import { parseBreakdown, parseChainTvl, parseOverviewProtocols, parseProtocolTvl, parseProtocols, parseSummaryBreakdown, parseTotalChart } from "../scripts/fetch/defillama";
import { parseOhlcvDay, parseOhlcvHour, parsePools, parseTokens } from "../scripts/fetch/geckoterminal";
import { attachToStocks, MARKETS_PAGE, marketsQuery, morphoTotals, parseMarkets } from "../scripts/fetch/morpho";
import { parseMethodology, parseProtocolExtras } from "../scripts/fetch/llama-extras";
import { parseAssets, parsePrices, stockTokensCsvRows } from "../scripts/fetch/robinhood";

const fx = (f: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8"));

describe("defillama parsers", () => {
  it.skipIf(!HAS_HISTORY)("keeps only Base protocols and strips the chain prefix from addresses", () => {
    const p = parseProtocols(fx("defillama/protocols.trimmed.json"));
    expect(p.map((x) => x.slug)).toContain("fables");
    expect(p.some((x) => x.slug === "uniswap-v3")).toBe(true);
    const raw = fx("defillama/protocols.trimmed.json") as Array<{ slug: string; chains: string[] }>;
    expect(p.length).toBe(raw.filter((x) => x.chains.includes("Base")).length);
    expect(p.some((x) => !raw.find((r) => r.slug === x.slug)!.chains.includes("Base"))).toBe(false);
    const fables = p.find((x) => x.slug === "fables")!;
    expect(fables.address).toBe("0xb63d07cef74be747231d601bb2faa6b252c68106");
    expect(fables.tvl).toBeGreaterThan(1e6);
    expect(p.find((x) => x.slug === "uniswap-v3")!.address).toBeNull();
  });
  it.skipIf(!HAS_HISTORY)("reads per-protocol TVL for the chain only", () => {
    const s = parseProtocolTvl(fx("defillama/protocol-uniswap-v3.trimmed.json"));
    // the live point shares a date with the last midnight point, so 10 raw points dedupe to 9 days
    expect(s.length).toBe(9);
    expect(s[0][0] < s[8][0]).toBe(true);
    expect(s.at(-1)![1]).toBe(78476617);
  });
  it("turns the chain breakdown into one series per protocol name", () => {
    const m = parseBreakdown(fx("defillama/overview-dexs.trimmed.json"));
    // Fables is absent from the chain breakdown (covered by the per-protocol summary fallback instead)
    expect(Object.keys(m).sort()).toEqual(["Uniswap V3", "Uniswap V4", "up v3"]);
    expect(m["Uniswap V4"].length).toBe(5);
    expect(m["Uniswap V4"].at(-1)![1]).toBe(151154388);
    expect(parseTotalChart(fx("defillama/overview-dexs.trimmed.json")).length).toBe(5);
    expect(parseOverviewProtocols(fx("defillama/overview-dexs.trimmed.json")).map((p) => p.name)).toContain("Fables");
  });
  it("sums children of this chain in a per-protocol summary", () => {
    const s = parseSummaryBreakdown({ totalDataChartBreakdown: [[1794096000, { Ethereum: { "Uniswap V3": 5 }, "Base": { "Uniswap V3": 2, "Uniswap V4": 3 } }], [1794009600, { Ethereum: { "Uniswap V3": 1 } }]] });
    expect(s).toEqual([["2026-11-08", 5]]);
  });
  it("parses chain tvl and active users", () => {
    expect(parseChainTvl(fx("defillama/historicalChainTvl.json")).at(-1)![1]).toBe(1075753352);
    expect(parseTotalChart(fx("defillama/active-users.json")).at(-1)![1]).toBe(68045);
  });
});

describe("blockscout parsers", () => {
  it("drops approximate days and coerces strings", () => {
    const s = parseLine(fx("blockscout/lines-activeAccounts.json"));
    expect(s[0]).toEqual(["2026-04-30", 6]);
    expect(s.length).toBe(4);
    expect(s.some(([d]) => d === "2026-11-08")).toBe(false);
  });
  it("parses counters, address counters, token info", () => {
    expect(parseCounters(fx("blockscout/counters.json")).totalAccounts).toBe(19011062);
    expect(parseAddressCounters(fx("blockscout/address-counters.json"))).toEqual({ txns: 12345, tokenTransfers: 678, gasUsed: 9999999, validations: 0 });
    const t = parseTokenInfo(fx("blockscout/token.json"));
    expect(t.holders).toBe(4210);
    expect(t.totalSupply).toBeCloseTo(93815.35, 1);
  });
  it("filters contract rows to valid addresses", () => {
    expect(parseContracts([{ Project: "A", Address: "0xD0601ce157Db5bdc3162bbac2a2c8af5320d9eec", Role: "Token" }, { Project: "B", Address: "nope" }])).toEqual([
      { project: "A", address: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", role: "token", source: "", verified: "" },
    ]);
  });
});

describe("geckoterminal parsers", () => {
  it("parses pools with dex and token sides", () => {
    const p = parsePools(fx("geckoterminal/pools.json"));
    expect(p.length).toBe(5);
    expect(p[0].dex).toBe("long-xyz");
    expect(p[0].quote).toBe("0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec");
    expect(p[0].reserveUsd).toBeGreaterThan(1e6);
  });
  it("parses a token with its top pools", () => {
    const { tokens, pools } = parseTokens(fx("geckoterminal/token.json"));
    expect(tokens[0].address).toBe("0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec");
    expect(tokens[0].priceUsd).toBeCloseTo(187.26, 1);
    expect(tokens[0].topPoolIds.length).toBe(3);
    expect(pools.length).toBeLessThanOrEqual(3);
  });
  it("orders candles oldest first and maps to UTC days", () => {
    const c = parseOhlcvDay(fx("geckoterminal/ohlcv-day.json"));
    expect(c.length).toBe(5);
    expect(c[0][0] < c[4][0]).toBe(true);
    expect(c[4][0]).toBe("2026-11-08");
    const h = parseOhlcvHour(fx("geckoterminal/ohlcv-hour.json"));
    expect(h.length).toBe(5);
    expect(h[0][0]).toBeLessThan(h[4][0]);
  });
});

describe("morpho", () => {
  it("handles null state and attaches collateral by address only", () => {
    const m = parseMarkets(fx("morpho/markets.json"));
    expect(m.length).toBeGreaterThanOrEqual(3);
    const amzn = m.find((x) => x.collateral?.symbol === "AMZN")!;
    expect(amzn.collateral!.address).toBe("0x12f190a9f9d7d37a250758b26824b97ce941bf54");
    const { perSymbol, lookAlikes } = attachToStocks(m, new Map([[amzn.collateral!.address, "AMZN"]]), new Set(["AMZN", "TSLA"]));
    expect(perSymbol.has("AMZN")).toBe(true);
    expect(lookAlikes.some((l) => l.collateral?.symbol === "TSLAon")).toBe(true);
  });
});

describe("robinhood", () => {
  it("parses assets on chain 4663 with lowercase addresses and numeric multipliers", () => {
    const t = parseAssets(fx("robinhood/assets.trimmed.json"));
    expect(t.map((x) => x.symbol)).toEqual(["CRM", "NVDA", "TSLA"]);
    const nvda = t.find((x) => x.symbol === "NVDA")!;
    expect(nvda.address).toBe("0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec");
    expect(nvda.multiplier).toBeGreaterThan(0.9);
    expect(nvda.tradingCapabilities.market).toBe(true);
    const rows = stockTokensCsvRows({ fetchedAt: "", tokens: Object.fromEntries(t.map((x) => [x.symbol, x])) });
    expect(rows[0].Ticker).toBe("CRM");
    expect(rows[0].Verified).toBe("Yes");
  });
  it("parses quotes and returns null for empty", () => {
    expect(parsePrices(fx("robinhood/prices-nvda.json"))!.tokenBid).toBeCloseTo(188.85, 1);
    expect(parsePrices(fx("robinhood/prices-empty.json"))).toBeNull();
  });
});

describe("defillama extras", () => {
  const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 1000;

  it("reads the borrowed, staking and vesting series beside a protocol's TVL, for this chain only", () => {
    const json = {
      chainTvls: {
        "Base": { tvl: [{ date: day("2026-11-09"), totalLiquidityUSD: 604e6 }] },
        "Base-borrowed": { tvl: [{ date: day("2026-11-08"), totalLiquidityUSD: 470e6 }, { date: day("2026-11-09"), totalLiquidityUSD: 471.4e6 }] },
        "Base-vesting": { tvl: [{ date: day("2026-11-09"), totalLiquidityUSD: 418_505.4 }] },
        "Ethereum-borrowed": { tvl: [{ date: day("2026-11-09"), totalLiquidityUSD: 9e9 }] },
        borrowed: { tvl: [{ date: day("2026-11-09"), totalLiquidityUSD: 9.5e9 }] },
      },
    };
    const extras = parseProtocolExtras(json, "Base");
    expect(Object.keys(extras).sort()).toEqual(["borrowed", "vesting"]);
    expect(extras.borrowed).toEqual([["2026-11-08", 470e6], ["2026-11-09", 471.4e6]]);
    expect(extras.vesting).toEqual([["2026-11-09", 418_505]]);
    expect(parseProtocolExtras({}, "Base")).toEqual({});
  });

  it("keeps each listing's 30-day revenue and the methodology sentence behind it", () => {
    const m = parseMethodology({
      protocols: [
        { name: "Morpho Blue", total30d: 0, methodology: { Fees: "Total borrow interest paid by borrowers.", Revenue: "No revenue for Morpho protocol.", ProtocolRevenue: "No revenue for Morpho protocol." } },
        { displayName: "Fee Only", total30d: 12.5, methodology: { ProtocolRevenue: "A tenth of fees." } },
        { name: "Bare" },
        { total30d: 1 },
      ],
    });
    expect(m["Morpho Blue"]).toEqual({ revenue30d: 0, revenue: "No revenue for Morpho protocol.", fees: "Total borrow interest paid by borrowers." });
    expect(m["Fee Only"]).toEqual({ revenue30d: 12.5, revenue: "A tenth of fees.", fees: null });
    expect(m.Bare).toEqual({ revenue30d: null, revenue: null, fees: null });
    expect(Object.keys(m)).toHaveLength(3);
  });
});

describe("morpho totals", () => {
  it("pages past the first 500 markets and sums supply, borrowed and collateral", () => {
    expect(marketsQuery(0)).toContain(`first: ${MARKETS_PAGE}, skip: 0`);
    expect(marketsQuery(MARKETS_PAGE)).toContain(`skip: ${MARKETS_PAGE}`);
    const mk = (supplyUsd: number | null, borrowUsd: number | null, collateralUsd: number | null) => ({ marketId: "m", lltv: null, loan: null, collateral: null, supplyUsd, borrowUsd, collateralUsd });
    expect(morphoTotals([mk(100.4, 90, 120), mk(50, null, 60.4), mk(null, null, null)])).toEqual({ supplyUsd: 150, borrowUsd: 90, collateralUsd: 180 });
  });
});
