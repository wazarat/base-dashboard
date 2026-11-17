/**
 * Builds the per-project sector metrics the registry reads (src/lib/sector-metrics.ts) from history
 * the refresh already stores. Pure, so the build script and the tests share it. Nothing here feeds
 * the chain KPIs, which keep summing only what DefiLlama counts in its chain total.
 */
import { addDays, type DateStr } from "./dates";
import type { ExtraTvlKey, GeckoVenueRecord, LlamaMethodology, MorphoTotalsRow, MorphoVaultsFile, Series, SeriesMap, YieldPoolsFile } from "./history-types";
import { sumWindow, valueAt } from "./live";
import { sumSeries } from "./mapping";
import { venueMetrics, type GeckoDexMapRow } from "./venues";
import { utilization } from "./sector-metrics";
import { sumLevelSeries } from "./series-gaps";
import type { MetricFlag, NumericMetricKey, Project, SectorMetricValue } from "./types";

/** The DefiLlama listing that is Morpho's lending markets; the Morpho API is the primary source for the project that maps to it. */
export const MORPHO_SLUG = "morpho-blue";

export interface SectorInputStore {
  /** slug -> series, one map per extra key. */
  extras: Record<ExtraTvlKey, SeriesMap>;
  /** DefiLlama display name -> methodology and 30-day revenue. */
  methodology: Record<string, LlamaMethodology>;
  nameOfSlug: Map<string, string>;
  morphoTotals: MorphoTotalsRow[];
  /** slug -> why DefiLlama or the Atlas keeps its TVL out of the chain total. */
  exclusionOf: Map<string, MetricFlag | null>;
}

/** A methodology sentence that states the protocol takes nothing. Deliberately narrow, since loose "no ..." wording also appears beside real revenue. */
const ZERO_REVENUE = /^(no|zero)\b[^.]*\brevenue\b|\bno (protocol )?revenue\b|\brevenue is (0|zero)\b/i;

export function statesZeroRevenue(text: string | null | undefined): boolean {
  return Boolean(text && ZERO_REVENUE.test(text.trim()));
}

/**
 * Zero by design: every listing of the project that the revenue overview covers reports a 30-day revenue
 * of exactly zero, the project does earn fees, and the source's methodology says in words that it keeps none.
 * Returns that sentence, or null.
 */
export function zeroRevenueReason(names: string[], fees: number | null, methodology: Record<string, LlamaMethodology>): string | null {
  const listed = names.map((n) => methodology[n]).filter((m): m is LlamaMethodology => Boolean(m));
  if (!listed.length || fees === null || fees <= 0) return null;
  if (!listed.every((m) => m.revenue30d === 0)) return null;
  return listed.map((m) => m.revenue).find((t) => statesZeroRevenue(t)) ?? null;
}

/** The latest Morpho totals row taken for `end`. The refresh runs a day after the last complete day, so that day counts too. */
export function morphoTotalsAt(rows: MorphoTotalsRow[], end: DateStr): MorphoTotalsRow | null {
  let best: MorphoTotalsRow | null = null;
  for (const r of rows) if (r[0] <= addDays(end, 1) && r[0] >= addDays(end, -7)) best = r;
  return best;
}

function levelAt(series: Series[], end: DateStr): { v: number; asOf: DateStr } | null {
  const s = sumLevelSeries(series.filter((x) => x.length));
  const v = valueAt(s, end);
  if (v === null) return null;
  const asOf = s.filter(([d]) => d <= end).at(-1)?.[0] ?? end;
  return { v, asOf };
}

type Input = Pick<Project, "tvl" | "fees" | "revenue">;

export function computeSectorMetrics(p: Input, slugs: string[], store: SectorInputStore, end: DateStr): Record<string, SectorMetricValue> {
  const out: Record<string, SectorMetricValue> = {};
  const level = (key: ExtraTvlKey) => levelAt(slugs.map((s) => store.extras[key][s] ?? []), end);

  // Lending: Morpho's own API splits lending supply from collateral, so it is the primary source for Morpho.
  const morpho = slugs.includes(MORPHO_SLUG) ? morphoTotalsAt(store.morphoTotals, end) : null;
  const borrowedLlama = level("borrowed");
  if (morpho) {
    const [asOf, supply, borrowed, collateral] = morpho;
    out.deposited = { v: supply + collateral, asOf };
    out.borrowed = { v: borrowed, asOf };
    out.lendingSupply = { v: supply, asOf };
    out.collateral = { v: collateral, asOf };
    if (supply > 0) out.utilization = { v: borrowed / supply, asOf };
  } else if (borrowedLlama && borrowedLlama.v > 0) {
    out.borrowed = borrowedLlama;
    if (p.tvl !== null) {
      out.deposited = { v: p.tvl + borrowedLlama.v, asOf: borrowedLlama.asOf };
      const u = utilization(borrowedLlama.v, p.tvl);
      if (u !== null) out.utilization = { v: u, asOf: borrowedLlama.asOf };
    }
  }
  // What DefiLlama reports for the same figures, kept for the source gap check.
  if (morpho && borrowedLlama) out.borrowedLlama = borrowedLlama;

  for (const key of ["staking", "pool2", "vesting"] as const) {
    const v = level(key);
    if (v && v.v > 0) out[key] = v;
  }

  if (p.revenue === null) {
    const names = slugs.map((s) => store.nameOfSlug.get(s)).filter((n): n is string => Boolean(n));
    const reason = zeroRevenueReason(names, p.fees, store.methodology);
    if (reason) out.revenueZero = { v: 0, asOf: end, zero: reason };
  }
  return out;
}

