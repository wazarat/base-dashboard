/**
 * Explorer "More filters" (owner prompt, 2026-11-09). Pure, so every filter is
 * tested; each value lives in the URL under its own key and narrows both the
 * table and the map, on top of the global search and facets.
 */
import { parseAsArrayOf, parseAsString, parseAsStringLiteral } from "nuqs";
import { displayToken } from "./backer-filters";
import { canonicalInvestor, investorId } from "./rounds";
import type { Investor, NumericMetricKey, Project, Round } from "./types";

export const MIN_TVLS = ["100k", "1m", "10m", "50m"] as const;
export type MinTvl = (typeof MIN_TVLS)[number];
export const MIN_TVL_VALUE: Record<MinTvl, number> = { "100k": 100_000, "1m": 1_000_000, "10m": 10_000_000, "50m": 50_000_000 };
export const MIN_TVL_LABEL: Record<MinTvl, string> = { "100k": "$100K+", "1m": "$1M+", "10m": "$10M+", "50m": "$50M+" };

export const HAS_METRICS = ["tvl", "volume", "fees", "revenue"] as const satisfies readonly NumericMetricKey[];
export const HAS_LABEL: Record<(typeof HAS_METRICS)[number], string> = { tvl: "Has TVL", volume: "Has 30d volume", fees: "Has 30d fees", revenue: "Has 30d revenue" };

const list = parseAsArrayOf(parseAsString, ",").withDefault([]);
const yesNo = parseAsStringLiteral(["yes", "no"] as const);

export const moreFilterParsers = {
  xsub: list,
  xtvl: parseAsStringLiteral(MIN_TVLS),
  xhas: list,
  xtok: yesNo,
  xfund: yesNo,
  xinv: parseAsString,
  xrh: parseAsStringLiteral(["yes"] as const),
  xonc: parseAsStringLiteral(["yes"] as const),
};

export interface MoreFilters {
  xsub: string[];
  xtvl: MinTvl | null;
  xhas: string[];
  xtok: "yes" | "no" | null;
  xfund: "yes" | "no" | null;
  /** Investor id from the aggregation (alias map applied). */
  xinv: string | null;
  xrh: "yes" | null;
  /** Has a mapped token, stablecoin, RWA or NFT collection with onchain data (src/lib/onchain.ts). */
  xonc?: "yes" | null;
}

export const NO_MORE_FILTERS: MoreFilters = { xsub: [], xtvl: null, xhas: [], xtok: null, xfund: null, xinv: null, xrh: null, xonc: null };

export interface FilterContext {
  /** investor id -> project ids with a round naming that investor */
  investorProjects: Map<string, Set<string>>;
  /** project ids with a Base related round */
  relatedProjects: Set<string>;
}

export function buildContext(rounds: Round[]): FilterContext {
  const investorProjects = new Map<string, Set<string>>();
  const relatedProjects = new Set<string>();
  for (const r of rounds) {
    if (!r.projectId) continue;
    if (r.related) relatedProjects.add(r.projectId);
    for (const n of [...r.leadInvestors, ...r.otherInvestors]) {
      // investorId over the canonical name, the same id the aggregation uses.
      const id = investorId(canonicalInvestor(n));
      const s = investorProjects.get(id) ?? new Set<string>();
      s.add(r.projectId);
      investorProjects.set(id, s);
    }
  }
  return { investorProjects, relatedProjects };
}

export const ONCHAIN_FILTER_LABEL = "Has token or supply data";

/** A mapped token, stablecoin, RWA token or NFT collection with any onchain figure. */
export function hasOnchainData(p: Project): boolean {
  return Boolean(p.onchain?.signals.length);
}

export function applyMoreFilters(projects: Project[], f: MoreFilters, ctx: FilterContext): Project[] {
  const subs = f.xsub.length ? new Set(f.xsub) : null;
  const floor = f.xtvl ? MIN_TVL_VALUE[f.xtvl] : null;
  const has = f.xhas.filter((m): m is (typeof HAS_METRICS)[number] => (HAS_METRICS as readonly string[]).includes(m));
  const inv = f.xinv ? (ctx.investorProjects.get(f.xinv) ?? new Set<string>()) : null;
  return projects.filter((p) => {
    if (subs && !subs.has(p.subcategory ?? "")) return false;
    if (floor !== null && (p.tvl ?? 0) < floor) return false;
    for (const m of has) if (p[m] === null) return false;
    if (f.xtok && (displayToken(p) !== null) !== (f.xtok === "yes")) return false;
    if (f.xfund && (p.fundingType !== "Not disclosed") !== (f.xfund === "yes")) return false;
    if (inv && !inv.has(p.id)) return false;
    if (f.xrh && !ctx.relatedProjects.has(p.id)) return false;
    if (f.xonc && !hasOnchainData(p)) return false;
    return true;
  });
}

/** Subcategory options, limited to the selected sectors when any are selected, with counts. */
export function subcategoryOptions(projects: Project[], sectors: string[]): Array<{ value: string; count: number }> {
  const scope = sectors.length ? projects.filter((p) => sectors.includes(p.sector)) : projects;
  const counts = new Map<string, number>();
  for (const p of scope) if (p.subcategory) counts.set(p.subcategory, (counts.get(p.subcategory) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }));
}

export function activeMoreCount(f: MoreFilters): number {
  return f.xsub.length + (f.xtvl ? 1 : 0) + f.xhas.length + (f.xtok ? 1 : 0) + (f.xfund ? 1 : 0) + (f.xinv ? 1 : 0) + (f.xrh ? 1 : 0) + (f.xonc ? 1 : 0);
}

/** "Filtered by Subcategory AMM DEXs, Minimum TVL $1M+" as one plain-text line; null when nothing is set. */
export function describeMoreFilters(f: MoreFilters, investors: Investor[]): string | null {
  const parts: string[] = [];
  if (f.xsub.length) parts.push(`Subcategory ${f.xsub.join(", ")}`);
  if (f.xtvl) parts.push(`Minimum TVL ${MIN_TVL_LABEL[f.xtvl]}`);
  if (f.xhas.length) parts.push(f.xhas.map((m) => HAS_LABEL[m as keyof typeof HAS_LABEL] ?? m).join(", "));
  if (f.xtok) parts.push(f.xtok === "yes" ? "Live token" : "No live token");
  if (f.xfund) parts.push(f.xfund === "yes" ? "Disclosed funding" : "No disclosed funding");
  if (f.xinv) parts.push(`Investor ${investors.find((i) => i.id === f.xinv)?.name ?? f.xinv}`);
  if (f.xrh) parts.push("Has a Base-related round");
  if (f.xonc) parts.push(ONCHAIN_FILTER_LABEL);
  return parts.length ? `Filtered by ${parts.join(", ")}` : null;
}
