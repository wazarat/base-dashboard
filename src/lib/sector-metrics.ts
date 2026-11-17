/**
 * The sector metric registry (docs/SECTOR-METRICS.md). Each sector lists its own metrics in display
 * order, names one headline that ranks its leaders and feeds the tier, and says whether it is measured
 * at all. The project pop-up, the sector cards and the sector leaders view all read from here, so a
 * lending market never shows a DEX volume row and a wallet never shows a tier.
 *
 * Pure. Every value comes from the project record the build wrote; nothing here is typed by hand
 * except the definitions of what each metric counts. Source names appear only in `info`.
 */
import { daysBetween, type DateStr } from "./dates";
import { fmtInt, fmtPct, fmtUsd, fmtUsdFull } from "./format";
import type { MetricFlag, NumericMetricKey, Project } from "./types";

/** The four things a metric cell can be. They are never mixed up (section 1 of the spec). */
export type MetricState = "value" | "zero-by-design" | "not-applicable" | "not-tracked";
export type MetricUnit = "usd" | "pct" | "count" | "ratio";
export type MetricBlock = "traction" | "financials" | "facts";

/** A figure is shown as current only when it is at most this many days behind the build's window end. */
export const STALE_AFTER_DAYS = 3;

interface Reading {
  v: number | null;
  asOf?: string | null;
  flag?: MetricFlag | null;
}

export interface MetricDef {
  id: string;
  /** Row label in the pop-up. */
  label: string;
  /** Short label beside a figure on a sector card or a leaders row, for example "30d volume". */
  short: string;
  /** What the figure counts and what it leaves out; shown in the InfoTip. */
  info: string;
  unit: MetricUnit;
  block: MetricBlock;
  /** One of the four core metrics, read from the project with its daily or snapshot source. */
  core?: NumericMetricKey;
  /** Reads a figure the project already carries (live financials, onchain metrics). Without it the value comes from `sectorMetrics[id]`. */
  read?: (p: Project) => Reading;
  /** False hides the row for this project (Not applicable). */
  appliesTo?: (p: Project) => boolean;
  /** Leave the row out instead of printing Not tracked. For facts and for figures only a few projects have. */
  hideWhenUntracked?: boolean;
  /** The figure exists only on a paid feed, so it always reads Not tracked. */
  paid?: boolean;
}

export interface ResolvedMetric {
  def: MetricDef;
  state: MetricState;
  value: number | null;
  asOf: string | null;
  /** For zero by design, the source's own sentence. */
  reason: string | null;
  flag: MetricFlag | null;
  /** More than STALE_AFTER_DAYS behind the window end; shown with its date, never as current. */
  stale: boolean;
}

const sub = (name: string) => (p: Project) => p.subcategory === name;
const live = (pick: (l: NonNullable<Project["live"]>) => number | null) => (p: Project): Reading => ({ v: p.live ? pick(p.live) : null, asOf: p.live?.asOf ?? null });
const onchain = (pick: (o: NonNullable<Project["onchain"]>) => number | null) => (p: Project): Reading => ({ v: p.onchain ? pick(p.onchain) : null, asOf: p.onchain?.asOf ?? null });

