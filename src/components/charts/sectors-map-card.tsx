"use client";

import { useMemo } from "react";
import { ChartCard, TvlNote } from "@/components/atlas/chart-card";
import { MetricSegmented } from "@/components/atlas/metric-segmented";
import { useChartMetric } from "@/lib/chart-metric";
import { useFilters } from "@/lib/filters";
import { METRIC_LABEL, lowerLabel } from "@/lib/format";
import { countedMetricValue } from "@/lib/metrics";
import { treemapTable, treemapTiles } from "@/lib/treemap";
import { METRICS, type Project } from "@/lib/types";
import { SectorTreemap } from "./sector-treemap";

/**
 * The "Sectors by projects" treemap card, shared by Overview and the Explorer map
 * so the two can never disagree. Money metrics use counted values (inChainTotal)
 * and untracked projects fold into one Not tracked tile. Clicking a sector opens
 * the sector pop-up (?sectorDrawer=) with its ranked leaders and every project.
 */
export function SectorsMapCard({ projects, id = "sectors-treemap", className, actions, table = true }: { projects: Project[]; id?: string; className?: string; actions?: React.ReactNode; /** False drops the Chart and Table switch, for a host that has its own table (the Explorer). */ table?: boolean }) {
  const { openProject, openSector } = useFilters();
  const [tm, setTm] = useChartMetric("tm");
  const treemap = useMemo(() => treemapTiles(projects, tm, null, countedMetricValue), [projects, tm]);
  const metricWord = lowerLabel(METRIC_LABEL[tm]);

  return (
    <ChartCard
      id={id}
      scope="filtered"
      className={className}
      title={`Sectors by ${metricWord}`}
      info={`Each box is sized by ${metricWord} for the current selection and coloured by the share of its projects that are Base-native. Money metrics count only what DefiLlama counts in its chain total, so double-counted apps, exchange deposits and token lockers are left out. Clicking a sector opens its ranked leaders and every project in it. Traction data from the DefiLlama API; blanks are Not tracked.`}
      actions={
        <>
          {actions}
          <MetricSegmented label="Treemap metric" value={tm} onChange={setTm} options={METRICS} />
        </>
      }
      adminNote={
        <>
          <p>A handful of sectors hold almost all the activity; most native-heavy sectors are small by value.</p>
          {tm === "tvl" && <TvlNote />}
        </>
      }
      table={table ? treemapTable(treemap, tm) : undefined}
    >
      {({ expanded, height }) => (
        <SectorTreemap
          result={treemap}
          metric={tm}
          onOpenSector={openSector}
          onOpenProject={openProject}
          onOpenSub={openSector}
          height={expanded ? height : 360}
          expanded={expanded}
        />
      )}
    </ChartCard>
  );
}
