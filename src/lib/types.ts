export const NATIVE_CHAINS = [
  "Base native",
  "Other EVM",
  "Other non-EVM",
  "Centralized / off-chain",
] as const;
export type NativeChain = (typeof NATIVE_CHAINS)[number];

export const TIERS = [
  "Tier 1 - Leader",
  "Tier 2 - Strong",
  "Tier 3 - Emerging",
  "Tracked, negligible",
  "Not tracked",
  // Set at build for sectors with no headline traction metric (src/lib/sector-metrics.ts); never a value in the CSV.
  "Not applicable",
] as const;
export type Tier = (typeof TIERS)[number];

export const RISK_LEVELS = [
  "High",
  "Medium",
  "Low",
  "Unknown",
  "Not researched",
] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const STATUS_GROUPS = [
  "Mainnet",
  "Building",
  "Hackathon",
  "Inactive",
  "Defunct",
  "Unknown",
] as const;
export type StatusGroup = (typeof STATUS_GROUPS)[number];

export const CONFIDENCE = ["High", "Medium", "Low"] as const;
export type Confidence = (typeof CONFIDENCE)[number];

export const METRICS = ["count", "tvl", "volume", "fees", "revenue"] as const;
export type MetricKey = (typeof METRICS)[number];
export type NumericMetricKey = Exclude<MetricKey, "count">;

