"use client";

import { ExternalLink } from "lucide-react";
import { PlainLabel } from "@/components/atlas/plain-label";
import { ConfidenceText } from "@/components/funding/rounds-table";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { investorBy, rounds } from "@/lib/data";
import { useFilters } from "@/lib/filters";
import { fmtDate, fmtUsd } from "@/lib/format";

/** Opens from ?investor=<id>; a project opened from it stacks on top because ProjectDrawer mounts later. */
export function InvestorDrawer() {
  const { state, openInvestor, openProject } = useFilters();
  const inv = investorBy(state.investor);
  const mine = inv ? rounds.filter((r) => inv.rounds.includes(r.id)).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")) : [];
  return (
    <Sheet open={Boolean(inv)} onOpenChange={(o) => !o && openInvestor(null)}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {inv && (
          <>
            <SheetHeader className="pb-2">
              <SheetTitle className="type-title text-ink-50">{inv.name}</SheetTitle>
              <SheetDescription>
                {inv.deals} {inv.deals === 1 ? "round" : "rounds"} · led {inv.led} · {inv.totalDisclosed > 0 ? `${fmtUsd(inv.totalDisclosed)} disclosed across them` : "no disclosed amounts"} · {inv.relatedDeals} Base related
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-8">
              <section className="space-y-2">
                <h4 className="type-kicker text-ink-300">Portfolio</h4>
                <ul className="flex flex-wrap gap-1.5">
                  {inv.projects.map((p) => (
                    <li key={p.name}>
                      {p.projectId ? (
                        <Button variant="outline" size="xs" onClick={() => openProject(p.projectId)}>
                          {p.name}
                        </Button>
                      ) : (
                        <PlainLabel className="h-6 items-center" title="No project row in the Atlas">
                          {p.name}
                        </PlainLabel>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
              <Separator />
              <section className="space-y-2">
                <h4 className="type-kicker text-ink-300">Rounds</h4>
                <ul className="divide-y divide-ink-700/40 rounded-lg border border-ink-700/60 text-sm">
                  {mine.map((r) => (
                    <li key={r.id} className="space-y-0.5 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-ink-50">
                          {r.projectId ? (
                            <button type="button" onClick={() => openProject(r.projectId as string)} className="underline-offset-2 hover:underline">
                              {r.project}
                            </button>
                          ) : (
                            r.project
                          )}
                          <span className="text-ink-300"> · {r.roundType}</span>
                        </span>
                        <span className="tabular text-ink-300">{r.amount !== null ? fmtUsd(r.amount) : (r.amountNote ?? "undisclosed")}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-300">
                        <span>{r.date ? fmtDate(r.date) : "undated"}</span>
                        {r.leadInvestors.includes(inv.name) && <span>lead</span>}
                        {r.related && <span>Base related</span>}
                        <ConfidenceText confidence={r.confidence} />
                        {r.sourceUrl && (
                          <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                            source <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
