import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAddressCounters, parseContracts, parseCounters, parseLine, parseTokenInfo } from "../scripts/fetch/blockscout";
import { parseBreakdown, parseChainTvl, parseOverviewProtocols, parseProtocolTvl, parseProtocols, parseSummaryBreakdown, parseTotalChart } from "../scripts/fetch/defillama";
import { parseOhlcvDay, parseOhlcvHour, parsePools, parseTokens } from "../scripts/fetch/geckoterminal";
import { isBrokenMarket, MARKETS_PAGE, marketsQuery, morphoTotals, parseMarkets } from "../scripts/fetch/morpho";
import { parseMethodology, parseProtocolExtras } from "../scripts/fetch/llama-extras";

const fx = (f: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8"));

describe("defillama parsers", () => {
  it("keeps only Base protocols and reads a Base address only from a base: prefix", () => {
    const p = parseProtocols(fx("defillama/protocols.trimmed.json"));
    expect(p.map((x) => x.slug).sort()).toEqual(["aero-slipstream", "morpho-blue", "uniswap-v3"]);
    const aero = p.find((x) => x.slug === "aero-slipstream")!;
    expect(aero.address).toBe("0x3f5bf3edac59d650d8fdf9657a71f2f904a3a4ee");
    expect(aero.tvl).toBeGreaterThan(1e6);
    // A bare 0x address is the token on Ethereum, never a Base contract.
    expect(p.find((x) => x.slug === "uniswap-v3")!.address).toBeNull();
  });
  it("reads per-protocol TVL for Base only", () => {
    const s = parseProtocolTvl(fx("defillama/protocol-uniswap-v3.trimmed.json"));
    // The live point shares a date with the last midnight point, so 10 raw points dedupe to 9 days.
    expect(s.length).toBe(9);
    expect(s[0][0] < s[8][0]).toBe(true);
    expect(s.at(-1)![1]).toBe(277441028);
  });
  it("turns the chain breakdown into one series per protocol name", () => {
    const m = parseBreakdown(fx("defillama/overview-dexs.trimmed.json"));
    expect(Object.keys(m).sort()).toEqual(["Aerodrome Slipstream", "Uniswap V3", "Uniswap V4"]);
    expect(m["Uniswap V4"].length).toBe(5);
    expect(m["Uniswap V4"].at(-1)![1]).toBe(17047852);
    expect(parseTotalChart(fx("defillama/overview-dexs.trimmed.json")).length).toBe(5);
    expect(parseOverviewProtocols(fx("defillama/overview-dexs.trimmed.json")).map((p) => p.name)).toContain("Aerodrome Slipstream");
  });
  it("sums children of this chain in a per-protocol summary", () => {
    const s = parseSummaryBreakdown({ totalDataChartBreakdown: [[1794096000, { Ethereum: { "Uniswap V3": 5 }, "Base": { "Uniswap V3": 2, "Uniswap V4": 3 } }], [1794009600, { Ethereum: { "Uniswap V3": 1 } }]] });
    expect(s).toEqual([["2026-11-08", 5]]);
  });
  it("parses chain tvl and active users", () => {
    expect(parseChainTvl(fx("defillama/historicalChainTvl.json")).at(-1)![1]).toBe(5197090375);
    expect(parseTotalChart(fx("defillama/active-users.json")).at(-1)![1]).toBe(69985);
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
    expect(p[0].dex).toBe("virtuals-base");
    // The network prefix is stripped, so the address matches data/contracts.csv.
    expect(p[0].quote).toBe("0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b");
    expect(p[0].reserveUsd).toBeGreaterThan(1000);
  });
  it("parses a token with its top pools", () => {
    const { tokens, pools } = parseTokens(fx("geckoterminal/token.json"));
    expect(tokens[0].address).toBe("0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b");
    expect(tokens[0].priceUsd).toBeCloseTo(0.4266, 3);
    expect(tokens[0].topPoolIds.length).toBe(1);
    expect(pools.length).toBe(1);
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
  it("handles null state and leaves broken markets out of the totals", () => {
    const m = parseMarkets(fx("morpho/markets.json"));
    expect(m).toHaveLength(4);
    expect(m.find((x) => x.supplyUsd === null)).toBeDefined();
    const hermes = m.find((x) => x.collateral?.symbol === "HERMES")!;
    expect(isBrokenMarket(hermes)).toBe(true);
    expect(m.filter((x) => isBrokenMarket(x))).toHaveLength(1);
    const totals = morphoTotals(m.filter((x) => !isBrokenMarket(x)));
    expect(totals.supplyUsd).toBeLessThan(1000);
    expect(morphoTotals(m).supplyUsd).toBeGreaterThan(5e8);
    expect(isBrokenMarket({ supplyUsd: 2e6, collateralUsd: null, supplyApy: 0.04 })).toBe(true);
    expect(isBrokenMarket({ supplyUsd: 2e6, collateralUsd: 3e6, supplyApy: 0.04 })).toBe(false);
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
