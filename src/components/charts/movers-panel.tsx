"use client";

import { useMemo } from "react";
import { ChangeCell } from "@/components/atlas/change-cell";
import { ChartCard, EmptyState, type Takeaway } from "@/components/atlas/chart-card";
import { SparkLine } from "@/components/atlas/spark-line";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useChartRange } from "@/lib/chart-range";
import { MIN_SIZES, type MinSize } from "@/lib/filters";
import { fmtMetric, fmtPctSigned, METRIC_LABEL, lowerLabel } from "@/lib/format";
import { MIN_SIZE_LABEL, movers, type Mover } from "@/lib/movers";
import { changeLabel, rangeDays, sliceTail } from "@/lib/ranges";
import type { MetricKey, Project } from "@/lib/types";
import type { ReactNode } from "react";
import { useSeries } from "@/lib/use-series";
import { SUMMARY_LABELS } from "@/lib/takeaways";

interface Props {
  projects: Project[];
  metric: MetricKey;
  minSize: MinSize;
  onMinSizeChange: (s: MinSize) => void;
  onOpen: (id: string) => void;
  limit?: number;
  /** The per-chart metric picker, rendered beside the size filter. */
  metricControl?: ReactNode;
}

export function MoversPanel({ projects, metric, minSize, onMinSizeChange, onOpen, limit = 5, metricControl }: Props) {
  const [range, setRange, rangeOptions] = useChartRange("mr");
  const m = useMemo(() => movers(projects, metric, range, minSize, limit), [projects, metric, range, minSize, limit]);
  const series = useSeries();
  const sparkN = rangeDays(range, 90);
  const label = METRIC_LABEL[m.metric];
  const win = changeLabel(range);
  // The expanded summary covers 7, 30 and 90 days whatever window the card shows; TVL compares end values, flows window sums (see info).
  const takeaway = useMemo<Takeaway>(() => {
    const by = (["7d", "30d", "90d"] as const).map((r) => movers(projects, metric, r, minSize, 1));
    const who = (x: Mover | undefined) => (x ? `${x.project.name} ${fmtPctSigned(x.change)}` : "none");
    return {
      points: [],
      table: {
        columns: SUMMARY_LABELS,
        rows: [
          { label: `Top riser in ${lowerLabel(label)}`, values: by.map((x) => who(x.risers[0])) },
          { label: `Top faller in ${lowerLabel(label)}`, values: by.map((x) => who(x.fallers[0])) },
          { label: "Projects passing the size filter", values: by.map((x) => String(x.eligible)) },
        ],
      },
    };
  }, [projects, metric, minSize, label]);

  const signed = (v: number) => `${v > 0 ? "+" : ""}${fmtMetric(m.metric, v)}`;
  const rowsFor = (list: Mover[]) => list.map((r) => ({ project: r.project.name, sector: r.project.sector, value: r.value, delta: r.delta, change: r.change }));

  const table = {
    columns: [
      { key: "side", label: "Side" },
      { key: "project", label: "Project" },
      { key: "sector", label: "Sector" },
      { key: "value", label: label, align: "right" as const, format: (v: unknown) => fmtMetric(m.metric, v as number) },
      { key: "delta", label: `Dollar change ${win}`, align: "right" as const, format: (v: unknown) => signed(v as number) },
      { key: "change", label: `Change ${win}`, align: "right" as const, format: (v: unknown) => fmtPctSigned(v as number) },
    ],
    rows: [...rowsFor(m.risers).map((r) => ({ side: "Riser", ...r })), ...rowsFor(m.fallers).map((r) => ({ side: "Faller", ...r }))],
    filename: `movers-${m.metric}-${win}.csv`,
  };

  const maxAbs = Math.max(0.01, ...[...m.risers, ...m.fallers].map((r) => Math.abs(r.change)));
  const renderList = (list: Mover[], side: "up" | "down") => (
    <ol className="space-y-1.5">
      {list.length === 0 && <li className="text-xs text-ink-300">None over {win}.</li>}
      {list.map((r) => {
        const pts = series?.projects[r.project.id]?.[m.metric];
        return (
          <li key={r.project.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,1fr)_80px_minmax(60px,1fr)_auto]">
            <button type="button" onClick={() => onOpen(r.project.id)} className="truncate text-left font-medium text-ink-50 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-500/60">
              {r.project.name}
            </button>
            <SparkLine points={series ? (pts ? sliceTail(pts, sparkN) : []) : null} label={`${r.project.name} ${label} trend`} className="hidden sm:block" />
            <div className="hidden h-2 w-full overflow-hidden rounded-sm bg-ink-800 sm:block" aria-hidden="true">
              <div className="h-full rounded-sm" style={{ width: `${Math.min(100, (Math.abs(r.change) / maxAbs) * 100)}%`, backgroundColor: side === "up" ? "var(--status-good)" : "var(--status-critical)" }} />
            </div>
            <span className="flex items-center justify-end gap-2 whitespace-nowrap">
              <ChangeCell value={r.change} />
              <span className="tabular text-xs text-ink-300" title={`${label} now ${fmtMetric(m.metric, r.value)}`}>
                {signed(r.delta)}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );

  return (
    <ChartCard
      id="movers"
      scope="filtered"
      title="Biggest risers and fallers"
      takeaway={takeaway}
      info={`Change in ${lowerLabel(label)} over the last ${win} versus the ${win} before, from DefiLlama daily history (TVL compares end values; volume, fees and revenue compare window sums), with the dollar change beside the percent. Only what DefiLlama counts in its chain total is ranked, so exchange deposits, token lockers and double-counted apps are left out. A project must start the window with at least $250K of TVL or volume, or $10K of fees or revenue, or the size picked here if higher, so a tiny base cannot read as a four-digit rise.${m.metric === "tvl" ? " TVL changes include token price moves, not only deposits and withdrawals." : ""}`}
      range={range}
      onRangeChange={setRange}
      rangeOptions={rangeOptions}
      actions={
        <>
          {metricControl}
          <Select value={minSize} onValueChange={(v) => onMinSizeChange(v as MinSize)}>
          <SelectTrigger size="sm" className="h-7 w-auto gap-1 text-xs" aria-label="Minimum size">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MIN_SIZES.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {MIN_SIZE_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
          </Select>
        </>
      }
      table={table}
    >
      {m.eligible === 0 ? (
        <EmptyState message={`No projects with daily history pass the size filter for ${lowerLabel(label)}.`} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="type-kicker mb-2 text-ink-300">Risers</h4>
            {renderList(m.risers, "up")}
          </div>
          <div>
            <h4 className="type-kicker mb-2 text-ink-300">Fallers</h4>
            {renderList(m.fallers, "down")}
          </div>
        </div>
      )}
    </ChartCard>
  );
}
