/**
 * Compare mode: selection in the URL (compare=a,b,c), peer suggestions,
 * per-metric ranks and shares within each project's sector, size-independent
 * ratios, indexed trend lines and generated sentences. Pure except useCompare().
 */
"use client";

import { useAccess } from "./access";
import { compareChange } from "./gate";
import { useQueryStates } from "nuqs";
import { useCallback, useMemo } from "react";
import { projects as allProjects } from "./data";
import { filterParsers } from "./filters";
import { fmtPctSigned, fmtUsd, METRIC_LABEL, lowerLabel } from "./format";
import { similarProjects } from "./metrics";
import { authOf, trackCompareAdd } from "./track";
import type { MetricKey, NumericMetricKey, Project, SeriesFile, SeriesKey } from "./types";

export const COMPARE_MAX = 4;

export function normalizeSelection(ids: string[], known: Set<string>): string[] {
  const out: string[] = [];
  for (const id of ids) if (known.has(id) && !out.includes(id)) out.push(id);
  return out.slice(0, COMPARE_MAX);
}

export function useCompare() {
  const [state, setState] = useQueryStates({ compare: filterParsers.compare }, { history: "replace", clearOnDefault: true });
  const known = useMemo(() => new Set(allProjects.map((p) => p.id)), []);
  const ids = useMemo(() => normalizeSelection(state.compare, known), [state.compare, known]);
  const projects = useMemo(() => ids.map((id) => allProjects.find((p) => p.id === id)).filter((p): p is Project => Boolean(p)), [ids]);
  const access = useAccess();
  const write = useCallback((next: string[]) => void setState({ compare: normalizeSelection(next, known) }), [setState, known]);
  // Adding to compare is gated (login wall); reading a comparison and removing from it are not.
  const set = useCallback(
    (next: string[]) => {
      // Logged out, one project may be picked; comparing a second asks for login (owner, 2026-11-11).
      const r = compareChange(ids, next, access.can({ action: "compare-add" }));
      if ("login" in r) access.openLogin("compare", r.login);
      else {
        write(r.write);
        if (r.write.some((id) => !ids.includes(id))) trackCompareAdd(Math.min(r.write.length, COMPARE_MAX), authOf(access));
      }
    },
    [ids, access, write],
  );
  const add = useCallback((id: string) => set([...ids, id]), [ids, set]);
  const remove = useCallback((id: string) => write(ids.filter((x) => x !== id)), [ids, write]);
  const toggle = useCallback((id: string) => (ids.includes(id) ? remove(id) : add(id)), [ids, add, remove]);
  const clear = useCallback(() => write([]), [write]);
  /** Replays a saved Add to compare after login, without asking again. */
  const addUngated = useCallback(
    (id: string) => {
      write([...ids, id]);
      trackCompareAdd(Math.min(ids.length + 1, COMPARE_MAX), authOf(access));
    },
    [ids, write, access],
  );
  return { ids, projects, set, add, remove, toggle, clear, addUngated, has: (id: string) => ids.includes(id), isFull: ids.length >= COMPARE_MAX };
}

/** Top same-sector peers by the selected metric, excluding the target and anything already chosen. */
export function suggestPeers(target: Project, metric: MetricKey, all: Project[], exclude: string[], n = 3): Project[] {
  const m: NumericMetricKey = metric === "count" ? "tvl" : metric;
  const peers = all
    .filter((p) => p.sector === target.sector && p.id !== target.id && !exclude.includes(p.id) && p[m] !== null)
    .sort((a, b) => (b[m] as number) - (a[m] as number))
    .slice(0, n);
  if (peers.length >= n) return peers;
  const extra = similarProjects(all, target, metric, n * 2).filter((p) => !exclude.includes(p.id) && !peers.some((x) => x.id === p.id));
  return [...peers, ...extra].slice(0, n);
}

export interface MatrixCell {
  value: number | null;
  rank: number | null;
  of: number;
  share: number | null;
  best: boolean;
}

export interface MatrixRow {
  key: string;
  label: string;
  format: (v: number | null) => string;
  cells: MatrixCell[];
  higherIsBetter: boolean;
}