const CORE: NumericMetricKey[] = ["tvl", "volume", "fees", "revenue"];

/**
 * Why each core figure sits outside the chain total, when it does. A figure is unflagged when the listings
 * DefiLlama counts cover it (within 1%). TVL carries the exclusion of its largest left-out listing; flows are
 * simply outside the chain breakdown.
 */
export function computeMetricFlags(p: Pick<Project, NumericMetricKey | "counted">, slugs: string[], tvlOfSlug: (slug: string) => number, exclusionOf: Map<string, MetricFlag | null>): Partial<Record<NumericMetricKey, MetricFlag>> {
  const out: Partial<Record<NumericMetricKey, MetricFlag>> = {};
  for (const m of CORE) {
    const v = p[m];
    if (v === null || v <= 0) continue;
    const counted = p.counted?.values[m] ?? null;
    if (counted !== null && counted >= v * 0.99) continue;
    if (m === "tvl") {
      const excluded = slugs.filter((s) => exclusionOf.get(s)).sort((a, b) => tvlOfSlug(b) - tvlOfSlug(a));
      out.tvl = (excluded.length ? exclusionOf.get(excluded[0]) : null) ?? "outside-total";
    } else {
      // The chain's own sequencer income is the one flow left out for a reason other than the breakdown.
      out[m] = slugs.some((s) => exclusionOf.get(s) === "chain-income") ? "chain-income" : "outside-total";
    }
  }
  return out;
}

