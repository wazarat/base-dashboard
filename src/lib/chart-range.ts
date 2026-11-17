"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback } from "react";
import { RANGES, type Range } from "./ranges";

/**
 * Per-card time range, stored in the URL under that card's own key
 * (docs/ATLAS-UI.md, section 4). There is no global range: the control sits on
 * the card it drives and every panel in that card follows it.
 *
 *   cr  chain over time
 *   ar  chain activity
 *   mr  biggest risers and fallers (Overview and Traction share it)
 *   hr  project side bar history
 *   xr  compare, indexed trend
 *   pr  stocks, premium and discount over time
 *   wr  stocks, premium by time of week
 *   dr  ticker side bar, premium section
 *
 * Cards whose data is a fixed 7, 30 or 90 day change (or a 90-day series) do not offer All.
 */
const WINDOWED = ["7d", "30d", "90d"] as const satisfies readonly Range[];

export const CHART_RANGE_OPTIONS = {
  cr: RANGES,
  ar: RANGES,
  mr: WINDOWED,
  hr: WINDOWED,
  xr: WINDOWED,
  br: WINDOWED,
  pr: RANGES,
  wr: RANGES,
  dr: RANGES,
} as const satisfies Record<string, readonly Range[]>;

export type ChartRangeKey = keyof typeof CHART_RANGE_OPTIONS;
export const CHART_RANGE_KEYS = Object.keys(CHART_RANGE_OPTIONS) as ChartRangeKey[];
export const DEFAULT_RANGE: Range = "30d";

/** Parser for one card's key. A value the card does not offer (for example `all` on a 90-day series) falls back to the default. */
export function chartRangeParser(key: ChartRangeKey) {
  return parseAsStringLiteral(CHART_RANGE_OPTIONS[key] as readonly Range[]).withDefault(DEFAULT_RANGE);
}

export function useChartRange(key: ChartRangeKey): [Range, (r: Range) => void, readonly Range[]] {
  const [value, set] = useQueryState(key, chartRangeParser(key).withOptions({ history: "replace", clearOnDefault: true }));
  const onChange = useCallback((r: Range) => void set(r), [set]);
  return [value, onChange, CHART_RANGE_OPTIONS[key]];
}
