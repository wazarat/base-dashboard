import type { ChartTableSpec } from "@/components/atlas/chart-table";
import { seqColor } from "./colors";
import { fmtMetricFull, fmtPct, METRIC_LABEL } from "./format";
import { bySector, metricValue, type ValueOf } from "./metrics";
import type { MetricKey, Project } from "./types";

/**
 * Sector treemap with drill-down (docs/ATLAS-UI.md, section 7). The root shows
 * sectors. Inside a sector, projects group by subcategory; a sector with fewer
 * than three subcategories shows its projects as tiles instead, with untracked
 * projects folded into one fixed-size "Not tracked" tile.
 */
export type TileKind = "sector" | "subcategory" | "project" | "untracked";
export type TreemapMode = "sectors" | "subcategories" | "projects";

export interface Tile {
  id: string;
  name: string;
  /** Box area. For the untracked tile this is a placeholder, not a value. */
  size: number;
  count: number;
  withData: number;
  nativeShare: number | null;
  kind: TileKind;
  fill: string;
  projectId?: string;
  subcategory?: string | null;
  /** Project names inside a subcategory or the untracked tile, for the tooltip. */
  members?: string[];
  notToScale?: boolean;
}

export interface TreemapResult {
  mode: TreemapMode;
  tiles: Tile[];
  sector: string | null;
  /** Set when the map is zoomed into one subcategory of `sector` (Explorer map, fourth level). */
  sub?: string | null;
  /** Projects without a value for the metric inside the zoomed sector. */
  untracked: number;
}

export const UNCLASSIFIED = "Unclassified";
export const MIN_SUBCATEGORIES = 3;

/** The projects one subcategory tile stands for. Projects without a subcategory belong to "Unclassified". */
export function subcategoryMembers(projects: Project[], sector: string, sub: string): Project[] {
  return projects.filter((p) => p.sector === sector && (p.subcategory ?? UNCLASSIFIED) === sub);
}

function nativeShareOf(ps: Project[]): number | null {
  return ps.length ? ps.filter((p) => p.chain === "Base native").length / ps.length : null;
}

function untrackedTile(tracked: Tile[], members: string[], count: number): Tile {
  const total = tracked.reduce((a, t) => a + t.size, 0);
  const smallest = tracked.length ? Math.min(...tracked.map((t) => t.size)) : 1;
  return {
    id: "untracked",
    name: "Not tracked",
    size: tracked.length ? Math.max(total * 0.06, smallest) : 1,
    count,
    withData: 0,
    nativeShare: null,
    kind: "untracked",
    fill: "var(--tier-none)",
    members,
    notToScale: true,
  };
}

/** Tile counts always add up to the projects passed in: sectors or projects with no value share one "Not tracked" tile. */
export function treemapTiles(projects: Project[], metric: MetricKey, zoom: string | null, valueOf: ValueOf = metricValue, sub: string | null = null): TreemapResult {
  if (!zoom) {
    const groups = bySector(projects, metric, valueOf);
    const tiles: Tile[] = groups
      .filter((g) => g.value > 0)
      .map((g) => {
        const inSector = projects.filter((p) => p.sector === g.key);
        const share = nativeShareOf(inSector);
        return { id: `sector:${g.key}`, name: g.key, size: g.value, count: g.count, withData: g.withData, nativeShare: share, kind: "sector", fill: seqColor(share) };
      });
    const empty = groups.filter((g) => g.value <= 0);
    const untracked = empty.reduce((a, g) => a + g.count, 0);
    if (untracked > 0 && metric !== "count") tiles.push(untrackedTile(tiles, projects.filter((p) => empty.some((g) => g.key === p.sector)).map((p) => p.name), untracked));
    return { mode: "sectors", tiles, sector: null, untracked };
  }

  // The fourth level: one subcategory's projects as tiles.
  const inSector = sub ? subcategoryMembers(projects, zoom, sub) : projects.filter((p) => p.sector === zoom);
  const subs = Array.from(new Set(inSector.map((p) => p.subcategory ?? UNCLASSIFIED)));

  if (!sub && subs.length >= MIN_SUBCATEGORIES) {
    const groups = subs
      .map((sub) => {
        const ps = inSector.filter((p) => (p.subcategory ?? UNCLASSIFIED) === sub);
        let value = 0;
        let withData = 0;
        for (const p of ps) {
          const v = valueOf(p, metric);
          if (v !== null) {
            value += v;
            withData += 1;
          }
        }
        return { sub, ps, value, withData };
      })
      .sort((a, b) => b.value - a.value || a.sub.localeCompare(b.sub));
    const tracked = groups.filter((g) => g.value > 0);
    const zero = groups.filter((g) => g.value <= 0);
    const tiles: Tile[] = tracked.map((g) => {
      const share = nativeShareOf(g.ps);
      return { id: `sub:${g.sub}`, name: g.sub, size: g.value, count: g.ps.length, withData: g.withData, nativeShare: share, kind: "subcategory", fill: seqColor(share), members: g.ps.map((p) => p.name) };
    });
    const untracked = zero.reduce((a, g) => a + g.ps.length, 0);
    if (untracked > 0 && metric !== "count") tiles.push(untrackedTile(tiles, zero.flatMap((g) => g.ps.map((p) => p.name)), untracked));
    return { mode: "subcategories", tiles, sector: zoom, untracked };
  }

  const valued = inSector
    .map((p) => ({ p, v: valueOf(p, metric) }))
    .filter((x): x is { p: Project; v: number } => x.v !== null && x.v > 0)
    .sort((a, b) => b.v - a.v || a.p.name.localeCompare(b.p.name));
  const without = inSector.filter((p) => {
    const v = valueOf(p, metric);
    return v === null || v <= 0;
  });
  const tiles: Tile[] = valued.map(({ p, v }) => {
    const share = p.chain === "Base native" ? 1 : 0;
    return { id: `project:${p.id}`, name: p.name, size: v, count: 1, withData: 1, nativeShare: share, kind: "project", fill: seqColor(share), projectId: p.id, subcategory: p.subcategory };
  });
  if (without.length > 0 && metric !== "count") tiles.push(untrackedTile(tiles, without.map((p) => p.name), without.length));
  return { mode: "projects", tiles, sector: zoom, sub, untracked: without.length };
}

