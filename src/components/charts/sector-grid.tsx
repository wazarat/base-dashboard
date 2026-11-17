"use client";

import { useMemo } from "react";
import { EmptyState } from "@/components/atlas/chart-card";
import { NOT_TRACKED } from "@/lib/coverage";
import { meta } from "@/lib/data";
import { fmtPct } from "@/lib/format";
import { FLAG_SHORT, fmtMetricValue, isMeasured, sectorLeaders } from "@/lib/sector-metrics";
import type { MetricFlag, Project } from "@/lib/types";

/** How many leaders a card lists; the sector pop-up has the full ranking. */
export const CARD_LEADERS = 3;

export interface SectorCardLeader {
  id: string;
  name: string;
  /** Headline figure with its label, for example "$16.9B" and "30d volume". Null for unmeasured sectors and for projects with no figure. */
  figure: string | null;
  label: string | null;
  /** The project's role from the dataset, shown where a sector has no traction metric. */
  role: string | null;
  flag: MetricFlag | null;
}

export interface SectorCardData {
  sector: string;
  measured: boolean;
  count: number;
  native: number;
  /** Top leaders in the current selection: by headline metric for measured sectors, by curated rank otherwise. */
  leaders: SectorCardLeader[];
}

/** Per-sector counts and leaders, largest sector first. Pure, so the card text is tested. */
export function sectorCards(projects: Project[], end: string | null = meta.live?.windowEnd ?? null): SectorCardData[] {
  const by = new Map<string, SectorCardData>();
  for (const p of projects) {
    const c = by.get(p.sector) ?? { sector: p.sector, measured: isMeasured(p), count: 0, native: 0, leaders: [] };
    c.count += 1;
    if (p.chain === "Base native") c.native += 1;
    by.set(p.sector, c);
  }
  for (const c of by.values()) {
    c.leaders = sectorLeaders(projects, c.sector, end)
      .slice(0, CARD_LEADERS)
      .map((l) => ({
        id: l.project.id,
        name: l.project.name,
        figure: l.headline?.value != null ? fmtMetricValue(l.headline.def, l.headline.value, true) : null,
        label: l.headline ? l.headline.def.short : null,
        role: c.measured ? null : l.role,
        flag: l.headline?.flag ?? null,
      }));
  }
  return Array.from(by.values()).sort((a, b) => b.count - a.count || a.sector.localeCompare(b.sector));
}

/** "45 (53%)" */
export function nativeText(c: SectorCardData): string {
  return `${c.native} (${fmtPct(c.count ? c.native / c.count : null)})`;
}

/**
 * Two stats and the top leaders per sector. Content stacks from the top, so the stats of every card
 * in a row line up and no card has a blank band under its title. Clicking the sector name opens the
 * sector pop-up with the full ranking; clicking a leader opens that project.
 */
export function SectorGrid({ projects, onSelect, onOpenProject }: { projects: Project[]; onSelect: (s: string) => void; onOpenProject: (id: string) => void }) {
  const cards = useMemo(() => sectorCards(projects), [projects]);
  if (cards.length === 0) return <EmptyState />;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map((c) => (
        <div key={c.sector} data-testid="sector-card" className="card-lit flex min-w-0 flex-col gap-3 rounded-xl border border-ink-700/60 bg-ink-900 p-4 text-sm">
          <button type="button" onClick={() => onSelect(c.sector)} className="truncate text-left font-medium leading-tight text-ink-50 underline-offset-2 hover:underline" title={c.sector}>
            {c.sector}
          </button>
          <dl className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <dt className="type-label text-ink-300">Projects</dt>
              <dd className="type-stat tabular text-ink-50">{c.count}</dd>
            </div>
            <div className="min-w-0">
              <dt className="type-label text-ink-300">Base native</dt>
              <dd className="tabular text-ink-50">
                <span className="type-stat">{c.native}</span> <span className="text-xs text-ink-300">({fmtPct(c.count ? c.native / c.count : null)})</span>
              </dd>
            </div>
          </dl>
          <div className="border-t border-ink-700/40 pt-3">
            <div className="type-label text-ink-300">Sector leaders</div>
            {c.leaders.length === 0 ? (
              <p className="mt-1 text-xs text-ink-300">none in this selection</p>
            ) : (
              <ol className="mt-1 space-y-0.5" data-testid="sector-card-leaders">
                {c.leaders.map((l, i) => (
                  <li key={l.id} className="flex items-baseline gap-2">
                    <span className="tabular w-3 shrink-0 text-xs text-ink-300">{i + 1}</span>
                    <button type="button" onClick={() => onOpenProject(l.id)} className="min-w-0 shrink truncate text-left text-ink-50 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-500/60">
                      {l.name}
                    </button>
                    {/* Right-aligned: the headline figure with its label, or the role where the sector has no traction metric. */}
                    {c.measured ? (
                      l.figure ? (
                        <span className="ml-auto shrink-0 whitespace-nowrap text-right text-xs text-ink-300" title={l.flag ? FLAG_SHORT[l.flag] : undefined}>
                          <span className="tabular text-sm font-medium text-ink-50">{l.figure}</span> {l.label}
                        </span>
                      ) : (
                        <span className="ml-auto shrink-0 text-right text-xs text-ink-300">{NOT_TRACKED}</span>
                      )
                    ) : (
                      l.role && <span className="ml-auto min-w-0 max-w-[55%] truncate text-right text-xs text-ink-300">{l.role}</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
