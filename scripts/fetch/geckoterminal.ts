/**
 * GeckoTerminal free API, network "robinhood", paced by the shared GeckoTerminal limiter (gecko-client.ts).
 * Hourly history is paged across runs with a cursor. Order is by need: token snapshots and daily candles
 * every day, then hourly candles, then the pool crawl, which stops first when the refresh runs out of time.
 * A pool or token with no volume in the last 7 days is not asked again until it trades: the daily token
 * snapshot (one batched call per 30 tokens) shows when it does.
 */
import type { Candle, HourRow, StockHourly, StockPool } from "../../src/lib/history-types";
import { dateOf } from "../../src/lib/dates";
import { log } from "../lib/log";
import { appendDated, mergeHourly, readJson, upsertSeries, writeJsonStable } from "../lib/store";
import { hasTime, type Ctx, type RunResult } from "./context";
import { geckoClient } from "./gecko-client";
import { HttpError, type HttpClient } from "./http";
import { hourlyPath, indexPath, readDaily, readIndex, writeDaily } from "./robinhood";

const BASE = "https://api.geckoterminal.com/api/v2/networks/robinhood";
const RETAIN_DAYS = 180;

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
const tokenAddr = (id: string | undefined) => (id ?? "").replace(/^robinhood_/, "").toLowerCase();

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

