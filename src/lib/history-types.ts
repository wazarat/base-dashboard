/**
 * Shapes of the committed history store under data/history/**.
 * Written by scripts/refresh.ts, read by scripts/build-data.ts and the tests.
 */
import type { DateStr } from "./dates";

export type DailyPoint = [date: DateStr, value: number];
/** Sorted ascending by date, one point per date. */
export type Series = DailyPoint[];
export type SeriesMap = Record<string, Series>;

export const SOURCE_IDS = [
  "defillama",
  "blockscout",
  "growthepie",
  "morpho",
  "blockscout-keyed",
  "defillama-stablecoins",
  "blockscout-tokens",
  "geckoterminal-tokens",
  "blockscout-nfts",
  // Sector metric sources (docs/SECTOR-METRICS.md, section 2).
  "llama-aggregators",
  "llama-bridge-aggregators",
  "llama-open-interest",
  "llama-options",
  "llama-hacks",
  "llama-yields",
  "morpho-vaults",
  "geckoterminal-venues",
] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export interface SourceStatus {
  lastAttempt: string | null;
  lastSuccess: string | null;
  rows: number;
  calls: number;
  ms: number;
  error: string | null;
  /** Reason the source was skipped on purpose, e.g. "BLOCKSCOUT_API_KEY not set". */
  skipped: string | null;
  notes: string[];
}

export interface NewlyDetected {
  /** "stablecoin" rows come from DefiLlama's stablecoin listing (slug is "stablecoin:<id>"); the rest are protocols. */
  kind?: "protocol" | "stablecoin";
  slug: string;
  name: string;
  category: string;
  parentProtocol: string | null;
  tvl: number;
  firstSeen: DateStr;
  url: string;
}

export interface HistoryMeta {
  version: 1;
  lastRun: string | null;
  /** UTC day of the last run; build-data derives the analysis window from it. */
  lastRunDate: DateStr | null;
  mode: "daily" | "backfill" | null;
  perSource: Record<SourceId, SourceStatus>;
  cursors: {
    geckoHourly: { nextPoolIndex: number; oldestTs: Record<string, number>; done: Record<string, boolean> };
    blockscoutTx: Record<string, { nextPageParams: Record<string, string> | null; done: boolean; rows: number }>;
    /** "file/name" -> date DefiLlama last said that data type does not exist for the protocol. */
    llamaMissing?: Record<string, string>;
  };
  newlyDetected: NewlyDetected[];
  unmatchedCsv: string[];
  unmatchedMap: string[];
}

/** Series DefiLlama reports beside a protocol's TVL on a chain, as `<chain>-<key>`; none of them is part of TVL. */
export const EXTRA_TVL_KEYS = ["borrowed", "staking", "pool2", "vesting"] as const;
export type ExtraTvlKey = (typeof EXTRA_TVL_KEYS)[number];

/** One listing in DefiLlama's revenue overview: what it reports for 30 days and how it defines the figure. */
export interface LlamaMethodology {
  revenue30d: number | null;
  revenue: string | null;
  fees: string | null;
}

/** One incident DefiLlama records for the chain (/hacks). `chains` above 1 means the amount is shared with other chains. */
export interface LlamaHack {
  date: DateStr;
  name: string;
  classification: string | null;
  technique: string | null;
  amount: number | null;
  returned: number | null;
  targetType: string | null;
  source: string | null;
  chains: number;
}

/** One yield pool on the chain with the lending side of the same pool, when it has one. APYs are shares (0.04 is 4%). */
export interface YieldPoolRecord {
  pool: string;
  /** DefiLlama slug of the protocol the pool belongs to. */
  project: string;
  symbol: string;
  tvlUsd: number | null;
  apyBase: number | null;
  apyReward: number | null;
  apy: number | null;
  supplyUsd: number | null;
  borrowUsd: number | null;
  apyBorrow: number | null;
  ltv: number | null;
}
export interface YieldPoolsFile {
  asOf: DateStr;
  pools: YieldPoolRecord[];
}

/** One Morpho vault on the chain. Its assets already sit in Morpho's markets, so they are double counted by construction. */
export interface MorphoVaultRecord {
  address: string;
  name: string;
  symbol: string;
  assetsUsd: number | null;
  netApy: number | null;
  curators: string[];
  asset: { symbol: string; address: string } | null;
}
export interface MorphoVaultsFile {
  asOf: DateStr;
  vaults: MorphoVaultRecord[];
}

/** One trading venue on GeckoTerminal (a DEX id on network robinhood): daily 24-hour volume and liquidity, and the pools seen with their creation day. */
export interface GeckoVenueRecord {
  id: string;
  name: string;
  /** [day, 24h volume across the pools read that day] */
  volume: Series;
  liquidity: Series;
  /** pool address -> day it was created */
  pools: Record<string, DateStr>;
}

/** Morpho totals across every market on the chain for one day: lending supply, borrowed, collateral posted (USD). */
export type MorphoTotalsRow = [DateStr, number, number, number];

export interface LlamaProtocolSnap {
  slug: string;
  name: string;
  parentProtocol: string | null;
  category: string;
  /** Lowercase 0x address on Base when the listing gives one. */
  address: string | null;
  tvl: number;
  mcap: number | null;
  geckoId: string | null;
  url: string | null;
  /** Which DefiLlama listings carry this protocol: tvl (the /protocols listing), dexs, fees. */
  kinds: Array<"tvl" | "dexs" | "fees">;
  /** GitHub link to the protocol's TVL adapter, and its module name in a shared registry. */
  codePath?: string | null;
  module?: string | null;
  /** [day, TVL on this chain] from the lite listing's previous-day value, the same day as the chain total it is checked against. */
  tvlPrevDay?: [DateStr, number] | null;
  /** Counted in DefiLlama's chain total for each metric (src/lib/flags.ts). */
  inChainTotal?: { tvl: boolean; volume: boolean; fees: boolean; revenue: boolean };
  /** In DefiLlama's double-counted TVL bucket. */
  doublecounted?: boolean;
  /** Why TVL sits outside the Atlas total, if it does. */
  tvlExclusion?: "doublecounted" | "cex" | "locker" | "bridge" | "chain-income" | null;
  chainIncome?: boolean;
}

