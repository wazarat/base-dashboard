"use client";

import { LOGIN_TITLE } from "@/components/auth/login-dialog";
import { PagePlaceholder } from "@/components/auth/page-placeholder";
import { useAccess } from "@/lib/access";
import { PUBLIC_COMPARE_MAX } from "@/lib/gate";
import { useGatedData } from "@/lib/use-gated";
import { Info, X } from "lucide-react";
import { useEffect, useMemo, type ReactNode } from "react";
import { Clamp } from "@/components/atlas/clamp";
import { InfoTip } from "@/components/atlas/info-tip";
import { MetricSegmented } from "@/components/atlas/metric-segmented";
import { chainText, PlainLabel, tierText } from "@/components/atlas/plain-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useChartMetric } from "@/lib/chart-metric";
import { compareMatrix, compareRatios, compareSentences, crossSector, suggestPeers, useCompare } from "@/lib/compare";
import { projects as allProjects, roundsForProject } from "@/lib/data";
import { useFilters, type Align } from "@/lib/filters";
import { displayUrl, fmtPct, fmtUsd, METRIC_LABEL, lowerLabel } from "@/lib/format";
import { NUMERIC_METRICS, topN } from "@/lib/metrics";
import { RED_FLAG_LABEL, redFlagTypes, securityResearched } from "@/lib/red-flags";
import { cn } from "@/lib/utils";
import { AddProjectPopover, PeerSuggestions, PresetButtons } from "./add-project";
import { CompareOverlay } from "./compare-overlay";