const DEFS: MetricDef[] = [
  // Core metrics.
  { id: "tvl", label: "TVL", short: "TVL", unit: "usd", block: "traction", core: "tvl", info: "Value deposited in the project's contracts on Base, from DefiLlama. For a lender, TVL excludes borrowed funds." },
  { id: "volume", label: "30d DEX volume", short: "30d volume", unit: "usd", block: "traction", core: "volume", info: "Trading volume on Base over the last 30 complete days, from DefiLlama." },
  { id: "fees", label: "30d fees", short: "30d fees", unit: "usd", block: "traction", core: "fees", info: "Everything users paid over the last 30 complete days, from DefiLlama. For a lender this is the interest borrowers paid." },
  { id: "revenue", label: "30d revenue", short: "30d revenue", unit: "usd", block: "traction", core: "revenue", info: "The part of fees the protocol keeps, over the last 30 complete days, from DefiLlama." },
  { id: "capture", label: "Revenue capture", short: "of fees kept", unit: "pct", block: "traction", read: (p) => ({ v: p.revenueCapture, asOf: p.live?.asOf ?? p.snapshot.asOf }), info: "30-day revenue divided by 30-day fees." },

  // Lending.
  { id: "deposited", label: "Total deposited", short: "deposited", unit: "usd", block: "traction", info: "Everything deposited, collateral plus lending supply. Borrowed funds are still counted here, which is why it is larger than TVL. From the Morpho API for Morpho, and DefiLlama TVL plus borrowed for other lenders." },
  { id: "borrowed", label: "Borrowed", short: "borrowed", unit: "usd", block: "traction", info: "Loans outstanding. DefiLlama leaves this amount out of TVL. From the Morpho API for Morpho and DefiLlama for other lenders." },
  { id: "utilization", label: "Utilization", short: "utilization", unit: "pct", block: "traction", info: "Borrowed divided by what is available to lend. Where the source splits lending supply from collateral (Morpho) the divisor is lending supply, otherwise it is TVL plus borrowed." },

  // Supply and tokens on the chain.
  { id: "stableSupply", label: "Supply on the chain", short: "supply", unit: "usd", block: "traction", read: onchain((o) => o.stableSupply), info: "Stablecoin supply issued on Base, from DefiLlama. Kept apart from TVL so nothing is counted twice." },
  { id: "tokenized", label: "Tokenized value", short: "tokenized", unit: "usd", block: "traction", read: (p) => ({ v: p.onchain?.rwaSupply ?? null, asOf: p.onchain?.asOf ?? null }), info: "Token supply on Base times price, from Blockscout. Kept apart from TVL." },
  { id: "tokenVolume", label: "30d token volume", short: "30d token volume", unit: "usd", block: "traction", read: onchain((o) => o.tokenVolume30d), info: "DEX volume of the project's token on Base over 30 days, from GeckoTerminal. Volume on other chains is left out." },
  { id: "tokenLiquidity", label: "Token liquidity", short: "liquidity", unit: "usd", block: "traction", read: onchain((o) => o.tokenLiquidity), hideWhenUntracked: true, info: "Liquidity in the token's pools on Base, from GeckoTerminal." },
  { id: "holders", label: "Token holders", short: "holders", unit: "count", block: "traction", read: onchain((o) => o.holders), info: "Addresses holding the project's token on Base, from Blockscout. Airdrops inflate holder counts, so they never set a tier." },
  { id: "nftHolders", label: "Collection holders", short: "holders", unit: "count", block: "traction", read: onchain((o) => o.nftHolders), info: "Addresses holding the collection on Base, from Blockscout. Holders never set a tier." },
  { id: "nftTransfers", label: "30d transfers", short: "30d transfers", unit: "count", block: "traction", read: onchain((o) => o.nftTransfers30d), info: "Transfers of the collection over 30 days, from Blockscout. The count stops at 100 until enough daily history exists." },
  { id: "staking", label: "Staked", short: "staked", unit: "usd", block: "traction", hideWhenUntracked: true, info: "The project's own token staked in its contracts, which DefiLlama reports beside TVL and never adds to it." },

  // Lending and yield rates, and how Morpho uses a token.
  { id: "supplyApy", label: "Supply APY", short: "supply APY", unit: "pct", block: "traction", hideWhenUntracked: true, info: "What lenders earn, base plus rewards, weighted by pool size across the project's pools on Base. From DefiLlama's yields listing." },
  { id: "borrowApy", label: "Borrow APY", short: "borrow APY", unit: "pct", block: "traction", hideWhenUntracked: true, info: "What borrowers pay, weighted by loans outstanding across the project's pools on Base. From DefiLlama's yields listing." },
  { id: "netApy", label: "Net APY", short: "net APY", unit: "pct", block: "traction", hideWhenUntracked: true, info: "Yield after fees, base plus rewards, weighted by size across the project's pools or vaults on Base. From DefiLlama's yields listing, or the Morpho API for vault curators." },
  { id: "yieldPools", label: "Vaults or pools", short: "pools", unit: "count", block: "traction", hideWhenUntracked: true, info: "Vaults or pools the project runs on Base, from DefiLlama's yields listing or the Morpho API." },
  { id: "vaultAssets", label: "Morpho vault assets", short: "in Morpho vaults", unit: "usd", block: "traction", hideWhenUntracked: true, info: "Assets in the Morpho vaults this project curates, from the Morpho API. The same deposits sit in Morpho's markets, so the figure is double counted by construction." },
  { id: "morphoCollateral", label: "Posted as Morpho collateral", short: "Morpho collateral", unit: "usd", block: "traction", hideWhenUntracked: true, info: "Value of the project's token posted as collateral in Morpho markets on Base, from the Morpho API." },
  { id: "morphoLoan", label: "Lent on Morpho", short: "lent on Morpho", unit: "usd", block: "traction", hideWhenUntracked: true, info: "Amount of the project's stablecoin supplied as the loan asset in Morpho markets on Base, from the Morpho API. Part of the supply on the chain, not extra to it." },

  // Routed volume, open interest and options.
  { id: "aggVolume", label: "30d aggregator volume", short: "30d routed volume", unit: "usd", block: "traction", hideWhenUntracked: true, info: "Volume the aggregator routed on Base over the last 30 complete days, from DefiLlama. It repeats volume the DEXes already report, so it never enters a chain total." },
  { id: "bridgeAggVolume", label: "30d bridge aggregator volume", short: "30d bridged", unit: "usd", block: "traction", hideWhenUntracked: true, info: "Volume routed to or from Base through the bridge aggregator over the last 30 complete days, from DefiLlama. Volume of a single bridge is a paid feed and is not tracked." },
  { id: "openInterest", label: "Open interest", short: "open interest", unit: "usd", block: "traction", info: "Value of positions open on the venue on Base, from DefiLlama. A level on the day, not a sum over a window." },
  { id: "optionsNotional", label: "30d options notional", short: "30d notional", unit: "usd", block: "traction", hideWhenUntracked: true, info: "Notional value of options traded on Base over the last 30 complete days, from DefiLlama." },
  { id: "optionsPremium", label: "30d options premium", short: "30d premium", unit: "usd", block: "traction", hideWhenUntracked: true, info: "Premiums paid for options on Base over the last 30 complete days, from DefiLlama." },

  // Trading venues.
  { id: "venueVolume", label: "30d venue volume", short: "30d volume", unit: "usd", block: "traction", info: "Volume of tokens trading on the project's own venue on Base, summed from daily readings of its most traded pools on GeckoTerminal. Shown once 27 daily readings exist, so the month is never understated." },
  { id: "tokensLaunched", label: "Tokens launched in 30d", short: "launched in 30d", unit: "count", block: "traction", hideWhenUntracked: true, info: "Pools created on the venue in the last 30 days, from GeckoTerminal's newest pools. The feed lists only the newest 100 pools a day, so this is a lower bound." },
  { id: "venueLiquidity", label: "Venue liquidity", short: "liquidity", unit: "usd", block: "traction", hideWhenUntracked: true, info: "Liquidity in the venue's most traded pools on Base, from GeckoTerminal." },

  // Figures that exist only on paid feeds.
  { id: "nftVolume", label: "Marketplace volume", short: "volume", unit: "usd", block: "traction", paid: true, appliesTo: sub("NFT marketplaces and tools"), info: "No free source reports NFT marketplace volume for Base." },
  { id: "perpsVolume", label: "Perps volume", short: "perps volume", unit: "usd", block: "traction", paid: true, appliesTo: sub("Perps"), info: "Perps volume per chain is a paid DefiLlama feed, so it is not tracked." },
  { id: "bridgeVolume", label: "Bridge volume", short: "bridge volume", unit: "usd", block: "traction", paid: true, appliesTo: sub("Bridges"), info: "Bridge volume per chain is a paid DefiLlama feed, so it is not tracked." },
  { id: "predictionVolume", label: "Trading volume", short: "volume", unit: "usd", block: "traction", paid: true, info: "No free feed reports prediction market volume for Base." },

  // Financials, the same rows for every sector.
  { id: "feesDaily", label: "Daily fees", short: "daily fees", unit: "usd", block: "financials", read: live((l) => l.feesDaily), info: "Fees on the last complete day, from DefiLlama." },
  { id: "fees30", label: "30d fees", short: "30d fees", unit: "usd", block: "financials", read: live((l) => l.fees), info: "Everything users paid over 30 days, from DefiLlama." },
  { id: "supplySide", label: "Supply-side rev.", short: "to suppliers", unit: "usd", block: "financials", read: live((l) => l.supplySideRevenue), info: "The part of fees paid on to lenders or liquidity providers over 30 days, from DefiLlama." },
  { id: "protocolRevenue", label: "Protocol revenue", short: "revenue", unit: "usd", block: "financials", core: "revenue", info: "The part of fees the protocol keeps over 30 days, from DefiLlama." },
  { id: "holdersRevenue", label: "Holders revenue", short: "to holders", unit: "usd", block: "financials", read: live((l) => l.holdersRevenue), info: "The part of revenue passed to token holders over 30 days, from DefiLlama." },
  { id: "annualised", label: "Annualised rev.", short: "annualised", unit: "usd", block: "financials", read: live((l) => l.annualisedRevenue), info: "30-day revenue scaled to a year." },
  { id: "marketCap", label: "Token market cap", short: "market cap", unit: "usd", block: "financials", read: live((l) => l.tokenMarketCap), info: "The token's market cap across every chain, from DefiLlama. It is a global figure, not a Base one." },
  { id: "ps", label: "P/S", short: "P/S", unit: "ratio", block: "financials", read: live((l) => l.psRatio), hideWhenUntracked: true, info: "Market cap over annualised revenue." },

  // Facts for sectors with no traction metric.
  { id: "heldAssets", label: "Assets on the chain", short: "held on the chain", unit: "usd", block: "facts", read: (p) => ({ v: p.tvl, asOf: p.live?.asOf ?? p.snapshot.asOf, flag: "cex" }), appliesTo: sub("Centralized exchanges"), hideWhenUntracked: true, info: "Balances the exchange's wallets hold on Base, from DefiLlama. These are customer deposits, not an app, and are not counted in chain TVL." },
  { id: "lockedValue", label: "Locked in lockers", short: "locked", unit: "usd", block: "facts", read: (p) => ({ v: p.tvl, asOf: p.live?.asOf ?? p.snapshot.asOf, flag: "locker" }), appliesTo: sub("Token lockers"), hideWhenUntracked: true, info: "Tokens locked in the project's locker contracts on Base, from DefiLlama. Locked tokens are not working capital, so the Atlas leaves them out of TVL." },
  { id: "vesting", label: "In vesting", short: "vesting", unit: "usd", block: "facts", appliesTo: sub("Token lockers"), hideWhenUntracked: true, info: "Tokens held in vesting contracts, which DefiLlama reports beside TVL and never adds to it." },
  { id: "contractsDeployed", label: "Contracts on the chain", short: "contracts", unit: "count", block: "facts", hideWhenUntracked: true, info: "Contracts deployed on Base as a whole, from Blockscout. A chain figure, shown here because the project is the chain's rollup stack." },
  { id: "contractsVerified", label: "Verified contracts", short: "verified", unit: "count", block: "facts", hideWhenUntracked: true, info: "Contracts on Base with verified source code, from Blockscout. A chain figure." },
  { id: "feesFact", label: "30d fees", short: "30d fees", unit: "usd", block: "facts", read: (p) => ({ v: p.fees, asOf: p.live?.asOf ?? p.snapshot.asOf }), hideWhenUntracked: true, info: "Fees users paid to the project on Base over the last 30 complete days, from DefiLlama. Shown as a fact, since this sector has no traction ranking." },
  { id: "auditedProjects", label: "Atlas projects audited", short: "projects audited", unit: "count", block: "facts", hideWhenUntracked: true, info: "Projects in the Atlas whose audit notes name this firm." },
];

