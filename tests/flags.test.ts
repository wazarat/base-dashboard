import { describe, expect, it } from "vitest";
import { adapterDoublecounted, inChainTotal, inDoublecountedBucket, rawAdapterUrl, tvlExclusion } from "@/lib/flags";
import { namesInWindow, parseLiteCharts, parseLitePrevDay } from "../scripts/fetch/defillama";

const GH = "https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/";

describe("adapterDoublecounted", () => {
  it("reads a single-protocol adapter file", () => {
    expect(adapterDoublecounted("module.exports = {\n  doublecounted: true,\n  methodology: 'x',\n}", `${GH}projects/fables/index.js`, "fables/index.js")).toBe(true);
    expect(adapterDoublecounted("module.exports.doublecounted = true", `${GH}projects/mellow/index.js`, null)).toBe(true);
    expect(adapterDoublecounted("module.exports = { doublecounted: false }", `${GH}projects/x/index.js`, null)).toBe(false);
    expect(adapterDoublecounted("module.exports = { methodology: 'no flag' }", `${GH}projects/grove/index.js`, null)).toBe(false);
  });

  it("finds the protocol's own entry in a shared registry", () => {
    const registry = ['const configs = {', '  "alpha": {', '    "doublecounted": true,', '    "ethereum": {}', '  },', '  "beta": {', '    "ethereum": {}', '  },', '}'].join("\n");
    expect(adapterDoublecounted(registry, `${GH}registries/sumTokens.js`, "alpha")).toBe(true);
    expect(adapterDoublecounted(registry, `${GH}registries/sumTokens.js`, "beta")).toBe(false);
    expect(adapterDoublecounted(registry, `${GH}registries/sumTokens.js`, "gamma")).toBeNull();
  });

  it("treats every curator registry entry as double counted, as the curator helper does", () => {
    expect(adapterDoublecounted("const configs = {}", `${GH}registries/curators.js`, "steakhouse")).toBe(true);
  });

  it("builds the raw URL only for DefiLlama adapter links", () => {
    expect(rawAdapterUrl(`${GH}projects/fables/index.js`)).toBe("https://raw.githubusercontent.com/DefiLlama/DefiLlama-Adapters/main/projects/fables/index.js");
    expect(rawAdapterUrl("https://example.com/x.js")).toBeNull();
    expect(rawAdapterUrl(null)).toBeNull();
  });
});

describe("chain-total flags", () => {
  const names = { volume: new Set(["Uniswap V4"]), fees: new Set(["Uniswap V4", "Arbitrum Nitro"]), revenue: new Set<string>() };

  it("orders TVL exclusions chain income, CEX, double counted, locker", () => {
    expect(tvlExclusion({ slug: "arbitrum-nitro", category: "Chain" }, false)).toBe("chain-income");
    expect(tvlExclusion({ slug: "bitget", category: "CEX" }, true)).toBe("cex");
    expect(tvlExclusion({ slug: "steakhouse-financial", category: "Risk Curators" }, null)).toBe("doublecounted");
    expect(tvlExclusion({ slug: "titan-locker", category: "Token Locker" }, true)).toBe("doublecounted");
    expect(tvlExclusion({ slug: "uncx-network-v3", category: "Token Locker" }, false)).toBe("locker");
    expect(tvlExclusion({ slug: "uniswap-v4", category: "Dexs" }, false)).toBeNull();
  });

  it("puts adapter flags and double-counted categories in DefiLlama's bucket, never a CEX", () => {
    expect(inDoublecountedBucket("Dexs", true)).toBe(true);
    expect(inDoublecountedBucket("Yield", false)).toBe(true);
    expect(inDoublecountedBucket("Onchain Capital Allocator", null)).toBe(true);
    expect(inDoublecountedBucket("CEX", true)).toBe(false);
    expect(inDoublecountedBucket("Lending", false)).toBe(false);
  });

  it("counts flows only for names in the chain breakdown, and nothing for chain income", () => {
    expect(inChainTotal({ slug: "uniswap-v4", name: "Uniswap V4", category: "Dexs" }, false, names)).toEqual({ tvl: true, volume: true, fees: true, revenue: false });
    expect(inChainTotal({ slug: "fables", name: "Fables", category: "Dexs" }, true, names)).toEqual({ tvl: false, volume: false, fees: false, revenue: false });
    expect(inChainTotal({ slug: "arbitrum-nitro", name: "Arbitrum Nitro", category: "Foundation" }, false, names)).toEqual({ tvl: false, volume: false, fees: false, revenue: false });
  });
});

describe("DefiLlama lite parsers", () => {
  it("splits gross and double-counted TVL by day", () => {
    const r = parseLiteCharts({ tvl: [["1794096000", 1699691254.4]], doublecounted: [["1794096000", 616312008]] });
    expect(r.gross).toEqual([["2026-11-08", 1699691254]]);
    expect(r.doublecounted).toEqual([["2026-11-08", 616312008]]);
  });

  it("reads each protocol's previous-day TVL on this chain only", () => {
    const m = parseLitePrevDay({ protocols: [{ name: "Morpho Blue", chainTvls: { Base: { tvlPrevDay: 605.4 }, Arbitrum: { tvlPrevDay: 9 } } }, { name: "Other", chainTvls: { Arbitrum: { tvlPrevDay: 1 } } }] });
    expect(Array.from(m.entries())).toEqual([["Morpho Blue", 605]]);
  });

  it("keeps names with a value inside the window", () => {
    const s = namesInWindow({ A: [["2026-11-01", 5]], B: [["2026-09-01", 5]], C: [["2026-11-02", 0]] }, "2026-10-10", "2026-11-08");
    expect(Array.from(s)).toEqual(["A"]);
  });
});
