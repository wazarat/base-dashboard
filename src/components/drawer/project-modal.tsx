"use client";

import { ExternalLink, GitCompareArrows } from "lucide-react";
import type { ReactNode } from "react";
import { ChangeCell } from "@/components/atlas/change-cell";
import { Clamp } from "@/components/atlas/clamp";
import { AtlasModal } from "@/components/atlas/atlas-modal";
import { LoginPanel } from "@/components/auth/login-dialog";
import { chainText, PlainLabel } from "@/components/atlas/plain-label";
import { TierInfoTip } from "@/components/atlas/tier-info";
import { OnchainLines } from "@/components/atlas/onchain-lines";
import { tierLabel } from "@/lib/tier";
import { blockAsOf, MetricCell, MetricTrio } from "@/components/atlas/sector-metric-rows";
import { blockMetrics, isMeasured, LENDING_BRIEFS, LENDING_TRIO, type ResolvedMetric } from "@/lib/sector-metrics";
import { HistoryChart } from "@/components/charts/history-chart";
import { PeerSuggestions } from "@/components/compare/add-project";
import { SuggestCorrectionButton } from "@/components/forms/tally-buttons";
import { ConfidenceText } from "@/components/funding/rounds-table";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAccess } from "@/lib/access";
import { useGatedData } from "@/lib/use-gated";
import { suggestPeers, useCompare } from "@/lib/compare";
import { events, meta, projectById, roundsForProject } from "@/lib/data";
import { useFilters } from "@/lib/filters";
import { displayUrl, fmtDate, fmtUsd, fmtUsdFull, xUrl } from "@/lib/format";
import { similarProjects } from "@/lib/metrics";
import { RED_FLAG_LABEL, redFlagTypes, securityResearched } from "@/lib/red-flags";
import { isDirectSource, NO_DIRECT_SOURCE } from "@/lib/sources";
import type { MetricSource, NumericMetricKey, Project } from "@/lib/types";
import { useEventDialog } from "@/lib/use-event";

function Field({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-0.5 text-sm">
      <dt className="text-ink-300">{label}</dt>
      <dd className="min-w-0 break-words text-ink-50">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="type-kicker text-ink-300">{title}</h4>
      <dl className="space-y-1.5">{children}</dl>
    </section>
  );
}

function Ext({ href, children }: { href: string; children?: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-ink-50 underline decoration-ink-500 underline-offset-2 hover:decoration-ink-50">
      <span className="truncate">{children ?? displayUrl(href)}</span>
      <ExternalLink className="size-3 shrink-0 text-ink-300" />
    </a>
  );
}


const CHANGE_WINDOWS = [
  { key: "d7", label: "7d" },
  { key: "d30", label: "30d" },
  { key: "d90", label: "90d" },
] as const;

/** Where a traction figure comes from and, for daily ones, its change over 7, 30 and 90 days. */
function Src({ p, k }: { p: Project; k: NumericMetricKey }) {
  const s: MetricSource = p.metricSource?.[k] ?? "none";
  if (s === "none") return null;
  const change = s === "live" ? p.live?.change[k] : undefined;
  const windows = CHANGE_WINDOWS.filter((w) => change?.[w.key] !== null && change?.[w.key] !== undefined);
  return (
    <>
      <span className="ml-2 text-xs text-ink-300">{s === "live" ? "daily" : "snapshot"}</span>
      {windows.length > 0 && (
        <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-300">
          {windows.map((w) => (
            <span key={w.key} className="inline-flex items-center gap-1">
              {w.label} <ChangeCell value={change?.[w.key] ?? null} />
            </span>
          ))}
        </span>
      )}
    </>
  );
}

/**
 * Project detail as a centred modal (docs/ATLAS-UI.md, section 3), opened by ?project=<id> from any page.
 * Header, Overview and Traction on the left, the history chart on the right, then the rest full width.
 */
export function ProjectModal() {
  const { state, openProject, all } = useFilters();
  const p = projectById(state.project);
  return (
    <AtlasModal open={Boolean(p)} onOpenChange={(o) => !o && openProject(null)} testId="project-modal">
      {p && <ProjectBody p={p} all={all} onOpen={openProject} />}
    </AtlasModal>
  );
}

/** Traction rows a logged-out reader sees: the core DefiLlama figures and revenue capture. */
const PUBLIC_TRACTION_ROWS = ["tvl", "volume", "fees", "revenue", "capture"];