export const METRIC_DEFS: Record<string, MetricDef> = Object.fromEntries(DEFS.map((d) => [d.id, d]));
export const FINANCIAL_METRICS = DEFS.filter((d) => d.block === "financials").map((d) => d.id);

/** How a headline enters the tier thresholds: like TVL, like 30-day volume, or not at all. */
export type TierKind = "tvl" | "volume" | "none";

export interface SectorConfig {
  sector: string;
  /** False for sectors whose work runs offchain or whose onchain figures are not traction. No headline, no tier. */
  measured: boolean;
  /** Metric ids in display order. The pop-up shows these and nothing else, so anything missing is Not applicable. */
  metrics: string[];
  /** Headline candidates in order of preference; the first one a project has ranks it. Empty for unmeasured sectors. */
  headline: string[];
  tierKind: TierKind;
  /** Flags that hold for a whole sector, for example volume a bot routes through other venues. */
  flags?: Record<string, MetricFlag>;
  /** Metrics this sector shows only when a project has a figure, so a row that few projects can have never reads Not tracked. */
  optional?: string[];
}

interface Extra {
  flags?: Record<string, MetricFlag>;
  optional?: string[];
}
const measured = (sector: string, headline: string[], tierKind: TierKind, metrics: string[], extra: Extra = {}): SectorConfig => ({ sector, measured: true, metrics, headline, tierKind, ...extra });
const unmeasured = (sector: string, metrics: string[] = []): SectorConfig => ({ sector, measured: false, metrics, headline: [], tierKind: "none" });

