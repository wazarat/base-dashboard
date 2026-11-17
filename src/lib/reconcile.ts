/**
 * Proof that the Atlas totals match DefiLlama's chain totals (owner review,
 * 2026-11-09). Pure; scripts/build-data.ts runs it on every build and fails
 * on a miss.
 */
import type { DateStr } from "./dates";
import { EXCLUSION_LABEL, FLAG_METRICS, type FlagMetric, type TvlExclusion } from "./flags";
import type { LlamaProtocolSnap, Series, SeriesMap } from "./history-types";
import { sumWindow, valueAt } from "./live";

export const RECONCILE_TOLERANCE = 0.01;

export interface Contributor {
  name: string;
  value: number;
}

export interface ReconcileCheck {
  id: string;
  label: string;
  ours: number;
  theirs: number | null;
  /** ours / theirs - 1 */
  gap: number | null;
  ok: boolean;
  /** Largest protocols that could explain a gap, biggest first. */
  contributors: Contributor[];
}

export interface Exclusion {
  name: string;
  slug: string;
  reason: TvlExclusion | "outside-breakdown";
  value: number;
}

export interface ReconcileResult {
  windowEnd: DateStr;
  checks: ReconcileCheck[];
  ok: boolean;
  /** Per metric, every protocol with a value that the Atlas total leaves out, biggest first. */
  excluded: Record<FlagMetric, Exclusion[]>;
  /** Per metric, the Atlas sum of counted protocols over the window (TVL on windowEnd). */
  atlas: Record<FlagMetric, number>;
}

function check(id: string, label: string, ours: number, theirs: number | null, contributors: Contributor[]): ReconcileCheck {
  const gap = theirs && theirs > 0 ? ours / theirs - 1 : null;
  return { id, label, ours, theirs, gap, ok: gap !== null && Math.abs(gap) <= RECONCILE_TOLERANCE, contributors: contributors.slice(0, 10) };
}

const desc = (a: Contributor, b: Contributor) => b.value - a.value;

/**
 * Flows: the protocols flagged inChainTotal, summed over the 30 days ending at
 * `end`, against DefiLlama's chain series over the same days.
 */
export function reconcileFlow(metric: Exclude<FlagMetric, "tvl">, protocols: LlamaProtocolSnap[], byName: SeriesMap, chain: Series, end: DateStr): { check: ReconcileCheck; atlas: number; excluded: Exclusion[] } {
  const included = new Set(protocols.filter((p) => p.inChainTotal?.[metric]).map((p) => p.name));
  let atlas = 0;
  const inside: Contributor[] = [];
  const outside: Contributor[] = [];
  for (const [name, s] of Object.entries(byName)) {
    const v = sumWindow(s, end, 30).value ?? 0;
    if (v === 0) continue;
    if (included.has(name)) {
      atlas += v;
      inside.push({ name, value: v });
    } else outside.push({ name, value: v });
  }
  const theirs = sumWindow(chain, end, 30).value;
  // Under the chain total, the missing value is among the names left out; over it, among the names kept.
  const contributors = theirs !== null && atlas < theirs ? outside.sort(desc) : inside.sort(desc);
  const slugOf = new Map(protocols.map((p) => [p.name, p]));
  const excluded = outside.sort(desc).map((c) => {
    const p = slugOf.get(c.name);
    return { name: c.name, slug: p?.slug ?? c.name, reason: p?.chainIncome ? ("chain-income" as const) : ("outside-breakdown" as const), value: c.value };
  });
  return { check: check(metric, `30-day ${metric}`, atlas, theirs, contributors), atlas, excluded };
}

/**
 * TVL on one day. DefiLlama's chain TVL is every protocol outside its
 * double-counted bucket (CEX deposits are in neither), and the bucket itself is
 * published as its own series, so both halves are checked.
 */
