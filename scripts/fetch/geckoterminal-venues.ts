/**
 * Trading venues on GeckoTerminal (DEX ids on network robinhood) for launchpads, agent platforms and DEXes
 * (docs/SECTOR-METRICS.md, section 2). GeckoTerminal has no per-venue total, so each day this reads a venue's
 * most traded pools and sums their 24-hour volume and liquidity, and reads the network's newest pools to
 * count what each venue launched. The 30-day figures build up from these daily readings.
 *
 * Paced by the shared GeckoTerminal limiter (gecko-client.ts): one call per page. A venue whose last 7 daily
 * readings all show no volume is read once a week (on Sundays) until it trades again.
 * Venues come from data/gecko-dex-map.csv (Project, Dex id, Kind); without it the source skips.
 */
import path from "node:path";
import { addDays, type DateStr } from "../../src/lib/dates";
import type { GeckoVenueRecord } from "../../src/lib/history-types";
import { parseGeckoDexMap } from "../../src/lib/venues";
import { readCsvOrEmpty } from "../lib/csv";
import { DATA, HISTORY } from "../lib/paths";
import { readJson, writeJsonStable } from "../lib/store";
import { hasTime, type Ctx, type RunResult } from "./context";
import { geckoClient } from "./gecko-client";

const BASE = "https://api.geckoterminal.com/api/v2/networks/robinhood";
export const VENUES_FILE = path.join(HISTORY, "gecko", "venues.json");
/**
 * Pages of 20 pools read per venue, most traded first. One page for every venue: the 20 most traded pools
 * carry nearly all of a venue's volume, and a second page doubled the calls on the slowest free API.
 */
const VENUE_PAGES = 1;
const DEX_PAGES = 1;
/** Pages of the network's newest pools read per run (20 each); the daily run sees about a day of launches. */
const NEW_POOL_PAGES = 2;

interface RawPool {
  attributes?: { address?: string; pool_created_at?: string | null; reserve_in_usd?: string | number | null; volume_usd?: { h24?: string | number | null } };
  relationships?: { dex?: { data?: { id?: string } } };
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

export interface VenuePool {
  address: string;
  dex: string | null;
  created: DateStr | null;
  volume24h: number;
  liquidity: number;
}

export function parsePools(json: { data?: RawPool[] }): VenuePool[] {
  return (json.data ?? [])
    .filter((p) => typeof p.attributes?.address === "string")
    .map((p) => ({
      address: (p.attributes?.address as string).toLowerCase(),
      dex: p.relationships?.dex?.data?.id ?? null,
      created: p.attributes?.pool_created_at ? (p.attributes.pool_created_at.slice(0, 10) as DateStr) : null,
      volume24h: num(p.attributes?.volume_usd?.h24),
      liquidity: num(p.attributes?.reserve_in_usd),
    }));
}

/** A run later than this hour of the UTC day reads a 24-hour window that is mostly today, so its volume is not a reading of yesterday. */
export const VOLUME_CUTOFF_HOUR = 12;

/**
 * Fold one day's reading into a venue's record. The 24-hour volume is a rolling window, so it stands for the day
 * that just ended only when it is read early in the UTC day (`closeOfDay`); a later run keeps the pools and the
 * liquidity level but stores no volume. Only the first reading of a day is kept, so a rerun cannot overwrite it.
 */
export function mergeVenue(prev: GeckoVenueRecord | undefined, id: string, name: string, pools: VenuePool[], today: DateStr, closeOfDay = true): GeckoVenueRecord {
  const day = addDays(today, -1);
  const rec: GeckoVenueRecord = prev ? { ...prev, name, volume: [...prev.volume], liquidity: [...prev.liquidity], pools: { ...prev.pools } } : { id, name, volume: [], liquidity: [], pools: {} };
  if (pools.length && closeOfDay && !rec.volume.some(([d]) => d === day)) rec.volume.push([day, Math.round(pools.reduce((a, p) => a + p.volume24h, 0))]);
  if (pools.length && !rec.liquidity.some(([d]) => d === day)) rec.liquidity.push([day, Math.round(pools.reduce((a, p) => a + p.liquidity, 0))]);
  for (const p of pools) if (p.created && !rec.pools[p.address]) rec.pools[p.address] = p.created;
  return rec;
}

/** A venue with a week of readings and no volume in any of them. */
export function idleVenue(rec: GeckoVenueRecord | undefined): boolean {
  const last = rec?.volume.slice(-7) ?? [];
  return last.length >= 7 && last.every(([, v]) => !v);
}

export async function run(ctx: Ctx): Promise<RunResult> {
  const map = parseGeckoDexMap(readCsvOrEmpty(path.join(DATA, "gecko-dex-map.csv"))).filter((r) => r.project);
  if (!map.length) return { rows: 0, calls: 0, notes: ["skipped: data/gecko-dex-map.csv has no mapped venue (run npm run seed:venues)"] };
  const client = geckoClient("geckoterminal-venues", ctx.env);
  const store = readJson<Record<string, GeckoVenueRecord>>(VENUES_FILE, {});
  const notes: string[] = [];
  const ids = Array.from(new Set(map.map((r) => r.dexId)));
  const closeOfDay = new Date(ctx.nowMs).getUTCHours() < VOLUME_CUTOFF_HOUR;
  if (!closeOfDay) notes.push(`run after ${VOLUME_CUTOFF_HOUR}:00 UTC, so pools and liquidity were read but no daily volume was stored`);
  let failed = 0;
  let idle = 0;
  const weekly = new Date(ctx.nowMs).getUTCDay() === 0;
  for (const id of ids) {
    if (!weekly && idleVenue(store[id])) {
      idle += 1;
      continue;
    }
    const pools: VenuePool[] = [];
    try {
      const pages = map.some((r) => r.dexId === id && r.kind !== "dex") ? VENUE_PAGES : DEX_PAGES;
      for (let page = 1; page <= pages; page++) {
        const batch = parsePools(await client.getJson(`${BASE}/dexes/${encodeURIComponent(id)}/pools?sort=h24_volume_usd_desc&page=${page}`));
        pools.push(...batch);
        if (batch.length < 20) break;
      }
    } catch (e) {
      failed += 1;
      notes.push(`${id}: ${(e as Error).message}`);
      if (!pools.length) continue;
    }
    store[id] = mergeVenue(store[id], id, map.find((r) => r.dexId === id)?.dexName ?? id, pools, ctx.today, closeOfDay);
  }
  // The network's newest pools, so launches on a mapped venue are counted even when they never reach its most traded list.
  let fresh = 0;
  try {
    for (let page = 1; page <= NEW_POOL_PAGES && hasTime(ctx); page++) {
      const batch = parsePools(await client.getJson(`${BASE}/new_pools?page=${page}`));
      for (const p of batch) {
        if (!p.dex || !p.created || !store[p.dex] || store[p.dex].pools[p.address]) continue;
        store[p.dex] = { ...store[p.dex], pools: { ...store[p.dex].pools, [p.address]: p.created } };
        fresh += 1;
      }
      if (batch.length < 20) break;
    }
  } catch (e) {
    notes.push(`new pools: ${(e as Error).message}`);
  }
  if (!ctx.dryRun) writeJsonStable(VENUES_FILE, store);
  notes.unshift(`${ids.length - failed - idle} of ${ids.length} venues read${idle ? ` (${idle} idle for a week, read on Sundays)` : ""}, ${fresh} new pools recorded`);
  return { rows: ids.length - failed - idle, calls: client.stats().calls, notes };
}
