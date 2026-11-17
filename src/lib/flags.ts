/**
 * Which DefiLlama protocols count toward the chain totals the Overview shows.
 * Pure; the fetcher computes the flags once per refresh and the build and the
 * tests reuse these rules.
 *
 * DefiLlama's free API does not expose its double-count list, so TVL uses two
 * proofs. Each protocol's adapter source on GitHub (doublecounted true), plus the
 * categories DefiLlama leaves out of chain TVL. The excluded set must then sum
 * to DefiLlama's own double-counted series (/lite/charts) within 1%, which
 * scripts/build-data.ts checks.
 */
import type { LlamaProtocolSnap } from "./history-types";

export const FLAG_METRICS = ["tvl", "volume", "fees", "revenue"] as const;
export type FlagMetric = (typeof FLAG_METRICS)[number];
export type InChainTotal = Record<FlagMetric, boolean>;

/** Categories DefiLlama keeps out of chain TVL as double counted, whatever the adapter says. */
export const DOUBLECOUNTED_CATEGORIES = new Set(["Yield", "Yield Aggregator", "Onchain Capital Allocator", "Risk Curators", "Liquid Staking", "Liquid Restaking"]);
export const CEX_CATEGORY = "CEX";
export const LOCKER_CATEGORY = "Token Locker";
/**
 * Bridge deposits sit on the source chain, so DefiLlama's chain TVL for Base leaves them out. Found at the first Base
 * reconciliation (Nov 17 2026): counting these three categories put the Atlas 3.7% above DefiLlama, leaving them out
 * brought it within 0.4%.
 */
export const BRIDGE_CATEGORIES = new Set(["Bridge", "Cross Chain Bridge", "Canonical Bridge"]);
/** The chain's own sequencer income is not an app. */
export const CHAIN_INCOME_CATEGORIES = new Set(["Chain", "Foundation"]);
/** Base's own row in the fees overview (name "Base", slug "base", category Chain): sequencer income. */
export const CHAIN_INCOME_SLUGS = new Set(["base"]);

/** Why a protocol's TVL sits outside the Atlas total. */
export type TvlExclusion = "doublecounted" | "cex" | "locker" | "bridge" | "chain-income";

export const EXCLUSION_LABEL: Record<TvlExclusion | "outside-breakdown", string> = {
  doublecounted: "Double counted by DefiLlama",
  cex: "Exchange deposits",
  locker: "Token lockers",
  bridge: "Bridge deposits",
  "chain-income": "Chain income",
  "outside-breakdown": "Outside DefiLlama's chain breakdown",
};

export function isChainIncome(p: Pick<LlamaProtocolSnap, "slug" | "category">): boolean {
  return CHAIN_INCOME_SLUGS.has(p.slug) || CHAIN_INCOME_CATEGORIES.has(p.category);
}

/** In DefiLlama's double-counted bucket: flagged in the adapter source, or in a double-counted category. */
export function inDoublecountedBucket(category: string, adapterDoublecounted: boolean | null | undefined): boolean {
  if (category === CEX_CATEGORY) return false;
  return adapterDoublecounted === true || DOUBLECOUNTED_CATEGORIES.has(category);
}

export function tvlExclusion(p: Pick<LlamaProtocolSnap, "slug" | "category">, adapterDoublecounted: boolean | null | undefined): TvlExclusion | null {
  if (isChainIncome(p)) return "chain-income";
  if (p.category === CEX_CATEGORY) return "cex";
  if (inDoublecountedBucket(p.category, adapterDoublecounted)) return "doublecounted";
  if (p.category === LOCKER_CATEGORY) return "locker";
  if (BRIDGE_CATEGORIES.has(p.category)) return "bridge";
  return null;
}

/**
 * Per-metric flags. Volume, fees and revenue are true only when the protocol's
 * name has a value in that metric's chain-overview breakdown within the window;
 * names that only come from the per-protocol summary fallback are outside the chain total.
 */
export function inChainTotal(
  p: Pick<LlamaProtocolSnap, "slug" | "category" | "name">,
  adapterDoublecounted: boolean | null | undefined,
  breakdownNames: Record<Exclude<FlagMetric, "tvl">, Set<string>>,
): InChainTotal {
  if (isChainIncome(p)) return { tvl: false, volume: false, fees: false, revenue: false };
  return {
    tvl: tvlExclusion(p, adapterDoublecounted) === null,
    volume: breakdownNames.volume.has(p.name),
    fees: breakdownNames.fees.has(p.name),
    revenue: breakdownNames.revenue.has(p.name),
  };
}

/** Does an adapter source mark this protocol double counted? null when the entry cannot be found. */
export function adapterDoublecounted(source: string, codePath: string, module: string | null): boolean | null {
  const path = codePath.replace(/^https:\/\/github\.com\/DefiLlama\/DefiLlama-Adapters\/blob\/[^/]+\//, "");
  // Every curator adapter goes through projects/helper/curators getCuratorExport, which sets doublecounted true.
  if (path === "registries/curators.js") return true;
  const flag = /["']?doublecounted["']?\s*[:=]\s*true/;
  if (!path.startsWith("registries/")) return flag.test(source);
  const key = (module ?? "").replace(/\/index\.(js|ts)$/, "");
  if (!key) return null;
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = new RegExp(`^  ["']?${esc}["']?\\s*:\\s*\\{`, "m").exec(source);
  if (!start) return null;
  const rest = source.slice(start.index + start[0].length);
  const next = /^  ["']?[\w.\-]+["']?\s*:\s*\{/m.exec(rest);
  return flag.test(next ? rest.slice(0, next.index) : rest);
}

/** Raw GitHub URL for a tvlCodePath, or null when the listing gives none. */
export function rawAdapterUrl(codePath: string | null | undefined): string | null {
  if (!codePath || !codePath.startsWith("https://github.com/DefiLlama/DefiLlama-Adapters/blob/")) return null;
  return codePath.replace("https://github.com/DefiLlama/DefiLlama-Adapters/blob/", "https://raw.githubusercontent.com/DefiLlama/DefiLlama-Adapters/");
}
