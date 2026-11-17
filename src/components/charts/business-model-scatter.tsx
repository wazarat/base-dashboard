"use client";

import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { TipProps, TooltipFrame, TooltipRow } from "@/components/atlas/chart-tooltip";
import { EmptyState } from "@/components/atlas/chart-card";
import { CHAIN_COLOR, CHAIN_SHAPE } from "@/lib/colors";
import { capture, plottableBiz, type BizPoint, type BizWindow } from "@/lib/biz-model";
import { fmtPct, fmtUsd, fmtUsdFull } from "@/lib/format";
import { countedValue } from "@/lib/metrics";
import { NATIVE_CHAINS, type NativeChain, type Project } from "@/lib/types";

interface Point {
  lx: number;
  ly: number;
  z: number;
  p: Project;
  b: BizPoint;
}

const WINDOW_LABEL: Record<BizWindow, string> = { d7: "7d", d30: "30d", d90: "90d" };

/** Projects the chart can draw for a window, after the native-chain and sector filters. */
export function bizPoints(projects: Project[], win: BizWindow, chains: NativeChain[] = [], sectors: string[] = []): Array<{ p: Project; b: BizPoint }> {
  return projects
    .filter((p) => (!chains.length || chains.includes(p.chain)) && (!sectors.length || sectors.includes(p.sector)))
    .map((p) => ({ p, b: p.biz?.[win] }))
    .filter((x): x is { p: Project; b: BizPoint } => plottableBiz(x.b));
}

/** Counts for the InfoTip: plotted, fees without paired revenue, and data errors left out. */
export function bizCounts(projects: Project[], win: BizWindow, chains: NativeChain[] = [], sectors: string[] = []) {
  const scope = projects.filter((p) => (!chains.length || chains.includes(p.chain)) && (!sectors.length || sectors.includes(p.sector)));
  const plotted = bizPoints(scope, win).length;
  const errors = scope.filter((p) => p.biz?.[win]?.error).length;
  const feesOnly = scope.filter((p) => (countedValue(p, "fees") ?? 0) > 0 && !p.biz?.[win]?.error && !plottableBiz(p.biz?.[win])).length;
  return { plotted, feesOnly, errors };
}

const CAPTURE_LINES = [
  { r: 1, label: "100% capture" },
  { r: 0.5, label: "50%" },
  { r: 0.1, label: "10%" },
];

function pow10Label(v: number): string {
  return fmtUsd(Math.pow(10, v), { digits: 0 });
}

