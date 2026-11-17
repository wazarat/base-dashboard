/**
 * Project <-> DefiLlama mapping helpers (pure).
 * data/defillama-map.csv has one row per slug: Project, DefiLlama slug, Notes.
 * A row with an empty Project means "reviewed, ignore" (CEX, bridge, look-alike...).
 */
import type { DateStr } from "./dates";
import type { LlamaProtocolSnap, NewlyDetected, Series } from "./history-types";
import type { RawRow } from "./parse";

export interface MapRow {
  project: string | null;
  slug: string;
  notes: string;
}

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\b(protocol|finance|labs|network|exchange|dao)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function parseMapRows(rows: RawRow[]): MapRow[] {
  const out: MapRow[] = [];
  for (const r of rows) {
    const slug = (r["DefiLlama slug"] ?? "").trim();
    if (!slug) continue;
    const project = (r["Project"] ?? "").trim();
    out.push({ project: project || null, slug, notes: (r["Notes"] ?? "").trim() });
  }
  return out;
}

/** Project name -> slugs (exact CSV project names). */
export function slugsByProject(map: MapRow[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of map) {
    if (!r.project) continue;
    const arr = m.get(r.project) ?? [];
    if (!arr.includes(r.slug)) arr.push(r.slug);
    m.set(r.project, arr);
  }
  return m;
}

export function mappedSlugs(map: MapRow[]): Set<string> {
  return new Set(map.filter((r) => r.project).map((r) => r.slug));
}

export function ignoredSlugs(map: MapRow[]): Set<string> {
  return new Set(map.filter((r) => !r.project).map((r) => r.slug));
}

/** Protocols on Base that no map row covers (mapped or ignored). */
export function newlyDetected(
  protocols: LlamaProtocolSnap[],
  map: MapRow[],
  previous: NewlyDetected[],
  today: DateStr,
): NewlyDetected[] {
  const covered = new Set(map.map((r) => r.slug));
  const firstSeen = new Map(previous.map((n) => [n.slug, n.firstSeen]));
  return protocols
    .filter((p) => !covered.has(p.slug))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      parentProtocol: p.parentProtocol,
      tvl: Math.round(p.tvl),
      firstSeen: firstSeen.get(p.slug) ?? today,
      url: `https://defillama.com/protocol/${p.slug}`,
    }))
    .sort((a, b) => b.tvl - a.tvl || a.name.localeCompare(b.name));
}

/** Map slugs that no longer appear in the DefiLlama listing. */
export function unmatchedMapSlugs(map: MapRow[], protocols: LlamaProtocolSnap[]): string[] {
  const have = new Set(protocols.map((p) => p.slug));
  return Array.from(new Set(map.map((r) => r.slug).filter((s) => !have.has(s)))).sort();
}

/** Sum several daily series by date (dates present in any series). */
export function sumSeries(list: Series[]): Series {
  const m = new Map<string, number>();
  for (const s of list) for (const [d, v] of s) m.set(d, (m.get(d) ?? 0) + v);
  return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** Display name of a slug, resolved through the saved protocols snapshot. */
export function nameOfSlug(slug: string, protocols: LlamaProtocolSnap[]): string | null {
  return protocols.find((p) => p.slug === slug)?.name ?? null;
}
