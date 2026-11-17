"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useOneLineAxis } from "@/components/atlas/one-line-axis";
import { TipProps, TooltipFrame, TooltipRow } from "@/components/atlas/chart-tooltip";
import { EmptyState, Legend } from "@/components/atlas/chart-card";
import { TIER_COLOR, TIER_SHORT } from "@/lib/colors";
import { TIERS, type Project, type Tier } from "@/lib/types";

/** Tracked tiers only; projects DefiLlama does not track, and sectors with no traction metric, are left out of this chart. */
export const TRACKED_TIERS = TIERS.filter((t): t is Exclude<Tier, "Not tracked" | "Not applicable"> => t !== "Not tracked" && t !== "Not applicable");
type TrackedTier = (typeof TRACKED_TIERS)[number];
type Row = { sector: string; total: number } & Record<TrackedTier, number>;

/** One row per sector with at least one tracked project, most tracked first. Pure, so the segments are tested. */
export function tierRows(projects: Project[]): Row[] {
  const m = new Map<string, Row>();
  for (const p of projects) {
    if (p.tier === "Not tracked" || p.tier === "Not applicable") continue;
    const r = m.get(p.sector) ?? ({ sector: p.sector, total: 0, ...Object.fromEntries(TRACKED_TIERS.map((t) => [t, 0])) } as Row);
    r[p.tier] += 1;
    r.total += 1;
    m.set(p.sector, r);
  }
  return Array.from(m.values()).sort((a, b) => b.total - a.total || a.sector.localeCompare(b.sector));
}

export function TierBySector({ projects, onSelect }: { projects: Project[]; onSelect: (sector: string) => void }) {
  const rows = useMemo(() => tierRows(projects), [projects]);
  const { attach: axisAttach, width: axisWidth, tick: axisTick } = useOneLineAxis(rows.map((r) => r.sector));

  if (rows.length === 0) return <EmptyState />;
  const height = Math.max(220, rows.length * 24 + 30);

  return (
    <div>
      <Legend items={TRACKED_TIERS.map((t) => ({ label: TIER_SHORT[t], color: TIER_COLOR[t], shape: "square" as const }))} className="mb-2" />
      <div ref={axisAttach} style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
            barCategoryGap={4}
            onClick={(s) => {
              const i = s?.activeIndex;
              const r = i === null || i === undefined ? undefined : rows[Number(i)];
              if (r) onSelect(r.sector);
            }}
            style={{ cursor: "pointer" }}
          >
            <CartesianGrid horizontal={false} stroke="var(--grid)" />
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="sector" width={axisWidth} tickLine={false} axisLine={false} interval={0} tick={axisTick} />
            <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.4 }} content={<TierTip />} />
            {TRACKED_TIERS.map((t) => (
              <Bar key={t} dataKey={t} stackId="t" fill={TIER_COLOR[t]} stroke="var(--background)" strokeWidth={2} isAnimationActive={false} maxBarSize={18} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TierTip({ active, payload }: TipProps<Row>) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TooltipFrame title={d.sector}>
      {TRACKED_TIERS.map((t) => (
        <TooltipRow key={t} label={TIER_SHORT[t]} color={TIER_COLOR[t]} value={d[t]} />
      ))}
      <TooltipRow label="Tracked" value={d.total} />
    </TooltipFrame>
  );
}
