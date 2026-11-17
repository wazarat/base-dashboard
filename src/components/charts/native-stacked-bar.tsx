"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TipProps, TooltipFrame, TooltipRow } from "@/components/atlas/chart-tooltip";
import { EmptyState, Legend } from "@/components/atlas/chart-card";
import { CHAIN_COLOR } from "@/lib/colors";
import { fmtMetric, fmtPct, METRIC_SHORT } from "@/lib/format";
import { byChain, countedMetricValue } from "@/lib/metrics";
import { METRICS, NATIVE_CHAINS, type MetricKey, type NativeChain, type Project } from "@/lib/types";

type Row = { metric: MetricKey; label: string; total: number | null } & Record<NativeChain, number>;

export function NativeStackedBar({ projects, height = 240 }: { projects: Project[]; height?: number }) {
  const rows = useMemo<Row[]>(() => {
    return METRICS.map((m) => {
      // Money rows sum only what DefiLlama counts in its chain total; the Projects row counts every project.
      const groups = byChain(projects, m, countedMetricValue);
      const total = groups.reduce((a, g) => a + g.value, 0);
      const row = { metric: m, label: METRIC_SHORT[m], total: total > 0 ? total : null } as Row;
      for (const c of NATIVE_CHAINS) {
        const g = groups.find((x) => x.key === c);
        row[c] = total > 0 && g ? g.value / total : 0;
      }
      return row;
    });
  }, [projects]);

  if (projects.length === 0) return <EmptyState />;

  return (
    <div>
      <Legend items={NATIVE_CHAINS.map((c) => ({ label: c, color: CHAIN_COLOR[c], shape: "square" as const }))} className="mb-2" />
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke="var(--grid)" />
            <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="label" width={92} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.4 }} content={<StackTip />} />
            {NATIVE_CHAINS.map((c) => (
              <Bar key={c} dataKey={c} stackId="share" fill={CHAIN_COLOR[c]} stroke="var(--background)" strokeWidth={2} isAnimationActive={false} maxBarSize={28}>
                <LabelList
                  dataKey={c}
                  position="center"
                  fill="#fff"
                  fontSize={10}
                  fontWeight={600}
                  formatter={(v) => (typeof v === "number" && v >= 0.09 ? `${Math.round(v * 100)}%` : "")}
                />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function StackTip({ active, payload }: TipProps<Row>) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TooltipFrame title={d.label}>
      {NATIVE_CHAINS.map((c) => (
        <TooltipRow key={c} label={c} color={CHAIN_COLOR[c]} value={fmtPct(d[c])} />
      ))}
      <div className="pt-1 text-ink-300">Total {d.total === null ? "Not tracked" : fmtMetric(d.metric, d.total)}</div>
    </TooltipFrame>
  );
}
