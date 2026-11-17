"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useOneLineAxis } from "@/components/atlas/one-line-axis";
import { ChartCard, EmptyState } from "@/components/atlas/chart-card";
import { TooltipFrame, TooltipRow, type TipProps } from "@/components/atlas/chart-tooltip";
import { fmtPct } from "@/lib/format";
import { RED_FLAG_LABEL, RED_FLAG_RULE, redFlagCounts, redFlagTypes, securityResearched, type RedFlagType } from "@/lib/red-flags";
import type { Project } from "@/lib/types";
import { points } from "@/lib/takeaways";

interface Row {
  type: RedFlagType;
  label: string;
  count: number;
  share: number;
}

export function RedFlagCounts({ projects }: { projects: Project[] }) {
  const researched = useMemo(() => projects.filter(securityResearched), [projects]);
  const flagged = useMemo(() => researched.filter((p) => redFlagTypes(p).length > 0).length, [researched]);
  const rows = useMemo<Row[]>(() => redFlagCounts(researched).map((r) => ({ ...r, label: RED_FLAG_LABEL[r.type], share: researched.length ? r.count / researched.length : 0 })), [researched]);
  const top = rows[0];
  const { attach: axisAttach, width: axisWidth, tick: axisTick } = useOneLineAxis(rows.map((r) => r.label), { fontSize: 10 });
  const notResearched = projects.length - researched.length;

  return (
    <ChartCard
      id="red-flags"
      scope="filtered"
      title="Red flags by type"
      takeaway={
        researched.length && top && top.count > 0
          ? points(`${flagged} of ${researched.length} researched projects in this selection list at least one flag.`, `The most common is ${top.label.toLowerCase()} (${top.count}).`)
          : researched.length
            ? points(`${researched.length} researched projects in this selection, none with a flag.`)
            : points("No researched projects in this selection.")
      }
      info="Counts of researched projects whose free-text security notes match a rule. The rules, in plain words, are in the table view. A flag records what the sources say; it does not rate the project."
      footer={`${notResearched} ${notResearched === 1 ? "project" : "projects"} in this selection ${notResearched === 1 ? "was" : "were"} not researched for security and ${notResearched === 1 ? "is" : "are"} not counted.`}
      table={{
        columns: [
          { key: "label", label: "Flag" },
          { key: "count", label: "Projects", align: "right" },
          { key: "share", label: "Share of researched", align: "right", format: (v) => fmtPct(v as number) },
          { key: "rule", label: "Rule" },
        ],
        rows: rows.map((r) => ({ label: r.label, count: r.count, share: r.share, rule: RED_FLAG_RULE[r.type] })),
        filename: "red-flags-by-type.csv",
      }}
    >
      {({ expanded, height }) =>
        researched.length === 0 ? (
          <EmptyState message="No researched projects in this selection." />
        ) : (
          <div ref={axisAttach} style={{ height: expanded ? height : 220 }} className="w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }} barCategoryGap={6}>
                <CartesianGrid horizontal={false} stroke="var(--grid)" />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={10} />
                <YAxis type="category" dataKey="label" width={axisWidth} tickLine={false} axisLine={false} interval={0} tick={axisTick} />
                <Tooltip cursor={{ fill: "var(--grid)", fillOpacity: 0.4 }} content={<FlagTip researched={researched.length} />} />
                <Bar dataKey="count" fill="var(--cat-1)" radius={[0, 4, 4, 0]} isAnimationActive={false} maxBarSize={18}>
                  <LabelList dataKey="count" position="right" fontSize={10} fill="var(--ink-secondary)" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      }
    </ChartCard>
  );
}

function FlagTip({ active, payload, researched }: TipProps<Row> & { researched: number }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TooltipFrame title={d.label}>
      <TooltipRow label="Researched projects" value={`${d.count} of ${researched}`} />
      <p className="pt-1 text-ink-300">{RED_FLAG_RULE[d.type]}</p>
    </TooltipFrame>
  );
}