export const SECTOR_CONFIGS: SectorConfig[] = [
  measured("DEXs & Liquidity", ["volume", "aggVolume"], "volume", ["volume", "aggVolume", "tvl", "fees", "revenue", "capture", "venueLiquidity"], { flags: { aggVolume: "routed" } }),
  // Clanker, Zora, Flaunch, Doppler and Ape.Store have no GeckoTerminal venue id on Base, so 30d fees rank them (owner decision, Nov 17 2026).
  measured("Launchpads", ["venueVolume", "fees"], "volume", ["venueVolume", "tokensLaunched", "fees", "revenue", "volume", "tvl"], { optional: ["volume"] }),
  measured("AI Agents", ["venueVolume", "tokenVolume", "fees"], "volume", ["venueVolume", "tokenVolume", "tokensLaunched", "fees", "revenue", "holders", "tvl"], { optional: ["venueVolume"] }),
  // Collection holders need the Blockscout key; until a collection is mapped, fees then TVL rank the sector (holders never set a tier).
  measured("NFTs, Gaming & Collectibles", ["nftHolders", "fees", "tvl"], "none", ["nftHolders", "nftTransfers", "fees", "tvl", "nftVolume"]),
  measured("Lending & Credit", ["deposited", "tvl"], "tvl", ["deposited", "borrowed", "tvl", "utilization", "supplyApy", "borrowApy", "fees", "revenue"]),
  measured("Yield & Asset Management", ["tvl", "vaultAssets"], "tvl", ["tvl", "vaultAssets", "netApy", "yieldPools", "fees", "revenue"], { flags: { vaultAssets: "doublecounted" } }),
  measured("RWA & Tokenized Assets", ["tvl", "tokenized"], "tvl", ["tvl", "tokenized", "holders", "tokenVolume", "netApy", "morphoCollateral"]),
  measured("Trading Tools & Bots", ["volume", "aggVolume"], "volume", ["volume", "aggVolume", "fees", "revenue"], { flags: { volume: "routed", aggVolume: "routed" } }),
  measured("Perps, Options & Derivatives", ["openInterest", "tvl"], "tvl", ["openInterest", "fees", "revenue", "tvl", "optionsNotional", "optionsPremium", "perpsVolume"]),
  measured("Memecoins & Community", ["tokenVolume"], "volume", ["tokenVolume", "holders", "tokenLiquidity"]),
  measured("Bridges & Interoperability", ["bridgeAggVolume", "tvl"], "volume", ["bridgeAggVolume", "fees", "tvl", "bridgeVolume"]),
  measured("Stablecoins & Payments", ["stableSupply"], "tvl", ["stableSupply", "holders", "morphoLoan", "fees"]),
  measured("Prediction Markets", ["openInterest", "tvl"], "tvl", ["openInterest", "fees", "tvl", "predictionVolume"]),
  // Fees from DefiLlama's SoFi and social listings rank the sector; holders are context only and never set a tier.
  measured("Social & Identity", ["fees"], "none", ["fees", "revenue", "holders", "tvl"]),
  unmeasured("Infrastructure & Dev Tools", ["lockedValue", "vesting", "feesFact"]),
  unmeasured("Security, Risk & Compliance", ["auditedProjects", "feesFact"]),
  unmeasured("Data & Analytics", ["feesFact"]),
  unmeasured("Wallets & Custody", ["feesFact"]),
  unmeasured("Exchanges & On/Off-Ramps", ["heldAssets", "feesFact"]),
  unmeasured("DAOs, Governance & Public Goods", ["feesFact"]),
  unmeasured("Ecosystem, Funding & Education", ["feesFact"]),
  unmeasured("Other", ["feesFact"]),
];

