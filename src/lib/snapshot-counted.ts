/**
 * Counted values for a build with no daily history yet (Milestone 1). The research snapshot is summed
 * only where it would not double count, using the DefiLlama category recorded in the seed map and the
 * notes in Other Traction Signal. Once data/history exists, DefiLlama's own chain-total flags replace this.
 */
import type { CountedMetrics, MetricFlag, NumericMetricKey, Project } from "./types";

/** DefiLlama categories whose TVL sits inside another app's TVL, or is not an app at all. */
export const SNAPSHOT_TVL_EXCLUSIONS: Record<string, MetricFlag> = {
  "Risk Curators": "doublecounted",
  "Onchain Capital Allocator": "doublecounted",
  "Liquid Staking": "doublecounted",
  "Liquid Restaking": "doublecounted",
  CEX: "cex",
  "Token Locker": "locker",
};

/** "DefiLlama category Dexs" in the seed map's Notes column, for each project. */
export function seedCategories(rows: Array<Record<string, string | undefined>>): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const r of rows) {
    const project = (r["Project"] ?? "").trim();
    const hit = /DefiLlama category ([^;]+)$/.exec((r["Notes"] ?? "").trim());
    if (!project || !hit) continue;
    const set = m.get(project) ?? new Set<string>();
    set.add(hit[1].trim());
    m.set(project, set);
  }
  return m;
}

const NONE = { d7: null, d30: null, d90: null };

export function snapshotCounted(p: Pick<Project, NumericMetricKey | "otherTraction">, categories: Set<string> | undefined): { counted: CountedMetrics | null; flags: Partial<Record<NumericMetricKey, MetricFlag>> } {
  const flags: Partial<Record<NumericMetricKey, MetricFlag>> = {};
  for (const c of categories ?? []) if (SNAPSHOT_TVL_EXCLUSIONS[c] && p.tvl !== null) flags.tvl = SNAPSHOT_TVL_EXCLUSIONS[c];
  const signal = (p.otherTraction ?? "").toLowerCase();
  if (p.tvl !== null && signal.includes("curated vault tvl overlaps")) flags.tvl = "doublecounted";
  // Card and payment volume sits in the DEX volume column for 11 rows; it is not DEX trading.
  if (p.volume !== null && signal.includes("card or payment volume")) flags.volume = "outside-total";
  const values = {} as Record<NumericMetricKey, number | null>;
  for (const k of ["tvl", "volume", "fees", "revenue"] as const) values[k] = flags[k] ? null : p[k];
  const any = Object.values(values).some((v) => v !== null);
  return { counted: any ? { values, change: { tvl: NONE, volume: NONE, fees: NONE, revenue: NONE } } : null, flags };
}
