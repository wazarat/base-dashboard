"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, Brush, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState, Legend } from "@/components/atlas/chart-card";
import { TooltipFrame, TooltipRow, type TipProps } from "@/components/atlas/chart-tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtCompact, fmtDate, fmtDateShort, fmtUsd } from "@/lib/format";
import { fitDomain, fmtRangeStats, rangeStats } from "@/lib/level-axis";
import { cn } from "@/lib/utils";

export interface MiniSeriesProps {
  title?: string;
  dates: string[];
  values: Array<number | null>;
  kind: "line" | "bar";
  color?: string;
  /** Optional second line, drawn in its own colour with a legend. */
  secondary?: { label: string; values: Array<number | null>; color: string };
  primaryLabel?: string;
  format?: (v: number) => string;
  height?: number;
  emptyMessage?: string;
  className?: string;
  /** A level (TVL, holders): fitted y-axis, a Start at zero toggle and a low/high/change line. Flows always start at zero. */
  level?: boolean;
  /** Window label for the stats line, for example "90d" or "all history". */
  rangeLabel?: string;
  /** Change for the stats line computed by the card (for example last day vs the same day n days earlier), used while no brush window is set. */
  change?: number | null;
  /** Range brush for zooming into a period (used in the expanded view). */
  brush?: boolean;
}

interface Row {
  date: string;
  v: number | null;
  w?: number | null;
}

/** One small chart with its own y-axis. Several of these make a small-multiples grid; never a dual axis. */
/** The next 1, 2, 2.5, 5 or 10 step above v, the way Recharts rounds an axis top. */
function niceCeil(v: number): number {
  if (!(v > 0)) return 0;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return step * p;
}