const BY_SECTOR = new Map(SECTOR_CONFIGS.map((c) => [c.sector, c]));
/** A sector the registry does not know is treated as unmeasured, so a new CSV value can never invent a tier. */
export function sectorConfig(sector: string): SectorConfig {
  return BY_SECTOR.get(sector) ?? unmeasured(sector);
}

export function isMeasured(p: Pick<Project, "sector">): boolean {
  return sectorConfig(p.sector).measured;
}

/** One sentence per flag, for InfoTips and row notes. */
export const FLAG_TEXT: Record<MetricFlag, string> = {
  doublecounted: "Double counted, since the same deposits already sit in another app, so it stays out of the chain total",
  cex: "Exchange balances, not an onchain app, so it stays out of the chain total",
  locker: "Locked tokens, not working capital, so the Atlas leaves it out of the chain total",
  bridge: "Bridged deposits that sit on the source chain, so it stays out of the chain total",
  "chain-income": "The chain's own income, not an app, so it stays out of the chain total",
  "outside-total": "Outside the source's chain total, so it stays out of the Overview sums",
  routed: "Routed through other venues, so it repeats volume those venues already report",
};
export const FLAG_SHORT: Record<MetricFlag, string> = {
  doublecounted: "double counted",
  cex: "exchange balances",
  locker: "locked tokens",
  bridge: "bridge deposits",
  "chain-income": "chain income",
  "outside-total": "outside the chain total",
  routed: "routed volume",
};

