"use client";

import { useFilters } from "@/lib/filters";
import { cn } from "@/lib/utils";

/**
 * Honest filter scope for a card (docs/ATLAS-UI.md, section 4). Filtered cards
 * show the active count; whole-chain cards carry no note (owner, 2026-11-09).
 */
export function FilteredNote({ scope, className }: { scope: "filtered" | "chain"; className?: string }) {
  const { activeCount } = useFilters();
  if (scope === "chain" || activeCount === 0) return null;
  return (
    <span className={cn("type-label text-ink-300", className)}>
      Filtered, {activeCount} {activeCount === 1 ? "filter" : "filters"} active
    </span>
  );
}
