"use client";

import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { AtlasModal } from "@/components/atlas/atlas-modal";
import { Clamp } from "@/components/atlas/clamp";
import { chainText } from "@/components/atlas/plain-label";
import { DataTable, makeColumnHelper } from "@/components/explorer/data-table";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { displayAmount, displayInvestors } from "@/lib/backer-filters";
import { fundingColor } from "@/lib/colors";
import { projects as allProjects, rounds as allRounds } from "@/lib/data";
import { useFilters } from "@/lib/filters";
import { displayUrl, fmtDate, fmtPct, fmtUsd } from "@/lib/format";
import { FUNDING_DEFINITIONS, fundingCounts, projectsOfType, typesInBucket } from "@/lib/funding";
import { aggregateInvestors } from "@/lib/rounds";
import { isDirectSource } from "@/lib/sources";
import type { Project } from "@/lib/types";
import { useFundingType } from "@/lib/use-funding-type";
import { RoundsTable } from "./rounds-table";
import { FilteredNote } from "@/components/atlas/filtered-note";

const h = makeColumnHelper<Project & { latestRound: string | null }>();

/**
 * One funding type in the shared centred modal (?fundingType=). Opened from a donut slice or a legend
 * row; it never filters the page on its own. "Filter the atlas to this type" applies the old facet.
 * Counts and shares follow the active filters, like the donut (owner request, 2026-11-10).
 */