function isStale(asOf: string | null, end: string | null | undefined): boolean {
  return Boolean(asOf && end && daysBetween(asOf as DateStr, end as DateStr) > STALE_AFTER_DAYS);
}

/** Does this metric belong on this project's pop-up at all? */
export function applies(p: Project, id: string): boolean {
  const def = METRIC_DEFS[id];
  if (!def) return false;
  if (def.block !== "financials" && !sectorConfig(p.sector).metrics.includes(id)) return false;
  return def.appliesTo ? def.appliesTo(p) : true;
}

/**
 * The state and value of one metric for one project. `end` is the build's window end (meta.live.windowEnd);
 * pass it to have figures more than three days old marked stale.
 */
export function resolveMetric(p: Project, id: string, end?: string | null): ResolvedMetric {
  const def = METRIC_DEFS[id];
  if (!def) throw new Error(`Unknown sector metric ${id}`);
  const none = (state: MetricState): ResolvedMetric => ({ def, state, value: null, asOf: null, reason: null, flag: null, stale: false });
  if (!applies(p, id)) return none("not-applicable");
  if (def.paid) return none("not-tracked");
  const sectorFlag = sectorConfig(p.sector).flags?.[id] ?? null;
  let r: Reading;
  if (def.core) {
    const src = p.metricSource?.[def.core] ?? "none";
    r = { v: p[def.core], asOf: src === "live" ? (p.live?.asOf ?? null) : src === "snapshot" ? p.snapshot.asOf : null, flag: p.metricFlags?.[def.core] ?? null };
    // A revenue the source reports as zero on purpose is a fact, not a gap.
    const zero = def.core === "revenue" && r.v === null ? p.sectorMetrics?.revenueZero : undefined;
    if (zero?.zero) return { def, state: "zero-by-design", value: 0, asOf: zero.asOf, reason: zero.zero, flag: null, stale: isStale(zero.asOf, end) };
  } else if (def.read) {
    r = def.read(p);
  } else {
    const m = p.sectorMetrics?.[id];
    r = m ? { v: m.v, asOf: m.asOf, flag: m.flag ?? null } : { v: null };
    if (m?.zero) return { def, state: "zero-by-design", value: 0, asOf: m.asOf, reason: m.zero, flag: null, stale: isStale(m.asOf, end) };
  }
  if (r.v === null || r.v === undefined) return none("not-tracked");
  const asOf = r.asOf ?? null;
  return { def, state: "value", value: r.v, asOf, reason: null, flag: r.flag ?? sectorFlag, stale: isStale(asOf, end) };
}