export function treemapTable(result: TreemapResult, metric: MetricKey): ChartTableSpec {
  const money = metric !== "count";
  const nameLabel = result.mode === "sectors" ? "Sector" : result.mode === "subcategories" ? "Subcategory" : "Project";
  const columns: ChartTableSpec["columns"] = [
    { key: "name", label: nameLabel },
    ...(result.mode === "projects" ? [{ key: "subcategory", label: "Subcategory", empty: UNCLASSIFIED }] : []),
    { key: "count", label: "Projects", align: "right" },
    ...(money
      ? [
          { key: "withData", label: "Tracked", align: "right" as const },
          { key: "value", label: METRIC_LABEL[metric], align: "right" as const, format: (v: unknown) => (v === null || v === undefined ? "Not tracked" : fmtMetricFull(metric, v as number)) },
        ]
      : []),
    { key: "nativeShare", label: "Base native", align: "right", format: (v: unknown) => (v === null || v === undefined ? "none" : fmtPct(v as number)) },
  ];
  const rows = result.tiles.map((t) => ({
    name: t.name,
    subcategory: t.kind === "project" ? (t.subcategory ?? UNCLASSIFIED) : null,
    count: t.count,
    withData: t.withData,
    value: t.kind === "untracked" ? null : t.size,
    nativeShare: t.nativeShare,
  }));
  const slug = result.sector ? result.sector.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "all";
  return { columns, rows, filename: `sectors-${slug}-${metric}.csv` };
}

/**
 * Word-wrap a tile label to at most two lines, truncating with an ellipsis,
 * and hide it entirely when the tile cannot hold four characters or one line.
 */
export function fitLabel(name: string, width: number, height: number, o: { charW?: number; lineH?: number; padX?: number; padY?: number } = {}): string[] {
  const { charW = 7.2, lineH = 13, padX = 6, padY = 8 } = o;
  const maxChars = Math.floor((width - 2 * padX) / charW);
  if (maxChars < 4 || height < padY + lineH) return [];
  const maxLines = height >= padY + 2 * lineH ? 2 : 1;
  const cut = (s: string) => (s.length > maxChars ? `${s.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…` : s);
  const words = name.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let i = 0;
  while (i < words.length && lines.length < maxLines) {
    let line = "";
    while (i < words.length) {
      const next = line ? `${line} ${words[i]}` : words[i];
      if (next.length > maxChars) break;
      line = next;
      i += 1;
    }
    if (!line) {
      line = cut(words[i]);
      i += 1;
    }
    lines.push(line);
  }
  if (i < words.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.endsWith("…") ? last : cut(`${last} ${words[i]}`);
  }
  return lines;
}
