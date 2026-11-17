/**
 * GeckoTerminal trading venues mapped to Atlas projects (data/gecko-dex-map.csv), and the venue metrics
 * built from the daily readings in data/history/gecko/venues.json. Pure.
 */
import { addDays, type DateStr } from "./dates";
import type { GeckoVenueRecord } from "./history-types";
import { sumWindow } from "./live";

export type VenueKind = "launchpad" | "agent" | "dex";

export interface GeckoDexMapRow {
  /** Empty means reviewed and left out, like an empty Project in data/defillama-map.csv. */
  project: string;
  dexId: string;
  dexName: string;
  kind: VenueKind | "";
}

type Raw = Record<string, string | undefined>;

export function parseGeckoDexMap(rows: Raw[]): GeckoDexMapRow[] {
  return rows
    .map((r) => {
      const kind = (r["Kind"] ?? "").trim().toLowerCase();
      return { project: (r["Project"] ?? "").trim(), dexId: (r["Dex id"] ?? "").trim(), dexName: (r["Dex name"] ?? "").trim(), kind: (kind === "launchpad" || kind === "agent" || kind === "dex" ? kind : "") as VenueKind | "" };
    })
    .filter((r) => r.dexId);
}

const VERSION = /\b(v\d+(\.\d+)?|cl|clmm|dlmm|legacy|dex|infinity|slipstream|amm)\b/g;

/** A venue or project name with the chain tag and version words dropped, so "Ramses V3 (Robinhood)" meets "RAMSES". Used only to seed the map. */
export function normalizeVenue(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(VERSION, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A 30-day venue figure needs at least this many daily readings, or it would understate the month. */
export const VENUE_MIN_DAYS = 27;

export interface VenueMetrics {
  asOf: DateStr;
  /** Sum of the daily 24-hour volumes over 30 days; null until VENUE_MIN_DAYS readings exist. */
  volume30d: number | null;
  /** Days with a reading inside the 30-day window. */
  days: number;
  liquidity: number | null;
  /** Pools created on the venue in the 30 days to `end`, among the pools the fetcher has seen. A lower bound. */
  launched30d: number;
  /** Every pool seen on the venue so far. */
  pools: number;
}

/** Metrics across all of a project's venues on `end`. Null when none of them has a reading yet. */
export function venueMetrics(venues: GeckoVenueRecord[], end: DateStr): VenueMetrics | null {
  if (!venues.length) return null;
  let volume = 0;
  let days = 0;
  let liquidity: number | null = null;
  let asOf: DateStr | null = null;
  const start = addDays(end, -29);
  let launched = 0;
  let pools = 0;
  for (const v of venues) {
    const w = sumWindow(v.volume, end, 30);
    volume += w.value ?? 0;
    days = Math.max(days, w.days);
    const liq = v.liquidity.filter(([d]) => d <= end).at(-1);
    if (liq) liquidity = (liquidity ?? 0) + liq[1];
    const last = [...v.volume, ...v.liquidity].filter(([d]) => d <= end).map(([d]) => d).sort().at(-1) as DateStr | undefined;
    if (last && (!asOf || last > asOf)) asOf = last;
    const created = Object.values(v.pools);
    pools += created.length;
    launched += created.filter((d) => d >= start && d <= addDays(end, 1)).length;
  }
  if (!asOf) return null;
  return { asOf, volume30d: days >= VENUE_MIN_DAYS ? volume : null, days, liquidity, launched30d: launched, pools };
}