function ProjectBody({ p, all, onOpen }: { p: Project; all: Project[]; onOpen: (id: string) => void }) {
  // Logged out (login wall on), the pop-up shows the header, Overview and Traction; the rest sits behind one login panel.
  // Full detail also needs the gated data itself, fetched once the reader is signed in.
  const { ready } = useGatedData();
  const full = useAccess().can({ action: "project-detail" }) && ready;
  const similar = similarProjects(all, p, "tvl", 5);
  const compare = useCompare();
  const inCompare = compare.has(p.id);
  const peers = inCompare && compare.ids.length === 1 ? suggestPeers(p, "tvl", all, compare.ids) : [];
  const myRounds = roundsForProject(p.id);
  // Traction, Financials and Facts render from the sector metric registry, so each sector shows its own rows (docs/SECTOR-METRICS.md).
  const end = meta.live?.windowEnd ?? null;
  const measured = isMeasured(p);
  const traction = measured ? blockMetrics(p, "traction", end) : [];
  // Logged out, Traction keeps the core rows; sector metric rows come with the gated data.
  const shown = full ? traction : traction.filter((r) => PUBLIC_TRACTION_ROWS.includes(r.def.id));
  const trio = full && p.sector === "Lending & Credit" ? LENDING_TRIO.map((id) => traction.find((r) => r.def.id === id)).filter((r): r is ResolvedMetric => Boolean(r)) : [];
  const tractionRows = shown.filter((r) => !trio.includes(r));
  const tractionAsOf = blockAsOf(traction);
  const facts = measured || !full ? [] : blockMetrics(p, "facts", end);
  const factsAsOf = blockAsOf(facts);
  const financials = blockMetrics(p, "financials", end);
  const finAsOf = blockAsOf(financials);
  const hasFin = Boolean(p.live) && financials.some((r) => r.state !== "not-tracked" && !["fees30", "protocolRevenue"].includes(r.def.id));
  const hasOnchain = Boolean(p.onchain && p.onchain.signals.length > 0);
  const otherSignal = p.otherTraction ? (
    <>
      {p.signal?.older ? (
        <details>
          <summary className="cursor-pointer text-ink-300 underline underline-offset-2">Older figure</summary>
          <Clamp lines={3}>{p.otherTraction}</Clamp>
        </details>
      ) : (
        <Clamp lines={3}>{p.otherTraction}</Clamp>
      )}
      {p.signal && (
        <span className="block text-xs text-ink-300" data-testid="signal-date">
          as of {fmtDate(p.signal.asOf)}
          {!p.signal.dated && ", the day of the dataset snapshot"}
        </span>
      )}
    </>
  ) : null;
  const related = events.filter((e) => e.projectIds.includes(p.id));
  const { openEvent } = useEventDialog();
  const researched = securityResearched(p);
  const flags = redFlagTypes(p).map((t) => RED_FLAG_LABEL[t]);
  const sources = [
    ...p.tractionSources.map((u) => ({ label: "Traction source", url: u })),
    { label: "Funding source", url: p.fundingSourceUrl },
    { label: "Security source", url: p.securitySourceUrl },
  ].filter((s): s is { label: string; url: string } => isDirectSource(s.url));

  return (
    <div className="space-y-6">
      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
      <div className="min-w-0 space-y-5">
      <header className="space-y-2 pr-8">
        <PlainLabel>
          {p.sector}, {p.chain}
        </PlainLabel>
        <DialogTitle className="type-title text-ink-50">{p.name}</DialogTitle>
        <DialogDescription className="text-ink-300">{p.description}</DialogDescription>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {p.website && <Ext href={p.website} />}
          {p.xHandle && <Ext href={xUrl(p.xHandle)}>{p.xHandle}</Ext>}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            variant={inCompare ? "secondary" : "outline"}
            size="sm"
            className="gap-1"
            onClick={() => compare.toggle(p.id)}
            disabled={!inCompare && compare.isFull}
            title={!inCompare && compare.isFull ? "Compare holds up to 4 projects" : undefined}
          >
            <GitCompareArrows className="size-3.5" /> {inCompare ? "In compare" : "Add to compare"}
          </Button>
          <SuggestCorrectionButton projectName={p.name} />
        </div>
        {peers.length > 0 && <PeerSuggestions peers={peers} onAdd={compare.add} />}
      </header>

        <Section title="Overview">
          <Field label="Sector">
            {p.sector}
            {p.subcategory && <span className="text-ink-300"> · {p.subcategory}</span>}
          </Field>
          <Field label="Native chain">
            {p.chain}
            {p.chainDetail && <span className="text-ink-300"> · {p.chainDetail}</span>}
            <span className="text-ink-300"> · {p.chainConfidence.toLowerCase()} confidence</span>
          </Field>
          <Field label="Status">{p.status}</Field>
          {unverifiedNote(p) && (
            <Field label="Unverified">
              <span className="text-ink-300">{unverifiedNote(p)}</span>
            </Field>
          )}
          {p.leaderRank !== null && (
            <Field label="Sector rank">
              #{p.leaderRank} in {p.sector}
            </Field>
          )}
          {!measured && (
            <Field label="Tier">
              <span className="inline-flex items-center gap-1">
                {tierLabel(p.tier)}
                <TierInfoTip />
              </span>
            </Field>
          )}
        </Section>

        <Separator />

        {measured ? (
          <Section title="Traction">
            <Field label="Tier">
              <span className="inline-flex items-center gap-1">
                {tierLabel(p.tier)}
                <TierInfoTip />
              </span>
              {(p.live || p.onchain) && p.snapshot.tier !== p.tier && <span className="text-ink-300"> · was {p.snapshot.tier.replace(/ - .*/, "")} in the {fmtDate(p.snapshot.asOf)} snapshot</span>}
            </Field>
            {trio.length > 0 && <MetricTrio rows={trio} briefs={LENDING_BRIEFS} sharedAsOf={tractionAsOf} />}
            {tractionRows.map((r) => (
              <Field key={r.def.id} label={r.def.label}>
                <MetricCell r={r} sharedAsOf={tractionAsOf} after={r.def.core ? <Src p={p} k={r.def.core} /> : undefined} />
              </Field>
            ))}
            <Field label="Other signal">{otherSignal}</Field>
            <Field label="Onchain">{hasOnchain && p.onchain ? <OnchainLines o={p.onchain} /> : null}</Field>
            {tractionAsOf && <p className="text-xs text-ink-300">Figures as of {fmtDate(tractionAsOf)} unless a row says otherwise.</p>}
            {!p.hasTraction && <p className="text-xs text-ink-300">DefiLlama lists no TVL, volume, fee or revenue figure for this project. Not tracked means a coverage gap, not zero.</p>}
            {p.live && (
              <p className="text-xs text-ink-300">
                Daily figures cover complete UTC days up to {fmtDate(p.live.asOf)} and sum {p.live.slugs.length === 1 ? "one DefiLlama listing" : `${p.live.slugs.length} DefiLlama listings`} ({p.live.slugs.join(", ")}).
              </p>
            )}
          </Section>
        ) : (
          (facts.length > 0 || otherSignal || hasOnchain) && (
            // Sectors with no traction metric show their facts with no Traction heading and no tier ranking.
            <Section title="On Base">
              {facts.map((r) => (
                <Field key={r.def.id} label={r.def.label}>
                  <MetricCell r={r} sharedAsOf={factsAsOf} />
                </Field>
              ))}
              <Field label="Other signal">{otherSignal}</Field>
              <Field label="Onchain">{hasOnchain && p.onchain ? <OnchainLines o={p.onchain} /> : null}</Field>
              {factsAsOf && <p className="text-xs text-ink-300">Figures as of {fmtDate(factsAsOf)} unless a row says otherwise.</p>}
            </Section>
          )
        )}

      </div>
      <div className="min-w-0">
        {!full ? (
          <LoginPanel trigger="project" />
        ) : p.live ? (
          <Section title="History">
            <HistoryChart projectId={p.id} height={300} />
          </Section>
        ) : (
          <Section title="History">
            <p className="text-sm text-ink-300">DefiLlama has no daily history for this project.</p>
          </Section>
        )}
      </div>
      </div>

      {full && (
      <div className="space-y-5">
        <Separator />

        {hasFin && (
          <>
            <Section title="Financials">
              {financials.map((r) => (
                <Field key={r.def.id} label={r.def.label}>
                  <MetricCell r={r} sharedAsOf={finAsOf} />
                </Field>
              ))}
              <p className="text-xs text-ink-300">
                30-day sums from DefiLlama fee breakdowns{finAsOf ? `, as of ${fmtDate(finAsOf)}` : ""}. Incentives and emissions not included (paid source).
              </p>
            </Section>
            <Separator />
          </>
        )}

        <Section title="Funding">
          <Field label="Funding type">
            {p.fundingType}
            {p.fundingType === "Not researched" && <span className="text-ink-300"> · never checked</span>}
            {p.fundingType === "Not disclosed" && <span className="text-ink-300"> · checked, nothing found</span>}
          </Field>
          <Field label="Investors">{p.investors && <Clamp lines={3}>{p.investors}</Clamp>}</Field>
          <Field label="Amount raised">{p.amountRaised}</Field>
          <Field label="Token">{p.tokenRaw}</Field>
          {myRounds.length > 0 && (
            <Field label="Rounds">
              <ul className="space-y-1">
                {myRounds.map((r) => (
                  <li key={r.id} className="text-sm">
                    <span className="font-medium">{r.roundType}</span>
                    <span className="text-ink-300">
                      {" "}
                      · {r.date ? fmtDate(r.date) : "undated"} · {r.amount !== null ? fmtUsdFull(r.amount) : (r.amountNote ?? "undisclosed")}
                    </span>
                    {r.leadInvestors.length > 0 && <span className="text-ink-300"> · led by {r.leadInvestors.join(", ")}</span>}
                    <span className="ml-1 inline-flex items-center gap-1 align-middle">
                      <ConfidenceText confidence={r.confidence} />
                      {r.sourceUrl && <Ext href={r.sourceUrl}>source</Ext>}
                    </span>
                  </li>
                ))}
              </ul>
            </Field>
          )}
        </Section>

        <Separator />

        <Section title="Security facts">
          <Field label="Checked">{researched ? "Researched in the security pass" : <span className="text-ink-300">Not researched</span>}</Field>
          <Field label="Audits">{p.audits ? <Clamp lines={3}>{p.audits}</Clamp> : researched ? <span className="text-ink-300">None found in the sources checked</span> : null}</Field>
          <Field label="Incidents">{p.incidents ? <Clamp lines={3}>{p.incidents}</Clamp> : researched ? <span className="text-ink-300">None found</span> : null}</Field>
          <Field label="Research notes">{p.redFlags && <Clamp lines={3}>{p.redFlags}</Clamp>}</Field>
          <Field label="Flags">{researched ? (flags.length ? flags.join(", ") : <span className="text-ink-300">Checked, nothing found</span>) : null}</Field>
          {researched && <p className="text-xs text-ink-300">Facts from the research pass with their sources below. Flags are keyword matches on these notes, not a rating.</p>}
        </Section>

        <Separator />

        <Section title="Sources">
          {sources.length === 0 && <p className="text-sm text-ink-300">{NO_DIRECT_SOURCE}.</p>}
          {sources.map((s, i) => (
            <Field key={`${s.url}-${i}`} label={s.label}>
              <Ext href={s.url} />
            </Field>
          ))}
        </Section>

        {related.length > 0 && (
          <>
            <Separator />
            <Section title="Events">
              {related.map((e) => (
                <div key={e.id} className="text-sm">
                  <span className="text-ink-300">{e.date}</span> · {e.type} ·{" "}
                  <button type="button" onClick={() => openEvent(e.id)} className="text-left text-ink-50 underline decoration-ink-500 underline-offset-2 hover:decoration-ink-50">
                    {e.title}
                  </button>
                </div>
              ))}
            </Section>
          </>
        )}

        {similar.length > 0 && (
          <>
            <Separator />
            <section className="space-y-2">
              <h4 className="type-kicker text-ink-300">Similar projects</h4>
              <p className="text-xs text-ink-300">Same sector, closest by TVL.</p>
              <ul className="divide-y divide-ink-700/40 rounded-lg border border-ink-700/60">
                {similar.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(s.id)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-ink-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-500/60"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-ink-50">{s.name}</span>
                        <PlainLabel>{chainText(s.chain, true)}</PlainLabel>
                      </span>
                      <span className="tabular text-ink-300">{fmtUsd(s.tvl)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
      )}
    </div>
  );
}

/** A quiet note for rows the research did not re-check: prior-knowledge rows and low-confidence native chain calls. */
export function unverifiedNote(p: Pick<Project, "discoveredVia" | "chainConfidence">): string | null {
  const parts: string[] = [];
  if (/prior knowledge/i.test(p.discoveredVia)) parts.push("Listed from prior knowledge and not re-checked against a source");
  if (p.chainConfidence === "Low") parts.push("Native chain set from the name and description, not confirmed");
  return parts.length ? `${parts.join(". ")}.` : null;
}
