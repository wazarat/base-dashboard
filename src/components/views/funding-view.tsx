"use client";

import { parseAsString, parseAsStringLiteral, useQueryState, useQueryStates } from "nuqs";
import { useEffect, useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartCard, EmptyState } from "@/components/atlas/chart-card";
import { ChartTable } from "@/components/atlas/chart-table";
import { TipProps, TooltipFrame, TooltipRow } from "@/components/atlas/chart-tooltip";
import { Clamp } from "@/components/atlas/clamp";
import { FilteredNote } from "@/components/atlas/filtered-note";
import { InfoTip } from "@/components/atlas/info-tip";
import { Segmented } from "@/components/atlas/segmented";
import { ROUNDS_QUARTER_INFO, RoundsQuarterChart, roundsByQuarter, roundsQuarterNote, roundsQuarterTable } from "@/components/charts/rounds-over-time";
import { backerParsers, BackersTable } from "@/components/funding/backers-table";
import { RoundsTable } from "@/components/funding/rounds-table";
import { Card, CardSection } from "@/components/ui/card";
import { activeBackerFilterCount } from "@/lib/backer-filters";
import { EVENT_COLOR } from "@/lib/colors";
import { events, rounds } from "@/lib/data";
import { useFilters } from "@/lib/filters";
import { fmtDate, fmtPct, fmtUsd } from "@/lib/format";
import { FUNDING_DEFINITIONS, fundingCounts, fundingSlices, type FundingCounts, type FundingSlice } from "@/lib/funding";
import { filterFlow, FLOW_ALL, flowTypes, moneyFlow, ROUND_FLOW_TYPE } from "@/lib/money-flow";
import { useEventDialog } from "@/lib/use-event";
import { useFundingType } from "@/lib/use-funding-type";

/** Money flow type filter (?mf=). */
const flowParser = parseAsString.withDefault(FLOW_ALL).withOptions({ history: "replace", clearOnDefault: true });
/** Which data the right-hand box shows (?fv=). Unset means money flow, or backers when a link carries backers filters. */
const FUNDING_VIEWS = ["flow", "rounds", "backers"] as const;
type FundingViewKey = (typeof FUNDING_VIEWS)[number];
const boxParser = parseAsStringLiteral(FUNDING_VIEWS).withOptions({ history: "replace" });
/** How the money flow view is drawn (?mv=): the item list, or funding by quarter as a chart or a table. */
const FLOW_MODES = ["list", "chart", "table"] as const;
type FlowMode = (typeof FLOW_MODES)[number];
const modeParser = parseAsStringLiteral(FLOW_MODES).withDefault("list").withOptions({ history: "replace", clearOnDefault: true });
const ROUND_DOT = "var(--neon-500)";
/** Rows per page for the tables inside the box, so a page of rows stays close to one screen. */
const BOX_PAGE_SIZE = 15;
/** The box is three quarters of the row, so the rounds table opens without its Base column (the money flow view covers that); the column chooser brings it back. */
const ROUNDS_BOX_COLUMNS = { related: false };

const VIEW_TITLE: Record<FundingViewKey, string> = {
  flow: "Ecosystem money flow",
  rounds: "Funding rounds",
  backers: "Disclosed backers per project",
};

