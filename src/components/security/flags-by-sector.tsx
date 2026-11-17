"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useOneLineAxis } from "@/components/atlas/one-line-axis";
import { ChartCard, EmptyState, Legend } from "@/components/atlas/chart-card";
import { TooltipFrame, TooltipRow, type TipProps } from "@/components/atlas/chart-tooltip";
import { HatchDefs } from "@/components/atlas/hatch-defs";
import { HATCH_FILL } from "@/lib/colors";
import { flagsBySector, RED_FLAG_LABEL, RED_FLAG_TYPES } from "@/lib/red-flags";
import type { Project } from "@/lib/types";
import { points } from "@/lib/takeaways";

interface Row {
  sector: string;
  researched: number;
  flagged: number;
  clean: number;
  byType: Record<string, number>;
}

export function FlagsBySector({ projects }: { projects: Project[] }) {
  const rows = useMemo<Row[]>(() => flagsBySector(projects).map((r) => ({ sector: r.sector, researched: r.researched, flagged: r.flagged, clean: r.researched - r.flagged, byType: r.byType })), [projects]);
  const top = rows[0];
  const { attach: axisAttach, width: axisWidth, tick: axisTick } = useOneLineAxis(rows.map((r) => r.sector), { fontSize: 10 });
  const clean = rows.reduce((a, r) => a + r.clean, 0);
  return (
    <ChartCard
      id="flags-by-sector"
      scope="filtered"
      title="Flags by sector"
      takeaway={top ? points(`${top.sector} has the most researched projects (${top.researched}).`, `${clean} researched ${clean === 1 ? "project was" : "projects were"} checked with nothing found.`) : points("No researched projects in this selection.")}
      info="Researched projects per sector, split between those whose notes match at least one flag rule and those checked with nothing found. Sectors with no researched project are not shown."
      table={{
        columns: [
          { key: "sector", label: "Sector" },
          { key: "researched", label: "Researched", align: "right" },
          { key: "flagged", label: "Any flag", align: "right" },
          ...RED_FLAG_TYPES.map((t) => ({ key: t, label: RED_FLAG_LABEL[t], align: "right" as const })),
        ],
        rows: rows.map((r) => ({ sector: r.sector, researched: r.researched, flagged: r.flagged, ...r.byType })),
        filename: "flags-by-sector.csv",
      }}
    >
      {({ expanded, height }) =>
        rows.length === 0 ? (
          <EmptyState message="No researched projects in this selection." />
        ) : (
          <div>
            <Legend
              className="mb-2"
              items={[
                { label: "At least one flag", color: "var(--cat-1)", shape: "square" },
                { label: "Checked, nothing found", color: "", shape: "hatch" },
              ]}
            />
            <div ref={axisAttach} style={{ height: expanded ? height : Math.max(220, rows.length * 30 + 30) }} className="w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap={4}>
                  <HatchDefs />
                  <CartesianGrid horizontal={false} stroke="var(--grid)" />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis type="category" dataKey="sector" width={axisWidth} tickLine={false} axisLine={false} interval={0} tick={axisTick} />
                  <Tooltip cursor={{ fill: "var(--grid)", fillOpacity: 0.4 }} content={<SectorTip />} />
                  <Bar dataKey="flagged" stackId="s" fill="var(--cat-1)" stroke="var(--ink-900)" strokeWidth={1} isAnimationActive={false} maxBarSize={18} />
                  <Bar dataKey="clean" stackId="s" fill={HATCH_FILL} stroke="var(--ink-900)" strokeWidth={1} isAnimationActive={false} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      }
    </ChartCard>
  );
}

function SectorTip({ active, payload }: TipProps<Row>) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TooltipFrame title={d.sector}>
      <TooltipRow label="Researched" value={d.researched} />
      <TooltipRow label="At least one flag" color="var(--cat-1)" value={d.flagged} />
      <TooltipRow label="Checked, nothing found" value={d.clean} />
      {RED_FLAG_TYPES.filter((t) => d.byType[t] > 0).map((t) => (
        <TooltipRow key={t} label={RED_FLAG_LABEL[t]} value={d.byType[t]} />
      ))}
    </TooltipFrame>
  );
}