export const MATRIX_METRICS: Array<{ key: string; label: string; get: (p: Project) => number | null; money: boolean; higherIsBetter: boolean }> = [
  { key: "tvl", label: "TVL", get: (p) => p.tvl, money: true, higherIsBetter: true },
  { key: "volume", label: "30d DEX volume", get: (p) => p.volume, money: true, higherIsBetter: true },
  { key: "fees", label: "30d fees", get: (p) => p.fees, money: true, higherIsBetter: true },
  { key: "revenue", label: "30d revenue", get: (p) => p.revenue, money: true, higherIsBetter: true },
  { key: "annualised", label: "Annualised revenue", get: (p) => p.live?.annualisedRevenue ?? null, money: true, higherIsBetter: true },
  { key: "mcap", label: "Token market cap", get: (p) => p.live?.tokenMarketCap ?? null, money: true, higherIsBetter: true },
  { key: "ps", label: "P/S", get: (p) => p.live?.psRatio ?? null, money: false, higherIsBetter: false },
  { key: "txns", label: "Daily transactions", get: (p) => p.live?.txns24h ?? null, money: false, higherIsBetter: true },
  { key: "senders", label: "Unique senders 7d (est.)", get: (p) => p.live?.uniqueSenders7d ?? null, money: false, higherIsBetter: true },
  { key: "holders", label: "Token holders", get: (p) => p.live?.holders ?? null, money: false, higherIsBetter: true },
];

const fmtNum = (v: number | null) => (v === null ? "Not tracked" : Math.round(v).toLocaleString("en-US"));
const fmtX = (v: number | null) => (v === null ? "Not tracked" : `${v.toFixed(1)}×`);

/** Rank and share are computed within each project's own sector, so mixed-sector comparisons stay honest. */
/** Matrix and ratio rows built from gated fields (financials, activity); a logged-out reader with one project sees the rest. */
export const GATED_COMPARE_KEYS = new Set(["annualised", "mcap", "ps", "txns", "senders", "holders", "txnsPerTvl"]);

export function compareMatrix(selected: Project[], all: Project[], opts: { gated?: boolean } = {}): MatrixRow[] {
  return MATRIX_METRICS.filter((m) => opts.gated !== false || !GATED_COMPARE_KEYS.has(m.key)).map((m) => {
    const cells: MatrixCell[] = selected.map((p) => {
      const sector = all.filter((x) => x.sector === p.sector);
      const vals = sector.map((x) => ({ id: x.id, v: m.get(x) })).filter((x): x is { id: string; v: number } => x.v !== null);
      const value = m.get(p);
      const sorted = [...vals].sort((a, b) => (m.higherIsBetter ? b.v - a.v : a.v - b.v));
      const rank = value === null ? null : sorted.findIndex((x) => x.id === p.id) + 1 || null;
      const total = vals.reduce((a, x) => a + x.v, 0);
      return { value, rank, of: vals.length, share: value !== null && m.money && total > 0 ? value / total : null, best: false };
    });
    const present = cells.filter((c) => c.value !== null);
    if (present.length > 1) {
      const bestVal = m.higherIsBetter ? Math.max(...present.map((c) => c.value as number)) : Math.min(...present.map((c) => c.value as number));
      for (const c of cells) c.best = c.value === bestVal;
    }
    return { key: m.key, label: m.label, format: m.money ? (v) => fmtUsd(v) : m.key === "ps" ? fmtX : fmtNum, cells, higherIsBetter: m.higherIsBetter };
  });
}

export interface RatioRow {
  key: string;
  label: string;
  info: string;
  values: Array<number | null>;
  format: (v: number | null) => string;
  higherIsBetter: boolean;
  best: boolean[];
}

export const ratio = (a: number | null, b: number | null): number | null => (a === null || b === null || b <= 0 ? null : a / b);

export function compareRatios(selected: Project[], opts: { gated?: boolean } = {}): RatioRow[] {
  const rows: Array<Omit<RatioRow, "best">> = [
    { key: "feesPerTvl", label: "30d fees per $1 TVL", info: "30-day fees divided by TVL; how hard the capital works.", values: selected.map((p) => ratio(p.fees, p.tvl)), format: (v) => (v === null ? "Not tracked" : `$${v.toFixed(4)}`), higherIsBetter: true },
    { key: "capture", label: "Revenue capture", info: "30-day revenue divided by 30-day fees.", values: selected.map((p) => p.revenueCapture), format: (v) => (v === null ? "Not tracked" : `${(v * 100).toFixed(0)}%`), higherIsBetter: true },
    { key: "turnover", label: "30d volume / TVL", info: "Capital turnover, 30-day DEX volume divided by TVL.", values: selected.map((p) => ratio(p.volume, p.tvl)), format: (v) => (v === null ? "Not tracked" : `${v.toFixed(1)}×`), higherIsBetter: true },
    { key: "growth", label: "30d change (TVL)", info: "TVL now versus 30 days ago from DefiLlama history.", values: selected.map((p) => p.live?.change.tvl.d30 ?? null), format: (v) => fmtPctSigned(v), higherIsBetter: true },
    { key: "txnsPerTvl", label: "Daily txns per $1M TVL", info: "Transactions to tracked contracts per day, per million dollars of TVL; activity relative to size.", values: selected.map((p) => (p.live?.txns24h !== null && p.live?.txns24h !== undefined && p.tvl ? (p.live.txns24h / p.tvl) * 1e6 : null)), format: (v) => (v === null ? "Not tracked" : v.toFixed(1)), higherIsBetter: true },
  ];
  return rows.filter((r) => opts.gated !== false || !GATED_COMPARE_KEYS.has(r.key)).map((r) => {
    const present = r.values.filter((v): v is number => v !== null);
    const bestVal = present.length > 1 ? (r.higherIsBetter ? Math.max(...present) : Math.min(...present)) : null;
    return { ...r, best: r.values.map((v) => bestVal !== null && v === bestVal) };
  });
}

