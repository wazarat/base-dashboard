"use client";

import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryStates, type inferParserType } from "nuqs";
import { useCallback, useMemo } from "react";
import { gatedVersion, projects as allProjects, rounds as allRounds } from "./data";
import { useGatedData } from "./use-gated";
import { canonicalInvestor } from "./rounds";
import type { Project } from "./types";

export const SCALES = ["log", "linear"] as const;
export type Scale = (typeof SCALES)[number];

export { RANGES, type Range } from "./ranges";

export const MIN_SIZES = ["any", "250k", "1m", "10m"] as const;
export type MinSize = (typeof MIN_SIZES)[number];

export const ALIGNS = ["date", "days"] as const;
export type Align = (typeof ALIGNS)[number];

const list = parseAsArrayOf(parseAsString, ",").withDefault([]);
const yesNo = parseAsStringLiteral(["yes", "no"] as const);

/**
 * Shared URL state. There is no global chart control: a chart that needs a
 * metric or a time range keeps its own key (see chart-metric.ts and
 * chart-range.ts). There is no security-risk facet (docs/ATLAS-UI.md,
 * sections 4 and 10).
 */
export const filterParsers = {
  q: parseAsString.withDefault(""),
  sector: list,
  chain: list,
  tier: list,
  status: list,
  funding: list,
  via: list,
  scale: parseAsStringLiteral(SCALES).withDefault("log"),
  minSize: parseAsStringLiteral(MIN_SIZES).withDefault("250k"),
  align: parseAsStringLiteral(ALIGNS).withDefault("date"),
  compare: list,
  project: parseAsString,
  sectorDrawer: parseAsString,
  /** Narrows the sector side bar to one subcategory. Only read together with sectorDrawer. */
  sectorSub: parseAsString,
  investor: parseAsString,
  /** Open ticker drawer. */
  ticker: parseAsString,
  /** Ticker driving the premium charts on the Stocks page. */
  chartTicker: parseAsString,
  /** Stock-token filters (Stocks page only): search, asset type, sector, industry, premium band, feed, pools, collateral. */
  sq: parseAsString.withDefault(""),
  sa: list,
  ss: list,
  si: list,
  sb: list,
  sf: yesNo,
  sp: yesNo,
  sc: yesNo,
};

export type FilterState = inferParserType<typeof filterParsers>;

/** Params that follow the reader from page to page: the compare selection, every per-chart metric key, and the range of the two cards that appear on more than one page. */
export const CARRIED_PARAMS = ["compare", "scale", "tm", "cm", "mm", "xm", "mr", "xr"] as const;

export const FACETS = [
  { key: "sector", label: "Sector" },
  { key: "chain", label: "Native chain" },
  { key: "tier", label: "Traction tier" },
  { key: "status", label: "Status" },
  { key: "funding", label: "Funding type" },
  { key: "via", label: "Discovered via" },
] as const;
export type FacetKey = (typeof FACETS)[number]["key"];

export function facetValue(p: Project, key: FacetKey): string[] {
  switch (key) {
    case "sector":
      return [p.sector];
    case "chain":
      return [p.chain];
    case "tier":
      return [p.tier];
    case "status":
      return [p.status];
    case "funding":
      return p.fundingTypes;
    case "via":
      return [p.discoveredVia];
  }
}

/** Investor names per project from the rounds file, both as written and under the alias map, so "Andreessen Horowitz" finds a16z deals. */
let roundInvestors: Map<string, string> | null = null;
let builtAt = -1;
function investorsOf(id: string): string {
  // Rebuilt when the gated rounds arrive (they are empty for a logged-out visitor).
  if (!roundInvestors || builtAt !== gatedVersion()) {
    builtAt = gatedVersion();
    roundInvestors = new Map();
    for (const r of allRounds) {
      if (!r.projectId) continue;
      const names = [...r.leadInvestors, ...r.otherInvestors].flatMap((n) => [n, canonicalInvestor(n)]);
      roundInvestors.set(r.projectId, `${roundInvestors.get(r.projectId) ?? ""} ${names.join(" ")}`);
    }
  }
  return roundInvestors.get(id) ?? "";
}

/** Everything the search box looks at: name, description, X handle, website, subcategory, token ticker and investors. */
export function searchText(p: Project): string {
  return [p.name, p.description, p.xHandle, p.website, p.subcategory, p.token, p.tokenRaw, p.investors, investorsOf(p.id)].filter(Boolean).join(" ").toLowerCase();
}

/** Pure filter so it can be tested without React. */
export function applyFilters(projects: Project[], f: Partial<FilterState>): Project[] {
  const q = (f.q ?? "").trim().toLowerCase();
  const sets: Partial<Record<FacetKey, Set<string>>> = {};
  for (const { key } of FACETS) {
    const vals = f[key] ?? [];
    if (vals.length) sets[key] = new Set(vals);
  }
  return projects.filter((p) => {
    for (const { key } of FACETS) {
      const s = sets[key];
      if (s && !facetValue(p, key).some((v) => s.has(v))) return false;
    }
    if (q && !searchText(p).includes(q)) return false;
    return true;
  });
}

export function activeFilterCount(f: FilterState): number {
  let n = f.q.trim() ? 1 : 0;
  for (const { key } of FACETS) n += f[key].length;
  return n;
}

export function useFilters() {
  const [state, setState] = useQueryStates(filterParsers, { history: "replace", clearOnDefault: true });
  const { version } = useGatedData();
  // `version` changes when gated fields (funding types, investors) arrive, so facets and search refilter.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => applyFilters(allProjects, state), [state, version]);

  const reset = useCallback(() => {
    void setState({ q: "", sector: [], chain: [], tier: [], status: [], funding: [], via: [] });
  }, [setState]);

  const toggleFacet = useCallback(
    (key: FacetKey, value: string) => {
      void setState((prev) => {
        const cur = prev[key];
        return { [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] };
      });
    },
    [setState],
  );

  const setFacet = useCallback(
    (key: FacetKey, values: string[]) => {
      void setState({ [key]: values });
    },
    [setState],
  );

  const openProject = useCallback((id: string | null) => void setState({ project: id }), [setState]);
  // Always writes both keys, so opening a whole sector clears a subcategory left over from an earlier view.
  const openSector = useCallback((sector: string | null, sub: string | null = null) => void setState({ sectorDrawer: sector, sectorSub: sector ? sub : null }), [setState]);
  const openInvestor = useCallback((id: string | null) => void setState({ investor: id }), [setState]);
  const openTicker = useCallback((symbol: string | null) => void setState({ ticker: symbol }), [setState]);
  const resetStockFilters = useCallback(() => void setState({ sq: "", sa: [], ss: [], si: [], sb: [], sf: null, sp: null, sc: null }), [setState]);
  const stockFilters = useMemo(() => ({ sq: state.sq, sa: state.sa, ss: state.ss, si: state.si, sb: state.sb, sf: state.sf, sp: state.sp, sc: state.sc }), [state.sq, state.sa, state.ss, state.si, state.sb, state.sf, state.sp, state.sc]);

  return {
    state,
    setState,
    filtered,
    all: allProjects,
    scale: state.scale as Scale,
    reset,
    toggleFacet,
    setFacet,
    openProject,
    openSector,
    openInvestor,
    openTicker,
    stockFilters,
    resetStockFilters,
    activeCount: activeFilterCount(state),
  };
}
