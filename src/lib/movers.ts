import type { MinSize, Range } from "./filters";
import { countedValue } from "./metrics";
import { changeKey } from "./ranges";
import type { MetricKey, NumericMetricKey, Project } from "./types";

export const MIN_SIZE_LABEL: Record<MinSize, string> = {
  any: "Any size",
  "250k": "TVL ≥ $250K or fees ≥ $10K",
  "1m": "TVL ≥ $1M or fees ≥ $50K",
  "10m": "TVL ≥ $10M or fees ≥ $500K",
};

const MIN_SIZE_RULE: Record<MinSize, { tvl: number; fees: number }> = {
  any: { tvl: 0, fees: 0 },
  "250k": { tvl: 250_000, fees: 10_000 },
  "1m": { tvl: 1_000_000, fees: 50_000 },
  "10m": { tvl: 10_000_000, fees: 500_000 },
};

/** Size on counted values only, so CEX deposits, lockers and double counts never qualify a project. */
export function passesMinSize(p: Project, size: MinSize): boolean {
  if (size === "any") return true;
  const r = MIN_SIZE_RULE[size];
  return (countedValue(p, "tvl") ?? 0) >= r.tvl || (countedValue(p, "fees") ?? 0) >= r.fees;
}

/** Smallest starting value a mover may have, whatever the size filter says, so a tiny base cannot read as a four-digit percent. */
export const MIN_PRIOR: Record<NumericMetricKey, number> = { tvl: 250_000, volume: 250_000, fees: 10_000, revenue: 10_000 };

/** The value at the start of the window must be at least the size threshold (a higher size filter raises it). */
export function priorFloor(metric: NumericMetricKey, size: MinSize): number {
  const r = MIN_SIZE_RULE[size];
  const base = metric === "tvl" || metric === "volume" ? r.tvl : r.fees;
  return Math.max(MIN_PRIOR[metric], base);
}

export interface Mover {
  project: Project;
  change: number;
  value: number;
  /** Dollar change over the window, value minus the starting value. */
  delta: number;
}

export interface Movers {
  metric: NumericMetricKey;
  window: ReturnType<typeof changeKey>;
  risers: Mover[];
  fallers: Mover[];
  eligible: number;
}

/**
 * Biggest risers and fallers on the selected metric over the range's window, on
 * counted values (CEX deposits, token lockers and double counts left out), after a
 * size filter and a starting-value floor.
 */
export function movers(projects: Project[], metric: MetricKey, range: Range, size: MinSize, limit = 5): Movers {
  const m: NumericMetricKey = metric === "count" ? "tvl" : metric;
  const key = changeKey(range);
  const rows: Mover[] = [];
  for (const p of projects) {
    if (!p.counted || !passesMinSize(p, size)) continue;
    const change = p.counted.change[m][key];
    const value = countedValue(p, m);
    if (change === null || value === null || value <= 0) continue;
    const prior = value / (1 + change);
    if (prior < priorFloor(m, size)) continue;
    rows.push({ project: p, change, value, delta: value - prior });
  }
  const sorted = [...rows].sort((a, b) => b.change - a.change);
  return {
    metric: m,
    window: key,
    risers: sorted.filter((r) => r.change > 0).slice(0, limit),
    fallers: sorted
      .filter((r) => r.change < 0)
      .reverse()
      .slice(0, limit),
    eligible: rows.length,
  };
}
