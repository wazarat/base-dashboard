"use client";

import { LoginPanel } from "@/components/auth/login-dialog";
import { useAccess } from "@/lib/access";
import { useGatedData } from "@/lib/use-gated";
import { ExternalLink } from "lucide-react";
import { chainText, PlainLabel, tierText } from "@/components/atlas/plain-label";
import { Separator } from "@/components/ui/separator";
import { AtlasModal } from "@/components/atlas/atlas-modal";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useChartMetric } from "@/lib/chart-metric";
import { leadersBySector, meta } from "@/lib/data";
import { CARD_LEADERS } from "@/components/charts/sector-grid";
import { NOT_TRACKED } from "@/lib/coverage";
import { FLAG_SHORT, fmtMetricValue, sectorConfig, sectorHeadlineDef, sectorLeaders } from "@/lib/sector-metrics";
import { useFilters } from "@/lib/filters";
import { displayUrl, fmtMetric, METRIC_SHORT } from "@/lib/format";
import { metricValue, sumMetric } from "@/lib/metrics";
import { subcategoryMembers } from "@/lib/treemap";
import { isLive } from "@/lib/coverage";
import { OnchainLines } from "@/components/atlas/onchain-lines";
import { FilteredNote } from "@/components/atlas/filtered-note";

/** A sector's ranked leaders and every other project, as the shared centred modal (?sectorDrawer=, ?sectorSub=). */
export function SectorModal() {
  const { state, setState, openSector, filtered, activeCount } = useFilters();
  // Opening a project replaces this modal rather than stacking a second one on top.
  const openProject = (id: string | null) => void setState({ sectorDrawer: null, sectorSub: null, project: id });
  const [metric] = useChartMetric("tm");
  const sector = state.sectorDrawer;
  // The pop-up follows the active filters like every chart (owner request, 2026-11-10); a subcategory scope narrows it further.
  const sub = sector ? state.sectorSub : null;
  const open = Boolean(sector);
  const { ready } = useGatedData();
  const full = useAccess().can({ action: "project-detail" }) && ready;
  const narrowed = Boolean(sub) || activeCount > 0;
  const inSector = sector ? (sub ? subcategoryMembers(filtered, sector, sub) : filtered.filter((p) => p.sector === sector)) : [];
  const scopeIds = new Set(inSector.map((p) => p.id));
  // Leaders rank by the sector's headline metric (curated rank where the sector has none, or a project has no figure yet); the
  // curated file still supplies each leader's reason and evidence link (docs/SECTOR-METRICS.md).
  const cfg = sector ? sectorConfig(sector) : null;
  const headlineDef = sector ? sectorHeadlineDef(sector) : null;
  const curated = new Map((sector ? leadersBySector.get(sector) ?? [] : []).filter((l) => l.projectId && scopeIds.has(l.projectId)).map((l) => [l.projectId as string, l]));
  const leaders = (sector ? sectorLeaders(inSector, sector, meta.live?.windowEnd ?? null) : []).slice(0, Math.max(CARD_LEADERS, curated.size));
  const leaderIds = new Set(leaders.map((l) => l.project.id));
  const rest = inSector
    .filter((p) => !leaderIds.has(p.id))
    .sort((a, b) => (metricValue(b, metric) ?? -1) - (metricValue(a, metric) ?? -1) || a.name.localeCompare(b.name));
  const native = inSector.filter((p) => p.chain === "Base native").length;
  const live = inSector.filter(isLive).length;

  return (
    <AtlasModal open={open} onOpenChange={(o) => !o && openSector(null)} testId="sector-modal" width="narrow">
        {sector && !full && (
          // Leaders and sector metrics are gated: logged out, the pop-up names the sector and asks for login.
          <div className="space-y-4 pr-8">
            <DialogTitle className="type-title text-ink-50">{sub ? `${sector}, ${sub}` : sector}</DialogTitle>
            <DialogDescription className="text-ink-300">{inSector.length} {inSector.length === 1 ? "project" : "projects"} in this selection.</DialogDescription>
            <LoginPanel trigger="sector" />
          </div>
        )}
        {sector && full && (
          <>
            <header className="space-y-2 pr-8">
              <DialogTitle className="type-title text-ink-50">{sub ? `${sector}, ${sub}` : sector}</DialogTitle>
              <FilteredNote scope="filtered" className="block" />
              <DialogDescription className="text-ink-300">
                {inSector.length} projects · {native} Base-native · {live} with traction
                {metric !== "count" && <> · {METRIC_SHORT[metric]} {fmtMetric(metric, sumMetric(inSector, metric))}</>}
              </DialogDescription>
              {sub && (
                <div>
                  <button type="button" onClick={() => openSector(sector)} className="text-xs text-ink-300 underline underline-offset-2 hover:text-ink-50">
                    Show all of {sector}
                  </button>
                </div>
              )}
            </header>
            <div className="mt-5 space-y-5">
              {(!narrowed || leaders.length > 0) && (
                <>
                  <section className="space-y-2">
                    <h4 className="type-kicker text-ink-300">Ranked leaders</h4>
                    {leaders.length === 0 && <p className="text-sm text-ink-300">No ranked leaders recorded for this sector.</p>}
                    {cfg?.measured && headlineDef && <p className="text-xs text-ink-300">Ranked by {headlineDef.short}. {headlineDef.info}</p>}
                    <ol className="space-y-2" data-testid="sector-leaders">
                      {leaders.map((l, i) => {
                        const c = curated.get(l.project.id);
                        return (
                          <li key={l.project.id} className="rounded-lg border border-ink-700/60 p-3 text-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="tabular text-xs font-semibold text-ink-300">#{i + 1}</span>
                                  <button type="button" className="font-medium text-ink-50 underline-offset-2 hover:underline" onClick={() => openProject(l.project.id)}>
                                    {l.project.name}
                                  </button>
                                  <span className="type-label text-ink-300">{c?.status ?? l.project.status}</span>
                                </div>
                                {c?.why && <p className="mt-1 text-ink-300">{c.why}</p>}
                                {l.project.onchain && <OnchainLines o={l.project.onchain} max={1} className="mt-1.5 space-y-1" />}
                              </div>
                              {/* The figure the ranking uses, with its label; a role where the sector has no traction metric. */}
                              <div className="shrink-0 text-right">
                                {cfg?.measured ? (
                                  l.headline?.value != null ? (
                                    <>
                                      <div className="tabular font-display text-base font-semibold text-ink-50">{fmtMetricValue(l.headline.def, l.headline.value, true)}</div>
                                      <div className="text-xs text-ink-300">{l.headline.def.short}</div>
                                      {l.headline.flag && <div className="text-xs text-ink-300">{FLAG_SHORT[l.headline.flag]}</div>}
                                    </>
                                  ) : (
                                    <div className="text-xs text-ink-300">{NOT_TRACKED}</div>
                                  )
                                ) : (
                                  l.role && <div className="max-w-40 text-xs text-ink-300">{l.role}</div>
                                )}
                              </div>
                            </div>
                            {c && (c.website || c.evidenceUrl) && (
                              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                                {c.website && (
                                  <a href={c.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ink-50 underline-offset-2 hover:underline">
                                    {displayUrl(c.website)} <ExternalLink className="size-3 text-ink-300" />
                                  </a>
                                )}
                                {c.evidenceUrl && (
                                  <a href={c.evidenceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ink-300 underline-offset-2 hover:underline">
                                    Evidence <ExternalLink className="size-3" />
                                  </a>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                  <Separator />
                </>
              )}
              <section className="space-y-2">
                <h4 className="type-kicker text-ink-300">{narrowed && leaders.length === 0 ? "Projects" : "All other projects"} ({rest.length})</h4>
                <ul className="divide-y divide-ink-700/40 rounded-lg border border-ink-700/60">
                  {rest.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => openProject(p.id)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-ink-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-500/60"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium text-ink-50">{p.name}</span>
                          <PlainLabel>
                            {chainText(p.chain, true)}
                            <span className="hidden sm:inline">, {tierText(p.tier)}</span>
                          </PlainLabel>
                        </span>
                        <span className="tabular shrink-0 text-xs text-ink-300">{metric === "count" ? p.statusGroup : fmtMetric(metric, p[metric])}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        )}
    </AtlasModal>
  );
}
