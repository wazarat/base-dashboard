/**
 * GeckoTerminal, network "base" only: 30-day DEX volume and liquidity for each mapped
 * project token (project-token role in data/contracts.csv), summed over its pools on this chain.
 * Global market cap or volume from CoinGecko or Blockscout covers every chain and is never used.
 */
import path from "node:path";
import { addDays, type DateStr } from "../../src/lib/dates";
import { isDexTradedRole } from "../../src/lib/contract-roles";
import type { Series, TokenDexRecord } from "../../src/lib/history-types";
import { readCsvOrEmpty } from "../lib/csv";
import { log } from "../lib/log";
import { DATA } from "../lib/paths";
import { appendDated, readJson, upsertSeries, writeJsonStable } from "../lib/store";
import { parseContracts } from "./blockscout";
import { TOKENS_DIR } from "./blockscout-tokens";
import { hasTime, type Ctx, type RunResult } from "./context";
import { parseOhlcvDay, parsePools, parseTokens } from "./geckoterminal";
import { geckoClient } from "./gecko-client";

const BASE = "https://api.geckoterminal.com/api/v2/networks/base";
const DEX_FILE = path.join(TOKENS_DIR, "dex.json");

export function readTokenDex(): Record<string, TokenDexRecord> {
  return readJson<Record<string, TokenDexRecord>>(DEX_FILE, {});
}

type Pool = ReturnType<typeof parsePools>[number];

/** The token's pools on this network, busiest first; pools with no volume and under $1K liquidity are left out of the candle calls. */
export function poolsFor(all: Pool[], address: string, max: number): { pools: Pool[]; liquidity: number } {
  const mine = all.filter((p) => p.base === address || p.quote === address);
  const liquidity = mine.reduce((s, p) => s + p.reserveUsd, 0);
  const active = mine.filter((p) => p.volume24h > 0 || p.reserveUsd >= 1000).sort((a, b) => b.volume24h - a.volume24h || b.reserveUsd - a.reserveUsd);
  return { pools: active.slice(0, max), liquidity };
}

/** Sum each pool's daily volume into one series; today's partial day is dropped. */
export function sumDaily(perPool: Series[], today: DateStr): Series {
  const m = new Map<DateStr, number>();
  for (const s of perPool) for (const [d, v] of s) if (d < today) m.set(d, (m.get(d) ?? 0) + v);
  return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/**
 * Daily runs stay cheap because the free API allows only a few calls a minute: one batched
 * tokens/multi call per 30 tokens gives each token's top pools on this network, their liquidity
 * and their rolling 24-hour volume, which is stored as the previous UTC day's volume (the refresh
 * runs at 03:17 UTC). A token seen for the first time, or any token on a backfill, gets
 * daily candles per pool instead, within GT_TOKEN_OHLCV calls per run.
 */
export async function run(ctx: Ctx): Promise<RunResult> {
  const tokens = Array.from(new Map(parseContracts(readCsvOrEmpty(path.join(DATA, "contracts.csv"))).filter((c) => isDexTradedRole(c.role)).map((c) => [c.address, c])).values());
  if (!tokens.length) return { rows: 0, calls: 0, notes: ["skipped: no project tokens in data/contracts.csv"] };
  const client = geckoClient("geckoterminal-tokens", ctx.env);
  const maxPools = Number(ctx.env.GT_TOKEN_POOLS ?? 3);
  let ohlcvBudget = Number(ctx.env.GT_TOKEN_OHLCV ?? (ctx.mode === "backfill" ? 600 : 40));
  const dex = readTokenDex();
  const notes: string[] = [];
  const yesterday = addDays(ctx.today, -1);
  let rows = 0;
  let candleTokens = 0;

  // 1. Batched snapshot: top pools, liquidity and 24h volume per token, on network base only.
  const pools: Pool[] = [];
  let snapped = 0;
  for (let i = 0; i < tokens.length; i += 30) {
    const chunk = tokens.slice(i, i + 30).map((t) => t.address);
    try {
      const r = parseTokens(await client.getJson(`${BASE}/tokens/multi/${chunk.join(",")}?include=top_pools`, { noCache: true }));
      pools.push(...r.pools);
      snapped += r.tokens.length;
    } catch (e) {
      notes.push(`tokens/multi chunk ${i / 30}: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  if (!snapped && tokens.length) throw new Error(notes.join("; ") || "GeckoTerminal returned no tokens");

  for (const t of tokens) {
    const rec: TokenDexRecord = dex[t.address] ?? { liquidity: [], volume: [], pools: 0 };
    const mine = poolsFor(pools, t.address, maxPools);
    const all = pools.filter((p) => p.base === t.address || p.quote === t.address);
    rec.liquidity = appendDated(rec.liquidity, [ctx.today, mine.liquidity]);
    rec.pools = all.length;
    // Records from before the backfill marker existed were filled with candles on their first run.
    rec.backfilled ??= rec.liquidity[0]?.[0];
    // Candles for a new token are optional work: past the refresh time budget it keeps the snapshot and gets them next run.
    if ((!rec.backfilled || ctx.mode === "backfill") && ohlcvBudget > 0 && hasTime(ctx)) {
      // 2. Daily candles for new tokens and backfills.
      const perPool: Series[] = [];
      for (const p of mine.pools) {
        if (ohlcvBudget <= 0) break;
        ohlcvBudget -= 1;
        try {
          const candles = parseOhlcvDay(await client.getJson(`${BASE}/pools/${p.address}/ohlcv/day?limit=31&currency=usd`, { noCache: true }));
          perPool.push(candles.map((c) => [c[0], c[5]]));
        } catch (e) {
          log.debug(`ohlcv ${t.project} ${p.address}: ${(e as Error).message}`);
        }
      }
      rec.volume = upsertSeries(rec.volume, sumDaily(perPool, ctx.today), { today: ctx.today, revisionDays: 31 });
      rec.backfilled = ctx.today;
      candleTokens += 1;
    } else if (!rec.volume.some(([d]) => d === yesterday)) {
      // 3. Otherwise the rolling 24h volume stands for the previous day, never overwriting a candle day.
      rec.volume = upsertSeries(rec.volume, [[yesterday, all.reduce((s, p) => s + p.volume24h, 0)]], { today: ctx.today });
    }
    dex[t.address] = rec;
    rows += 1;
  }
  if (!ctx.dryRun) writeJsonStable(DEX_FILE, dex);
  notes.push(`${snapped} of ${tokens.length} project tokens in the batched snapshot, ${candleTokens} with daily candles`);
  return { rows, calls: client.stats().calls, notes };
}
