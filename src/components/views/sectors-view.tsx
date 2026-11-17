"use client";

import { useState } from "react";
import { ChartCard, TvlNote } from "@/components/atlas/chart-card";
import { MetricSegmented } from "@/components/atlas/metric-segmented";
import { FilteredNote } from "@/components/atlas/filtered-note";
import { SectorBars } from "@/components/charts/sector-bars";
import { SectorGrid } from "@/components/charts/sector-grid";
import { Switch } from "@/components/ui/switch";
import { useChartMetric } from "@/lib/chart-metric";
import { useFilters } from "@/lib/filters";
import { METRIC_LABEL, lowerLabel } from "@/lib/format";
import { METRICS } from "@/lib/types";

export function SectorsView() {
  const { filtered, scale, setState, openSector, openProject } = useFilters();
  const [tm, setTm] = useChartMetric("tm");
  const [stacked, setStacked] = useState(false);

  return (
    <div className="space-y-4">
      <ChartCard
        id="sectors-bars"
        scope="filtered"
        title={`Sectors by ${lowerLabel(METRIC_LABEL[tm])}`}
        info={`All sectors ranked by ${lowerLabel(METRIC_LABEL[tm])} within the current selection. Toggle the stack to split each bar by Native Chain. The log scale is available for the unstacked view; stacked bars are always linear so segment lengths stay comparable.`}
        scale={stacked || tm === "count" ? undefined : scale}
        onScaleChange={(s) => void setState({ scale: s })}
        actions={
          <>
            <MetricSegmented label="Sector bars metric" value={tm} onChange={setTm} options={METRICS} />
            <label className="flex items-center gap-2 text-xs text-ink-300">
              <Switch checked={stacked} onCheckedChange={setStacked} aria-label="Stack by native chain" />
              Stack by chain
            </label>
          </>
        }
        adminNote={
          <>
            <p>DEXs and lending dominate value; launchpads and AI agents dominate the project count.</p>
            {tm === "tvl" && <TvlNote />}
          </>
        }
      >
        <SectorBars projects={filtered} metric={tm} stacked={stacked} scale={scale} onSelect={openSector} />
      </ChartCard>

      <section className="space-y-3">
        <div>
          <h3 className="type-card-title text-ink-50">Sector cards</h3>
          <FilteredNote scope="filtered" className="block" />
          <p className="text-sm text-ink-300">Projects, how many are Base native and the sector leaders. Click a sector name for the full ranking, or a leader for its record.</p>
        </div>
        <SectorGrid projects={filtered} onSelect={openSector} onOpenProject={openProject} />
      </section>
    </div>
  );
}