export function MiniSeries({ title, dates, values, kind, color = "var(--chain-base)", secondary, primaryLabel, format = fmtUsd, height = 150, emptyMessage, className, level = false, rangeLabel, change, brush = false }: MiniSeriesProps) {
  const [startAtZero, setStartAtZero] = useState(false);
  const [win, setWin] = useState<{ start: number; end: number } | null>(null);
  const data: Row[] = useMemo(() => dates.map((d, i) => ({ date: d, v: values[i] ?? null, w: secondary ? (secondary.values[i] ?? null) : undefined })), [dates, values, secondary]);
  const any = data.some((r) => r.v !== null || (r.w !== null && r.w !== undefined));
  const visible = win ? values.slice(win.start, win.end + 1) : values;
  const visibleSecondary = secondary ? (win ? secondary.values.slice(win.start, win.end + 1) : secondary.values) : [];
  const raw = level ? rangeStats(visible) : null;
  const stats = raw && change !== undefined && !win ? { ...raw, change } : raw;
  const fit = level ? fitDomain([...visible, ...visibleSecondary]) : null;
  const domain: [number | string, number | string] = fit ? (startAtZero ? [0, fit[1]] : fit) : [0, "auto"];
  // A fitted axis spans a narrow band, so its ticks keep one decimal; a zero-based flow axis rounds to whole units.
  // Whole units stay short ($2M) and in-between ticks keep one decimal ($1.5M). A fitted axis can span a narrow band
  // ($1.06B to $1.13B), so its decimals come from the tick step instead, up to two, so neighbouring ticks never read the same.
  const unitOf = (v: number) => {
    const a = Math.abs(v);
    return a >= 1e12 ? 1e12 : a >= 1e9 ? 1e9 : a >= 1e6 ? 1e6 : a >= 1e3 ? 1e3 : 1;
  };
  const levelDigits = fit ? Math.min(2, Math.max(0, Math.ceil(-Math.log10(Math.max(1e-9, (fit[1] - fit[0]) / 3 / unitOf(fit[1])))))) : 0;
  const tickFmt = (v: number) => {
    if (format !== fmtUsd) {
      // Whole ticks stay short (100K, not 100.0K); in-between ticks keep one decimal.
      const scaled = v / unitOf(v);
      return Math.abs(scaled - Math.round(scaled)) < 1e-6 && unitOf(v) > 1 ? fmtCompact(v).replace(/\.0(?=[KMB]$)/, "") : fmtCompact(v);
    }
    if (fit) return fmtUsd(v, { digits: levelDigits });
    const scaled = v / unitOf(v);
    return fmtUsd(v, { digits: Math.abs(scaled - Math.round(scaled)) < 1e-6 ? 0 : 1 });
  };
  // Measure the ticks Recharts will actually draw. A zero-based axis rounds its top tick up past the data
  // maximum (80K data gets a 100K tick), so probe that rounded value and its neighbours too.
  const dataMax = Math.max(0, ...values.filter((v): v is number => v !== null && Number.isFinite(v)), ...visibleSecondary.filter((v): v is number => v !== null && Number.isFinite(v)));
  const top = niceCeil(dataMax);
  const axisProbe = fit
    ? [fit[0], fit[1], (fit[0] + fit[1]) / 2, fit[0] + (fit[1] - fit[0]) / 3, fit[0] + ((fit[1] - fit[0]) * 2) / 3]
    : [0, dataMax, ...[2, 3, 4, 5].flatMap((parts) => Array.from({ length: parts }, (_, i) => (top * (i + 1)) / parts))];
  const axisWidth = Math.max(40, Math.min(84, Math.max(...axisProbe.map((v) => tickFmt(v).length)) * 7 + 12));
  const tip = <Tooltip content={<MiniTip format={format} label={primaryLabel ?? title ?? ""} secondaryLabel={secondary?.label} colors={[color, secondary?.color]} />} cursor={{ stroke: "var(--axis)", fill: "var(--grid)", fillOpacity: 0.4 }} />;
  const axes = (
    <>
      <CartesianGrid stroke="var(--grid)" vertical={false} />
      <XAxis dataKey="date" tickFormatter={fmtDateShort} tickLine={false} axisLine={false} minTickGap={32} fontSize={10} />
      <YAxis domain={domain} tickCount={level ? 4 : undefined} tickFormatter={tickFmt} width={axisWidth} tickLine={false} axisLine={false} fontSize={10} />
    </>
  );
  const brushEl = brush ? (
    <Brush
      dataKey="date"
      height={24}
      travellerWidth={8}
      stroke="var(--axis)"
      fill="var(--surface-chart)"
      tickFormatter={fmtDateShort}
      onChange={(r) => setWin(r.startIndex !== undefined && r.endIndex !== undefined ? { start: r.startIndex, end: r.endIndex } : null)}
    />
  ) : null;
  const windowLabel = win ? `${visible.length} ${visible.length === 1 ? "day" : "days"}` : (rangeLabel ?? `${values.length} days`);

  return (
    <div className={cn("rounded-lg border border-ink-700/40 p-2", className)}>
      {(title || level) && (
        <div className="mb-1 flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-1">
          <div className="min-w-0">
            {title && <span className="type-label block text-ink-300">{title}</span>}
          </div>
          {level && (
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-300">
              <Checkbox checked={startAtZero} onCheckedChange={(v) => setStartAtZero(v === true)} aria-label={`Start ${title ?? primaryLabel ?? "axis"} at zero`} />
              Start at zero
            </label>
          )}
        </div>
      )}
      {!any ? (
        <EmptyState message={emptyMessage ?? "No readings in this range."} className="h-[120px]" />
      ) : (
        <div style={{ height: brush ? height + 32 : height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            {kind === "bar" ? (
              <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }} barCategoryGap={1}>
                {axes}
                {tip}
                <Bar dataKey="v" fill={color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                {brushEl}
              </BarChart>
            ) : (
              <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                {axes}
                {tip}
                <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                {secondary && <Line type="monotone" dataKey="w" stroke={secondary.color} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />}
                {brushEl}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
      {/* The low, high and change line sits under the chart, so it never reads as part of the title (owner request, 2026-11-10). */}
      {stats && any && (
        <p className="type-label mt-1 px-1 text-ink-300" data-testid="range-stats">
          {fmtRangeStats(stats, format, windowLabel)}
        </p>
      )}
      {secondary && <Legend className="mt-1 px-1" items={[{ label: primaryLabel ?? title ?? "", color }, { label: secondary.label, color: secondary.color }]} />}
    </div>
  );
}

function MiniTip({ active, payload, label, format, secondaryLabel, colors }: TipProps<Row> & { label: string; format: (v: number) => string; secondaryLabel?: string; colors: [string, string | undefined] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <TooltipFrame title={fmtDate(r.date)}>
      <TooltipRow label={label} color={colors[0]} value={r.v === null ? "no reading" : format(r.v)} />
      {secondaryLabel && <TooltipRow label={secondaryLabel} color={colors[1]} value={r.w === null || r.w === undefined ? "no reading" : format(r.w)} />}
    </TooltipFrame>
  );
}
