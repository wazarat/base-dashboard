/**
 * Traction that DefiLlama's protocol listings miss (pure): stablecoin and RWA supply on the chain,
 * project-token DEX volume and NFT collections. Kept apart from the chain TVL, volume, fees and
 * revenue KPIs so nothing is counted twice.
 */
import { isDexTradedRole, isFungibleRole, isNftRole } from "./contract-roles";
import { addDays, type DateStr } from "./dates";
import type { StablecoinRecord, TokenDexRecord, TokenMetaRecord, TokenSnapRow } from "./history-types";
import { sumWindow, valueAt } from "./live";

export const BLOCKSCOUT_TOKEN = "https://robinhoodchain.blockscout.com/token/";
export const LLAMA_STABLECOINS_CHAIN = "https://defillama.com/stablecoins/base";
export const GECKO_TOKEN = "https://www.geckoterminal.com/robinhood/tokens/";
/** Transfers counted page by page for the 30-day window stop here; the NFT rule needs 100. */
export const RECENT_TRANSFER_CAP = 100;

export interface StablecoinMapRow {
  llamaId: string;
  symbol: string;
  project: string;
  address: string | null;
  decimals: number | null;
  source: string;
}

export interface OnchainContract {
  address: string;
  role: string;
  symbol: string | null;
}

export interface OnchainSignal {
  kind: "stablecoin" | "rwa" | "token" | "nft";
  symbol: string;
  /** USD supply on the chain (stablecoin, rwa) or 30-day DEX volume (token); null for NFTs. */
  usd: number | null;
  holders: number | null;
  transfers30d: number | null;
  address: string | null;
  sources: Array<{ label: string; url: string }>;
}

export interface OnchainMetrics {
  asOf: DateStr;
  stableSupply: number | null;
  rwaSupply: number | null;
  tokenVolume30d: number | null;
  tokenLiquidity: number | null;
  /** Most holders across the project's fungible tokens. */
  holders: number | null;
  nftHolders: number | null;
  nftTransfers30d: number | null;
  /** One line per token or collection, biggest first. */
  signals: OnchainSignal[];
}

export interface OnchainStore {
  coins: Record<string, StablecoinRecord>;
  meta: Record<string, TokenMetaRecord>;
  snaps: Record<string, TokenSnapRow[]>;
  dex: Record<string, TokenDexRecord>;
}

/** Snapshots are taken during the refresh, a day after the last complete day `end`, so that day counts too. */
const latest = (rows: TokenSnapRow[] | undefined, end: DateStr): TokenSnapRow | null => {
  let best: TokenSnapRow | null = null;
  for (const r of rows ?? []) if (r[0] <= addDays(end, 1) && r[0] >= addDays(end, -7)) best = r;
  return best;
};

/** Transfers in the 30 days to `end`: the difference of the running total when history reaches back far enough, else the capped page count. */
export function transfers30d(rows: TokenSnapRow[] | undefined, end: DateStr): number | null {
  const now = latest(rows, end);
  if (!now) return null;
  const startDay = addDays(end, -30);
  const then = (rows ?? []).filter((r) => r[0] <= startDay && r[0] >= addDays(startDay, -3)).at(-1);
  if (now[4] !== null && then?.[4] != null) return Math.max(0, now[4] - then[4]);
  return now[5];
}

const symOf = (c: OnchainContract, store: OnchainStore) => c.symbol || store.meta[c.address]?.symbol || "Token";
const sumOrNull = (xs: Array<number | null>) => (xs.some((v) => v !== null) ? xs.reduce<number>((s, v) => s + (v ?? 0), 0) : null);
const maxOrNull = (xs: Array<number | null>) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.max(...v) : null;
};