export function CompareView() {
  const { ids, projects, add, remove, set, isFull } = useCompare();
  const { state, setState, openProject } = useFilters();
  const [xm, setXm] = useChartMetric("xm");
  const sectors = crossSector(projects);
  // Logged out, one project is open to everyone; a comparison of two or more, and the gated rows, need a login.
  const access = useAccess();
  const { ready } = useGatedData();
  const full = access.can({ action: "project-detail" }) && ready;
  const askLogin = projects.length > PUBLIC_COMPARE_MAX && access.enabled && access.loaded && !access.signedIn;
  const { openLogin } = access;
  useEffect(() => {
    if (askLogin) openLogin("compare");
  }, [askLogin, openLogin]);
  const matrix = useMemo(() => compareMatrix(projects, allProjects, { gated: full }), [projects, full]);
  const ratios = useMemo(() => compareRatios(projects, { gated: full }), [projects, full]);
  const sentences = useMemo(() => compareSentences(projects, xm), [projects, xm]);
  const peers = projects.length === 1 ? suggestPeers(projects[0], xm, allProjects, ids) : [];

  if (projects.length === 0) {
    const top = topN(allProjects, xm, 6);
    return (
      <Card className="gap-4">
        <CardHeader>
          <h3 className="type-card-title text-ink-50">Compare projects</h3>
          <p className="text-sm text-ink-300">
            Put up to four projects side by side. Raw values with their rank and share inside their own sector, size-independent ratios, indexed trends and the funding, token, chain and security profile. Add projects from any leaderboard checkbox, the project drawer, or a preset. The selection is kept in the URL, so the comparison can be shared.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <PresetButtons onApply={set} />
          <div className="flex flex-wrap items-center gap-2">
            <AddProjectPopover exclude={ids} onAdd={add} />
            <span className="text-xs text-ink-300">or start from the largest by {lowerLabel(METRIC_LABEL[xm])}</span>
            {top.map((p) => (
              <Button key={p.id} variant="outline" size="xs" onClick={() => add(p.id)}>
                {p.name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (projects.length > PUBLIC_COMPARE_MAX && !full) {
    // The comparison in the URL loads after login; until then only shapes, never data.
    return (
      <div className="relative" data-testid={askLogin ? "login-wall" : "gated-loading"}>
        <PagePlaceholder label={askLogin ? LOGIN_TITLE : "Loading"} />
        {askLogin && !access.loginOpen && (
          <div className="absolute inset-x-0 top-24 flex justify-center">
            <Button onClick={() => openLogin("compare")} className="shadow-popover">
              {LOGIN_TITLE}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="gap-4">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {projects.map((p, i) => (
                <li key={p.id} className="inline-flex items-center gap-2 text-sm">
                  <span aria-hidden="true" className="inline-block size-2 rounded-[2px]" style={{ backgroundColor: `var(--cat-${i + 1})` }} />
                  <button type="button" onClick={() => openProject(p.id)} className="font-medium text-ink-50 underline-offset-2 hover:underline">
                    {p.name}
                  </button>
                  <PlainLabel>{tierText(p.tier)}</PlainLabel>
                  <button type="button" onClick={() => remove(p.id)} aria-label={`Remove ${p.name}`} className="rounded-md p-0.5 text-ink-300 hover:text-ink-50">
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
              <li>
                <AddProjectPopover exclude={ids} onAdd={add} disabled={isFull} />
              </li>
            </ul>
            <MetricSegmented label="Compare metric" value={xm} onChange={setXm} options={NUMERIC_METRICS} />
          </div>
          <PresetButtons onApply={set} />
          {peers.length > 0 && <PeerSuggestions peers={peers} onAdd={add} />}
          {sectors.length > 1 && (
            <p className="flex items-start gap-2 rounded-lg border border-ink-700/60 px-3 py-2 text-xs text-ink-300">
              <Info className="mt-0.5 size-3.5 shrink-0 text-ink-300" aria-hidden="true" />
              <span>
                These projects span {sectors.length} sectors ({sectors.join(", ")}). Ranks and shares below are computed inside each project&apos;s own sector; business models differ, so read the ratios as context rather than a league table.
              </span>
            </p>
          )}
          {sentences.length > 0 && (
            <ul className="space-y-1 text-sm text-ink-50">
              {sentences.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
        </CardHeader>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <h3 className="type-card-title text-ink-50">Metrics, with rank and share in sector</h3>
          <p className="text-sm text-ink-300">Each cell shows the value, the project&apos;s rank among projects in its sector that report the metric, and its share of that sector&apos;s total. The best value in each row is marked.</p>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 bg-ink-900 pl-5">Metric</TableHead>
                  {projects.map((p) => (
                    <TableHead key={p.id} className="min-w-[9rem] text-right">
                      {p.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrix.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="sticky left-0 z-10 bg-ink-900 pl-5 font-medium text-ink-50">{row.label}</TableCell>
                    {row.cells.map((c, i) => (
                      <TableCell key={projects[i].id} className={cn("tabular text-right align-top", c.best && "font-semibold text-ink-50")}>
                        <div>
                          {row.format(c.value)}
                          {c.best && <span className="type-micro ml-1 text-ink-300">best</span>}
                        </div>
                        {c.value !== null && (
                          <div className="text-[11px] font-normal text-ink-300">
                            #{c.rank} of {c.of} in {projects[i].sector.split(" ")[0]}
                            {c.share !== null && ` · ${fmtPct(c.share, 1)} of sector`}
                          </div>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <h3 className="type-card-title text-ink-50">Ratios that remove size</h3>
          <p className="text-sm text-ink-300">Efficiency and momentum measures so a $200K protocol can be read next to a $200M one.</p>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 bg-ink-900 pl-5">Ratio</TableHead>
                  {projects.map((p) => (
                    <TableHead key={p.id} className="min-w-[8rem] text-right">
                      {p.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ratios.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="sticky left-0 z-10 bg-ink-900 pl-5 font-medium text-ink-50">
                      <span className="inline-flex items-center gap-1">
                        {r.label}
                        <InfoTip label={`About ${r.label}`}>{r.info}</InfoTip>
                      </span>
                    </TableCell>
                    {r.values.map((v, i) => (
                      <TableCell key={projects[i].id} className={cn("tabular text-right", r.best[i] && "font-semibold text-ink-50")}>
                        {r.format(v)}
                        {r.best[i] && <span className="type-micro ml-1 text-ink-300">best</span>}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <CompareOverlay projects={projects} metric={xm} align={state.align as Align} onAlignChange={(align) => void setState({ align })} />

      {full && (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {projects.map((p, i) => {
          const rounds = roundsForProject(p.id);
          return (
            <Card key={p.id} className="gap-3" style={{ borderTopWidth: 3, borderTopColor: `var(--cat-${i + 1})` }}>
              <CardHeader className="gap-1">
                <h3 className="type-card-title text-ink-50">{p.name}</h3>
                <PlainLabel>{chainText(p.chain)}</PlainLabel>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-ink-50">
                <Profile label="Funding">
                  {p.fundingType}
                  {p.amountRaised && <span className="text-ink-300"> · {p.amountRaised}</span>}
                  {rounds.length > 0 && (
                    <span className="text-ink-300">
                      {" "}
                      · {rounds.length} recorded {rounds.length === 1 ? "round" : "rounds"}
                      {rounds.some((r) => r.amount) ? ` (${fmtUsd(rounds.reduce((a, r) => a + (r.amount ?? 0), 0))} disclosed)` : ""}
                    </span>
                  )}
                </Profile>
                <Profile label="Investors">{p.investors ?? <span className="text-ink-300">none recorded</span>}</Profile>
                <Profile label="Token">{p.tokenRaw ?? <span className="text-ink-300">none</span>}</Profile>
                <Profile label="Chain">
                  {p.chain}
                  {p.chainDetail && <span className="text-ink-300"> · {p.chainDetail}</span>}
                </Profile>
                <Profile label="Security">
                  {securityResearched(p) ? redFlagTypes(p).map((t) => RED_FLAG_LABEL[t]).join(", ") || "Checked, nothing found" : "Not researched"}
                  {p.audits && <span className="text-ink-300"> · {p.audits}</span>}
                  {p.incidents && <span className="text-ink-300"> · incidents recorded, {p.incidents}</span>}
                </Profile>
                <Profile label="Sources">
                  <span className="flex flex-wrap gap-x-2">
                    {[p.sourceUrl, ...p.tractionSources, p.fundingSourceUrl, p.securitySourceUrl]
                      .filter((u): u is string => Boolean(u))
                      .slice(0, 4)
                      .map((u) => (
                        <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="truncate underline-offset-2 hover:underline">
                          {displayUrl(u).split("/")[0]}
                        </a>
                      ))}
                  </span>
                </Profile>
                <Button variant="outline" size="sm" className="mt-1" onClick={() => openProject(p.id)}>
                  Open full record
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      )}
    </div>
  );
}

function Profile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="type-kicker text-ink-300">{label}</div>
      <Clamp lines={3}>{children}</Clamp>
    </div>
  );
}
