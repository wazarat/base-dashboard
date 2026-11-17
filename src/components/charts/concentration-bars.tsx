"use client";

import { EmptyState } from "@/components/atlas/chart-card";
import { fmtMetric, fmtMetricFull, fmtPct, METRIC_LABEL } from "@/lib/format";
import type { ConcentrationBar } from "@/lib/metrics";
import type { NumericMetricKey } from "@/lib/types";

/**
 * Top projects as horizontal bars of their share of the total (the chain with no filters,
 * the selection with filters), then one "All other projects" bar for the rest, so the
 * reader sees each leader's slice and how much sits outside the top 10 at a glance.
 */
export function ConcentrationBars({ bars, metric, onOpen }: { bars: ConcentrationBar[]; metric: NumericMetricKey; onOpen: (id: string) => void }) {
  if (bars.length === 0) return <EmptyState message={`No ${METRIC_LABEL[metric]} data in this selection.`} />;
  const max = Math.max(...bars.map((b) => b.share), 0.0001);
  return (
    <div>
      <ol className="space-y-1.5">
        {bars.map((b, i) => (
          <li key={b.id ?? "other"} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-x-3 text-sm sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]">
            {b.id ? (
              <button type="button" onClick={() => onOpen(b.id as string)} className="truncate text-left font-medium text-ink-50 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-500/60" title={`${i + 1}. ${b.name}`}>
                {b.name}
              </button>
            ) : (
              <span className="truncate text-ink-300">{b.name}</span>
            )}
            <div className="h-3 w-full overflow-hidden rounded-sm bg-ink-800" aria-hidden="true">
              <div className="h-full rounded-sm" style={{ width: `${Math.max(0.5, (b.share / max) * 100)}%`, backgroundColor: b.other ? "var(--tier-none)" : "var(--chain-base)" }} />
            </div>
            <span className="flex items-center justify-end gap-2 whitespace-nowrap" title={fmtMetricFull(metric, b.value)}>
              <span className="tabular text-xs font-semibold text-ink-50">{fmtPct(b.share, b.share < 0.1 ? 1 : 0)}</span>
              <span className="tabular w-14 text-right text-xs text-ink-300">{fmtMetric(metric, b.value)}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