export function computeOnchain(contracts: OnchainContract[], stables: StablecoinMapRow[], store: OnchainStore, end: DateStr): OnchainMetrics | null {
  const signals: OnchainSignal[] = [];
  let asOf: DateStr | null = null;
  const seen = (d: DateStr | undefined | null) => {
    if (d && (!asOf || d > asOf)) asOf = d;
  };

  // Stablecoins: supply on the chain from DefiLlama, holders from Blockscout when the address is mapped.
  const stableUsd: Array<number | null> = [];
  for (const s of stables) {
    const coin = store.coins[s.llamaId];
    const usd = coin ? valueAt(coin.series, end, 3) : null;
    if (coin) seen(coin.series.filter(([d]) => d <= end).at(-1)?.[0]);
    const snap = s.address ? latest(store.snaps[s.address], end) : null;
    if (snap) seen(snap[0]);
    stableUsd.push(usd);
    const sources = [{ label: "DefiLlama", url: LLAMA_STABLECOINS_CHAIN }];
    if (s.address) sources.push({ label: "Blockscout", url: `${BLOCKSCOUT_TOKEN}${s.address}` });
    signals.push({ kind: "stablecoin", symbol: s.symbol, usd, holders: snap?.[1] ?? null, transfers30d: null, address: s.address, sources });
  }

  // RWA tokens: supply times price, both from Blockscout.
  const rwaUsd: Array<number | null> = [];
  for (const c of contracts.filter((x) => x.role === "rwa-token")) {
    const snap = latest(store.snaps[c.address], end);
    if (snap) seen(snap[0]);
    const usd = snap && snap[2] !== null && snap[3] !== null ? snap[2] * snap[3] : null;
    rwaUsd.push(usd);
    signals.push({ kind: "rwa", symbol: symOf(c, store), usd, holders: snap?.[1] ?? null, transfers30d: null, address: c.address, sources: [{ label: "Blockscout", url: `${BLOCKSCOUT_TOKEN}${c.address}` }] });
  }

  // Project tokens: 30-day DEX volume and liquidity on network robinhood (GeckoTerminal), holders from Blockscout.
  const vols: Array<number | null> = [];
  const liqs: Array<number | null> = [];
  for (const c of contracts.filter((x) => isDexTradedRole(x.role))) {
    const dex = store.dex[c.address];
    const w = dex ? sumWindow(dex.volume, end, 30) : null;
    const vol = w && w.days > 0 ? w.value : null;
    const liq = dex?.liquidity.filter(([d]) => d <= addDays(end, 1)).at(-1) ?? null;
    if (dex) seen(dex.volume.filter(([d]) => d <= end).at(-1)?.[0]);
    const snap = latest(store.snaps[c.address], end);
    vols.push(vol);
    liqs.push(liq ? liq[1] : null);
    if (vol === null && !snap) continue;
    signals.push({ kind: "token", symbol: symOf(c, store), usd: vol, holders: snap?.[1] ?? null, transfers30d: null, address: c.address, sources: [{ label: "GeckoTerminal", url: `${GECKO_TOKEN}${c.address}` }, { label: "Blockscout", url: `${BLOCKSCOUT_TOKEN}${c.address}` }] });
  }

  // NFT collections: holders and 30-day transfers from Blockscout.
  const nftHolders: Array<number | null> = [];
  const nftTransfers: Array<number | null> = [];
  for (const c of contracts.filter((x) => isNftRole(x.role))) {
    const snap = latest(store.snaps[c.address], end);
    if (!snap) continue;
    seen(snap[0]);
    const t = transfers30d(store.snaps[c.address], end);
    nftHolders.push(snap[1]);
    nftTransfers.push(t);
    signals.push({ kind: "nft", symbol: symOf(c, store), usd: null, holders: snap[1], transfers30d: t, address: c.address, sources: [{ label: "Blockscout", url: `${BLOCKSCOUT_TOKEN}${c.address}` }] });
  }

  const holders = maxOrNull(contracts.filter((c) => isFungibleRole(c.role)).map((c) => latest(store.snaps[c.address], end)?.[1] ?? null));
  if (!signals.length || !asOf) return null;
  signals.sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1) || (b.holders ?? 0) - (a.holders ?? 0));
  // The NFT with the most holders stands for the project in the 30-day transfer rule.
  const topNft = signals.filter((s) => s.kind === "nft").sort((a, b) => (b.holders ?? 0) - (a.holders ?? 0))[0];
  return {
    asOf,
    stableSupply: sumOrNull(stableUsd),
    rwaSupply: sumOrNull(rwaUsd),
    tokenVolume30d: sumOrNull(vols),
    tokenLiquidity: sumOrNull(liqs),
    holders,
    nftHolders: topNft?.holders ?? maxOrNull(nftHolders),
    nftTransfers30d: topNft?.transfers30d ?? maxOrNull(nftTransfers),
    signals,
  };
}

/** The supply figure that counts like TVL: stablecoin plus RWA supply on the chain. */
export function onchainSupply(o: OnchainMetrics | null | undefined): number | null {
  if (!o) return null;
  return o.stableSupply === null && o.rwaSupply === null ? null : (o.stableSupply ?? 0) + (o.rwaSupply ?? 0);
}

type Raw = Record<string, string | undefined>;

export function parseStablecoinMap(rows: Raw[]): StablecoinMapRow[] {
  return rows
    .map((r) => {
      const address = (r["Address"] ?? "").trim().toLowerCase();
      const decRaw = (r["Decimals"] ?? "").trim();
      return {
        llamaId: (r["DefiLlama id"] ?? "").trim(),
        symbol: (r["Symbol"] ?? "").trim(),
        project: (r["Project"] ?? "").trim(),
        address: /^0x[0-9a-f]{40}$/.test(address) ? address : null,
        decimals: decRaw !== "" && Number.isFinite(Number(decRaw)) ? Number(decRaw) : null,
        source: (r["Source"] ?? "").trim(),
      };
    })
    .filter((r) => r.llamaId);
}

export interface StablecoinSummary {
  asOf: DateStr;
  /** DefiLlama's Base total (stablecoincharts). */
  total: number | null;
  coins: Array<{ id: string; symbol: string; name: string; usd: number; project: string | null }>;
  /** Sum of coins tied to an Atlas project in data/stablecoin-map.csv. */
  mapped: number;
  /** Mapped share of the chain total, null without a total. */
  mappedShare: number | null;
}

/** Chain total and per-coin values on `end`, for the Overview KPI and the 5% reconciliation. */
export function stablecoinSummary(coins: Record<string, StablecoinRecord>, chain: Array<[DateStr, number]>, map: StablecoinMapRow[], projectNames: Set<string>, end: DateStr): StablecoinSummary | null {
  const projectOf = new Map(map.filter((m) => projectNames.has(m.project)).map((m) => [m.llamaId, m.project]));
  const list = Object.values(coins)
    .map((c) => ({ id: c.id, symbol: c.symbol, name: c.name, usd: valueAt(c.series, end, 3) ?? 0, project: projectOf.get(c.id) ?? null }))
    .filter((c) => c.usd > 0)
    .sort((a, b) => b.usd - a.usd);
  const total = valueAt(chain, end, 3);
  if (!list.length && total === null) return null;
  const mapped = list.filter((c) => c.project).reduce((s, c) => s + c.usd, 0);
  return { asOf: end, total, coins: list, mapped, mappedShare: total ? mapped / total : null };
}
