import type { ReactNode } from "react";
import { NOT_TRACKED } from "@/lib/coverage";
import { fmtDateShort, fmtUsd } from "@/lib/format";
import { FLAG_SHORT, FLAG_TEXT, fmtMetricValue, type ResolvedMetric } from "@/lib/sector-metrics";
import { InfoTip } from "./info-tip";

/** The day most rows in a block share, so the block states it once and a row repeats its date only when it differs. */
export function blockAsOf(rows: ResolvedMetric[]): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) if (r.asOf) counts.set(r.asOf, (counts.get(r.asOf) ?? 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] ?? null;
}

/** What a metric counts, why a zero is a zero, and why a figure sits outside the chain totals. Source names live here only. */
function Definition({ r }: { r: ResolvedMetric }) {
  return (
    <InfoTip label={`About ${r.def.label}`} className="align-middle">
      <span className="block space-y-1.5">
        <span className="block">{r.def.info}</span>
        {r.state === "zero-by-design" && r.reason && <span className="block">Zero by design. The source says, &ldquo;{r.reason}&rdquo;</span>}
        {r.flag && <span className="block">{FLAG_TEXT[r.flag]}.</span>}
        {r.state === "not-tracked" && <span className="block">Not tracked means the metric applies here but no free source covers this project yet. It is a coverage gap, not a zero.</span>}
      </span>
    </InfoTip>
  );
}

/**
 * One registry metric as a pop-up cell: a value, "$0" by design with its reason, or Not tracked.
 * Not applicable metrics never reach here; the registry drops them. `after` carries the daily or
 * snapshot source and the 7, 30 and 90 day changes for core metrics.
 */
export function MetricCell({ r, sharedAsOf, after }: { r: ResolvedMetric; sharedAsOf?: string | null; after?: ReactNode }) {
  const dated = r.asOf && (r.stale || (sharedAsOf !== undefined && r.asOf !== sharedAsOf));
  return (
    <span data-metric={r.def.id} data-state={r.state}>
      {r.state === "value" && r.value !== null && (
        <span className="tabular">
          {fmtMetricValue(r.def, r.value)}
          {r.def.id === "capture" && " of fees"}
        </span>
      )}
      {r.state === "zero-by-design" && (
        <>
          <span className="tabular">$0</span> <span className="text-xs text-ink-300">by design</span>
        </>
      )}
      {r.state === "not-tracked" && <span className="text-ink-300">{NOT_TRACKED}</span>}
      <Definition r={r} />
      {r.flag && r.state === "value" && <span className="ml-1 text-xs text-ink-300">{FLAG_SHORT[r.flag]}</span>}
      {dated && <span className="ml-2 text-xs text-ink-300">as of {fmtDateShort(r.asOf as string)}</span>}
      {after}
    </span>
  );
}

/**
 * Figures that only make sense together, side by side with a one-line definition each. Lending uses it
 * for Total deposited, Borrowed and TVL, which measure different things and are all true at once.
 */
export function MetricTrio({ rows, briefs, sharedAsOf }: { rows: ResolvedMetric[]; briefs: Record<string, string>; sharedAsOf?: string | null }) {
  if (!rows.length) return null;
  return (
    <div className="grid grid-cols-3 gap-3 rounded-lg border border-ink-700/60 p-3" data-testid="metric-trio">
      {rows.map((r) => (
        <div key={r.def.id} className="min-w-0" data-metric={r.def.id} data-state={r.state}>
          <div className="type-label flex items-center gap-0.5 text-ink-300">
            {r.def.label}
            <Definition r={r} />
          </div>
          <div className="tabular font-display text-base font-semibold text-ink-50">{r.state === "value" && r.value !== null ? fmtUsd(r.value) : <span className="text-sm font-normal text-ink-300">{NOT_TRACKED}</span>}</div>
          <div className="text-xs leading-snug text-ink-300">{briefs[r.def.id]}</div>
          {r.asOf && (r.stale || (sharedAsOf !== undefined && r.asOf !== sharedAsOf)) && <div className="text-xs text-ink-300">as of {fmtDateShort(r.asOf)}</div>}
        </div>
      ))}
    </div>
  );
}
