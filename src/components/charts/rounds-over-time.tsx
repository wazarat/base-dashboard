"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState, Legend } from "@/components/atlas/chart-card";
import type { ChartTableSpec } from "@/components/atlas/chart-table";
import { TooltipFrame, TooltipRow, type TipProps } from "@/components/atlas/chart-tooltip";
import { CAT5 } from "@/lib/colors";
import { fmtUsd } from "@/lib/format";
import { quarterOf, ROUND_BUCKETS } from "@/lib/rounds";
import type { Round } from "@/lib/types";

export interface QuarterRow {
  quarter: string;
  count: number;
  [bucket: string]: number | string;
}

export function roundsByQuarter(rounds: Round[]): QuarterRow[] {
  const m = new Map<string, QuarterRow>();
  for (const r of rounds) {
    if (!r.date) continue;
    const q = quarterOf(r.date);
    const row = m.get(q) ?? { quarter: q, count: 0, ...Object.fromEntries(ROUND_BUCKETS.map((b) => [b, 0])) };
    row.count += 1;
    if (r.amount) row[r.bucket] = ((row[r.bucket] as number) ?? 0) + r.amount;
    m.set(q, row);
  }
  return Array.from(m.values()).sort((a, b) => a.quarter.localeCompare(b.quarter));
}

/** What the quarterly bars count, for the InfoTip beside them. */
export const ROUNDS_QUARTER_INFO =
  "Disclosed USD per quarter from data/base-funding-rounds-*.csv, stacked by round type bucket (seed and angel; Series rounds; strategic incl. acquisitions; token sales; programs, awards and incentives). Undated or undisclosed rounds are counted in the note under the chart only. Rows tagged re-verify come from prior knowledge, not a linked source.";

/** Counts for the note under the quarterly chart and table; both kinds of round stay out of the bars. */
export function roundsQuarterNote(rounds: Round[]): string {
  const undated = rounds.filter((r) => !r.date).length;
  const undisclosed = rounds.filter((r) => r.amount === null).length;
  return `${undisclosed} rounds have no disclosed amount and ${undated} are undated; both are excluded from the bars. Rounds arrive via the submit and correction forms and are added by hand.`;
}

/** The quarterly rows as a table: one column per round type bucket, newest quarter first, with a CSV. */
export function roundsQuarterTable(rows: QuarterRow[]): ChartTableSpec {
  return {
    columns: [{ key: "quarter", label: "Quarter" }, ...ROUND_BUCKETS.map((b) => ({ key: b, label: b, align: "right" as const, format: (v: unknown) => fmtUsd((v as number) ?? 0) })), { key: "count", label: "Rounds", align: "right" }],
    rows: [...rows].reverse() as unknown as Record<string, unknown>[],
    filename: "rounds-by-quarter.csv",
  };
}

/** Disclosed funding per quarter, stacked by round type bucket. Lives inside the Funding tab's money flow view. */
export function RoundsQuarterChart({ rows, height = 300 }: { rows: QuarterRow[]; height?: number }) {
  if (rows.length === 0) return <EmptyState message="No dated rounds." />;
  return (
    <div data-testid="rounds-quarter-chart">
      <Legend className="mb-2" items={ROUND_BUCKETS.map((b, i) => ({ label: b, color: CAT5[i], shape: "square" }))} />
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={4}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="quarter" tickLine={false} axisLine={false} fontSize={10} />
            <YAxis tickFormatter={(v) => fmtUsd(v, { digits: 0 })} width={52} tickLine={false} axisLine={false} fontSize={10} />
            <Tooltip content={<QuarterTip />} cursor={{ fill: "var(--grid)", fillOpacity: 0.4 }} />
            {ROUND_BUCKETS.map((b, i) => (
              <Bar key={b} dataKey={b} stackId="a" fill={CAT5[i]} stroke="var(--background)" strokeWidth={1} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function QuarterTip({ active, payload }: TipProps<QuarterRow>) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <TooltipFrame title={r.quarter}>
      {ROUND_BUCKETS.map((b, i) => ((r[b] as number) > 0 ? <TooltipRow key={b} label={b} color={CAT5[i]} value={fmtUsd(r[b] as number)} /> : null))}
      <TooltipRow label="Rounds (incl. undisclosed)" value={String(r.count)} />
    </TooltipFrame>
  );
}
