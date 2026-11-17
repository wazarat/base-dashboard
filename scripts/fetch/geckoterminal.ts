/**
 * GeckoTerminal parsers for network "base", shared by the token and venue fetchers (geckoterminal-tokens.ts,
 * geckoterminal-venues.ts). The calls themselves are paced by the shared GeckoTerminal limiter (gecko-client.ts).
 */
import type { Candle, HourRow, StockPool } from "../../src/lib/history-types";
import { CHAIN } from "../../src/lib/chain";
import { dateOf } from "../../src/lib/dates";

const BASE = `https://api.geckoterminal.com/api/v2/networks/${CHAIN.geckoNetwork}`;

interface GtPool {
  id: string;
  attributes: { address: string; name: string; pool_created_at?: string; reserve_in_usd?: string; volume_usd?: Record<string, string> };
  relationships: { dex?: { data: { id: string } }; base_token?: { data: { id: string } }; quote_token?: { data: { id: string } } };
}
interface GtToken {
  id: string;
  attributes: { address: string; name: string; symbol: string; price_usd?: string | null; fdv_usd?: string | null; market_cap_usd?: string | null; total_supply?: string | null; volume_usd?: Record<string, string> };
  relationships?: { top_pools?: { data: { id: string }[] } };
}

const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const tokenAddr = (id: string | undefined) => (id ?? "").replace(new RegExp(`^${CHAIN.geckoNetwork}_`), "").toLowerCase();

export function parsePools(json: { data?: GtPool[] }): Array<StockPool & { reserveUsd: number; volume24h: number }> {
  return (json.data ?? []).map((p) => ({
    address: p.attributes.address,
    dex: p.relationships.dex?.data.id ?? "unknown",
    name: p.attributes.name,
    createdAt: p.attributes.pool_created_at ?? "",
    base: tokenAddr(p.relationships.base_token?.data.id),
    quote: tokenAddr(p.relationships.quote_token?.data.id),
    reserveUsd: num(p.attributes.reserve_in_usd) ?? 0,
    volume24h: num(p.attributes.volume_usd?.h24) ?? 0,
  }));
}

export interface TokenSnap {
  address: string;
  priceUsd: number | null;
  fdv: number | null;
  mcap: number | null;
  vol24: number | null;
  totalSupply: number | null;
  topPoolIds: string[];
}

export function parseTokens(json: { data?: GtToken | GtToken[]; included?: GtPool[] }): { tokens: TokenSnap[]; pools: ReturnType<typeof parsePools> } {
  const arr = Array.isArray(json.data) ? json.data : json.data ? [json.data] : [];
  const tokens = arr.map((t) => ({
    address: t.attributes.address.toLowerCase(),
    priceUsd: num(t.attributes.price_usd),
    fdv: num(t.attributes.fdv_usd),
    mcap: num(t.attributes.market_cap_usd),
    vol24: num(t.attributes.volume_usd?.h24),
    totalSupply: num(t.attributes.total_supply),
    topPoolIds: (t.relationships?.top_pools?.data ?? []).map((p) => p.id),
  }));
  return { tokens, pools: parsePools({ data: json.included ?? [] }) };
}

/** ohlcv_list is newest first: [ts, o, h, l, c, volume]. */
export function parseOhlcvDay(json: { data?: { attributes?: { ohlcv_list?: number[][] } } }): Candle[] {
  const m = new Map<string, Candle>();
  for (const r of json.data?.attributes?.ohlcv_list ?? []) {
    if (r.length < 6) continue;
    m.set(dateOf(r[0]), [dateOf(r[0]), r[1], r[2], r[3], r[4], Math.round(r[5])]);
  }
  return Array.from(m.values()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

export function parseOhlcvHour(json: { data?: { attributes?: { ohlcv_list?: number[][] } } }): HourRow[] {
  return (json.data?.attributes?.ohlcv_list ?? [])
    .filter((r) => r.length >= 6)
    .map((r) => [r[0], r[4], Math.round(r[5])] as HourRow)
    .sort((a, b) => a[0] - b[0]);
}

const WEEK = 7;

/** Volume a token traded over the last 7 daily snapshots (rows are [date, price, fdv, mcap, vol24]). */
export function tokenWeekVolume(rows: ReadonlyArray<ReadonlyArray<unknown>> | undefined): number {
  return (rows ?? []).slice(-WEEK).reduce((a, r) => a + (Number(r[4]) || 0), 0);
}

/** Volume a pool traded over its last 7 daily candles (rows are [date, o, h, l, c, volume]). */
export function candleWeekVolume(rows: ReadonlyArray<ReadonlyArray<unknown>> | undefined): number {
  return (rows ?? []).slice(-WEEK).reduce((a, r) => a + (Number(r[5]) || 0), 0);
}

/** Skip a pool when it has a week of candles, none of them with volume, and its token shows no volume either. */
export function idlePool(candles: ReadonlyArray<ReadonlyArray<unknown>> | undefined, tokenRows: ReadonlyArray<ReadonlyArray<unknown>> | undefined): boolean {
  return (candles?.length ?? 0) >= WEEK && candleWeekVolume(candles) === 0 && tokenWeekVolume(tokenRows) === 0;
}

/** Shared base URL for the GeckoTerminal fetchers. */
export const GECKO_BASE = BASE;