/** A project's metrics for one block, in the sector's order, with Not applicable rows already dropped. */
export function blockMetrics(p: Project, block: MetricBlock, end?: string | null): ResolvedMetric[] {
  const ids = block === "financials" ? FINANCIAL_METRICS : sectorConfig(p.sector).metrics.filter((id) => METRIC_DEFS[id]?.block === block);
  return ids
    .map((id) => resolveMetric(p, id, end))
    .filter((r) => r.state !== "not-applicable")
    .filter((r) => !(r.state === "not-tracked" && (r.def.hideWhenUntracked || sectorConfig(p.sector).optional?.includes(r.def.id))));
}

/** The figure that ranks a project in its sector: the first headline candidate it has a value for. Null for unmeasured sectors. */
export function headlineOf(p: Project, end?: string | null): ResolvedMetric | null {
  for (const id of sectorConfig(p.sector).headline) {
    const r = resolveMetric(p, id, end);
    if (r.state === "value" && r.value !== null) return r;
  }
  return null;
}

/** The headline the sector would show first, for labels when a project has no value yet. */
export function sectorHeadlineDef(sector: string): MetricDef | null {
  const id = sectorConfig(sector).headline[0];
  return id ? METRIC_DEFS[id] : null;
}

export interface RankedLeader {
  project: Project;
  /** Null when the project has no headline figure (or the sector is unmeasured). */
  headline: ResolvedMetric | null;
  /** The project's role, from the dataset's subcategory; what unmeasured sectors show in place of a figure. */
  role: string | null;
}

const UNKNOWN_ROLE = new Set(["", "Unknown"]);
export function roleOf(p: Project): string | null {
  const s = (p.subcategory ?? "").trim();
  return UNKNOWN_ROLE.has(s) ? null : s;
}

