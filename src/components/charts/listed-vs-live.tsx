"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useOneLineAxis } from "@/components/atlas/one-line-axis";
import { TipProps, TooltipFrame, TooltipRow } from "@/components/atlas/chart-tooltip";
import { EmptyState, Legend } from "@/components/atlas/chart-card";
import { isLive } from "@/lib/coverage";
import { fmtPct } from "@/lib/format";
import type { Project } from "@/lib/types";

interface Row {
  via: string;
  listed: number;
  live: number;
}

/** Listed and live per discovery source, using the one live definition (src/lib/coverage.ts isLive). */
export function listedVsLiveRows(projects: Project[]): Row[] {
  const m = new Map<string, Row>();
  for (const p of projects) {
    const r = m.get(p.discoveredVia) ?? { via: p.discoveredVia, listed: 0, live: 0 };
    r.listed += 1;
    if (isLive(p)) r.live += 1;
    m.set(p.discoveredVia, r);
  }
  return Array.from(m.values()).sort((a, b) => b.listed - a.listed);
}

export function ListedVsLive({ projects, onSelect }: { projects: Project[]; onSelect: (via: string) => void }) {
  const rows = useMemo(() => listedVsLiveRows(projects), [projects]);
  const { attach: axisAttach, width: axisWidth, tick: axisTick } = useOneLineAxis(rows.map((r) => r.via));

  if (rows.length === 0) return <EmptyState />;

  return (
    <div>
      <Legend
        items={[
          { label: "Listed", color: "var(--neon-500)", shape: "square" },
          { label: "Live", color: "var(--chain-base)", shape: "square" },
        ]}
        className="mb-2"
      />
      <div ref={axisAttach} className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 48, bottom: 4, left: 4 }}
            barCategoryGap={8}
            barGap={2}
            onClick={(s) => {
              const i = s?.activeIndex;
              const r = i === null || i === undefined ? undefined : rows[Number(i)];
              if (r) onSelect(r.via);
            }}
            style={{ cursor: "pointer" }}
          >
            <CartesianGrid horizontal={false} stroke="var(--grid)" />
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="via" width={axisWidth} tickLine={false} axisLine={false} interval={0} tick={axisTick} />
            <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.4 }} content={<LiveTip />} />
            <Bar dataKey="listed" fill="var(--neon-500)" radius={[0, 4, 4, 0]} isAnimationActive={false} maxBarSize={12}>
              <LabelList dataKey="listed" position="right" fontSize={10} fill="var(--ink-secondary)" />
            </Bar>
            <Bar dataKey="live" fill="var(--chain-base)" radius={[0, 4, 4, 0]} isAnimationActive={false} maxBarSize={12}>
              <LabelList dataKey="live" position="right" fontSize={10} fill="var(--ink-secondary)" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LiveTip({ active, payload }: TipProps<Row>) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TooltipFrame title={d.via}>
      <TooltipRow label="Listed" value={d.listed} />
      <TooltipRow label="Live" value={`${d.live} (${fmtPct(d.listed ? d.live / d.listed : null)})`} />
      <div className="pt-1 text-ink-300">Click to filter by this source</div>
    </TooltipFrame>
  );
}
