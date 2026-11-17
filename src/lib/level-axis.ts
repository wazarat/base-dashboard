import { fmtPctSigned } from "./format";

/**
 * Level series (TVL, holders, supply) get a fitted y-axis with about 10%
 * padding so small movements stay readable; flows always start at zero
 * (docs/ATLAS-UI.md, section 6).
 */
export function fitDomain(values: Array<number | null | undefined>, pad = 0.1): [number, number] {
  const xs = values.filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
  if (xs.length === 0) return [0, 1];
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  if (min === max) {
    if (min === 0) return [0, 1];
    const slack = Math.abs(min) * 0.05;
    return [min - slack, max + slack];
  }
  const span = max - min;
  let lo = min - span * pad;
  const hi = max + span * pad;
  if (min >= 0 && lo < 0) lo = 0;
  return [lo, hi];
}

export interface RangeStats {
  min: number;
  max: number;
  first: number;
  last: number;
  /** last / first − 1, or null when the first reading is not positive. */
  change: number | null;
}

export function rangeStats(values: Array<number | null | undefined>): RangeStats | null {
  const xs = values.filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
  if (xs.length === 0) return null;
  const first = xs[0];
  const last = xs[xs.length - 1];
  return { min: Math.min(...xs), max: Math.max(...xs), first, last, change: first > 0 ? last / first - 1 : null };
}

/** "Low $1.0B, high $1.1B, +2.3% over 90d" */
export function fmtRangeStats(s: RangeStats, fmt: (v: number) => string, label: string): string {
  const change = s.change === null ? "" : `, ${fmtPctSigned(s.change)}`;
  return `Low ${fmt(s.min)}, high ${fmt(s.max)}${change} over ${label}`;
}

/** Label for the window a level panel shows. */
export function levelLabel(days: number, available: number): string {
  return days >= available ? "all history" : `${days}d`;
}