export function FundingView() {
  const { filtered, openProject, openInvestor, activeCount } = useFilters();
  const { openEvent } = useEventDialog();
  const { openFundingType } = useFundingType();
  const [mf, setMf] = useQueryState("mf", flowParser);
  const [fv, setFv] = useQueryState("fv", boxParser);
  const [mode, setMode] = useQueryState("mv", modeParser);
  const [backerFilters] = useQueryStates(backerParsers);
  // A link that carries backers filters but no view (links shared before the box existed) opens on the backers table.
  const linkedToBackers = fv === null && activeBackerFilterCount(backerFilters) > 0;
  const view: FundingViewKey = fv ?? (linkedToBackers ? "backers" : "flow");
  useEffect(() => {
    // Pin the inferred view, so clearing the backers filters does not switch the box away from the table.
    if (linkedToBackers) void setFv("backers");
  }, [linkedToBackers, setFv]);

  const visibleRounds = useMemo(() => {
    if (!activeCount) return rounds;
    const ids = new Set(filtered.map((p) => p.id));
    return rounds.filter((r) => r.projectId && ids.has(r.projectId));
  }, [filtered, activeCount]);
  const sourced = visibleRounds.filter((r) => r.confidence === "Sourced").length;
  const quarterRows = useMemo(() => roundsByQuarter(visibleRounds), [visibleRounds]);

  const counts = useMemo(() => fundingCounts(filtered), [filtered]);
  const slices = useMemo(() => fundingSlices(filtered), [filtered]);

  const flow = useMemo(() => moneyFlow(events, rounds), []);
  const flowOptions = useMemo(() => flowTypes(flow), [flow]);
  const flowType = flowOptions.some((o) => o.type === mf) ? mf : FLOW_ALL;
  const flowItems = useMemo(() => filterFlow(flow, flowType), [flow, flowType]);

  // The money flow list covers the whole chain; everything else in the box follows the active filters.
  const followsFilters = view !== "flow" || mode !== "list";

  return (
    <div className="grid gap-4 xl:grid-cols-4 xl:items-start">
      <ChartCard
        id="funding-type"
        scope="filtered"
        title="Funding type"
        info={`Each disclosed project counts once, by its primary funding type. ${counts.notDisclosed} ${counts.notDisclosed === 1 ? "project is" : "projects are"} Not disclosed and stay out of the donut. ${FUNDING_DEFINITIONS["Not disclosed"]} Click a slice or a type to see its projects, rounds and backers.`}
      >
        {({ expanded, height }) => <FundingDonut slices={slices} counts={counts} height={expanded ? Math.max(260, height - 160) : 200} onSelect={openFundingType} />}
      </ChartCard>

      {/* One box, three views, so the rounds and backers tables need no scrolling to reach (owner request, 2026-11-10). */}
      <Card className="min-w-0 xl:col-span-3" data-testid="funding-box">
        <CardSection className="space-y-3">
          <div className="max-w-full overflow-x-auto">
            <Segmented
              ariaLabel="Funding data"
              role="tablist"
              value={view}
              onChange={(v) => void setFv(v)}
              options={[
                { value: "flow", label: "Money flow", title: VIEW_TITLE.flow },
                { value: "rounds", label: "Rounds", title: VIEW_TITLE.rounds },
                { value: "backers", label: "Backers", title: VIEW_TITLE.backers },
              ]}
            />
          </div>
          <div>
            <h3 className="type-card-title text-ink-50">{VIEW_TITLE[view]}</h3>
            {followsFilters && <FilteredNote scope="filtered" className="block" />}
            <p className="text-sm text-ink-300">
              {view === "flow" && mode === "list" && "Programs, strategic investments and incentives from the events file, plus Base related awards and investments from the rounds file. Newest first."}
              {view === "flow" && mode !== "list" && "Disclosed funding per quarter across every round in the rounds file, stacked by round type."}
              {view === "rounds" && `Individual rounds, awards and strategic cheques from the rounds file. ${sourced} are backed by a linked source, ${visibleRounds.length - sourced} come from prior knowledge and are tagged re-verify. Click a project or an investor to open it.`}
              {view === "backers" && "Projects with named backers or a stated amount. Amounts are as written in the source and may be lifetime totals rather than a single round. Click a row to open the project."}
            </p>
          </div>
          {view === "flow" && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {mode === "list" ? (
                <div className="max-w-full overflow-x-auto">
                  <Segmented
                    ariaLabel="Money flow type"
                    size="sm"
                    value={flowType}
                    onChange={(v) => void setMf(v)}
                    options={flowOptions.map((o) => ({
                      value: o.type,
                      label: (
                        <>
                          {o.type} <span className="tabular text-ink-300">{o.count}</span>
                        </>
                      ),
                    }))}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <h4 className="type-label text-ink-300">Disclosed funding by quarter</h4>
                  <InfoTip label="About funding by quarter">{ROUNDS_QUARTER_INFO}</InfoTip>
                </div>
              )}
              <Segmented<FlowMode>
                ariaLabel="Money flow view"
                role="tablist"
                size="sm"
                className="ml-auto"
                value={mode}
                onChange={(v) => void setMode(v)}
                options={[
                  { value: "list", label: "List" },
                  { value: "chart", label: "Chart" },
                  { value: "table", label: "Table" },
                ]}
              />
            </div>
          )}
        </CardSection>

        {view === "flow" && mode === "list" && (
          <CardSection className="grid gap-2 sm:grid-cols-2" data-testid="money-flow">
            {flowItems.length === 0 && <EmptyState message={`No ${flowType.toLowerCase()} items recorded yet.`} />}
            {flowItems.map((e) => (
              <div key={e.id} className="flex flex-col rounded-lg border border-ink-700/60 p-3 text-sm transition-colors hover:border-neon-500/60">
                <div className="flex items-start justify-between gap-3">
                  <span className="type-label inline-flex flex-wrap items-center gap-x-1.5 text-ink-300">
                    <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: e.type === ROUND_FLOW_TYPE ? ROUND_DOT : EVENT_COLOR[e.type as keyof typeof EVENT_COLOR] }} />
                    {e.type}
                    <span className="tabular">{e.date ? fmtDate(e.date) : "undated"}</span>
                  </span>
                  <span className="tabular shrink-0 font-display text-base font-semibold text-ink-50">{e.amount !== null ? fmtUsd(e.amount) : "undisclosed"}</span>
                </div>
                <div className="mt-1 font-medium leading-snug text-ink-50">
                  <button
                    type="button"
                    onClick={() => (e.eventId ? openEvent(e.eventId) : e.projectId ? openProject(e.projectId) : undefined)}
                    className="text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-500/60"
                  >
                    {e.title}
                  </button>
                </div>
                {e.detail && (
                  <Clamp lines={3} className="mt-1 text-xs text-ink-300">
                    {e.detail}
                  </Clamp>
                )}
              </div>
            ))}
          </CardSection>
        )}

        {view === "flow" && mode !== "list" && (
          <CardSection className="space-y-3" data-testid="funding-by-quarter">
            {mode === "chart" ? <RoundsQuarterChart rows={quarterRows} /> : <ChartTable spec={roundsQuarterTable(quarterRows)} />}
            <p className="text-xs text-ink-300">{roundsQuarterNote(visibleRounds)}</p>
          </CardSection>
        )}

        {view === "rounds" && (
          <CardSection className="px-0 py-4">
            <RoundsTable
              rounds={visibleRounds}
              onOpenProject={openProject}
              onOpenInvestor={(name) =>
                openInvestor(
                  name
                    .toLowerCase()
                    .replace(/\s*\(.*?\)\s*/g, " ")
                    .trim()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-+|-+$/g, ""),
                )
              }
              pageSize={BOX_PAGE_SIZE}
              dense
              chooser
              initialVisibility={ROUNDS_BOX_COLUMNS}
            />
          </CardSection>
        )}

        {view === "backers" && (
          <CardSection className="px-0 py-4">
            <BackersTable projects={filtered} onOpenProject={openProject} pageSize={BOX_PAGE_SIZE} />
          </CardSection>
        )}
      </Card>
    </div>
  );
}

