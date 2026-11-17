/**
 * KPI card values and their generated InfoTip sentences (owner review,
 * 2026-11-09). Unfiltered cards show DefiLlama's chain totals; filtered cards sum
 * only what DefiLlama counts in that total. Every number and name here is
 * computed from the data, never typed.
 */
import { fmtDateShort, fmtPct, fmtUsd, lowerLabel } from "./format";
import { countedValue, sumCounted } from "./metrics";
import type { ChainData, Meta, NumericMetricKey, Project } from "./types";

export function fmtWindow(start: string, end: string): string {
  return `${fmtDateShort(start)} to ${fmtDateShort(end)}`;
}

/** Chain totals per metric for the latest window; TVL on the last full day. */
export function chainTotal(latest: ChainData["latest"], metric: NumericMetricKey): number | null {
  return metric === "tvl" ? latest.tvl : metric === "volume" ? latest.volume30d : metric === "fees" ? latest.fees30d : latest.revenue30d;
}

export function kpiValue(projects: Project[], metric: NumericMetricKey, unfiltered: boolean, latest: ChainData["latest"]): number | null {
  // With no daily history yet there is no chain total, so the card sums the research snapshot the same way a filtered card does.
  const chain = unfiltered ? chainTotal(latest, metric) : null;
  return chain ?? sumCounted(projects, metric);
}

export function trackedCount(projects: Project[], metric: NumericMetricKey): number {
  return projects.filter((p) => countedValue(p, metric) !== null).length;
}

/** Short on purpose (owner request, 2026-11-10): what is left out and why lives in the card's InfoTip (`kpiInfo`). */
export function fmtCountedTracked(tracked: number, total: number): string {
  return `Tracked for ${tracked}/${total} ${total === 1 ? "project" : "projects"}`;
}

const WHY: Record<string, string> = {
  doublecounted: "their deposits already sit in another app DefiLlama counts",
  cex: "they are exchange balances, not onchain apps",
  locker: "locked tokens are not working capital, though DefiLlama's chain TVL keeps them",
  "chain-income": "it is the chain's own sequencer income, not an app",
  "outside-breakdown": "DefiLlama does not count them in its chain total",
};

/** Exclusions DefiLlama's own chain total also leaves out; lockers are the Atlas's choice only. */
const IN_CHAIN_TOTAL_TOO = new Set(["doublecounted", "cex", "chain-income", "outside-breakdown"]);

function list(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** One sentence per exclusion group: what is left out and why. */
export function exclusionSentences(groups: NonNullable<Meta["chainTotals"]>["excluded"][NumericMetricKey], unfiltered: boolean): string[] {
  return groups
    .filter((g) => g.value > 0 && (!unfiltered || IN_CHAIN_TOTAL_TOO.has(g.reason)))
    .map((g) => {
      const n = g.count;
      const what = g.reason === "chain-income" ? `${list(g.names.slice(0, 1))} (${fmtUsd(g.value)})` : `${n} ${n === 1 ? "app" : "apps"} worth ${fmtUsd(g.value)}, such as ${list(g.names.slice(0, 3))}`;
      const verb = g.reason === "chain-income" || n === 1 ? "is" : "are";
      return `${g.label}, ${what}, ${verb} left out because ${WHY[g.reason] ?? "DefiLlama leaves them out"}.`;
    });
}

export function kpiInfo(metric: NumericMetricKey, unfiltered: boolean, ct: Meta["chainTotals"], label: string): string {
  if (!ct) return `Sum of the ${lowerLabel(label)} in the research snapshot of Nov 17 2026, from DefiLlama. Vault curators, capital allocators, liquid staking, token lockers and exchange wallets are left out because their deposits already sit in other apps or are not apps. DefiLlama's chain figure replaces this once the daily refresh runs.`;
  const when = metric === "tvl" ? `on ${fmtDateShort(ct.windowEnd)}` : `from ${fmtWindow(ct.windowStart, ct.windowEnd)}`;
  const head = unfiltered ? `DefiLlama's ${lowerLabel(label)} for Base ${when}.` : `Sum over the filtered projects of only what DefiLlama counts in its chain total, ${when}.`;
  return [head, ...exclusionSentences(ct.excluded[metric], unfiltered)].join(" ");
}

export interface NativeRevenue {
  share: number | null;
  top: Array<{ name: string; value: number }>;
  /** Share with Arcus taken out of both sides, when Arcus is native and counted. */
  withoutArcus: number | null;
}

export function nativeRevenue(projects: Project[]): NativeRevenue {
  const total = sumCounted(projects, "revenue");
  const natives = projects.filter((p) => p.chain === "Base native" && (countedValue(p, "revenue") ?? 0) > 0);
  const nat = natives.reduce((a, p) => a + (countedValue(p, "revenue") ?? 0), 0);
  if (total === null || total <= 0) return { share: null, top: [], withoutArcus: null };
  const top = natives
    .map((p) => ({ name: p.name, value: countedValue(p, "revenue") as number }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
  const arcus = natives.find((p) => p.name === "Arcus");
  const av = arcus ? (countedValue(arcus, "revenue") ?? 0) : 0;
  return { share: nat / total, top, withoutArcus: arcus && total - av > 0 ? (nat - av) / (total - av) : null };
}

export function nativeRevenueInfo(n: NativeRevenue, ct: Meta["chainTotals"]): string {
  const when = ct ? `, ${fmtWindow(ct.windowStart, ct.windowEnd)}` : "";
  const parts = [`Share of 30-day revenue that DefiLlama counts in the chain total earned by projects classified as Base native${when}.`];
  if (n.top.length) parts.push(`The largest native contributors are ${list(n.top.map((t) => `${t.name} (${fmtUsd(t.value)})`))}.`);
  if (n.withoutArcus !== null) parts.push(`Arcus counts as native, and without it the share is ${fmtPct(n.withoutArcus)}.`);
  return parts.join(" ");
}

/**
 * Stablecoin supply KPI. Unfiltered it is DefiLlama's Base total; filtered it sums the
 * coins mapped to the selected projects. A separate metric that never enters TVL.
 */
export function stablecoinKpi(projects: Project[], unfiltered: boolean, s: Meta["stablecoins"]): { value: number | null; sub: string; info: string } {
  if (!s) return { value: null, sub: "Not tracked", info: "DefiLlama reports no stablecoin supply for Base on the last refresh." };
  const issuers = projects.filter((p) => p.onchain?.stableSupply != null);
  const value = unfiltered ? s.total : issuers.length ? issuers.reduce((a, p) => a + (p.onchain?.stableSupply ?? 0), 0) : null;
  const top = s.coins.slice(0, 3).map((c) => `${c.symbol} ${fmtUsd(c.usd, { digits: c.usd >= 1e6 && c.usd < 1e9 ? 0 : 1 })}`);
  const sub = unfiltered ? `Tracking ${s.coins.length} ${s.coins.length === 1 ? "coin" : "coins"}` : `Tracking ${issuers.length} ${issuers.length === 1 ? "issuer" : "issuers"}`;
  const info = `Stablecoins on Base on ${fmtDateShort(s.asOf)}, from DefiLlama. The largest are ${top.join(", ")}. Kept apart from TVL so nothing is counted twice.`;
  return { value, sub, info };
}