export const EVENT_TYPES = [
  "Milestone",
  "Integration",
  "Program",
  "Funding",
  "Incentive",
  "Incident",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface Project {
  id: string;
  name: string;
  website: string | null;
  sector: string;
  subcategory: string | null;
  chain: NativeChain;
  chainDetail: string | null;
  chainConfidence: Confidence;
  tier: Tier;
  tvl: number | null;
  volume: number | null;
  fees: number | null;
  revenue: number | null;
  otherTraction: string | null;
  tractionSources: string[];
  /** Raw Funding Type cell, e.g. "Corporate/parent; VC-backed". */
  fundingType: string;
  /** Split on ";" so compound values can be filtered individually. */
  fundingTypes: string[];
  investors: string | null;
  amountRaised: string | null;
  /** True when Amount Raised holds a real figure, not Unknown / Undisclosed / N/A. */
  amountDisclosed: boolean;
  /** Ticker when one exists; null for blank, None, Unknown, None confirmed. */
  token: string | null;
  tokenRaw: string | null;
  fundingSourceUrl: string | null;
  risk: RiskLevel;
  audits: string | null;
  incidents: string | null;
  redFlags: string | null;
  securitySourceUrl: string | null;
  description: string;
  status: string;
  statusGroup: StatusGroup;
  xHandle: string | null;
  discoveredVia: string;
  sourceUrl: string | null;
  /** Any of tvl, volume, fees, revenue is non-null. */
  hasTraction: boolean;
  /** revenue / fees when both are present and fees > 0. */
  revenueCapture: number | null;
  leaderRank: number | null;
  /** Values exactly as researched in the CSV snapshot. */
  snapshot: Snapshot;
  /** Daily-refreshed values joined from data/history; null when the project has no mapped DefiLlama entry. */
  live: LiveMetrics | null;
  /** Where each effective metric came from. */
  metricSource: Record<NumericMetricKey, MetricSource>;
  /** Contracts tracked for onchain activity (data/contracts.csv). */
  contracts: ContractInfo[];
  /** Values from only the slugs DefiLlama counts in its chain total (src/lib/flags.ts); what the Overview sums. */
  counted?: CountedMetrics | null;
  /** Fees and revenue over 7, 30 and 90 days from listings that report both (src/lib/biz-model.ts). */
  biz?: import("./biz-model").BizModel | null;
  /** Stablecoin and RWA supply, token DEX volume and NFT holders on the chain (src/lib/onchain.ts). Never part of the chain KPIs. */
  onchain?: import("./onchain").OnchainMetrics | null;
  /** Sector metrics beyond the four core ones, keyed by metric id (src/lib/sector-metrics.ts). Sparse, and never part of the chain KPIs. */
  sectorMetrics?: Record<string, SectorMetricValue>;
  /** Why a core metric sits outside DefiLlama's chain total, when it does. A flagged value still ranks; it is never summed into a KPI. */
  metricFlags?: Partial<Record<NumericMetricKey, MetricFlag>>;
  /** Date and conflict check for the Other Traction Signal (src/lib/signal-check.ts). */
  signal?: SignalCheck | null;
}

/** Why a figure is kept out of the chain totals. */
export type MetricFlag = "doublecounted" | "cex" | "locker" | "bridge" | "chain-income" | "outside-total" | "routed";

export interface SectorMetricValue {
  v: number;
  /** Day the figure covers. */
  asOf: string;
  flag?: MetricFlag;
  /** For a zero the source reports on purpose, the source's own sentence saying so. */
  zero?: string;
}

export interface SignalCheck {
  /** Date the signal speaks for: one written in its text, else the dataset snapshot day. */
  asOf: string;
  /** True when the date was read from the signal text. */
  dated: boolean;
  /** The signal's dollar figure differs from the live metric of the same kind by more than 25%. */
  conflict: { kind: string; signal: number; live: number; gap: number } | null;
  /** Conflicting and older than 30 days, so the pop-up tucks it behind Older figure. */
  older: boolean;
}

export interface CountedMetrics {
  values: Record<NumericMetricKey, number | null>;
  change: Record<NumericMetricKey, MetricChange>;
}

export interface ContractInfo {
  address: string;
  role: string;
  verified: string;
  name: string;
  symbol?: string | null;
  decimals?: number | null;
  source?: string;
}

export type MetricSource = "live" | "snapshot" | "none";

export interface Snapshot {
  tvl: number | null;
  volume: number | null;
  fees: number | null;
  revenue: number | null;
  tier: Tier;
  asOf: string;
}

export interface MetricChange {
  d7: number | null;
  d30: number | null;
  d90: number | null;
}

export interface LiveMetrics {
  /** Last complete UTC day the numbers cover. */
  asOf: string;
  slugs: string[];
  tvl: number | null;
  volume: number | null;
  fees: number | null;
  revenue: number | null;
  holdersRevenue: number | null;
  supplySideRevenue: number | null;
  feesDaily: number | null;
  change: Record<NumericMetricKey, MetricChange>;
  annualisedRevenue: number | null;
  tokenMarketCap: number | null;
  psRatio: number | null;
  txns24h: number | null;
  txns7d: number | null;
  uniqueSenders7d: number | null;
  holders: number | null;
  activityAsOf: string | null;
  /** Some tracked contract exceeded the backfill size cap, so early history is incomplete. */
  activityPartial: boolean;
}

/** 90-day sparkline series per project, aligned to a shared date axis. */
export type SeriesKey = NumericMetricKey | "txns";

export interface SeriesFile {
  dates: string[];
  projects: Record<string, Record<SeriesKey, Array<number | null>>>;
}

export const CHAIN_SERIES = ["tvl", "volume", "fees", "revenue", "holdersRevenue", "supplySideRevenue", "activeUsers"] as const;
export type ChainSeriesKey = (typeof CHAIN_SERIES)[number];

export interface ChainData {
  dates: string[];
  defillama: Record<ChainSeriesKey, Array<number | null>>;
  blockscout: Record<string, Array<number | null>>;
  /** Chain activity from growthepie, aligned to `dates`: activeAddresses, txns, smartWallets7d. */
  activity: Record<string, Array<number | null>>;
  counters: Record<string, number>;
  latest: {
    asOf: string;
    tvl: number | null;
    volume30d: number | null;
    fees30d: number | null;
    revenue30d: number | null;
    activeUsers: number | null;
    activeAccounts: number | null;
    txns: number | null;
    change: Record<"tvl" | "volume" | "fees" | "revenue" | "activeAccounts" | "txns", MetricChange>;
  };
}

export interface SourceSummary {
  ok: boolean;
  lastSuccess: string | null;
  error: string | null;
  skipped: string | null;
}

export interface Leader {
  sector: string;
  rank: number;
  name: string;
  projectId: string | null;
  website: string | null;
  why: string;
  status: string;
  xHandle: string | null;
  evidenceUrl: string | null;
}

export interface EcosystemEvent {
  id: string;
  date: string;
  type: EventType;
  title: string;
  projects: string[];
  projectIds: string[];
  amount: number | null;
  amountNote: string | null;
  detail: string | null;
  sourceUrl: string | null;
}

export interface MemoInsight {
  n: number;
  title: string;
  text: string;
}

export interface Meta {
  /** Date the headline numbers cover: the live window end when history exists, else the CSV date. */
  asOf: string;
  asOfLabel: string;
  snapshotAsOf: string;
  snapshotAsOfLabel: string;
  live: { lastRun: string; windowEnd: string; perSource: Record<string, SourceSummary> } | null;
  counts: {
    projects: number;
    sectors: number;
    leaders: number;
    events: number;
    tier1: number;
    liveProjects: number;
    newlyDetected: number;
    mappedSlugs: number;
    rounds: number;
    investors: number;
  };
  totals: { tvl: number; volume: number; fees: number; revenue: number };
  /** Reconciliation against DefiLlama's chain totals and what the Atlas leaves out, per metric (src/lib/reconcile.ts). */
  chainTotals: {
    windowStart: string;
    windowEnd: string;
    checks: Array<{ id: string; label: string; ours: number; theirs: number | null; gap: number | null; ok: boolean }>;
    atlas: Record<NumericMetricKey, number>;
    excluded: Record<NumericMetricKey, Array<{ reason: string; label: string; names: string[]; value: number; count: number }>>;
  } | null;
  snapshotTotals: { tvl: number; volume: number; fees: number; revenue: number };
  tierCounts: Record<Tier, number>;
  /** Stablecoin supply on the chain from DefiLlama, a separate metric that never enters the TVL KPI. */
  stablecoins: import("./onchain").StablecoinSummary | null;
  sectors: string[];
  chains: string[];
  tiers: string[];
  statuses: string[];
  fundingTypes: string[];
  /** Counts from the funding and security research; the per-project facts are gated. */
  research: { fundingChecked: number; securityResearched: number; redFlagged: number };
  discoveredVia: string[];
}

export type RoundConfidence = "Sourced" | "Prior knowledge (re-verify)";

export interface Round {
  id: string;
  project: string;
  projectId: string | null;
  roundType: string;
  bucket: string;
  date: string | null;
  amount: number | null;
  amountNote: string | null;
  leadInvestors: string[];
  otherInvestors: string[];
  /** Base related per the research file. */
  related: boolean;
  confidence: RoundConfidence;
  sourceUrl: string | null;
}

export interface Investor {
  id: string;
  name: string;
  deals: number;
  led: number;
  totalDisclosed: number;
  relatedDeals: number;
  projects: Array<{ name: string; projectId: string | null }>;
  rounds: string[];
}
