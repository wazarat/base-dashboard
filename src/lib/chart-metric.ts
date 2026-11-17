"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback } from "react";
import { NUMERIC_METRICS } from "./metrics";
import { METRICS, type MetricKey, type NumericMetricKey } from "./types";

/**
 * Per-chart metric choice, stored in the URL under that chart's own key
 * (docs/ATLAS-UI.md, section 4). There is no global metric switcher.
 *
 *   tm  sectors treemap, sector bars, sector cards, sector drawer, insights (Projects allowed)
 *   cm  concentration curve
 *   mm  biggest risers and fallers (Overview and Traction share it)
 *   xm  compare page sentences, peers and the indexed overlay
 */
const numeric = parseAsStringLiteral(NUMERIC_METRICS).withDefault("tvl");

export const CHART_METRIC_PARSERS = {
  tm: parseAsStringLiteral(METRICS).withDefault("count"),
  cm: numeric,
  mm: numeric,
  xm: numeric,
} as const;

export type ChartMetricKey = keyof typeof CHART_METRIC_PARSERS;
export const CHART_METRIC_KEYS = Object.keys(CHART_METRIC_PARSERS) as ChartMetricKey[];

type ValueOf<K extends ChartMetricKey> = K extends "tm" ? MetricKey : NumericMetricKey;

export function useChartMetric<K extends ChartMetricKey>(key: K): [ValueOf<K>, (m: ValueOf<K>) => void] {
  const [value, set] = useQueryState(key, (CHART_METRIC_PARSERS[key] as unknown as typeof numeric).withOptions({ history: "replace", clearOnDefault: true }));
  const onChange = useCallback((m: ValueOf<K>) => void set(m as unknown as NumericMetricKey), [set]);
  return [value as unknown as ValueOf<K>, onChange];
}