export function crossSector(selected: Project[]): string[] {
  return Array.from(new Set(selected.map((p) => p.sector)));
}

/**
 * Index each aligned series to 100 at the first date where every project that has any data
 * shows a positive value. Projects with no data at all stay null instead of blanking the chart.
 */
export function indexTo100(series: Array<Array<number | null>>): { start: number; indexed: Array<Array<number | null>>; skipped: number[] } {
  const n = series[0]?.length ?? 0;
  const hasData = series.map((s) => s.some((v) => v !== null && v > 0));
  const active = series.filter((_, k) => hasData[k]);
  let start = -1;
  if (active.length >= 1) {
    for (let i = 0; i < n; i++) {
      if (active.every((s) => s[i] !== null && (s[i] as number) > 0)) {
        start = i;
        break;
      }
    }
  }
  const skipped = hasData.map((h, k) => (h ? -1 : k)).filter((k) => k >= 0);
  if (start === -1) return { start: -1, indexed: series.map((s) => s.map(() => null)), skipped };
  return {
    start,
    indexed: series.map((s, k) => (hasData[k] ? s.map((v, i) => (i < start || v === null ? null : (v / (s[start] as number)) * 100)) : s.map(() => null))),
    skipped,
  };
}

/** Re-base every series so day 0 is its own first non-null value; arrays are left-aligned. */
export function alignByFirstData(series: Array<Array<number | null>>): Array<Array<number | null>> {
  return series.map((s) => {
    const first = s.findIndex((v) => v !== null && (v as number) > 0);
    if (first === -1) return [];
    const base = s[first] as number;
    return s.slice(first).map((v) => (v === null ? null : (v / base) * 100));
  });
}

export function seriesFor(file: SeriesFile | null, ids: string[], key: SeriesKey): Array<Array<number | null>> {
  if (!file) return ids.map(() => []);
  return ids.map((id) => file.projects[id]?.[key] ?? file.dates.map(() => null));
}

/** Two or three plain sentences computed from the numbers. Never hardcoded. */
export function compareSentences(selected: Project[], metric: MetricKey): string[] {
  const out: string[] = [];
  if (selected.length < 2) return out;
  const m: NumericMetricKey = metric === "count" ? "tvl" : metric;
  const withM = selected.filter((p) => p[m] !== null && (p[m] as number) > 0).sort((a, b) => (b[m] as number) - (a[m] as number));
  if (withM.length >= 2) {
    const [a, b] = withM;
    const mult = (a[m] as number) / (b[m] as number);
    out.push(`${a.name} leads on ${lowerLabel(METRIC_LABEL[m])} with ${fmtUsd(a[m])}, ${mult >= 1.05 ? `${mult.toFixed(1)}× ${b.name}` : `about level with ${b.name}`}.`);
  }
  const eff = selected.map((p) => ({ p, v: ratio(p.fees, p.tvl) })).filter((x): x is { p: Project; v: number } => x.v !== null && x.v > 0).sort((a, b) => b.v - a.v);
  if (eff.length >= 2) {
    const [a, b] = [eff[0], eff[eff.length - 1]];
    out.push(`${a.p.name} earns ${(a.v / b.v).toFixed(1)}× more fees per dollar of TVL than ${b.p.name} ($${a.v.toFixed(4)} vs $${b.v.toFixed(4)} over 30 days).`);
  }
  const mom = selected.map((p) => ({ p, v: p.live?.change[m].d30 ?? null })).filter((x): x is { p: Project; v: number } => x.v !== null).sort((a, b) => b.v - a.v);
  if (mom.length >= 2) {
    const [a, b] = [mom[0], mom[mom.length - 1]];
    out.push(`Over 30 days ${a.p.name} ${a.v >= 0 ? "grew" : "shrank"} ${fmtPctSigned(a.v)} in ${lowerLabel(METRIC_LABEL[m])} while ${b.p.name} ${b.v >= 0 ? "grew" : "shrank"} ${fmtPctSigned(b.v)}.`);
  }
  return out.slice(0, 3);
}