/**
 * A sector's projects in leader order. Measured sectors rank by the headline figure, largest first, and
 * fall back to the curated rank for projects with no figure. Unmeasured sectors use the curated rank alone,
 * so only projects in the sector leaders file appear. Flagged values rank like any other, and no two metrics
 * are ever added together, so nothing is double counted.
 */
export function sectorLeaders(projects: Project[], sector: string, end?: string | null): RankedLeader[] {
  const cfg = sectorConfig(sector);
  const rows = projects.filter((p) => p.sector === sector).map((p) => ({ project: p, headline: cfg.measured ? headlineOf(p, end) : null, role: roleOf(p) }));
  const rank = (p: Project) => p.leaderRank ?? Number.POSITIVE_INFINITY;
  const byCurated = (a: RankedLeader, b: RankedLeader) => rank(a.project) - rank(b.project) || a.project.name.localeCompare(b.project.name);
  if (!cfg.measured) return rows.filter((r) => r.project.leaderRank !== null).sort(byCurated);
  return rows
    .filter((r) => r.headline !== null || r.project.leaderRank !== null)
    .sort((a, b) => (b.headline?.value ?? -1) - (a.headline?.value ?? -1) || byCurated(a, b));
}

/** Format a metric value for a row: full dollars in the pop-up, compact on cards. */
export function fmtMetricValue(def: MetricDef, v: number, compact = false): string {
  if (def.unit === "usd") return compact ? fmtUsd(v) : fmtUsdFull(v);
  // Small shares keep one decimal, so a 5.3% APY or a 0.4% share never rounds to a bare 5% or 0%.
  if (def.unit === "pct") return fmtPct(v, Math.abs(v) < 0.1 ? 1 : 0);
  if (def.unit === "ratio") return `${v.toFixed(1)}×`;
  return compact && v >= 10_000 ? `${(v / 1000).toFixed(v >= 100_000 ? 0 : 1)}K` : fmtInt(v);
}

/** The Total deposited, Borrowed and TVL trio a lending pop-up shows side by side, each with a one-line definition. */
export const LENDING_TRIO = ["deposited", "borrowed", "tvl"] as const;
export const LENDING_BRIEFS: Record<string, string> = {
  deposited: "Collateral plus lending supply",
  borrowed: "Loans outstanding, left out of TVL",
  tvl: "Deposits minus borrowed funds",
};

/** Utilization for a lender with no supply and collateral split: borrowed over TVL plus borrowed. */
export function utilization(borrowed: number | null, tvl: number | null): number | null {
  if (borrowed === null || tvl === null) return null;
  const base = tvl + borrowed;
  return base > 0 ? borrowed / base : null;
}

/** Headlines the onchain tier rule already covers, with its own minimums (src/lib/tier.ts, onchainTier). */
const ONCHAIN_TIERED = new Set(["stableSupply", "tokenized", "tokenVolume"]);

/** Which threshold a headline figure is held to: levels of capital count like TVL, flows of trading count like 30-day volume. */
export const TIER_SLOT: Record<string, "tvl" | "volume"> = {
  tvl: "tvl",
  deposited: "tvl",
  openInterest: "tvl",
  vaultAssets: "tvl",
  volume: "volume",
  aggVolume: "volume",
  bridgeAggVolume: "volume",
  venueVolume: "volume",
};

/**
 * The figure a sector's headline hands to the tier thresholds, in the TVL slot or the volume slot.
 * Holders never set a tier, and supply or token volume keep the minimums of the onchain rule.
 */
export function headlineTierInput(p: Project): { tvl: number | null; volume: number | null } {
  const cfg = sectorConfig(p.sector);
  const h = cfg.measured && cfg.tierKind !== "none" ? headlineOf(p) : null;
  const slot = h && !ONCHAIN_TIERED.has(h.def.id) ? TIER_SLOT[h.def.id] : undefined;
  const v = h && slot ? h.value : null;
  return { tvl: slot === "tvl" ? v : null, volume: slot === "volume" ? v : null };
}
