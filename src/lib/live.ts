/**
 * Pure helpers that turn daily history into the "live" numbers the app shows:
 * trailing windows, momentum, sparklines, and the join onto a Project.
 * No I/O here; the build script feeds in the history files.
 */
import { addDays, dateRange, type DateStr } from "./dates";
import type { Series, SeriesMap } from "./history-types";
import { sumSeries } from "./mapping";
import { sumLevelSeries } from "./series-gaps";
import { recomputeTier } from "./tier";
import type { CountedMetrics, LiveMetrics, MetricChange, NumericMetricKey, Project } from "./types";

export const FLOW_METRICS = ["volume", "fees", "revenue", "holdersRevenue", "supplySideRevenue"] as const;
export type FlowMetric = (typeof FLOW_METRICS)[number];

/** Last complete UTC day at the time of the last refresh. Deterministic across machines. */
export function windowEnd(lastRunDate: DateStr): DateStr {
  return addDays(lastRunDate, -1);
}

export interface WindowSum {
  value: number | null;
  /** Days inside the window that had a data point. */
  days: number;
}

/** Sum of a flow over the n days ending at `end` (inclusive). Missing days count as 0; null when no point falls in the window. */
export function sumWindow(series: Series, end: DateStr, n: number): WindowSum {
  const start = addDays(end, -(n - 1));
  let total = 0;
  let days = 0;
  for (const [d, v] of series) {
    if (d < start || d > end) continue;
    total += v;
    days += 1;
  }
  return { value: days ? total : null, days };
}

/** Latest stock value at or before `date`, no older than `tolerance` days. */
export function valueAt(series: Series, date: DateStr, tolerance = 3): number | null {
  const floor = addDays(date, -tolerance);
  let best: number | null = null;
  for (const [d, v] of series) {
    if (d > date) break;
    if (d >= floor) best = v;
  }
  return best;
}

export function pctChange(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev <= 0) return null;
  return cur / prev - 1;
}

/** Flow momentum: trailing n days vs the n days before, requiring half the prior window to have data. */
export function flowChange(series: Series, end: DateStr, n: number): number | null {
  const cur = sumWindow(series, end, n);
  const prev = sumWindow(series, addDays(end, -n), n);
  if (prev.days < Math.ceil(n / 2) || cur.days === 0) return null;
  return pctChange(cur.value, prev.value);
}

/** One change definition for daily counts: the last full day against the same day n days earlier. */
export function dayChange(series: Series, end: DateStr, n: number): number | null {
  return pctChange(valueAt(series, end, 0), valueAt(series, addDays(end, -n), 0));
}

/** Stock momentum: value at end vs value n days earlier. */
export function stockChange(series: Series, end: DateStr, n: number): number | null {
  return pctChange(valueAt(series, end), valueAt(series, addDays(end, -n)));
}

export function changes(series: Series, end: DateStr, kind: "flow" | "stock"): MetricChange {
  const f = kind === "flow" ? flowChange : stockChange;
  return { d7: f(series, end, 7), d30: f(series, end, 30), d90: f(series, end, 90) };
}

/** Values aligned to `dates`; flows as daily values with null gaps, stocks forward-filled up to 3 days. */
export function alignSeries(series: Series, dates: DateStr[], kind: "flow" | "stock"): Array<number | null> {
  const m = new Map(series);
  const out: Array<number | null> = [];
  let last: number | null = null;
  let lastDate: DateStr | null = null;
  for (const d of dates) {
    const v = m.get(d);
    if (v !== undefined) {
      last = v;
      lastDate = d;
      out.push(v);
    } else if (kind === "stock" && last !== null && lastDate !== null && d <= addDays(lastDate, 3)) {
      out.push(last);
    } else {
      out.push(null);
    }
  }
  return out;
}

export function sparkDates(end: DateStr, n = 90): DateStr[] {
  return dateRange(addDays(end, -(n - 1)), end);
}

export interface HistoryStore {
  /** slug -> TVL series */
  tvl: SeriesMap;
  /** display name -> daily series */
  volume: SeriesMap;
  fees: SeriesMap;
  revenue: SeriesMap;
  holdersRevenue: SeriesMap;
  supplySideRevenue: SeriesMap;
  /** slug -> display name */
  nameOfSlug: Map<string, string>;
  /** slug -> token market cap from the listing */
  mcapOfSlug: Map<string, number | null>;
}

export interface ProjectSeries {
  tvl: Series;
  volume: Series;
  fees: Series;
  revenue: Series;
  holdersRevenue: Series;
  supplySideRevenue: Series;
}

/** Sum the series of every mapped slug for one project. TVL carries each listing across short gaps first, so one listing skipping a day never reads as an outflow. */
export function projectSeries(slugs: string[], store: HistoryStore): ProjectSeries {
  const names = slugs.map((s) => store.nameOfSlug.get(s)).filter((n): n is string => Boolean(n));
  const pick = (map: SeriesMap, keys: string[]) => sumSeries(keys.map((k) => map[k] ?? []).filter((s) => s.length));
  return {
    tvl: sumLevelSeries(slugs.map((k) => store.tvl[k] ?? [])),
    volume: pick(store.volume, names),
    fees: pick(store.fees, names),
    revenue: pick(store.revenue, names),
    holdersRevenue: pick(store.holdersRevenue, names),
    supplySideRevenue: pick(store.supplySideRevenue, names),
  };
}

