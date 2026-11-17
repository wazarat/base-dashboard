import { isLive } from "./coverage";
import { fmtPct, METRIC_LABEL } from "./format";
import { concentration, metricValue, nativeShare, topNShare, type ValueOf } from "./metrics";
import { redFlagTypes } from "./red-flags";
import type { MetricKey, NumericMetricKey, Project } from "./types";

export interface Insight {
  id: string;
  text: string;
}

function pct(v: number | null): string {
  return fmtPct(v, 0);
}

/**
 * Short sentences computed from the current selection. Pure and deterministic
 * so they can be tested; nothing here is hardcoded to the Nov 2026 numbers.
 */
export function generateInsights(
  projects: Project[],
  metric: MetricKey,
  opts: {
    value?: ValueOf;
    total?: Partial<Record<NumericMetricKey, number | null>>;
    /**
     * Logged out, the per-project funding and security facts are gated, so the research line uses the
     * build's counts for the whole list (null with filters on, where the line is left out).
     */
    research?: { fundingChecked: number; redFlagged: number } | null;
  } = {},
): Insight[] {
  // The Overview passes counted values and the chain totals, so these sentences use the same totals as the KPI cards.
  const valueOf = opts.value ?? metricValue;
  const out: Insight[] = [];
  const n = projects.length;
  if (n === 0) {
    return [{ id: "empty", text: "No projects match the current filters." }];
  }

  const focus: NumericMetricKey = metric === "count" ? "tvl" : metric;
  const focusLabel = METRIC_LABEL[focus];

  // 1. Concentration in the selected metric.
  const denom = opts.total?.[focus] ?? null;
  const where = denom ? "on Base" : "in this selection";
  const curve = concentration(projects, focus, { value: valueOf, total: denom });
  if (curve.length >= 3) {
    const top3 = topNShare(curve, 3);
    const top10 = curve.length >= 10 ? topNShare(curve, 10) : null;
    out.push({
      id: "concentration",
      text:
        `Top 3 projects hold ${pct(top3)} of ${focusLabel} ${where}` +
        (top10 !== null ? `, the top 10 hold ${pct(top10)}.` : "."),
    });
  } else if (curve.length > 0) {
    out.push({
      id: "concentration",
      text: `Only ${curve.length} project${curve.length === 1 ? "" : "s"} in this selection report${curve.length === 1 ? "s" : ""} ${focusLabel}.`,
    });
  }

  // 2. Single largest project.
  if (curve.length >= 2) {
    const lead = curve[0];
    out.push({
      id: "leader",
      text: `${lead.name} alone is ${pct(lead.share)} of ${focusLabel} ${denom ? where : "here"}.`,
    });
  }

  // 3. Native share of count vs revenue vs TVL.
  const nativeCount = projects.filter((p) => p.chain === "Base native").length;
  const nativeRev = nativeShare(projects, "revenue", valueOf);
  const nativeTvl = nativeShare(projects, "tvl", valueOf);
  if (nativeCount > 0 && nativeCount < n && (nativeRev !== null || nativeTvl !== null)) {
    const parts: string[] = [];
    if (nativeRev !== null) parts.push(`earn ${pct(nativeRev)} of revenue`);
    if (nativeTvl !== null) parts.push(`hold ${pct(nativeTvl)} of TVL`);
    out.push({
      id: "native",
      text: `Base-native projects are ${pct(nativeCount / n)} of the selection but ${parts.join(" and ")}.`,
    });
  } else if (nativeCount === n) {
    out.push({ id: "native", text: `Every project in this selection is Base-native.` });
  } else if (nativeCount === 0) {
    out.push({ id: "native", text: `No Base-native projects in this selection.` });
  }

  // 4. Listed vs live.
  const live = projects.filter(isLive).length;
  out.push({
    id: "live",
    text: `${live} of ${n} projects (${pct(live / n)}) have traction.`,
  });

  // 5. Biggest sector by count with its live ratio, when more than one sector.
  const sectors = new Map<string, { total: number; live: number }>();
  for (const p of projects) {
    const s = sectors.get(p.sector) ?? { total: 0, live: 0 };
    s.total += 1;
    if (isLive(p)) s.live += 1;
    sectors.set(p.sector, s);
  }
  if (sectors.size > 1) {
    const [name, s] = Array.from(sectors.entries()).sort((a, b) => b[1].total - a[1].total)[0];
    out.push({
      id: "sector",
      text: `${name} is the largest sector with ${s.total} projects, ${s.live} of them with traction.`,
    });
  }

  // 6. Revenue capture spread.
  const withCapture = projects.filter((p) => p.revenueCapture !== null && (p.fees ?? 0) >= 10_000);
  if (withCapture.length >= 3) {
    const sorted = [...withCapture].sort((a, b) => (b.revenueCapture as number) - (a.revenueCapture as number));
    const hi = sorted[0];
    const lo = sorted[sorted.length - 1];
    out.push({
      id: "capture",
      text: `Revenue capture ranges from ${pct(lo.revenueCapture)} (${lo.name}) to ${pct(hi.revenueCapture)} (${hi.name}) of fees.`,
    });
  }

  // 7. Research coverage.
  const fromBuild = opts.research !== undefined;
  const researched = fromBuild ? (opts.research?.fundingChecked ?? 0) : projects.filter((p) => p.fundingType !== "Not researched").length;
  const flagged = fromBuild ? (opts.research?.redFlagged ?? 0) : projects.filter((p) => redFlagTypes(p).length > 0).length;
  if (researched > 0) {
    out.push({
      id: "coverage",
      text: `${researched} of ${n} were researched for funding and security; ${flagged} ${flagged === 1 ? "lists" : "list"} at least one red flag.`,
    });
  }

  // 8. Tier 1 count when the selection has any.
  const t1 = projects.filter((p) => p.tier === "Tier 1 - Leader").length;
  if (t1 > 0 && out.length < 7) {
    out.push({ id: "tier1", text: `${t1} Tier 1 leader${t1 === 1 ? "" : "s"} in this selection.` });
  }

  // Keep 5 to 7 sentences.
  return out.slice(0, 7);
}
