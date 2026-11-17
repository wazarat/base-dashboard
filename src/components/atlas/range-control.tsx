"use client";

import { RANGE_LABEL, RANGES, type Range } from "@/lib/ranges";
import { Segmented } from "./segmented";

/** The 7d / 30d / 90d / All control of one card. `label` names the card, so several on a page stay distinguishable. */
export function RangeControl({ value, onChange, options = RANGES, label, className }: { value: Range; onChange: (r: Range) => void; options?: readonly Range[]; label: string; className?: string }) {
  return <Segmented size="sm" ariaLabel={label} value={value} onChange={onChange} options={options.map((r) => ({ value: r, label: RANGE_LABEL[r] }))} className={className} />;
}