export function computeLive(slugs: string[], store: HistoryStore, end: DateStr): LiveMetrics | null {
  const s = projectSeries(slugs, store);
  const has = Object.values(s).some((x) => x.length > 0);
  if (!has) return null;
  const sum30 = (x: Series) => sumWindow(x, end, 30).value;
  const tvl = valueAt(s.tvl, end);
  const volume = sum30(s.volume);
  const fees = sum30(s.fees);
  const revenue = sum30(s.revenue);
  const annualisedRevenue = revenue !== null ? (revenue * 365) / 30 : null;
  const mcaps = slugs.map((sl) => store.mcapOfSlug.get(sl) ?? null).filter((v): v is number => v !== null && v > 0);
  const tokenMarketCap = mcaps.length ? Math.max(...mcaps) : null;
  return {
    asOf: end,
    slugs,
    tvl,
    volume,
    fees,
    revenue,
    holdersRevenue: sum30(s.holdersRevenue),
    supplySideRevenue: sum30(s.supplySideRevenue),
    feesDaily: valueAt(s.fees, end, 0),
    change: {
      tvl: changes(s.tvl, end, "stock"),
      volume: changes(s.volume, end, "flow"),
      fees: changes(s.fees, end, "flow"),
      revenue: changes(s.revenue, end, "flow"),
    },
    annualisedRevenue,
    tokenMarketCap,
    psRatio: tokenMarketCap !== null && annualisedRevenue !== null && annualisedRevenue > 0 ? tokenMarketCap / annualisedRevenue : null,
    txns24h: null,
    txns7d: null,
    uniqueSenders7d: null,
    holders: null,
    activityAsOf: null,
    activityPartial: false,
  };
}

/**
 * The same metrics from only the slugs whose chain-total flag is true for that
 * metric, so the Overview never sums a double count. Null when nothing is counted.
 */
export function computeCounted(slugs: string[], store: HistoryStore, end: DateStr, flags: Map<string, Record<NumericMetricKey, boolean>>): CountedMetrics | null {
  const values = {} as CountedMetrics["values"];
  const change = {} as CountedMetrics["change"];
  let any = false;
  for (const m of ["tvl", "volume", "fees", "revenue"] as const) {
    const sub = slugs.filter((s) => flags.get(s)?.[m]);
    const s = projectSeries(sub, store)[m];
    values[m] = !sub.length || !s.length ? null : m === "tvl" ? valueAt(s, end) : sumWindow(s, end, 30).value;
    change[m] = sub.length ? changes(s, end, m === "tvl" ? "stock" : "flow") : { d7: null, d30: null, d90: null };
    if (values[m] !== null) any = true;
  }
  return any ? { values, change } : null;
}

/** A live record with no DefiLlama series, used when only onchain activity exists. */
export function emptyLive(end: DateStr, slugs: string[]): LiveMetrics {
  const nul = { d7: null, d30: null, d90: null };
  return {
    asOf: end,
    slugs,
    tvl: null,
    volume: null,
    fees: null,
    revenue: null,
    holdersRevenue: null,
    supplySideRevenue: null,
    feesDaily: null,
    change: { tvl: nul, volume: nul, fees: nul, revenue: nul },
    annualisedRevenue: null,
    tokenMarketCap: null,
    psRatio: null,
    txns24h: null,
    txns7d: null,
    uniqueSenders7d: null,
    holders: null,
    activityAsOf: null,
    activityPartial: false,
  };
}

/** Effective = live ?? snapshot. Keeps every existing consumer of tvl/volume/fees/revenue working. */
export function applyLive(p: Project, live: LiveMetrics | null): Project {
  const snapshot = { tvl: p.tvl, volume: p.volume, fees: p.fees, revenue: p.revenue, tier: p.tier, asOf: p.snapshot?.asOf ?? "" };
  const pick = (k: NumericMetricKey): [number | null, "live" | "snapshot" | "none"] => {
    const lv = live?.[k] ?? null;
    if (lv !== null) return [lv, "live"];
    if (snapshot[k] !== null) return [snapshot[k], "snapshot"];
    return [null, "none"];
  };
  const [tvl, sTvl] = pick("tvl");
  const [volume, sVol] = pick("volume");
  const [fees, sFees] = pick("fees");
  const [revenue, sRev] = pick("revenue");
  return {
    ...p,
    snapshot: { ...snapshot, asOf: p.snapshot?.asOf ?? snapshot.asOf },
    live,
    tvl,
    volume,
    fees,
    revenue,
    metricSource: { tvl: sTvl, volume: sVol, fees: sFees, revenue: sRev },
    // Recompute only when daily data exists; a project with no DefiLlama listing keeps its researched tier.
    tier: live ? recomputeTier({ tvl, volume, fees, revenue }) : snapshot.tier,
    hasTraction: [tvl, volume, fees, revenue].some((v) => v !== null),
    revenueCapture: fees !== null && revenue !== null && fees > 0 ? revenue / fees : null,
  };
}
