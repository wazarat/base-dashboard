"use client";

import { useState } from "react";
import { ResponsiveContainer, Tooltip, Treemap } from "recharts";
import { EmptyState } from "@/components/atlas/chart-card";
import { TipProps, TooltipFrame, TooltipRow } from "@/components/atlas/chart-tooltip";
import { Button } from "@/components/ui/button";
import { labelColorFor } from "@/lib/color-utils";
import { SEQ } from "@/lib/colors";
import { fmtMetric, fmtMetricFull, fmtPct, METRIC_SHORT, lowerLabel } from "@/lib/format";
import { fitLabel, type Tile, type TreemapResult } from "@/lib/treemap";
import type { MetricKey } from "@/lib/types";
import { useCssVars } from "@/lib/use-css-vars";
import { useMedia } from "@/lib/use-media";

interface Props {
  result: TreemapResult;
  metric: MetricKey;
  /** Opens the sector pop-up (ranked leaders and every project in the sector). */
  onOpenSector: (sector: string) => void;
  onOpenProject: (id: string) => void;
  /** Opens the pop-up scoped to one subcategory, for a result zoomed into a sector. */
  onOpenSub: (sector: string, sub: string) => void;
  height?: number;
  expanded?: boolean;
}

const VAR_NAMES = ["--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5", "--seq-6", "--tier-none"] as const;

