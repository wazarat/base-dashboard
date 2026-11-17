"use client";

import { METRIC_SHORT } from "@/lib/format";
import type { MetricKey } from "@/lib/types";
import { Segmented } from "./segmented";

/** Small per-chart metric picker. Each chart names its own control, so the label says which chart it drives. */
export function MetricSegmented<M extends MetricKey>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: M;
  onChange: (m: M) => void;
  options: readonly M[];
  label: string;
  className?: string;
}) {
  return <Segmented size="sm" ariaLabel={label} value={value} onChange={onChange} options={options.map((m) => ({ value: m, label: METRIC_SHORT[m] }))} className={className} />;
}
