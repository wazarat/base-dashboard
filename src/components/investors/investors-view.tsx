"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useOneLineAxis } from "@/components/atlas/one-line-axis";
import { ChartCard } from "@/components/atlas/chart-card";
import { FilteredNote } from "@/components/atlas/filtered-note";
import { TooltipFrame, TooltipRow, type TipProps } from "@/components/atlas/chart-tooltip";
import { DataTable, makeColumnHelper } from "@/components/explorer/data-table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { investors, rounds } from "@/lib/data";
import { useFilters } from "@/lib/filters";
import { fmtInt, fmtUsd } from "@/lib/format";
import type { Investor } from "@/lib/types";
import { points } from "@/lib/takeaways";

const h = makeColumnHelper<Investor>();

export function InvestorsView() {
  const { openInvestor } = useFilters();
  const columns = useMemo(
    () => [
      h.accessor("name", {
        header: "Investor",
        cell: ({ row }) => (
          <button type="button" onClick={(e) => { e.stopPropagation(); openInvestor(row.original.id); }} className="text-left font-medium text-ink-50 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-500/60">
            {row.original.name}
          </button>
        ),
        sortFn: "alphanumeric",
      }),
      h.accessor("deals", { header: "Deals", cell: ({ getValue }) => fmtInt(getValue()), meta: { align: "right" } }),
      h.accessor("led", { header: "Led", cell: ({ getValue }) => fmtInt(getValue()), meta: { align: "right", hideBelow: "md" } }),
      h.accessor("totalDisclosed", { header: "Total disclosed", cell: ({ getValue }) => (getValue() > 0 ? fmtUsd(getValue()) : <span className="text-ink-300">none</span>), meta: { align: "right", hideBelow: "sm" } }),
      h.accessor("relatedDeals", { header: "RH Chain deals", cell: ({ getValue }) => (getValue() ? <span>{getValue()}</span> : <span className="text-ink-300">0</span>), meta: { align: "right" } }),
      h.accessor((i) => i.projects.map((p) => p.name).join(", "), {
        id: "portfolio",
        header: "Portfolio",
        cell: ({ row }) => (
          <span className="block max-w-sm truncate" title={row.original.projects.map((p) => p.name).join(", ")}>
            {row.original.projects.slice(0, 3).map((p) => p.name).join(", ")}
            {row.original.projects.length > 3 && <span className="text-ink-300"> +{row.original.projects.length - 3}</span>}
          </span>
        ),
        meta: { hideBelow: "md" },
      }),
    ],
    [openInvestor],
  );
  const top = investors.slice(0, 15).map((i) => ({ name: i.name, deals: i.deals, disclosed: i.totalDisclosed, id: i.id }));
  const { attach: axisAttach, width: axisWidth, tick: axisTick } = useOneLineAxis(top.map((i) => i.name));
  const related = rounds.filter((r) => r.related).length;

  return (
    <div className="space-y-4">
      <ChartCard
        id="top-investors"
        scope="chain"
        title="Most active investors"
        takeaway={investors[0] ? points(`${investors[0].name} appears in ${investors[0].deals} of ${rounds.length} recorded rounds.`, `${related} rounds are Base related.`) : points("No rounds recorded yet.")}
        info="Deal count per investor across data/base-funding-rounds-*.csv, counting lead and other investors once per round. Disclosed totals sum the round amounts an investor took part in, not their cheque size. Click a bar to open the investor."
        table={{
          columns: [
            { key: "name", label: "Investor" },
            { key: "deals", label: "Deals", align: "right" },
            { key: "disclosed", label: "Rounds total disclosed", align: "right", format: (v) => fmtUsd(v as number) },
          ],
          rows: top,
          filename: "investors-top.csv",
        }}
      >
        <div ref={axisAttach} style={{ height: Math.max(200, top.length * 24 + 30) }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 0 }} barCategoryGap={4} onClick={(s) => { const i = s?.activeIndex; if (i !== null && i !== undefined && top[Number(i)]) openInvestor(top[Number(i)].id); }}>
              <CartesianGrid stroke="var(--grid)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={10} />
              <YAxis type="category" dataKey="name" width={axisWidth} tickLine={false} axisLine={false} interval={0} tick={axisTick} />
              <Tooltip content={<InvestorTip />} cursor={{ fill: "var(--grid)", fillOpacity: 0.4 }} />
              <Bar dataKey="deals" fill="var(--chain-base)" radius={[0, 3, 3, 0]} isAnimationActive={false} style={{ cursor: "pointer" }}>
                <LabelList dataKey="deals" position="right" fontSize={10} fill="var(--foreground)" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <Card className="gap-4">
        <CardHeader>
          <h3 className="type-card-title text-ink-50">Investors ({investors.length})</h3>
          <FilteredNote scope="chain" className="block" />
          <p className="text-sm text-ink-300">
            Everyone named as a lead or participating investor in the rounds file, with how many of their deals touch Base. Click an investor for their portfolio and the sources behind each round.
          </p>
        </CardHeader>
        <CardContent className="px-0">
          <DataTable data={investors} columns={columns} initialSorting={[{ id: "deals", desc: true }]} pageSize={25} getRowId={(i) => i.id} onRowClick={(i) => openInvestor(i.id)} />
        </CardContent>
      </Card>
    </div>
  );
}

function InvestorTip({ active, payload }: TipProps<{ name: string; deals: number; disclosed: number }>) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <TooltipFrame title={r.name}>
      <TooltipRow label="Deals" value={String(r.deals)} />
      <TooltipRow label="Rounds total disclosed" value={fmtUsd(r.disclosed)} />
      <div className="pt-1 text-ink-300">Click to open</div>
    </TooltipFrame>
  );
}
