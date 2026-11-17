"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TipProps, TooltipFrame, TooltipRow } from "@/components/atlas/chart-tooltip";
import { useOneLineAxis } from "@/components/atlas/one-line-axis";
import { EmptyState, Legend } from "@/components/atlas/chart-card";
import { CHAIN_COLOR } from "@/lib/colors";
import { fmtMetric, fmtMetricFull, METRIC_SHORT, lowerLabel } from "@/lib/format";
import type { Scale } from "@/lib/filters";
import { bySector, metricValue } from "@/lib/metrics";
import { NATIVE_CHAINS, type MetricKey, type NativeChain, type Project } from "@/lib/types";

type Row = { sector: string; total: number; count: number; withData: number } & Record<NativeChain, number>;

interface Props {
  projects: Project[];
  metric: MetricKey;
  stacked: boolean;
  scale: Scale;
  onSelect: (sector: string) => void;
}

export function SectorBars({ projects, metric, stacked, scale, onSelect }: Props) {
  const rows = useMemo<Row[]>(() => {
    const groups = bySector(projects, metric);
    return groups.map((g) => {
      const row = { sector: g.key, total: g.value, count: g.count, withData: g.withData } as Row;
      for (const c of NATIVE_CHAINS) row[c] = 0;
      for (const p of projects) {
        if (p.sector !== g.key) continue;
        const v = metricValue(p, metric);
        if (v !== null) row[p.chain] += v;
      }
      return row;
    });
  }, [projects, metric]);

  const useLog = scale === "log" && !stacked && metric !== "count";
  const data = useLog ? rows.filter((r) => r.total > 0) : rows;
  const hidden = rows.length - data.length;
  const { attach: axisAttach, width: axisWidth, tick: axisTick } = useOneLineAxis(data.map((r) => r.sector));

  if (rows.length === 0) return <EmptyState />;

  const height = Math.max(220, data.length * 26 + 30);
  return (
    <div>
      {stacked && <Legend items={NATIVE_CHAINS.map((c) => ({ label: c, color: CHAIN_COLOR[c], shape: "square" as const }))} className="mb-2" />}
      <div ref={axisAttach} style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 56, bottom: 4, left: 4 }}
            barCategoryGap={4}
            onClick={(s) => {
              const i = s?.activeIndex;
              const r = i === null || i === undefined ? undefined : data[Number(i)];
              if (r) onSelect(r.sector);
            }}
            style={{ cursor: "pointer" }}
          >
            <CartesianGrid horizontal={false} stroke="var(--grid)" />
            <XAxis
              type="number"
              scale={useLog ? "log" : "linear"}
              domain={useLog ? [1, "auto"] : [0, "auto"]}
              allowDataOverflow={useLog}
              tickFormatter={(v) => fmtMetric(metric, v)}
              tickLine={false}
              axisLine={false}
            />
            <YAxis type="category" dataKey="sector" width={axisWidth} tickLine={false} axisLine={false} interval={0} tick={axisTick} />
            <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.4 }} content={<SectorTip metric={metric} stacked={stacked} />} />
            {stacked ? (
              NATIVE_CHAINS.map((c) => (
                <Bar key={c} dataKey={c} stackId="s" fill={CHAIN_COLOR[c]} stroke="var(--background)" strokeWidth={2} isAnimationActive={false} maxBarSize={20} />
              ))
            ) : (
              <Bar dataKey="total" fill="var(--chain-base)" radius={[0, 4, 4, 0]} isAnimationActive={false} maxBarSize={20}>
                <LabelList dataKey="total" position="right" fontSize={10} fill="var(--ink-secondary)" formatter={(v) => fmtMetric(metric, typeof v === "number" ? v : null)} />
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {hidden > 0 && (
        <p className="mt-1 text-xs text-ink-300">
          {hidden} sector{hidden === 1 ? "" : "s"} with no {lowerLabel(METRIC_SHORT[metric])} data hidden on the log scale.
        </p>
      )}
    </div>
  );
}

function SectorTip({ active, payload, metric, stacked }: TipProps<Row> & { metric: MetricKey; stacked: boolean }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TooltipFrame title={d.sector}>
      {/* On the project count the metric row and the Projects row were the same line twice. */}
      {metric !== "count" && <TooltipRow label={METRIC_SHORT[metric]} value={fmtMetricFull(metric, d.total)} />}
      {stacked && NATIVE_CHAINS.map((c) => <TooltipRow key={c} label={c} color={CHAIN_COLOR[c]} value={fmtMetric(metric, d[c])} />)}
      <TooltipRow label="Projects" value={d.count} />
      {metric !== "count" && <TooltipRow label="With data" value={`${d.withData} of ${d.count}`} />}
      <div className="pt-1 text-ink-300">Click to open sector</div>
    </TooltipFrame>
  );
}