export function reconcileTvl(protocols: LlamaProtocolSnap[], chainTvl: Series, doublecounted: Series, end: DateStr): { checks: ReconcileCheck[]; atlas: number; excluded: Exclusion[] } {
  const withTvl = protocols.filter((p) => p.tvlPrevDay && p.tvlPrevDay[0] === end && p.tvlPrevDay[1] > 0);
  const val = (p: LlamaProtocolSnap) => p.tvlPrevDay?.[1] ?? 0;
  // DefiLlama keeps token lockers in chain TVL but leaves out exchanges and bridge deposits.
  const counted = withTvl.filter((p) => !p.doublecounted && p.tvlExclusion !== "cex" && p.tvlExclusion !== "bridge");
  const dc = withTvl.filter((p) => p.doublecounted);
  const sum = (ps: LlamaProtocolSnap[]) => ps.reduce((a, p) => a + val(p), 0);
  const toC = (ps: LlamaProtocolSnap[]) => ps.map((p) => ({ name: p.name, value: val(p) })).sort(desc);
  const chainV = valueAt(chainTvl, end, 0);
  const dcV = valueAt(doublecounted, end, 0);
  const countedSum = sum(counted);
  const dcSum = sum(dc);
  const atlasPs = withTvl.filter((p) => p.inChainTotal?.tvl);
  // The exclusion list also names exchanges, which the lite listing carries no previous-day value for; their listing value stands in.
  const excluded = protocols
    .filter((p) => p.kinds.includes("tvl") && !p.inChainTotal?.tvl)
    .map((p) => ({ name: p.name, slug: p.slug, reason: (p.tvlExclusion ?? "doublecounted") as TvlExclusion, value: p.tvlPrevDay?.[0] === end ? p.tvlPrevDay[1] : p.tvl }))
    .filter((e) => e.value > 0)
    .sort(desc);
  return {
    checks: [
      check("tvl", "TVL counted by DefiLlama", countedSum, chainV, chainV !== null && countedSum > chainV ? toC(counted) : toC(withTvl.filter((p) => p.doublecounted || p.tvlExclusion === "cex" || p.tvlExclusion === "bridge"))),
      check("tvl-doublecounted", "TVL double counted", dcSum, dcV, dcV !== null && dcSum > dcV ? toC(dc) : toC(counted)),
    ],
    atlas: sum(atlasPs),
    excluded,
  };
}

export function reconcile(
  protocols: LlamaProtocolSnap[],
  store: Record<Exclude<FlagMetric, "tvl">, SeriesMap>,
  chain: { tvl: Series; tvlDoublecounted: Series; volume: Series; fees: Series; revenue: Series },
  end: DateStr,
): ReconcileResult {
  const tvl = reconcileTvl(protocols, chain.tvl, chain.tvlDoublecounted, end);
  const checks = [...tvl.checks];
  const excluded = { tvl: tvl.excluded } as ReconcileResult["excluded"];
  const atlas = { tvl: tvl.atlas } as ReconcileResult["atlas"];
  for (const m of FLAG_METRICS) {
    if (m === "tvl") continue;
    const r = reconcileFlow(m, protocols, store[m], chain[m], end);
    checks.push(r.check);
    excluded[m] = r.excluded;
    atlas[m] = r.atlas;
  }
  return { windowEnd: end, checks, ok: checks.every((c) => c.ok), excluded, atlas };
}

/** Exclusions grouped by reason, biggest group first, for the KPI InfoTips. */
export function groupExclusions(list: Exclusion[]): Array<{ reason: Exclusion["reason"]; label: string; names: string[]; value: number; count: number }> {
  const m = new Map<Exclusion["reason"], { names: string[]; value: number; count: number }>();
  for (const e of list) {
    const g = m.get(e.reason) ?? { names: [], value: 0, count: 0 };
    g.names.push(e.name);
    g.value += e.value;
    g.count += 1;
    m.set(e.reason, g);
  }
  return Array.from(m.entries())
    .map(([reason, g]) => ({ reason, label: EXCLUSION_LABEL[reason], ...g }))
    .sort((a, b) => b.value - a.value);
}
