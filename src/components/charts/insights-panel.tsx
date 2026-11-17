"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { FilteredNote } from "@/components/atlas/filtered-note";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { chainData, memoInsights, meta } from "@/lib/data";
import { useFilters } from "@/lib/filters";
import { generateInsights } from "@/lib/insights";
import { useGatedData } from "@/lib/use-gated";
import { countedMetricValue } from "@/lib/metrics";
import { SHOW_NOTES } from "@/lib/notes";
import type { MetricKey, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

export function InsightsPanel({ projects, metric }: { projects: Project[]; metric: MetricKey; total?: number }) {
  const { activeCount } = useFilters();
  // With filters on, shares compare against the selection's own total, never the whole chain (owner request, 2026-11-10).
  const filteredView = activeCount > 0;
  const { ready, version } = useGatedData();
  const live = useMemo(
    () =>
      generateInsights(projects, metric, {
        value: countedMetricValue,
        total: filteredView ? undefined : { tvl: chainData.latest.tvl, volume: chainData.latest.volume30d, fees: chainData.latest.fees30d, revenue: chainData.latest.revenue30d },
        // Without the gated facts, only the build's whole-list counts can be stated.
        ...(ready ? {} : { research: filteredView ? null : meta.research }),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, metric, filteredView, ready, version],
  );
  const [open, setOpen] = useState(false);

  return (
    <Card className="gap-4">
      <CardHeader>
        <h3 className="type-card-title text-ink-50">Live insights</h3>
        <FilteredNote scope="filtered" className="block" />
        <p className="text-xs text-ink-300">
          Computed from the {filteredView ? "current selection" : "full dataset"}. They change as you filter, and the metric follows the sectors chart.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {live.map((i) => (
            <li key={i.id} className="flex gap-2">
              <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ink-400" />
              <span>{i.text}</span>
            </li>
          ))}
        </ul>
        {/* Hand-written notes from the research memo, admin-only (src/lib/notes.ts). The computed list above is public. */}
        {SHOW_NOTES && (
          <Collapsible data-admin-note="" open={open} onOpenChange={setOpen} className="mt-4 rounded-lg border border-ink-700/60">
            <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-ink-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-500/60">
              <span>
                Analyst notes <span className="font-normal text-ink-300">· {memoInsights.length} curated insights, {meta.asOfLabel}</span>
              </span>
              <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ol className="space-y-2 border-t border-ink-700/40 px-3 py-3 text-sm">
                {memoInsights.map((m) => (
                  <li key={m.n} className="flex gap-2">
                    <span className="tabular w-5 shrink-0 text-ink-300">{m.n}.</span>
                    <span>
                      <span className="font-medium">{m.title}.</span> {m.text.slice(m.title.length + 1).trim()}
                    </span>
                  </li>
                ))}
              </ol>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
