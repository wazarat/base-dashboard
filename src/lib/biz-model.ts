/**
 * Fees against revenue for the Traction business model chart (owner review,
 * 2026-11-09). Pure. A project's fees and revenue are summed only over the
 * DefiLlama listings DefiLlama counts in its chain total for both metrics, and
 * only on days where a listing reports both, so a version with fees but no
 * revenue (Uniswap V4) cannot drag capture down.
 */
import { addDays, type DateStr } from "./dates";
import type { SeriesMap } from "./history-types";

export const BIZ_WINDOWS = { d7: 7, d30: 30, d90: 90 } as const;
export type BizWindow = keyof typeof BIZ_WINDOWS;

export interface BizPoint {
  fees: number;
  revenue: number;
  /** Revenue above fees means the source has a data error; the chart leaves these out. */
  error?: true;
}

export type BizModel = Partial<Record<BizWindow, BizPoint>>;

/** Sum fees and revenue over the n days ending at `end`, per listing, on days that listing reports both. Null when nothing pairs up or fees are zero. */
export function pairedSums(names: string[], fees: SeriesMap, revenue: SeriesMap, end: DateStr, n: number): BizPoint | null {
  const start = addDays(end, -(n - 1));
  let f = 0;
  let r = 0;
  let paired = 0;
  for (const name of new Set(names)) {
    const rev = new Map(revenue[name] ?? []);
    if (!rev.size) continue;
    for (const [d, v] of fees[name] ?? []) {
      if (d < start || d > end || !rev.has(d)) continue;
      f += v;
      r += rev.get(d) as number;
      paired += 1;
    }
  }
  if (!paired || f <= 0) return null;
  return r > f ? { fees: f, revenue: r, error: true } : { fees: f, revenue: r };
}

export function bizModel(names: string[], fees: SeriesMap, revenue: SeriesMap, end: DateStr): BizModel | null {
  const out: BizModel = {};
  for (const [k, n] of Object.entries(BIZ_WINDOWS) as Array<[BizWindow, number]>) {
    const p = pairedSums(names, fees, revenue, end, n);
    if (p) out[k] = p;
  }
  return Object.keys(out).length ? out : null;
}

/** Revenue capture, the share of fees a project keeps. */
export function capture(p: BizPoint | null | undefined): number | null {
  return p && p.fees > 0 ? p.revenue / p.fees : null;
}

/** A point the chart can draw: fees and revenue both above zero and no data error. */
export function plottableBiz(p: BizPoint | null | undefined): p is BizPoint {
  return Boolean(p && !p.error && p.fees > 0 && p.revenue > 0);
}