export function SectorTreemap({ result, metric, onOpenSector, onOpenProject, onOpenSub, height = 360, expanded = false }: Props) {
  const vars = useCssVars(VAR_NAMES);
  // On touch screens without hover the first tap previews a tile instead of acting on it.
  const noHover = useMedia("(hover: none)"); // copy-ok
  const [preview, setPreview] = useState<Tile | null>(null);
  const labelFor = (fill: string) => {
    const m = /var\((--[\w-]+)\)/.exec(fill);
    return labelColorFor(m ? vars[m[1]] || null : fill);
  };
  const act = (t: Tile) => {
    setPreview(null);
    if (t.kind === "sector") onOpenSector(t.name);
    else if (t.kind === "subcategory" && result.sector) onOpenSub(result.sector, t.name);
    else if (t.kind === "project" && t.projectId) onOpenProject(t.projectId);
  };
  // On a phone the first tap shows the tile's details with an Open button; the button acts.
  const activate = (t: Tile) => (noHover ? setPreview(t) : act(t));

  return (
    <div>
      {result.tiles.length === 0 ? (
        <EmptyState message={result.sector ? `No projects in ${result.sector} match the current filters.` : undefined} />
      ) : (
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap data={result.tiles as unknown as Record<string, unknown>[]} dataKey="size" nameKey="name" isAnimationActive={false} content={<TreemapCell tiles={result.tiles} onActivate={activate} labelFor={labelFor} expanded={expanded} metric={metric} />}>
              {!noHover && <Tooltip content={<TreemapTip metric={metric} />} />}
            </Treemap>
          </ResponsiveContainer>
        </div>
      )}
      {preview && (
        <div data-testid="treemap-preview" className="mt-2 flex items-start justify-between gap-3 rounded-lg border border-ink-700/60 bg-ink-900 p-3 text-xs">
          <TileDetails tile={preview} metric={metric} />
          {(preview.kind === "sector" || preview.kind === "subcategory" || preview.kind === "project") && (
            <Button size="xs" onClick={() => act(preview)}>
              Open
            </Button>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-300">
        <span>Box size is {lowerLabel(METRIC_SHORT[metric])}. Colour is the share of projects that are Base-native, from</span>
        <span className="inline-flex items-center gap-1">
          0%
          {SEQ.map((c) => (
            <span key={c} aria-hidden="true" className="inline-block h-2.5 w-4" style={{ backgroundColor: c }} />
          ))}
          100%
        </span>
      </div>
    </div>
  );
}

interface CellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  depth?: number;
  index?: number;
  tiles: Tile[];
  onActivate: (t: Tile) => void;
  labelFor: (fill: string) => string;
  expanded: boolean;
  metric: MetricKey;
}

const LINE = 13;
const PAD_Y = 8;

function TreemapCell({ x = 0, y = 0, width = 0, height = 0, name = "", depth, index, tiles, onActivate, labelFor, expanded, metric }: CellProps) {
  if (depth === 0) return null;
  const tile = index !== undefined && tiles[index]?.name === name ? tiles[index] : tiles.find((t) => t.name === name);
  if (!tile) return null;
  const actionable = tile.kind === "sector" || tile.kind === "subcategory" || tile.kind === "project";
  const lines = fitLabel(tile.name, width, height);
  const valueLine = expanded && lines.length > 0 && height >= PAD_Y + (lines.length + 1) * LINE + 4 ? fmtMetric(metric, tile.kind === "untracked" ? null : tile.size) : null;
  const color = labelFor(tile.fill);
  return (
    <g
      data-tile-kind={tile.kind}
      role={actionable ? "button" : undefined}
      tabIndex={actionable ? 0 : undefined}
      aria-label={actionable ? (tile.kind === "sector" ? `Open ${tile.name}` : tile.kind === "subcategory" ? `List the projects in ${tile.name}` : `Open ${tile.name}`) : tile.name}
      onClick={actionable ? () => onActivate(tile) : undefined}
      onKeyDown={
        actionable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onActivate(tile);
              }
            }
          : undefined
      }
      style={{ cursor: actionable ? "pointer" : "default", outline: "none" }}
    >
      <rect x={x + 1} y={y + 1} width={Math.max(0, width - 2)} height={Math.max(0, height - 2)} rx={3} fill={tile.fill} stroke="var(--ink-900)" strokeWidth={2} strokeDasharray={tile.notToScale ? "3 3" : undefined} />
      {lines.map((line, i) => (
        <text key={i} x={x + 7} y={y + 16 + i * LINE} fontSize={11} fontWeight={600} fill={color} style={{ pointerEvents: "none" }}>
          {line}
        </text>
      ))}
      {valueLine && (
        <text x={x + 7} y={y + 16 + lines.length * LINE} fontSize={11} fontWeight={400} fill={color} style={{ pointerEvents: "none" }}>
          {valueLine}
        </text>
      )}
    </g>
  );
}

/** The same facts the hover tooltip shows, for the tap preview on phones. */
function TileDetails({ tile: d, metric }: { tile: Tile; metric: MetricKey }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="font-medium text-ink-50">{d.name}</div>
      <div className="text-ink-300">
        {METRIC_SHORT[metric]} {d.kind === "untracked" ? "Not tracked" : metric === "count" ? fmtMetric(metric, d.size) : fmtMetricFull(metric, d.size)}, {d.count} {d.count === 1 ? "project" : "projects"}, Base native {d.nativeShare === null ? "none" : fmtPct(d.nativeShare)}
      </div>
    </div>
  );
}

function TreemapTip({ active, payload, metric }: TipProps<Tile> & { metric: MetricKey }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const members = d.members ?? [];
  return (
    <TooltipFrame title={d.name}>
      <TooltipRow label={METRIC_SHORT[metric]} value={d.kind === "untracked" ? "Not tracked" : metric === "count" ? fmtMetric(metric, d.size) : fmtMetricFull(metric, d.size)} />
      <TooltipRow label="Projects" value={d.count} />
      {metric !== "count" && d.kind !== "untracked" && <TooltipRow label="Tracked" value={`${d.withData} of ${d.count}`} />}
      <TooltipRow label="Base native" value={d.nativeShare === null ? "none" : fmtPct(d.nativeShare)} />
      {members.length > 0 && (
        <div className="pt-1 text-ink-300">
          {members.slice(0, 8).join(", ")}
          {members.length > 8 && ` and ${members.length - 8} more`}
        </div>
      )}
      {d.kind === "sector" && <div className="pt-1 text-ink-300">Click to see its leaders and projects</div>}
      {d.kind === "subcategory" && <div className="pt-1 text-ink-300">Click to list its projects</div>}
      {d.kind === "project" && <div className="pt-1 text-ink-300">Click to open the project</div>}
    </TooltipFrame>
  );
}
