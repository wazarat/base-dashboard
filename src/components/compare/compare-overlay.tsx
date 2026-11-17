"use client";

import { useMemo } from "react";
import { Brush, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard, EmptyState, Legend } from "@/components/atlas/chart-card";
import { TooltipFrame, TooltipRow, type TipProps } from "@/components/atlas/chart-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Segmented } from "@/components/atlas/segmented";
import { CAT5 } from "@/lib/colors";
import { alignByFirstData, indexTo100, seriesFor } from "@/lib/compare";
import { useChartRange } from "@/lib/chart-range";
import type { Align } from "@/lib/filters";
import { fmtDateShort, METRIC_LABEL, lowerLabel } from "@/lib/format";
import { fitDomain } from "@/lib/level-axis";
import { rangeDays, sliceTail } from "@/lib/ranges";
import type { MetricKey, NumericMetricKey, Project } from "@/lib/types";
import { useSeries } from "@/lib/use-series";
import { points } from "@/lib/takeaways";

interface Props {
  projects: Project[];
  metric: MetricKey;
  align: Align;
  onAlignChange: (a: Align) => void;
}

export function CompareOverlay({ projects, metric, align, onAlignChange }: Props) {
  const [range, setRange, rangeOptions] = useChartRange("xr");
  const file = useSeries();
  const m: NumericMetricKey = metric === "count" ? "tvl" : metric;
  const ids = projects.map((p) => p.id);
  const { rows, start, noData, skipped } = useMemo(() => {
    if (!file) return { rows: [], start: -1, noData: false, skipped: [] as number[] };
    const n = rangeDays(range, file.dates.length);
    const dates = sliceTail(file.dates, n);
    const raw = seriesFor(file, ids, m).map((s) => sliceTail(s, n));
    if (align === "days") {
      const aligned = alignByFirstData(raw);
      const len = Math.max(0, ...aligned.map((s) => s.length));
      const rows = Array.from({ length: len }, (_, i) => {
        const r: Record<string, number | string | null> = { x: i };
        ids.forEach((id, k) => (r[id] = aligned[k][i] ?? null));
        return r;
      });
      return { rows, start: len ? 0 : -1, noData: len === 0, skipped: aligned.map((s, k) => (s.length ? -1 : k)).filter((k) => k >= 0) };
    }
    const { start, indexed, skipped } = indexTo100(raw);
    const rows = dates.map((d, i) => {
      const r: Record<string, number | string | null> = { x: d };
      ids.forEach((id, k) => (r[id] = indexed[k][i]));
      return r;
    });
    return { rows: start === -1 ? [] : rows.slice(start), start, noData: start === -1, skipped };
  }, [file, ids, m, range, align]);


  const label = `${METRIC_LABEL[m]} indexed to 100`;
  const domain = useMemo(() => fitDomain([100, ...rows.flatMap((r) => ids.map((id) => (typeof r[id] === "number" ? (r[id] as number) : null)))]), [rows, ids]);
  return (
    <ChartCard
      id="trend-indexed"
      scope="none"
      title="Trend, indexed"
      takeaway={points(noData ? `No overlapping daily history for ${lowerLabel(METRIC_LABEL[m])} across these projects in this range.` : align === "days" ? `Each line starts at 100 on its own first day with data, so launches of different ages line up.` : `Each line is ${lowerLabel(METRIC_LABEL[m])} relative to the first day all ${projects.length} projects have data (= 100).`)}
      info="Daily DefiLlama history (TVL as a level; volume, fees and revenue as daily flows). Indexing to 100 removes size so growth rates can be compared. The days-since-first-data view re-bases every project on its own first observed day."
      range={range}
      onRangeChange={setRange}
      rangeOptions={rangeOptions}
      actions={
        <Segmented
          size="sm"
          ariaLabel="Align"
          value={align}
          onChange={onAlignChange}
          options={[
            { value: "date", label: "By date" },
            { value: "days", label: "Days since first data" },
          ]}
        />
      }
      table={{
        columns: [{ key: "x", label: align === "days" ? "Day" : "Date" }, ...projects.map((p) => ({ key: p.id, label: p.name, align: "right" as const, format: (v: unknown) => (v === null || v === undefined ? "no reading" : (v as number).toFixed(1)) }))],
        rows: rows as Record<string, unknown>[],
        filename: `compare-${m}-indexed.csv`,
        maxRows: 200,
      }}
    >
      {({ expanded, height }) =>
        !file ? (
          <Skeleton className="h-[240px] w-full" />
        ) : noData || start === -1 ? (
          <EmptyState message="Pick projects with daily history on DefiLlama, or widen the range." />
        ) : (
          <div>
            <Legend className="mb-2" items={projects.map((p, i) => ({ label: p.name, color: CAT5[i] }))} />
            <div style={{ height: expanded ? height : 240 }} className="w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="x" tickFormatter={(v) => (align === "days" ? `d${v}` : fmtDateShort(String(v)))} tickLine={false} axisLine={false} minTickGap={32} fontSize={10} />
                  <YAxis domain={domain} tickFormatter={(v) => String(Math.round(v))} width={40} tickLine={false} axisLine={false} fontSize={10} />
                  <ReferenceLine y={100} stroke="var(--axis)" />
                  <Tooltip content={<OverlayTip projects={projects} align={align} />} cursor={{ stroke: "var(--axis)" }} />
                  {projects.map((p, i) => (
                    <Line key={p.id} type="monotone" dataKey={p.id} name={p.name} stroke={CAT5[i]} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                  ))}
                  {expanded && <Brush dataKey="x" height={24} travellerWidth={8} stroke="var(--axis)" fill="var(--surface-chart)" tickFormatter={(v) => (align === "days" ? `d${v}` : fmtDateShort(String(v)))} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-xs text-ink-300">
              {label}; colours follow the order in the tray. The axis is fitted around the 100 line.{skipped.length > 0 && ` No daily ${lowerLabel(METRIC_LABEL[m])} history for ${skipped.map((k) => projects[k].name).join(", ")}.`}
            </p>
          </div>
        )
      }
    </ChartCard>
  );
}

function OverlayTip({ active, payload, projects, align }: TipProps<Record<string, number | string | null>> & { projects: Project[]; align: Align }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <TooltipFrame title={align === "days" ? `Day ${r.x}` : fmtDateShort(String(r.x))}>
      {projects.map((p, i) => (
        <TooltipRow key={p.id} label={p.name} color={CAT5[i]} value={r[p.id] === null || r[p.id] === undefined ? "no reading" : (r[p.id] as number).toFixed(1)} />
      ))}
    </TooltipFrame>
  );
}
