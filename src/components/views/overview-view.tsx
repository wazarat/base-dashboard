"use client";

import { useMemo } from "react";
import { ChartCard, TvlNote } from "@/components/atlas/chart-card";
import { MetricSegmented } from "@/components/atlas/metric-segmented";
import { ChainActivity } from "@/components/charts/chain-activity";
import { ChainOverTime } from "@/components/charts/chain-over-time";
import { ConcentrationBars } from "@/components/charts/concentration-bars";
import { InsightsPanel } from "@/components/charts/insights-panel";
import { KpiTiles } from "@/components/charts/kpi-tiles";
import { MoversPanel } from "@/components/charts/movers-panel";
import { NativeStackedBar } from "@/components/charts/native-stacked-bar";
import { SectorsMapCard } from "@/components/charts/sectors-map-card";
import { Timeline } from "@/components/charts/timeline";
import { useChartMetric } from "@/lib/chart-metric";
import { chainData, events } from "@/lib/data";
import { useFilters } from "@/lib/filters";
import { fmtMetricFull, fmtPct, METRIC_LABEL, lowerLabel } from "@/lib/format";
import { chainTotal } from "@/lib/kpi";
import { concentration, concentrationBars, countedMetricValue, NUMERIC_METRICS, nativeShare, topNShare } from "@/lib/metrics";
import { TIMELINE_DEFAULT_START } from "@/lib/site";
import { eventTable, timelineSummary } from "@/lib/timeline";
import { points } from "@/lib/takeaways";
import { useEventDialog } from "@/lib/use-event";
import { useGatedData } from "@/lib/use-gated";
import type { NumericMetricKey } from "@/lib/types";

export function OverviewView() {
  const { filtered, all, state, setState, openProject, activeCount } = useFilters();
  // With filters on, every share compares against the selection, not the whole chain (owner request, 2026-11-10).
  const unfiltered = activeCount === 0;
  const [cm, setCm] = useChartMetric("cm");
  const [mm, setMm] = useChartMetric("mm");
  const [tm] = useChartMetric("tm");
  const natRev = nativeShare(filtered, "revenue", countedMetricValue);
  const natTvl = nativeShare(filtered, "tvl", countedMetricValue);
  const cFocus: NumericMetricKey = cm;
  const conc = useMemo(() => {
    const denom = unfiltered ? chainTotal(chainData.latest, cFocus) : null;
    const ranked = concentration(filtered, cFocus, { value: countedMetricValue, total: denom });
    return { bars: concentrationBars(ranked, denom), top3: topNShare(ranked, 3), top10: ranked.length >= 10 ? topNShare(ranked, 10) : null };
  }, [filtered, cFocus, unfiltered]);
  const shareOf = unfiltered ? "chain" : "selection";
  const natCount = filtered.length ? filtered.filter((p) => p.chain === "Base native").length / filtered.length : null;
  const { openEvent } = useEventDialog();
  // Logged out, a Funding event's detail and source arrive with the gated data; the CSV says so instead of "none".
  const { ready } = useGatedData();
  const timelineTable = useMemo(() => ({ ...eventTable(events, { gatedHidden: !ready }), onRowClick: (row: Record<string, unknown>) => openEvent(String(row.id)) }), [openEvent, ready]);

  return (
    <div className="space-y-4">
      <KpiTiles projects={filtered} total={all.length} />

      <ChainOverTime />

      <ChainActivity />

      <div className="grid gap-4 xl:grid-cols-3">
        <SectorsMapCard projects={filtered} className="xl:col-span-2" />
        <InsightsPanel projects={filtered} metric={tm} total={all.length} />
      </div>

      <MoversPanel
        projects={filtered}
        metric={mm}
        minSize={state.minSize}
        onMinSizeChange={(minSize) => void setState({ minSize })}
        onOpen={openProject}
        metricControl={<MetricSegmented label="Movers metric" value={mm} onChange={setMm} options={NUMERIC_METRICS} />}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          id="native-vs-imported"
          scope="filtered"
          title="Native vs imported"
          takeaway={
            natCount !== null && natRev !== null && natTvl !== null
              ? points(`Base-native projects are ${fmtPct(natCount)} of projects.`, `They earn ${fmtPct(natRev)} of revenue.`, `They hold ${fmtPct(natTvl)} of TVL.`)
              : points("Share of each metric held by projects grouped by the chain they were born on.")
          }
          info="100% stacked bars. Each row splits one metric across Native Chain classifications for the current selection. The Projects row counts every project. The money rows use only what DefiLlama counts in its chain total, so double-counted apps, exchange deposits and token lockers are left out."
          adminNote={<TvlNote />}
        >
          {({ expanded, height }) => <NativeStackedBar projects={filtered} height={expanded ? height : 240} />}
        </ChartCard>
        <ChartCard
          id="concentration"
          scope="filtered"
          title={`Share of ${shareOf} ${lowerLabel(METRIC_LABEL[cFocus])}`}
          takeaway={conc.bars.length ? points(`Top 3 hold ${fmtPct(conc.top3)}.`, conc.top10 !== null && `Top 10 hold ${fmtPct(conc.top10)}.`) : undefined}
          info={`The ten projects with the most ${lowerLabel(METRIC_LABEL[cFocus])}, then everything else in one bar. With no filters each bar is a share of DefiLlama's chain total; with filters on it is a share of the selection's total, and the last bar holds the rest of the selection. Only what DefiLlama counts in its chain total is ranked, so Morpho is one project and Steakhouse, which curates a Morpho vault, is left out.`}
          actions={<MetricSegmented label="Concentration metric" value={cm} onChange={setCm} options={NUMERIC_METRICS} />}
          adminNote={cFocus === "tvl" ? <TvlNote /> : undefined}
          table={{
            columns: [
              { key: "rank", label: "Rank", align: "right" },
              { key: "name", label: "Project" },
              { key: "value", label: METRIC_LABEL[cFocus], align: "right", format: (v: unknown) => fmtMetricFull(cFocus, v as number) },
              { key: "share", label: `Share of ${shareOf}`, align: "right", format: (v: unknown) => fmtPct(v as number, 1) },
            ],
            rows: conc.bars.map((b, i) => ({ rank: b.other ? "" : i + 1, name: b.name, value: b.value, share: b.share })),
            filename: `share-of-${shareOf}-${cFocus}.csv`,
          }}
        >
          <ConcentrationBars bars={conc.bars} metric={cFocus} onOpen={openProject} />
        </ChartCard>
      </div>

      <ChartCard
        id="timeline"
        scope="chain"
        title="Timeline"
        takeaway={timelineSummary(events, TIMELINE_DEFAULT_START)}
        info="All dated events from the events file, milestones, integrations, programs, funding rounds, incentives and incidents. Click a row for the amount, the detail and the source. The chart view sizes each marker by the recorded USD amount on a log scale and keeps events before mainnet behind one marker until you show them."
        table={timelineTable}
        defaultView="table"
      >
        {({ expanded, height }) => <Timeline events={events} defaultStart={TIMELINE_DEFAULT_START} height={expanded ? Math.max(360, height) : 300} onOpen={openEvent} />}
      </ChartCard>
    </div>
  );
}
