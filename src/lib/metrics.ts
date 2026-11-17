import type { MetricKey, NativeChain, NumericMetricKey, Project } from "./types";
import { NATIVE_CHAINS } from "./types";
import { tractionReasons } from "./traction";

export const NUMERIC_METRICS: NumericMetricKey[] = ["tvl", "volume", "fees", "revenue"];

/** Value of a metric for one project. "count" is 1 per project. Blank stays null. */
export function metricValue(p: Project, metric: MetricKey): number | null {
  if (metric === "count") return 1;
  return p[metric];
}

export type ValueOf = (p: Project, metric: MetricKey) => number | null;

/** Like metricValue, but money metrics count only what DefiLlama counts in its chain total. */
export function countedMetricValue(p: Project, metric: MetricKey): number | null {
  return metric === "count" ? 1 : (p.counted?.values[metric] ?? null);
}

/** Sum ignoring nulls. Returns null when no project had a value. */
export function sumMetric(projects: Project[], metric: MetricKey, valueOf: ValueOf = metricValue): number | null {
  let total = 0;
  let seen = false;
  for (const p of projects) {
    const v = valueOf(p, metric);
    if (v !== null) {
      total += v;
      seen = true;
    }
  }
  return seen ? total : null;
}

/** A project's value counted toward the chain total; null when DefiLlama leaves it out or has no figure. */
export function countedValue(p: Project, metric: NumericMetricKey): number | null {
  return p.counted?.values[metric] ?? null;
}

/** Sum of counted values; null when no project in the list has one. */
export function sumCounted(projects: Project[], metric: NumericMetricKey): number | null {
  let total = 0;
  let seen = false;
  for (const p of projects) {
    const v = countedValue(p, metric);
    if (v !== null) {
      total += v;
      seen = true;
    }
  }
  return seen ? total : null;
}

export function countWith(projects: Project[], metric: NumericMetricKey): number {
  return projects.filter((p) => p[metric] !== null).length;
}

export interface GroupTotal<K extends string = string> {
  key: K;
  value: number;
  count: number;
  /** number of projects with a non-null value for this metric */
  withData: number;
}

export function groupBy<K extends string>(
  projects: Project[],
  keyOf: (p: Project) => K,
  metric: MetricKey,
  valueOf: ValueOf = metricValue,
): GroupTotal<K>[] {
  const map = new Map<K, GroupTotal<K>>();
  for (const p of projects) {
    const k = keyOf(p);
    const g = map.get(k) ?? { key: k, value: 0, count: 0, withData: 0 };
    g.count += 1;
    const v = valueOf(p, metric);
    if (v !== null) {
      g.value += v;
      g.withData += 1;
    }
    map.set(k, g);
  }
  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

export function bySector(projects: Project[], metric: MetricKey, valueOf: ValueOf = metricValue) {
  return groupBy(projects, (p) => p.sector, metric, valueOf);
}

export function byChain(projects: Project[], metric: MetricKey, valueOf: ValueOf = metricValue) {
  return groupBy(projects, (p) => p.chain, metric, valueOf);
}

/** Share of each native chain for one metric, in NATIVE_CHAINS order. */
export function chainShares(projects: Project[], metric: MetricKey): Record<NativeChain, number> {
  const totals = byChain(projects, metric);
  const total = totals.reduce((a, g) => a + g.value, 0);
  const out = {} as Record<NativeChain, number>;
  for (const c of NATIVE_CHAINS) {
    const g = totals.find((t) => t.key === c);
    out[c] = total > 0 && g ? g.value / total : 0;
  }
  return out;
}

export function nativeShare(projects: Project[], metric: MetricKey, valueOf: ValueOf = metricValue): number | null {
  const total = sumMetric(projects, metric, valueOf);
  if (total === null || total === 0) return null;
  const native = sumMetric(projects.filter((p) => p.chain === "Base native"), metric, valueOf) ?? 0;
  return native / total;
}

export interface ConcentrationPoint {
  rank: number;
  name: string;
  id: string;
  value: number;
  cumulative: number;
  share: number;
}

/**
 * Projects ranked by metric (nulls and zeros excluded) with cumulative share.
 * `total` is the denominator, for example the chain total, so shares read as a
 * share of the whole chain; it defaults to the sum of the ranked values.
 */
export function concentration(projects: Project[], metric: NumericMetricKey, opts: { value?: ValueOf; total?: number | null } = {}): ConcentrationPoint[] {
  const valueOf = opts.value ?? metricValue;
  const ranked = projects
    .map((p) => ({ p, v: valueOf(p, metric) }))
    .filter((x): x is { p: Project; v: number } => x.v !== null && x.v > 0)
    .sort((a, b) => b.v - a.v || a.p.name.localeCompare(b.p.name));
  const sum = ranked.reduce((a, x) => a + x.v, 0);
  const total = opts.total && opts.total > 0 ? opts.total : sum;
  let cum = 0;
  return ranked.map(({ p, v }, i) => {
    cum += v;
    return { rank: i + 1, name: p.name, id: p.id, value: v, cumulative: cum, share: total > 0 ? cum / total : 0 };
  });
}

export interface ConcentrationBar {
  id: string | null;
  name: string;
  value: number;
  /** Share of the denominator. */
  share: number;
  other?: boolean;
}

/** The top n projects as bars, then one "All other projects" bar holding the rest of the denominator. */
export function concentrationBars(points: ConcentrationPoint[], total: number | null, n = 10): ConcentrationBar[] {
  const denom = total && total > 0 ? total : (points.at(-1)?.cumulative ?? 0);
  if (denom <= 0) return [];
  const top = points.slice(0, n).map((p) => ({ id: p.id, name: p.name, value: p.value, share: p.value / denom }));
  const rest = denom - top.reduce((a, b) => a + b.value, 0);
  return rest > 0 ? [...top, { id: null, name: "All other projects", value: rest, share: rest / denom, other: true }] : top;
}

export function topNShare(points: ConcentrationPoint[], n: number): number | null {
  if (points.length === 0) return null;
  const idx = Math.min(n, points.length) - 1;
  return points[idx].share;
}

export function topN(projects: Project[], metric: MetricKey, n: number): Project[] {
  return projects
    .filter((p) => metricValue(p, metric) !== null)
    .sort((a, b) => (metricValue(b, metric) ?? 0) - (metricValue(a, metric) ?? 0))
    .slice(0, n);
}

/** Same sector, nearest by metric (falls back to same sector by tier). */
export function similarProjects(all: Project[], target: Project, metric: MetricKey, n = 5): Project[] {
  const peers = all.filter((p) => p.sector === target.sector && p.id !== target.id);
  const tv = metric === "count" ? null : target[metric];
  if (tv === null) {
    // No metric on the target: prefer peers with traction, then same tier.
    return peers
      .sort((a, b) => Number(tractionReasons(b).length > 0) - Number(tractionReasons(a).length > 0) || a.tier.localeCompare(b.tier))
      .slice(0, n);
  }
  const withVal = peers.filter((p) => p[metric as NumericMetricKey] !== null);
  return withVal
    .sort(
      (a, b) =>
        Math.abs(Math.log((a[metric as NumericMetricKey] as number) + 1) - Math.log(tv + 1)) -
        Math.abs(Math.log((b[metric as NumericMetricKey] as number) + 1) - Math.log(tv + 1)),
    )
    .slice(0, n);
}