export function FundingTypeModal() {
  const { fundingType, openFundingType } = useFundingType();
  const { setState, filtered } = useFilters();
  const members = useMemo(() => (fundingType ? projectsOfType(filtered, fundingType) : []), [fundingType, filtered]);
  const open = Boolean(fundingType) && projectsOfType(allProjects, fundingType ?? "").length > 0;
  const ids = useMemo(() => new Set(members.map((p) => p.id)), [members]);
  const rounds = useMemo(() => allRounds.filter((r) => r.projectId && ids.has(r.projectId)), [ids]);
  const rows = useMemo(
    () =>
      members.map((p) => {
        const dates = rounds.filter((r) => r.projectId === p.id && r.date).map((r) => r.date as string);
        return { ...p, latestRound: dates.length ? dates.sort().at(-1)! : null };
      }),
    [members, rounds],
  );
  const backers = useMemo(() => aggregateInvestors(rounds).slice(0, 10), [rounds]);
  const disclosed = fundingCounts(filtered).disclosed;
  const total = rounds.reduce((a, r) => a + (r.amount ?? 0), 0);
  const withAmount = rounds.filter((r) => r.amount !== null).length;

  // Opening a project replaces this modal rather than stacking a second one.
  const openProject = (id: string) => {
    openFundingType(null);
    void setState({ project: id });
  };

  const columns = useMemo(
    () => [
      h.accessor("name", {
        header: "Project",
        cell: ({ row }) => (
          <button type="button" onClick={(e) => { e.stopPropagation(); openProject(row.original.id); }} className="text-left font-medium text-ink-50 underline-offset-2 hover:underline">
            {row.original.name}
          </button>
        ),
        sortFn: "alphanumeric",
      }),
      h.accessor("sector", { header: "Sector", cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue()}</span>, meta: { hideBelow: "sm" } }),
      h.accessor("chain", { header: "Native chain", cell: ({ getValue }) => <span className="whitespace-nowrap text-ink-300">{chainText(getValue(), true)}</span>, meta: { hideBelow: "md" } }),
      h.accessor((p) => displayInvestors(p.investors) ?? undefined, {
        id: "investors",
        header: "Investors",
        sortUndefined: "last",
        cell: ({ getValue }) => (getValue() ? <Clamp lines={2} className="block max-w-xs whitespace-normal text-xs">{getValue() as string}</Clamp> : <span className="text-xs text-ink-300">none</span>),
        meta: { hideBelow: "md" },
      }),
      h.accessor((p) => displayAmount(p.amountRaised) ?? undefined, {
        id: "amount",
        header: "Amount raised",
        sortUndefined: "last",
        cell: ({ getValue }) => (getValue() ? <span className="block w-32 whitespace-normal text-xs">{getValue() as string}</span> : <span className="text-xs text-ink-300">undisclosed</span>),
      }),
      h.accessor((p) => p.latestRound ?? undefined, {
        id: "latestRound",
        header: "Latest round",
        sortUndefined: "last",
        cell: ({ getValue }) => (getValue() ? <span className="whitespace-nowrap">{fmtDate(getValue() as string)}</span> : <span className="text-ink-300">none</span>),
        meta: { hideBelow: "sm" },
      }),
      h.display({
        id: "source",
        header: "Source",
        cell: ({ row }) => {
          const url = row.original.fundingSourceUrl;
          return isDirectSource(url) ? (
            <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline">
              {displayUrl(url).split("/")[0]} <ExternalLink className="size-3 text-ink-300" />
            </a>
          ) : (
            <span className="text-xs text-ink-300">none</span>
          );
        },
        meta: { hideBelow: "lg" },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <AtlasModal open={open} onOpenChange={(o) => !o && openFundingType(null)} testId="funding-type-modal">
      {fundingType && (
        <div className="space-y-6">
          <header className="space-y-2 pr-8">
            <p className="type-label inline-flex items-center gap-1.5 text-ink-300">
              <span aria-hidden className="size-2.5 rounded-[2px]" style={{ backgroundColor: fundingColor(fundingType) }} />
              Funding type
            </p>
            <DialogTitle className="type-title text-ink-50">{fundingType}</DialogTitle>
            <FilteredNote scope="filtered" className="block" />
            <DialogDescription className="text-ink-300">{FUNDING_DEFINITIONS[fundingType] ?? "Projects whose primary funding type is this one."}</DialogDescription>
            <dl className="grid grid-cols-3 gap-3 pt-2 sm:max-w-lg">
              <div>
                <dt className="type-label text-ink-300">Projects</dt>
                <dd className="type-stat tabular text-ink-50">{members.length}</dd>
              </div>
              <div>
                <dt className="type-label text-ink-300">Share of disclosed</dt>
                <dd className="type-stat tabular text-ink-50">{fundingType === "Not disclosed" ? "none" : fmtPct(members.length / Math.max(1, disclosed))}</dd>
              </div>
              <div>
                <dt className="type-label text-ink-300">Disclosed in rounds</dt>
                <dd className="type-stat tabular text-ink-50">{withAmount ? fmtUsd(total) : "none"}</dd>
              </div>
            </dl>
            <div className="pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  openFundingType(null);
                  void setState({ funding: typesInBucket(allProjects, fundingType) });
                }}
              >
                Filter the atlas to this type
              </Button>
            </div>
          </header>

          <section className="space-y-2">
            <h4 className="type-kicker text-ink-300">Projects</h4>
            <div className="-mx-4 sm:-mx-6">
              <DataTable data={rows} columns={columns} initialSorting={[{ id: "latestRound", desc: true }]} pageSize={15} dense onRowClick={(p) => openProject(p.id)} emptyMessage="No projects of this type." />
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="type-kicker text-ink-300">Rounds ({rounds.length})</h4>
            {rounds.length === 0 ? (
              <p className="text-sm text-ink-300">No rounds recorded for these projects.</p>
            ) : (
              <div className="-mx-4 sm:-mx-6">
                <RoundsTable rounds={rounds} onOpenProject={openProject} pageSize={10} dense />
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h4 className="type-kicker text-ink-300">Top backers</h4>
            {backers.length === 0 ? (
              <p className="text-sm text-ink-300">No named backers in the rounds file for these projects.</p>
            ) : (
              <ol className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {backers.map((b) => (
                  <li key={b.id} className="flex items-baseline justify-between gap-3 border-b border-ink-700/40 py-1">
                    <span className="truncate text-ink-50">{b.name}</span>
                    <span className="tabular shrink-0 text-xs text-ink-300">
                      {b.deals} {b.deals === 1 ? "round" : "rounds"}
                      {b.led > 0 && `, led ${b.led}`}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </AtlasModal>
  );
}
