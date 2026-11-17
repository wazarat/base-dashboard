"use client";

import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useMemo } from "react";
import { EmptyState } from "@/components/atlas/chart-card";
import { FilteredNote } from "@/components/atlas/filtered-note";
import { Segmented } from "@/components/atlas/segmented";
import { SectorsMapCard } from "@/components/charts/sectors-map-card";
import { DataTable } from "@/components/explorer/data-table";
import { ExplorerSearch } from "@/components/explorer/explorer-search";
import { MoreFiltersButton, useMoreFilters } from "@/components/explorer/more-filters";
import { DownloadCsv } from "@/components/explorer/download-csv";
import { NewlyDetectedCard } from "@/components/explorer/newly-detected";
import {
  amountColumn,
  auditsColumn,
  captureColumn,
  chainColumn,
  chainDetailColumn,
  compareColumn,
  descriptionColumn,
  feesColumn,
  fundingColumn,
  investorsColumn,
  nameColumn,
  otherTractionColumn,
  redFlagsColumn,
  revenueColumn,
  stableSupplyColumn,
  tokenVolumeColumn,
  holdersColumn,
  securityColumn,
  sectorColumn,
  statusColumn,
  subcategoryColumn,
  tierColumn,
  tokenColumn,
  tvlColumn,
  viaColumn,
  volumeColumn,
  websiteColumn,
  xColumn,
} from "@/components/explorer/project-columns";
import { SubmitProjectButton } from "@/components/forms/tally-buttons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useCompare } from "@/lib/compare";
import { investors, rounds } from "@/lib/data";
import { applyMoreFilters, buildContext, describeMoreFilters } from "@/lib/explorer-filters";
import { useFilters } from "@/lib/filters";
import { parseSort, serializeSort } from "@/lib/explorer-sort";

/** The Explorer opens on the map (owner request, 2026-11-10); the table is ?view=table. */
const viewParser = parseAsStringLiteral(["map", "table"] as const).withDefault("map").withOptions({ history: "replace", clearOnDefault: true });
const sortParser = parseAsString.withOptions({ history: "replace", clearOnDefault: true });

export function ExplorerView() {
  const { filtered: base, state, openProject, reset, activeCount } = useFilters();
  const { filters: more, clear: clearMore, active: moreActive } = useMoreFilters();
  const [view, setView] = useQueryState("view", viewParser);
  const [xs, setXs] = useQueryState("xs", sortParser);
  const sorting = useMemo(() => parseSort(xs), [xs]);
  // The same list feeds the table and the map, so their counts always agree.
  // The view mounts once gated data is ready (LoginWall), so the rounds are filled in by then.
  const ctx = useMemo(() => buildContext(rounds), []);
  const filtered = useMemo(() => applyMoreFilters(base, more, ctx), [base, more, ctx]);
  const summary = describeMoreFilters(more, investors);
  const compare = useCompare();
  const compareKey = compare.ids.join(",");
  const columns = useMemo(
    () => [
      compareColumn(compare.has, compare.toggle, compare.isFull),
      nameColumn(openProject),
      sectorColumn,
      subcategoryColumn,
      chainColumn,
      chainDetailColumn,
      tierColumn,
      statusColumn,
      tvlColumn,
      volumeColumn,
      feesColumn,
      revenueColumn,
      stableSupplyColumn,
      tokenVolumeColumn,
      holdersColumn,
      captureColumn,
      otherTractionColumn,
      fundingColumn,
      investorsColumn,
      amountColumn,
      tokenColumn,
      securityColumn,
      auditsColumn,
      redFlagsColumn,
      viaColumn,
      descriptionColumn,
      websiteColumn,
      xColumn,
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openProject, compareKey, compare.isFull],
  );

  const resetAll = () => {
    reset();
    clearMore();
  };
  const toolbarLine = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {summary && (
        <span className="text-ink-300" data-testid="more-filters-summary">
          {summary}
        </span>
      )}
      {summary && (
        <button type="button" onClick={clearMore} className="text-ink-300 underline underline-offset-2 hover:text-ink-50">
          Clear all
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Card className="gap-4">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="type-card-title text-ink-50">Explorer</h3>
              <FilteredNote scope="filtered" className="block" />
              <p className="text-sm text-ink-300">Every project in the current selection. Click a name for the full record and sources. Blank cells mean Not tracked, never zero.</p>
            </div>
            <Segmented
              ariaLabel="Explorer view"
              role="tablist"
              size="sm"
              value={view}
              onChange={(v) => void setView(v)}
              options={[
                { value: "map", label: "Map" },
                { value: "table", label: "Table" },
              ]}
            />
          </div>
          <ExplorerSearch count={filtered.length} trailing={<MoreFiltersButton sectors={state.sector} />} />
          {summary && toolbarLine}
        </CardHeader>
        {filtered.length === 0 ? (
          <CardContent>
            <EmptyState message="No project matches this search and these filters." />
            <div className="mt-2 text-center">
              <button type="button" onClick={resetAll} className="text-sm text-ink-300 underline underline-offset-2 hover:text-ink-50" disabled={activeCount === 0 && moreActive === 0}>
                Reset filters
              </button>
            </div>
          </CardContent>
        ) : view === "map" ? (
          <CardContent>
            <SectorsMapCard projects={filtered} id="explorer-map" table={false} />
          </CardContent>
        ) : (
        <CardContent className="px-0">
          <DataTable
            data={filtered}
            columns={columns}
            chooser
            pageSize={50}
            dense
            sorting={sorting}
            onSortingChange={(next) => void setXs(serializeSort(next))}
            initialVisibility={{
              subcategory: false,
              chainDetail: false,
              stableSupply: false,
              tokenVolume: false,
              holders: false,
              capture: false,
              otherTraction: false,
              investors: false,
              amountRaised: false,
              token: false,
              audits: false,
              redFlags: false,
              securityFlags: false,
              description: false,
            }}
            onRowClick={(p) => openProject(p.id)}
            toolbar={
              <>
                <DownloadCsv rows={filtered} />
                <SubmitProjectButton variant="ghost" />
              </>
            }
          />
        </CardContent>
        )}
      </Card>
      <NewlyDetectedCard extra={<SubmitProjectButton />} />
    </div>
  );
}