function FundingDonut({ slices, counts, height, onSelect }: { slices: FundingSlice[]; counts: FundingCounts; height: number; onSelect: (k: string) => void }) {
  if (counts.disclosed === 0) return <EmptyState message="No project in this selection has disclosed funding." />;
  return (
    <div className="space-y-4">
      <div className="relative w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="92%"
              paddingAngle={1}
              stroke="var(--ink-900)"
              strokeWidth={2}
              isAnimationActive={false}
              onClick={(d) => {
                const name = (d as unknown as { name?: string })?.name ?? (d as unknown as { payload?: FundingSlice })?.payload?.name;
                if (name) onSelect(name);
              }}
              style={{ cursor: "pointer" }}
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip allowEscapeViewBox={{ x: false, y: false }} wrapperStyle={{ pointerEvents: "none", zIndex: 10 }} content={<DonutTip total={counts.disclosed} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="type-stat text-ink-50">{counts.disclosed}</span>
          <span className="type-label text-ink-300">disclosed</span>
        </div>
      </div>
      {/* Three aligned columns: swatch and type, project count, share; tabular figures on the same lines at every width. */}
      <ul className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 text-sm" aria-label="Funding types" data-testid="funding-legend">
        {slices.map((s) => (
          <li key={s.name} className="col-span-3 grid grid-cols-subgrid">
            <button type="button" onClick={() => onSelect(s.name)} className="col-span-3 grid grid-cols-subgrid items-center rounded-md py-1 text-left hover:bg-ink-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-500/60">
              <span className="inline-flex min-w-0 items-center gap-2 text-ink-50">
                <span aria-hidden="true" className="inline-block size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: s.color }} />
                <span className="truncate underline-offset-2 hover:underline">{s.name}</span>
              </span>
              <span className="tabular text-right text-ink-50">{s.value}</span>
              <span className="tabular w-10 text-right text-ink-300">{fmtPct(s.value / counts.disclosed)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DonutTip({ active, payload, total }: TipProps<FundingSlice> & { total: number }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TooltipFrame title={d.name}>
      <TooltipRow label="Projects" value={`${d.value} (${fmtPct(d.value / total)} of disclosed)`} />
    </TooltipFrame>
  );
}
