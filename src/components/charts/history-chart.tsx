"use client";

import { useMemo, useState } from "react";
import { ChartTable, ChartTableToggle, type ChartView } from "@/components/atlas/chart-table";
import { RangeControl } from "@/components/atlas/range-control";
import { Segmented } from "@/components/atlas/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useChartRange } from "@/lib/chart-range";
import { fmtCompact, fmtUsd, METRIC_LABEL } from "@/lib/format";
import { levelLabel } from "@/lib/level-axis";
import { rangeDays, sliceTail } from "@/lib/ranges";
import type { SeriesKey } from "@/lib/types";
import { useSeries } from "@/lib/use-series";
import { MiniSeries } from "./mini-series";

const ORDER: SeriesKey[] = ["tvl", "volume", "fees", "revenue", "txns"];
const LABEL: Record<SeriesKey, string> = { tvl: "TVL", volume: "Volume", fees: "Fees", revenue: "Revenue", txns: "Transactions" };

/** Per-project daily history for every metric the project has, over its own range (URL key hr). TVL opens first. */
export function HistoryChart({ projectId, height = 180 }: { projectId: string; height?: number }) {
  const series = useSeries();
  const [range, setRange, rangeOptions] = useChartRange("hr");
  const [view, setView] = useState<ChartView>("chart");
  const available = useMemo(() => {
    const s = series?.projects[projectId];
    if (!s) return [];
    return ORDER.filter((k) => s[k].some((v) => v !== null));
  }, [series, projectId]);
  const [picked, setPicked] = useState<SeriesKey | null>(null);
  const active = picked && available.includes(picked) ? picked : available.includes("tvl") ? "tvl" : available[0];

  if (!series) return <Skeleton className="w-full" style={{ height: height + 20 }} />;
  if (!available.length || !active) {
    return <p className="text-xs text-ink-300">No daily history on DefiLlama for this project. The figures above are from the research snapshot.</p>;
  }
  const level = active === "tvl";
  const n = rangeDays(range, series.dates.length);
  const dates = sliceTail(series.dates, n);
  const values = sliceTail(series.projects[projectId][active], n);
  const kind = active === "tvl" ? "line" : "bar";
  const label = active === "tvl" ? "TVL" : active === "txns" ? "Daily transactions" : `Daily ${METRIC_LABEL[active].replace("30d ", "")}`;
  const money = active !== "txns";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented size="sm" role="tablist" ariaLabel="History metric" value={active} onChange={setPicked} options={available.map((k) => ({ value: k, label: LABEL[k] }))} />
        <div className="flex flex-wrap items-center gap-2">
          <RangeControl label="History date range" value={range} onChange={setRange} options={rangeOptions} />
          <ChartTableToggle view={view} onChange={setView} />
        </div>
      </div>
      {view === "table" ? (
        <ChartTable
          spec={{
            columns: [
              { key: "date", label: "Date" },
              { key: "v", label: label, align: "right", format: (v) => (v === null ? "no reading" : money ? fmtUsd(v as number) : fmtCompact(v as number)) },
            ],
            rows: dates.map((d, i) => ({ date: d, v: values[i] })).reverse(),
            filename: `${projectId}-${active}.csv`,
            maxRows: 100,
          }}
        />
      ) : (
        <MiniSeries dates={dates} values={values} kind={kind} primaryLabel={label} height={height} format={money ? fmtUsd : fmtCompact} level={level} rangeLabel={levelLabel(n, series.dates.length)} />
      )}
      <p className="text-xs text-ink-300">
        {dates.length} days shown · {active === "txns" ? "Blockscout transactions to tracked contracts" : `DefiLlama daily history${active === "tvl" ? "" : ", current partial day excluded"}`}.
      </p>
    </div>
  );
}