/** Result of reading a protocol's adapter source on GitHub. */
export interface AdapterCheck {
  /** null when the source or the registry entry could not be read. */
  doublecounted: boolean | null;
  source: string | null;
  checked: DateStr;
}

export interface ChainHistory {
  defillama: {
    tvl: Series;
    volume: Series;
    fees: Series;
    revenue: Series;
    holdersRevenue: Series;
    supplySideRevenue: Series;
    activeUsers: Series;
    /** /lite/charts: TVL before removing double counts, and the double-counted part. */
    tvlGross?: Series;
    tvlDoublecounted?: Series;
  };
  blockscoutLines: SeriesMap;
  /** Chain activity from growthepie (data/history/growthepie.json, joined at build): activeAddresses, txns and smartWallets7d. */
  growthepie?: SeriesMap;
  counters: Array<[DateStr, Record<string, number>]>;
}

export interface StockPool {
  address: string;
  dex: string;
  name: string;
  createdAt: string;
  base: string;
  quote: string;
}

export interface StockToken {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  status: string;
  multiplier: number;
  pendingMultiplier: number | null;
  isin: string | null;
  logoUrl: string | null;
  tradingCapabilities: Record<string, boolean>;
  feed: { proxy: string; decimals: number; heartbeat: number; is247: boolean } | null;
  /** Top pools by liquidity (up to 3) used for candles. */
  pools: StockPool[];
  /** From the periodic full pool crawl. */
  poolCount?: number;
  quotePools?: number;
  venues?: string[];
  poolsScannedAt?: string;
}

export interface StockIndex {
  fetchedAt: string;
  tokens: Record<string, StockToken>;
}

export type Candle = [date: DateStr, open: number, high: number, low: number, close: number, volumeUsd: number];
export type HourRow = [ts: number, close: number, volumeUsd: number];

export interface StockDaily {
  symbol: string;
  candles: Record<string, Candle[]>;
  token: Array<[DateStr, number | null, number | null, number | null, number | null]>;
  chainlink: Array<[DateStr, number, number]>;
  /** Feed round history: [updatedAt unix, price], ascending; the feed holds each value until the next round. */
  chainlinkRounds?: Array<[number, number]>;
  /** Resume point for the round backfill: oldest round id fetched so far (decimal string) and whether the window is complete. */
  chainlinkCursor?: { oldestRoundId: string; done: boolean };
  robinhood: Array<[DateStr, number | null, number | null, number | null]>;
  onchain: Array<[DateStr, number | null, number | null, number | null]>;
  morpho: Array<[DateStr, number, number]>;
}

export interface StockHourly {
  symbol: string;
  pools: Record<string, HourRow[]>;
}

/** One stablecoin on Base from stablecoins.llama.fi; series is the USD value on this chain only. */
export interface StablecoinRecord {
  id: string;
  symbol: string;
  name: string;
  pegType: string;
  series: Series;
}

/** Token identity as Blockscout reports it, used by the spoof guard (src/lib/token-guard.ts). */
export interface TokenMetaRecord {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  type: string | null;
  checked: DateStr;
}

/** [date, holders, total supply (decimals applied), price USD, transfers ever, transfers in the last 30 days (capped)] */
export type TokenSnapRow = [date: DateStr, holders: number | null, supply: number | null, priceUsd: number | null, transfersTotal: number | null, transfers30d: number | null];

/** DEX activity of one project token on network robinhood only, summed over its pools. */
export interface TokenDexRecord {
  /** [date, liquidity USD summed over pools] */
  liquidity: Array<[DateStr, number]>;
  /** Daily volume USD summed over pools. */
  volume: Series;
  pools: number;
  /** Day the token's daily candles were last fetched; later days use the batched 24h volume. */
  backfilled?: DateStr;
}

/** Per-contract daily activity from the transaction backfill (keyed Blockscout). */
export interface ContractActivity {
  /** [date, transactions, unique senders (estimate)] */
  days: Array<[DateStr, number, number]>;
  next: Record<string, string> | null;
  done: boolean;
  /** Contract had more than BACKFILL_MAX_TXNS transactions, so page-by-page history was skipped. */
  skippedLarge: boolean;
  pages: number;
}

export interface MorphoMarketRecord {
  marketId: string;
  lltv: number | null;
  loan: { symbol: string; address: string } | null;
  collateral: { symbol: string; address: string } | null;
  /** Symbol looks like a stock ticker but the address is not an official token. */
  lookAlike: boolean;
  series: Array<[DateStr, number | null, number | null, number | null]>;
}

export function emptySourceStatus(): SourceStatus {
  return { lastAttempt: null, lastSuccess: null, rows: 0, calls: 0, ms: 0, error: null, skipped: null, notes: [] };
}

export function emptyMeta(): HistoryMeta {
  const perSource = {} as Record<SourceId, SourceStatus>;
  for (const id of SOURCE_IDS) perSource[id] = emptySourceStatus();
  return {
    version: 1,
    lastRun: null,
    lastRunDate: null,
    mode: null,
    perSource,
    cursors: { geckoHourly: { nextPoolIndex: 0, oldestTs: {}, done: {} }, blockscoutTx: {} },
    newlyDetected: [],
    unmatchedCsv: [],
    unmatchedMap: [],
  };
}
