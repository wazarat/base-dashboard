import type { MetricChange, NumericMetricKey, Project } from "@/lib/types";

const NO_CHANGE: MetricChange = { d7: null, d30: null, d90: null };

/** A minimal project for unit tests; `counted` takes plain values and optional 30d changes. */
export function mkProject(partial: Partial<Project> & { name: string }, counted?: Partial<Record<NumericMetricKey, number | null>>, change30?: Partial<Record<NumericMetricKey, number | null>>): Project {
  const values = { tvl: null, volume: null, fees: null, revenue: null, ...(counted ?? {}) } as Record<NumericMetricKey, number | null>;
  const change = Object.fromEntries((["tvl", "volume", "fees", "revenue"] as const).map((m) => [m, { ...NO_CHANGE, d30: change30?.[m] ?? null }])) as Record<NumericMetricKey, MetricChange>;
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
    hasTraction: false,
    revenueCapture: null,
    leaderRank: null,
    snapshot: { tvl: null, volume: null, fees: null, revenue: null, tier: "Not tracked", asOf: "2026-11-07" },
    live: null,
    metricSource: { tvl: "none", volume: "none", fees: "none", revenue: "none" },
    contracts: [],
    counted: counted ? { values, change } : null,
    ...partial,
  };
}
