import { describe, expect, it } from "vitest";
import type { LlamaProtocolSnap } from "@/lib/history-types";
import { groupExclusions, reconcile, reconcileFlow, reconcileTvl } from "@/lib/reconcile";

const END = "2026-11-08";

function snap(slug: string, name: string, category: string, tvl: number, flags: Partial<LlamaProtocolSnap>): LlamaProtocolSnap {
  return {
    slug,
    name,
    parentProtocol: null,
    category,
    address: null,
    tvl,
    mcap: null,
    geckoId: null,
    url: null,
    kinds: ["tvl", "dexs", "fees"],
    tvlPrevDay: [END, tvl],
    inChainTotal: { tvl: true, volume: true, fees: true, revenue: true },
    doublecounted: false,
    tvlExclusion: null,
    chainIncome: false,
    ...flags,
  };
}

const protocols = [
  snap("morpho-blue", "Morpho Blue", "Lending", 600, {}),
  snap("uniswap-v4", "Uniswap V4", "Dexs", 400, {}),
  snap("steakhouse-financial", "Steakhouse Financial", "Risk Curators", 530, { doublecounted: true, tvlExclusion: "doublecounted", inChainTotal: { tvl: false, volume: false, fees: false, revenue: false } }),
  snap("uncx-network-v3", "UNCX Network V3", "Token Locker", 10, { tvlExclusion: "locker", inChainTotal: { tvl: false, volume: false, fees: false, revenue: false } }),
  snap("bitget", "Bitget", "CEX", 34, { tvlExclusion: "cex", inChainTotal: { tvl: false, volume: false, fees: false, revenue: false } }),
  snap("fables", "Fables", "Dexs", 0, { inChainTotal: { tvl: false, volume: false, fees: false, revenue: false } }),
];

// 30 days ending Nov 8: Oct 10 to Oct 31, then Nov 1 to Nov 8.
const window = (v: number): Array<[string, number]> => [...Array.from({ length: 22 }, (_, i) => [`2026-10-${String(10 + i)}`, v] as [string, number]), ...Array.from({ length: 8 }, (_, i) => [`2026-11-0${i + 1}`, v] as [string, number])];

describe("reconcileTvl", () => {
  it("passes when counted TVL matches the chain and the excluded part matches DefiLlama's double count", () => {
    // DefiLlama counts lockers in chain TVL but not CEX deposits; the Atlas also leaves lockers out.
    const r = reconcileTvl(protocols, [[END, 1010]], [[END, 530]], END);
    expect(r.checks.map((c) => c.ok)).toEqual([true, true]);
    expect(r.atlas).toBe(1000);
    expect(r.excluded.map((e) => [e.slug, e.reason])).toEqual([
      ["steakhouse-financial", "doublecounted"],
      ["bitget", "cex"],
      ["uncx-network-v3", "locker"],
    ]);
  });

  it("fails beyond 1% and names the biggest contributors", () => {
    const r = reconcileTvl(protocols, [[END, 1200]], [[END, 530]], END);
    expect(r.checks[0].ok).toBe(false);
    expect(r.checks[0].gap).toBeCloseTo(1010 / 1200 - 1, 6);
    expect(r.checks[0].contributors[0].name).toBe("Steakhouse Financial");
  });

  it("fails when DefiLlama has no value on that day", () => {
    expect(reconcileTvl(protocols, [], [], END).checks.every((c) => !c.ok)).toBe(true);
  });
});

describe("reconcileFlow", () => {
  const byName = { "Uniswap V4": window(100), "Morpho Blue": window(10), Fables: window(50) };

  it("sums only breakdown names and lists the rest as outside the breakdown", () => {
    const r = reconcileFlow("volume", protocols, byName, window(110), END);
    expect(r.atlas).toBe(3300);
    expect(r.check.ok).toBe(true);
    expect(r.excluded).toEqual([{ name: "Fables", slug: "fables", reason: "outside-breakdown", value: 1500 }]);
  });

  it("points at the names left out when the chain total is higher", () => {
    const r = reconcileFlow("volume", protocols, byName, window(160), END);
    expect(r.check.ok).toBe(false);
    expect(r.check.contributors[0].name).toBe("Fables");
  });
});

describe("reconcile and groupExclusions", () => {
  it("runs every metric and groups exclusions by reason, biggest first", () => {
    const store = { volume: { "Uniswap V4": window(100) }, fees: { "Uniswap V4": window(1) }, revenue: { "Uniswap V4": window(1) } };
    const r = reconcile(protocols, store, { tvl: [[END, 1010]], tvlDoublecounted: [[END, 530]], volume: window(100), fees: window(1), revenue: window(1) }, END);
    expect(r.ok).toBe(true);
    expect(r.checks.map((c) => c.id)).toEqual(["tvl", "tvl-doublecounted", "volume", "fees", "revenue"]);
    expect(groupExclusions(r.excluded.tvl).map((g) => [g.reason, g.count])).toEqual([
      ["doublecounted", 1],
      ["cex", 1],
      ["locker", 1],
    ]);
  });
});
