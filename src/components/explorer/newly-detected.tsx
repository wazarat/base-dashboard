"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { newlyDetected } from "@/lib/data";
import { fmtDate, fmtUsd } from "@/lib/format";

/** Protocols DefiLlama lists on Base that are not in the Atlas yet. Review only; never auto-added. */
export function NewlyDetectedCard({ extra }: { extra?: React.ReactNode }) {
  const [showAll, setShowAll] = useState(false);
  const items = newlyDetected.items;
  if (!items.length) return null;
  const shown = showAll ? items : items.slice(0, 12);
  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="type-card-title text-ink-50">Coming to CanHav Base Ecosystem Atlas</h3>
          {extra}
        </div>
        <p className="text-sm text-ink-300">
          Protocols active on Base that we’re reviewing before adding them to the Atlas.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((i) => (
            <li key={i.slug} className="flex items-center justify-between gap-3 border-b border-ink-700/40 py-1 last:border-0">
              <span className="flex min-w-0 items-center gap-2">
                <a href={i.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate font-medium text-ink-50 underline-offset-2 hover:underline">
                  <span className="truncate">{i.name}</span>
                  <ExternalLink className="size-3 shrink-0 text-ink-300" />
                </a>
                <span className="hidden truncate text-xs text-ink-300 md:inline">{i.category}</span>
              </span>
              <span className="tabular shrink-0 text-xs text-ink-300" title={`First seen ${fmtDate(i.firstSeen)}`}>
                {i.tvl > 0 ? fmtUsd(i.tvl) : "no TVL"}
              </span>
            </li>
          ))}
        </ul>
        {items.length > 12 && (
          <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show fewer" : `Show all ${items.length}`}
          </Button>
        )}
        {newlyDetected.unmatchedCsv.length > 0 && (
          <p className="mt-3 text-xs text-ink-300">
            Atlas projects with research metrics but no DefiLlama mapping are {newlyDetected.unmatchedCsv.join(", ")}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