/** How many other projects' audit notes name this firm. Short names are skipped, since they match by accident. */
export function auditedBy(firm: string, projects: Array<Pick<Project, "name" | "audits">>): number {
  const name = firm.replace(/\s*\(.*?\)\s*/g, " ").trim();
  if (name.length < 5) return 0;
  const re = new RegExp(`(^|[^a-z0-9])${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
  return projects.filter((q) => q.name !== firm && q.audits && re.test(q.audits.toLowerCase())).length;
}

/** The five per-protocol series the DefiLlama overview fetchers store, keyed by display name. */
export const OVERVIEW_KEYS = ["aggVolume", "bridgeAggVolume", "openInterest", "optionsNotional", "optionsPremium"] as const;
export type OverviewKey = (typeof OVERVIEW_KEYS)[number];

/** One Morpho market on the last day read: who is lent, what backs it, and how much. */
export interface MarketNow {
  loan: string | null;
  collateral: string | null;
  supplyUsd: number;
  borrowUsd: number;
  collateralUsd: number;
}

/** What the sources added for the sector metrics bring to the build (docs/SECTOR-METRICS.md, section 2). */
export interface SourceStore {
  overview: Record<OverviewKey, SeriesMap>;
  /** slug -> display name for listings that only exist in those overviews. */
  overviewNames: Record<string, string>;
  yields: YieldPoolsFile | null;
  vaults: MorphoVaultsFile | null;
  markets: MarketNow[];
  marketsAsOf: DateStr | null;
  /** Addresses of the official stock tokens, so a look-alike with a stock ticker never counts. */
  stockAddresses: Set<string>;
  venues: Record<string, GeckoVenueRecord>;
  dexMap: GeckoDexMapRow[];
}

export interface SourceInput {
  name: string;
  /** The project's own token addresses on the chain (RWA and project tokens). */
  tokens: string[];
  /** Addresses of the stablecoins the project issues. */
  stables: string[];
}

const weighted = (rows: Array<{ rate: number | null; weight: number | null }>): number | null => {
  let top = 0;
  let base = 0;
  for (const r of rows) {
    if (r.rate === null || r.weight === null || !(r.weight > 0)) continue;
    top += r.rate * r.weight;
    base += r.weight;
  }
  return base > 0 ? top / base : null;
};

/**
 * Sector metrics from the newer sources: routed and bridged volume, open interest, options, yields,
 * Morpho vaults and markets, and trading venues. Joined by DefiLlama slug, by curator name, by token
 * address and by the venue map; nothing is matched by a loose name. None of it enters a chain KPI.
 */
export function computeSourceMetrics(p: SourceInput, slugs: string[], nameOfSlug: Map<string, string>, store: SourceStore, end: DateStr): Record<string, SectorMetricValue> {
  const out: Record<string, SectorMetricValue> = {};
  const names = Array.from(new Set(slugs.map((s) => nameOfSlug.get(s) ?? store.overviewNames[s]).filter((n): n is string => Boolean(n))));
  const seriesOf = (key: OverviewKey) => names.map((n) => store.overview[key][n] ?? []).filter((x) => x.length);

  // Flows, summed over the 30 days to `end`.
  for (const key of ["aggVolume", "bridgeAggVolume", "optionsNotional", "optionsPremium"] as const) {
    const w = sumWindow(sumSeries(seriesOf(key)), end, 30);
    if (w.value !== null && w.value > 0) out[key] = { v: w.value, asOf: end };
  }
  // Open interest is a level: its value on the day, each listing carried across short gaps before they are summed.
  const oi = levelAt(seriesOf("openInterest"), end);
  if (oi && oi.v > 0) out.openInterest = oi;

  // Yield pools the project's own listings run on the chain.
  const pools = (store.yields?.pools ?? []).filter((x) => slugs.includes(x.project));
  if (pools.length && store.yields) {
    const asOf = store.yields.asOf;
    const net = weighted(pools.map((x) => ({ rate: x.apy, weight: x.tvlUsd })));
    if (net !== null) {
      out.netApy = { v: net, asOf };
      out.supplyApy = { v: net, asOf };
    }
    const borrow = weighted(pools.map((x) => ({ rate: x.apyBorrow, weight: x.borrowUsd })));
    if (borrow !== null) out.borrowApy = { v: borrow, asOf };
    out.yieldPools = { v: pools.length, asOf };
  }

  // Morpho vaults the project curates. The same deposits sit in Morpho's markets, hence the flag.
  const mine = (store.vaults?.vaults ?? []).filter((v) => v.curators.some((c) => c.toLowerCase() === p.name.toLowerCase()));
  if (mine.length && store.vaults) {
    const asOf = store.vaults.asOf;
    const assets = mine.reduce((a, v) => a + (v.assetsUsd ?? 0), 0);
    if (assets > 0) out.vaultAssets = { v: assets, asOf, flag: "doublecounted" };
    const net = weighted(mine.map((v) => ({ rate: v.netApy, weight: v.assetsUsd })));
    if (net !== null && !out.netApy) out.netApy = { v: net, asOf };
    if (!out.yieldPools) out.yieldPools = { v: mine.length, asOf };
  }

  // How Morpho's markets use the project's tokens, matched by address.
  if (store.marketsAsOf) {
    const asOf = store.marketsAsOf;
    if (slugs.includes(MORPHO_SLUG)) {
      const total = store.markets.reduce((a, m) => a + m.borrowUsd, 0);
      const stock = store.markets.filter((m) => m.collateral && store.stockAddresses.has(m.collateral)).reduce((a, m) => a + m.borrowUsd, 0);
      if (total > 0) out.stockBacked = { v: stock / total, asOf };
    }
    const tokens = new Set(p.tokens);
    const collateral = store.markets.filter((m) => m.collateral && tokens.has(m.collateral)).reduce((a, m) => a + m.collateralUsd, 0);
    if (collateral > 0) out.morphoCollateral = { v: collateral, asOf };
    const stables = new Set(p.stables);
    const lent = store.markets.filter((m) => m.loan && stables.has(m.loan)).reduce((a, m) => a + m.supplyUsd, 0);
    if (lent > 0) out.morphoLoan = { v: lent, asOf };
  }

  // The project's own trading venues.
  const rows = store.dexMap.filter((r) => r.project === p.name);
  const vm = venueMetrics(rows.map((r) => store.venues[r.dexId]).filter((v): v is GeckoVenueRecord => Boolean(v)), end);
  if (vm) {
    // Venue volume is a headline only for launchpads and agent platforms; a DEX already has its DefiLlama volume.
    const ownVenue = rows.some((r) => r.kind === "launchpad" || r.kind === "agent");
    if (ownVenue && vm.volume30d !== null) out.venueVolume = { v: vm.volume30d, asOf: vm.asOf };
    if (ownVenue && vm.launched30d > 0) out.tokensLaunched = { v: vm.launched30d, asOf: vm.asOf };
    if (vm.liquidity !== null && vm.liquidity > 0) out.venueLiquidity = { v: vm.liquidity, asOf: vm.asOf };
  }
  return out;
}