/** `chains` and `sectors` narrow the plot; empty shows all. Markers are uniform unless `sizeByTvl`. */
export function BusinessModelScatter({ projects, win = "d30", chains = [], sectors = [], sizeByTvl = false, onOpen }: { projects: Project[]; win?: BizWindow; chains?: NativeChain[]; sectors?: string[]; sizeByTvl?: boolean; onOpen: (id: string) => void }) {
  const shown = chains.length ? NATIVE_CHAINS.filter((c) => chains.includes(c)) : [...NATIVE_CHAINS];
  const pts: Point[] = bizPoints(projects, win, chains, sectors).map(({ p, b }) => ({ lx: Math.log10(b.fees), ly: Math.log10(b.revenue), z: sizeByTvl ? (countedValue(p, "tvl") ?? 0) : 1, p, b }));
  const xs = pts.map((d) => d.lx);
  const ys = pts.map((d) => d.ly);
  const xDomain: [number, number] = pts.length ? [Math.floor(Math.min(...xs)), Math.ceil(Math.max(...xs))] : [0, 1];
  const yDomain: [number, number] = pts.length ? [Math.floor(Math.min(...ys)), Math.ceil(Math.max(...ys))] : [0, 1];

  if (pts.length === 0) return <EmptyState message="No projects with both fees and revenue in this selection." />;

  const ticks = (d: [number, number]) => Array.from({ length: d[1] - d[0] + 1 }, (_, i) => d[0] + i);

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-300" aria-label="Legend">
        {shown.map((c) => (
          <li key={c} data-chain={c} className="inline-flex items-center gap-1.5">
            <ShapeGlyph chain={c} />
            {c}
          </li>
        ))}
        {sizeByTvl && (
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block size-3 rounded-full border border-dashed border-ink-300" />
            size = TVL
          </li>
        )}
      </ul>
      <div className="h-[380px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 24, bottom: 16, left: 8 }}>
            <CartesianGrid stroke="var(--grid)" />
            <XAxis
              type="number"
              dataKey="lx"
              domain={xDomain}
              ticks={ticks(xDomain)}
              tickFormatter={pow10Label}
              tickLine={false}
              axisLine={false}
              label={{ value: `${WINDOW_LABEL[win]} fees (log)`, position: "insideBottom", offset: -8, fontSize: 10, fill: "var(--ink-muted)" }}
            />
            <YAxis
              type="number"
              dataKey="ly"
              domain={yDomain}
              ticks={ticks(yDomain)}
              tickFormatter={pow10Label}
              width={52}
              tickLine={false}
              axisLine={false}
              label={{ value: `${WINDOW_LABEL[win]} revenue (log)`, angle: -90, position: "insideLeft", offset: 4, fontSize: 10, fill: "var(--ink-muted)" }}
            />
            <ZAxis type="number" dataKey="z" range={sizeByTvl ? [40, 900] : [90, 90]} />
            <Tooltip cursor={false} content={<ScatterTip win={win} />} />
            {CAPTURE_LINES.map(({ r, label }) => {
              const off = Math.log10(r);
              const x1 = Math.max(xDomain[0], yDomain[0] - off);
              const x2 = Math.min(xDomain[1], yDomain[1] - off);
              if (x2 <= x1) return null;
              return (
                <ReferenceLine
                  key={label}
                  segment={[
                    { x: x1, y: x1 + off },
                    { x: x2, y: x2 + off },
                  ]}
                  stroke="var(--axis)"
                  strokeDasharray={r === 1 ? undefined : "4 4"}
                  label={{ value: label, position: "insideRight", fontSize: 10, fill: "var(--ink-muted)" }}
                />
              );
            })}
            {shown.map((c) => (
              <Scatter
                key={c}
                name={c}
                data={pts.filter((d) => d.p.chain === c)}
                fill={CHAIN_COLOR[c]}
                fillOpacity={0.8}
                stroke="var(--background)"
                strokeWidth={2}
                shape={CHAIN_SHAPE[c]}
                isAnimationActive={false}
                onClick={(d) => {
                  const pt = (d as unknown as { payload?: Point })?.payload ?? (d as unknown as Point);
                  if (pt?.p) onOpen(pt.p.id);
                }}
                style={{ cursor: "pointer" }}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ShapeGlyph({ chain }: { chain: NativeChain }) {
  const color = CHAIN_COLOR[chain];
  const shape = CHAIN_SHAPE[chain];
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      {shape === "circle" && <circle cx="6" cy="6" r="5" fill={color} />}
      {shape === "square" && <rect x="1" y="1" width="10" height="10" fill={color} />}
      {shape === "triangle" && <polygon points="6,1 11,11 1,11" fill={color} />}
      {shape === "diamond" && <polygon points="6,0.5 11.5,6 6,11.5 0.5,6" fill={color} />}
    </svg>
  );
}

function ScatterTip({ active, payload, win }: TipProps<Point> & { win: BizWindow }) {
  if (!active || !payload?.length) return null;
  const { p, b } = payload[0].payload;
  return (
    <TooltipFrame title={p.name}>
      <TooltipRow label="Sector" color={CHAIN_COLOR[p.chain]} value={p.sector} />
      <TooltipRow label={`${WINDOW_LABEL[win]} fees`} value={fmtUsdFull(b.fees)} />
      <TooltipRow label={`${WINDOW_LABEL[win]} revenue`} value={fmtUsdFull(b.revenue)} />
      <TooltipRow label="Capture" value={fmtPct(capture(b), 1)} />
      <div className="pt-1 text-ink-300">Click to open</div>
    </TooltipFrame>
  );
}
