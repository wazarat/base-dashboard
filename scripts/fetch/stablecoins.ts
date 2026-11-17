/**
 * DefiLlama stablecoins (free, no key): each coin's circulating value on Base
 * (chainCirculating["Base"]) and the chain's stablecoin total over time.
 * Coins are tied to issuers in data/stablecoin-map.csv; the rest show up for review.
 */
import path from "node:path";
import { dateOf } from "../../src/lib/dates";
import type { Series, StablecoinRecord } from "../../src/lib/history-types";
import { HISTORY } from "../lib/paths";
import { readJson, upsertSeries, writeJsonStable } from "../lib/store";
import type { Ctx, RunResult } from "./context";
import { createClient } from "./http";

const BASE = "https://stablecoins.llama.fi";
export const LLAMA_CHAIN = "Base";
const DIR = path.join(HISTORY, "stablecoins");

interface PeggedAsset {
  id: string;
  name: string;
  symbol: string;
  pegType?: string;
  price?: number | null;
  chainCirculating?: Record<string, { current?: Record<string, number> } | undefined>;
}

/** USD value on the chain: the amount in its peg unit times the coin's price (1 when DefiLlama gives none). */
export function parseChainCoins(json: { peggedAssets?: PeggedAsset[] }, chain = LLAMA_CHAIN): Array<{ id: string; symbol: string; name: string; pegType: string; usd: number; price: number }> {
  const out: Array<{ id: string; symbol: string; name: string; pegType: string; usd: number; price: number }> = [];
  for (const a of json.peggedAssets ?? []) {
    const cur = a.chainCirculating?.[chain]?.current;
    if (!cur) continue;
    const pegType = a.pegType ?? "peggedUSD";
    const amount = Number(cur[pegType] ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const price = typeof a.price === "number" && Number.isFinite(a.price) ? a.price : pegType === "peggedUSD" ? 1 : null;
    if (price === null) continue;
    out.push({ id: String(a.id), symbol: a.symbol, name: a.name, pegType, usd: amount * price, price });
  }
  return out.sort((x, y) => y.usd - x.usd);
}

/** /stablecoincharts/{chain}: [{date (unix s), totalCirculatingUSD: {peggedUSD, ...}}] summed over peg types. */
export function parseChainChart(json: Array<{ date: string | number; totalCirculatingUSD?: Record<string, number> }>): Series {
  const out: Series = [];
  for (const p of json ?? []) {
    const ts = Number(p.date);
    if (!Number.isFinite(ts)) continue;
    const v = Object.values(p.totalCirculatingUSD ?? {}).reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0);
    out.push([dateOf(ts), v]);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** /stablecoin/{id}: the coin's daily circulating amount on one chain, priced at `price` (1 for a USD peg without a price). */
export function parseCoinHistory(json: { pegType?: string; chainBalances?: Record<string, { tokens?: Array<{ date: number; circulating?: Record<string, number> }> }> }, price: number, chain = LLAMA_CHAIN): Series {
  const peg = json.pegType ?? "peggedUSD";
  const out: Series = [];
  for (const t of json.chainBalances?.[chain]?.tokens ?? []) {
    const v = Number(t.circulating?.[peg]);
    if (!Number.isFinite(v) || !Number.isFinite(t.date)) continue;
    out.push([dateOf(t.date), v * price]);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

export function readStablecoins(): { coins: Record<string, StablecoinRecord>; chain: Series } {
  return { coins: readJson<Record<string, StablecoinRecord>>(path.join(DIR, "coins.json"), {}), chain: readJson<Series>(path.join(DIR, "chain.json"), []) };
}

export async function run(ctx: Ctx): Promise<RunResult> {
  const client = createClient({ name: "defillama-stablecoins", minIntervalMs: 1000 });
  const notes: string[] = [];
  const { coins, chain } = readStablecoins();
  let rows = 0;
  let nextChain = chain;
  try {
    const now = parseChainCoins(await client.getJson(`${BASE}/stablecoins?includePrices=true`));
    for (const c of now) {
      const rec = coins[c.id] ?? { id: c.id, symbol: c.symbol, name: c.name, pegType: c.pegType, series: [] };
      rec.symbol = c.symbol;
      rec.name = c.name;
      rec.pegType = c.pegType;
      // Daily history on this chain, trailing 7 days re-fetched (all of it on a backfill or a new coin).
      try {
        // History is in peg units; today's price converts it (DefiLlama's chain chart does the same).
        const priced = parseCoinHistory(await client.getJson(`${BASE}/stablecoin/${c.id}`), c.price);
        rec.series = upsertSeries(rec.series, priced, { today: ctx.today, revisionDays: ctx.mode === "backfill" || !rec.series.length ? 10_000 : 7 });
      } catch (e) {
        notes.push(`${c.symbol} history: ${(e as Error).message}`);
      }
      // A current value, like TVL, so today may be stored and is overwritten by later runs the same day.
      rec.series = upsertSeries(rec.series, [[ctx.today, c.usd]], { today: ctx.today, allowToday: true });
      coins[c.id] = rec;
      rows += 1;
    }
    notes.push(`${now.length} stablecoins on ${LLAMA_CHAIN}`);
  } catch (e) {
    notes.push(`stablecoins: ${(e as Error).message}`);
  }
  try {
    const s = parseChainChart(await client.getJson(`${BASE}/stablecoincharts/${encodeURIComponent(LLAMA_CHAIN)}`));
    nextChain = upsertSeries(chain, s, { today: ctx.today, revisionDays: ctx.mode === "backfill" ? 10_000 : 7, allowToday: true });
    rows += s.length;
  } catch (e) {
    notes.push(`chain chart: ${(e as Error).message}`);
  }
  if (!rows) throw new Error(notes.join("; ") || "no stablecoin data");
  if (!ctx.dryRun) {
    writeJsonStable(path.join(DIR, "coins.json"), coins);
    writeJsonStable(path.join(DIR, "chain.json"), nextChain);
  }
  return { rows, calls: client.stats().calls, notes };
}