function topPools(all: ReturnType<typeof parsePools>, addr: string, n = 3): StockPool[] {
  return all
    .filter((p) => p.base === addr || p.quote === addr)
    .sort((a, b) => b.reserveUsd - a.reserveUsd)
    .slice(0, n)
    .map(({ address, dex, name, createdAt, base, quote }) => ({ address, dex, name, createdAt, base, quote }));
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

async function fetchTokenSnaps(client: HttpClient, addrs: string[], notes: string[]): Promise<{ tokens: TokenSnap[]; pools: ReturnType<typeof parsePools> }> {
  const tokens: TokenSnap[] = [];
  const pools: ReturnType<typeof parsePools> = [];
  let multiOk = true;
  for (let i = 0; i < addrs.length && multiOk; i += 30) {
    const chunk = addrs.slice(i, i + 30);
    try {
      const r = parseTokens(await client.getJson(`${BASE}/tokens/multi/${chunk.join(",")}?include=top_pools`));
      tokens.push(...r.tokens);
      pools.push(...r.pools);
    } catch (e) {
      if (e instanceof HttpError && (e.status === 404 || e.status === 400) && i === 0) {
        multiOk = false;
        notes.push("tokens/multi unavailable; using per-token requests");
        break;
      }
      // A refused chunk (usually 429) falls back to one request per token so no token is skipped for the day.
      let recovered = 0;
      for (const a of chunk) {
        try {
          const r = parseTokens(await client.getJson(`${BASE}/tokens/${a}?include=top_pools`));
          tokens.push(...r.tokens);
          pools.push(...r.pools);
          recovered += 1;
        } catch (e2) {
          log.debug(`token ${a}: ${(e2 as Error).message}`);
        }
      }
      notes.push(`tokens/multi chunk ${i / 30} refused (${e instanceof HttpError ? `HTTP ${e.status}` : "error"}); recovered ${recovered}/${chunk.length} tokens one by one`);
    }
  }
  if (!multiOk) {
    for (const a of addrs) {
      try {
        const r = parseTokens(await client.getJson(`${BASE}/tokens/${a}?include=top_pools`));
        tokens.push(...r.tokens);
        pools.push(...r.pools);
      } catch (e) {
        log.debug(`token ${a}: ${(e as Error).message}`);
      }
    }
  }
  return { tokens, pools };
}

export async function run(ctx: Ctx): Promise<RunResult> {
  // GeckoTerminal counts per minute, so a refusal needs a long pause rather than a quick retry.
  const client = geckoClient("geckoterminal", ctx.env);
  const notes: string[] = [];
  const index = readIndex();
  const symbols = Object.keys(index.tokens);
  if (!symbols.length) return { rows: 0, calls: 0, notes: ["stock index empty; run the robinhood source first"] };
  const byAddr = new Map(symbols.map((s) => [index.tokens[s].address, s]));
  let rows = 0;

  // 1. Token snapshots + top pools for every listed stock token.
  const { tokens, pools } = await fetchTokenSnaps(client, Array.from(byAddr.keys()), notes);
  for (const t of tokens) {
    const sym = byAddr.get(t.address);
    if (!sym) continue;
    const found = topPools(pools, t.address);
    if (found.length) index.tokens[sym].pools = found;
    if (ctx.dryRun) continue;
    const daily = readDaily(sym);
    daily.token = appendDated(daily.token, [ctx.today, t.priceUsd, t.fdv, t.mcap, t.vol24]);
    writeDaily(daily);
    rows += 1;
  }
  notes.push(`${tokens.length} token snapshots, ${tokens.filter((t) => t.topPoolIds.length).length} with pools`);
  if (!ctx.dryRun) writeJsonStable(indexPath(), index);

  // 2. Daily candles for every pool of tickers with a Chainlink feed (priced in the stock token).
  const fed = symbols.filter((s) => index.tokens[s].feed && index.tokens[s].pools.length);
  const dayLimit = ctx.mode === "backfill" ? 1000 : 7;
  let candleCalls = 0;
  let idleSkips = 0;
  for (const sym of fed) {
    const t = index.tokens[sym];
    const daily = readDaily(sym);
    let changed = false;
    for (const p of t.pools) {
      if (idlePool(daily.candles[p.address], daily.token)) {
        idleSkips += 1;
        continue;
      }
      try {
        const existing = daily.candles[p.address] ?? [];
        const limit = existing.length < 7 ? 1000 : dayLimit;
        const c = parseOhlcvDay(await client.getJson(`${BASE}/pools/${p.address}/ohlcv/day?limit=${limit}&currency=usd&token=${t.address}`, { noCache: true }));
        candleCalls += 1;
        const merged = new Map<string, Candle>(existing.map((x) => [x[0], x]));
        for (const x of c) if (x[0] < ctx.today) merged.set(x[0], x);
        daily.candles[p.address] = Array.from(merged.values()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
        changed = true;
      } catch (e) {
        log.debug(`ohlcv day ${sym} ${p.address}: ${(e as Error).message}`);
      }
    }
    if (changed && !ctx.dryRun) writeDaily(daily);
  }
  notes.push(`${candleCalls} daily candle calls for ${fed.length} fed tickers${idleSkips ? `, ${idleSkips} idle pools skipped` : ""}`);

  // 3. Hourly candles, round-robin with a cursor so backfill completes over several runs.
  const budget = Number(ctx.env.GT_HOURLY_CALLS ?? (ctx.mode === "backfill" ? 240 : 60));
  const cursor = ctx.meta.cursors.geckoHourly;
  const poolList = fed.flatMap((sym) => index.tokens[sym].pools.map((p) => ({ sym, p, tokenAddr: index.tokens[sym].address })));
  let used = 0;
  let visited = 0;
  const nowSec = Math.floor(ctx.nowMs / 1000);
  let hourlyIdle = 0;
  while (poolList.length && used < budget && visited < poolList.length) {
    if (!hasTime(ctx)) {
      notes.push("hourly candles stopped at the refresh time budget");
      break;
    }
    const i = cursor.nextPoolIndex % poolList.length;
    cursor.nextPoolIndex = (i + 1) % poolList.length;
    visited += 1;
    const { sym, p, tokenAddr: ta } = poolList[i];
    const file = hourlyPath(sym);
    const hourly = readJson<StockHourly>(file, { symbol: sym, pools: {} });
    const existing = hourly.pools[p.address] ?? [];
    const day = readDaily(sym);
    if (idlePool(day.candles[p.address], day.token)) {
      hourlyIdle += 1;
      continue;
    }
    // A pool with its history done needs only the trailing 7 days (168 hours); the rest is already stored.
    const hours = cursor.done[p.address] ? WEEK * 24 : 1000;
    try {
      const latest = parseOhlcvHour(await client.getJson(`${BASE}/pools/${p.address}/ohlcv/hour?limit=${hours}&currency=usd&token=${ta}`, { noCache: true }));
      used += 1;
      let merged = mergeHourly(existing, latest, { retainDays: RETAIN_DAYS, now: nowSec });
      const key = p.address;
      const oldest = merged.length ? merged[0][0] : nowSec;
      const createdSec = p.createdAt ? Math.floor(Date.parse(p.createdAt) / 1000) : 0;
      const floor = Math.max(createdSec, nowSec - RETAIN_DAYS * 86_400);
      if (!cursor.done[key] && oldest > floor + 3600 && used < budget) {
        const older = parseOhlcvHour(
          await client.getJson(`${BASE}/pools/${p.address}/ohlcv/hour?limit=1000&currency=usd&token=${ta}&before_timestamp=${oldest}`, { noCache: true }),
        );
        used += 1;
        if (older.length === 0 || older[0][0] <= floor) cursor.done[key] = true;
        merged = mergeHourly(merged, older, { retainDays: RETAIN_DAYS, now: nowSec });
      } else if (oldest <= floor + 3600) {
        cursor.done[key] = true;
      }
      cursor.oldestTs[key] = merged.length ? merged[0][0] : oldest;
      hourly.pools[p.address] = merged;
      if (!ctx.dryRun) writeJsonStable(file, hourly);
      rows += latest.length;
    } catch (e) {
      log.debug(`ohlcv hour ${sym} ${p.address}: ${(e as Error).message}`);
    }
  }
  notes.push(`${used} hourly calls, ${Object.values(cursor.done).filter(Boolean).length}/${poolList.length} pools fully backfilled${hourlyIdle ? `, ${hourlyIdle} idle pools skipped` : ""}`);
  // 4. Full pool crawl, a few tokens per run (last: the least time-sensitive): pool count, launch pairs (token as quote), venues; refreshes the top-3 list.
  // 203 tokens on a 7-day cycle need about 30 a day; idle tokens wait until they trade.
  const crawlBudget = Number(ctx.env.GT_POOL_SCANS ?? (ctx.mode === "backfill" ? 80 : 30));
  const stale = (t: typeof index.tokens[string]) => !t.poolsScannedAt || Date.parse(t.poolsScannedAt) < ctx.nowMs - 7 * 86_400_000;
  const idleToken = (s: string) => Boolean(index.tokens[s].poolsScannedAt) && tokenWeekVolume(readDaily(s).token) === 0;
  const toScan = symbols.filter((s) => stale(index.tokens[s]) && !idleToken(s)).sort((a, b) => (index.tokens[b].pools.length - index.tokens[a].pools.length)).slice(0, crawlBudget);
  let scanned = 0;
  for (const sym of toScan) {
    if (!hasTime(ctx)) {
      notes.push("pool crawl stopped at the refresh time budget");
      break;
    }
    const t = index.tokens[sym];
    const all: ReturnType<typeof parsePools> = [];
    try {
      for (let page = 1; page <= 3; page++) {
        const r = parsePools(await client.getJson(`${BASE}/tokens/${t.address}/pools?page=${page}`, { noCache: true }));
        all.push(...r);
        if (r.length < 20) break;
      }
      t.poolCount = all.length;
      t.quotePools = all.filter((p) => p.quote === t.address).length;
      t.venues = Array.from(new Set(all.map((p) => p.dex)));
      t.poolsScannedAt = new Date(ctx.nowMs).toISOString();
      const top = topPools(all, t.address);
      if (top.length) t.pools = top;
      scanned += 1;
    } catch (e) {
      log.debug(`pool crawl ${sym}: ${(e as Error).message}`);
    }
  }
  if (scanned) notes.push(`${scanned} tokens pool-crawled (${symbols.filter((s) => index.tokens[s].poolsScannedAt).length}/${symbols.length} scanned in the last 7 days)`);
  if (!ctx.dryRun) writeJsonStable(indexPath(), index);

  void upsertSeries;
  return { rows, calls: client.stats().calls, notes };
}
