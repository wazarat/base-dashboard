/**
 * TVL is a level, so a day a DefiLlama listing skips is not a zero. Summing several listings by
 * date used to read a missing day as nothing, which showed Uniswap falling from about $260M to
 * $45M on Oct 17 and 18, 2026 when only uniswap-v4 skipped two days (owner report, 2026-11-10).
 * These helpers carry the last value forward across short gaps before listings are summed, and
 * flag sharp drops that undo themselves within a few days so any left are visible in the build.
 */
import { addDays, daysBetween, type DateStr } from "./dates";
import type { Series } from "./history-types";

/** Longest run of missing days filled with the last reading. Longer gaps stay gaps. */
export const MAX_CARRY_DAYS = 7;

/** Fill missing days inside a level series, and up to `until` after its last reading, with the last value. */
export function carryForward(series: Series, until: DateStr | null = null, maxGap = MAX_CARRY_DAYS): Series {
  if (series.length === 0) return series;
  const out: Series = [];
  for (let i = 0; i < series.length; i++) {
    const [d, v] = series[i];
    out.push([d, v]);
    const next = i + 1 < series.length ? series[i + 1][0] : until;
    if (!next || next <= d) continue;
    // Inside the series the next reading is real; at the tail, `until` itself is filled too.
    const missing = daysBetween(d, next) - (i + 1 < series.length ? 1 : 0);
    if (missing <= 0 || missing > maxGap) continue;
    for (let k = 1; k <= missing; k++) out.push([addDays(d, k), v]);
  }
  return out;
}

/** Sum level series by date after carrying each one across its short gaps, up to the latest day any of them has. */
export function sumLevelSeries(list: Series[], maxGap = MAX_CARRY_DAYS): Series {
  const parts = list.filter((s) => s.length);
  if (!parts.length) return [];
  const until = parts.map((s) => s[s.length - 1][0]).sort().at(-1) as DateStr;
  const m = new Map<string, number>();
  for (const s of parts) for (const [d, v] of carryForward(s, until, maxGap)) m.set(d, (m.get(d) ?? 0) + v);
  return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

export interface ReversedDrop {
  /** Last reading before the drop. */
  before: DateStr;
  /** First day of the low. */
  date: DateStr;
  /** Day the level was back. */
  recovered: DateStr;
  from: number;
  low: number;
}

/**
 * A fall of more than `drop` (50%) from one reading to the next that is back within `within`
 * days (3) to at least `recover` (80%) of the level before it. Real outflows rarely undo
 * themselves that fast; a missing listing or a bad print does.
 */
export function reversedDrops(series: Series, opts: { drop?: number; within?: number; recover?: number; floor?: number } = {}): ReversedDrop[] {
  const drop = opts.drop ?? 0.5;
  const within = opts.within ?? 3;
  const recover = opts.recover ?? 0.8;
  const floor = opts.floor ?? 0;
  const out: ReversedDrop[] = [];
  for (let i = 1; i < series.length; i++) {
    const [d0, v0] = series[i - 1];
    const [d1, v1] = series[i];
    if (v0 <= floor || v1 >= v0 * (1 - drop)) continue;
    let low = v1;
    for (let j = i + 1; j < series.length && daysBetween(d1, series[j][0]) <= within; j++) {
      const [dj, vj] = series[j];
      if (vj >= v0 * recover) {
        out.push({ before: d0, date: d1, recovered: dj, from: v0, low });
        break;
      }
      low = Math.min(low, vj);
    }
  }
  return out;
}
