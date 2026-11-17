import type { ReactNode } from "react";
import { InfoTip } from "./info-tip";

/** Marks an approximate figure in words, with the reason one click away. */
export function EstimateLabel({ note, children }: { note: string; children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 align-baseline">
      {children}
      <span className="text-ink-300">(estimate)</span>
      <InfoTip label="Why this is an estimate">{note}</InfoTip>
    </span>
  );
}
