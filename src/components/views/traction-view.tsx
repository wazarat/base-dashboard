"use client";

import { parseAsArrayOf, parseAsBoolean, parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";
import { ChartCard, TvlNote } from "@/components/atlas/chart-card";
import { FilteredNote } from "@/components/atlas/filtered-note";
import { MetricSegmented } from "@/components/atlas/metric-segmented";
import { TierInfoContent } from "@/components/atlas/tier-info";
import { BusinessModelScatter, bizCounts, bizPoints } from "@/components/charts/business-model-scatter";
import { ListedVsLive } from "@/components/charts/listed-vs-live";
import { MoversPanel } from "@/components/charts/movers-panel";
import { TierBySector } from "@/components/charts/tier-by-sector";
import { DataTable } from "@/components/explorer/data-table";
import { chainColumn, holdersColumn, nameColumn, sectorColumn, stableSupplyColumn, tierColumn, tokenVolumeColumn, tvlColumn } from "@/components/explorer/project-columns";
import { MultiSelect } from "@/components/filters/multi-select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { BizWindow } from "@/lib/biz-model";
import { useChartMetric } from "@/lib/chart-metric";
import { useChartRange } from "@/lib/chart-range";
import { CHAIN_COLOR } from "@/lib/colors";
import { isLive, LIVE_DEFINITION } from "@/lib/coverage";
import { isMeasured } from "@/lib/sector-metrics";
import { useFilters } from "@/lib/filters";
import { NUMERIC_METRICS } from "@/lib/metrics";
import { changeKey } from "@/lib/ranges";
import { NATIVE_CHAINS, type NativeChain } from "@/lib/types";
import { points } from "@/lib/takeaways";

/** Native-chain types shown on the business model chart. Empty means all four. */
const chainsParser = parseAsArrayOf(parseAsString, ",").withDefault([]).withOptions({ history: "replace", clearOnDefault: true });
/** Sectors shown on the business model chart (?bs=). Empty means all. */
const sectorsParser = parseAsArrayOf(parseAsString, ",").withDefault([]).withOptions({ history: "replace", clearOnDefault: true });
/** Marker size follows TVL only when switched on (?bz=1); uniform by default. */
const sizeParser = parseAsBoolean.withDefault(false).withOptions({ history: "replace", clearOnDefault: true });

export function TractionView() {
  const { filtered, state, setState, openProject, openSector, setFacet } = useFilters();
  const [mm, setMm] = useChartMetric("mm");
  const [nc, setNc] = useQueryState("nc", chainsParser);
  const [bs, setBs] = useQueryState("bs", sectorsParser);
  const [bz, setBz] = useQueryState("bz", sizeParser);
  const [br, setBr, brOptions] = useChartRange("br");
  const win = changeKey(br) as BizWindow;
  const winLabel = br;
  // The leaderboard ranks traction, so sectors with no traction metric stay off it (docs/SECTOR-METRICS.md, section 1).
  const withTraction = useMemo(() => filtered.filter(isLive).filter(isMeasured), [filtered]);
  const official = filtered.filter((p) => p.discoveredVia.includes("Base official directory"));
  const officialLive = official.filter(isLive).length;

  // Five columns by default; the onchain columns are optional and hidden. Everything else about a project is in its modal, one click away.
  const columns = useMemo(() => [nameColumn(openProject), sectorColumn, chainColumn, tierColumn, tvlColumn, stableSupplyColumn, tokenVolumeColumn, holdersColumn], [openProject]);

  const chains = nc.filter((c): c is NativeChain => (NATIVE_CHAINS as readonly string[]).includes(c));
  const chainOptions = useMemo(() => {
    const pts = bizPoints(filtered, win, [], bs);
    return NATIVE_CHAINS.map((c) => ({ value: c, count: pts.filter((x) => x.p.chain === c).length, color: CHAIN_COLOR[c] }));
  }, [filtered, win, bs]);
  const sectorOptions = useMemo(() => {
    const pts = bizPoints(filtered, win, chains);
    const counts = new Map<string, number>();
    for (const x of pts) counts.set(x.p.sector, (counts.get(x.p.sector) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count }));
  }, [filtered, win, chains]);
  const counts = bizCounts(filtered, win, chains, bs);

  return (
    <div className="space-y-4">
      <Card className="gap-4">
        <CardHeader className="gap-2">
          <div>
            <h3 className="type-card-title text-ink-50">Leaderboard</h3>
            <FilteredNote scope="filtered" className="block" />
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <DataTable
            data={withTraction}
            columns={columns}
            initialSorting={[{ id: "tvl", desc: true }]}
            chooser
            initialVisibility={{ stableSupply: false, tokenVolume: false, holders: false }}
            pageSize={25}
            onRowClick={(p) => openProject(p.id)}
            emptyMessage="No projects with traction data in this selection."
          />
        </CardContent>
      </Card>

      <MoversPanel
        projects={filtered}
        metric={mm}
        minSize={state.minSize}
        onMinSizeChange={(minSize) => void setState({ minSize })}
        onOpen={openProject}
        metricControl={<MetricSegmented label="Movers metric" value={mm} onChange={setMm} options={NUMERIC_METRICS} />}
      />

      <ChartCard
        id="business-model"
        scope="filtered"
        title="Business model, fees against revenue"
        info={
          <div className="space-y-1.5">
            <p>
              Each marker is a project&rsquo;s {winLabel} fees against its {winLabel} revenue from DefiLlama, on log axes. Diagonal lines mark 10%, 50% and 100% revenue capture. Shape and colour both encode Native Chain.
            </p>
            <p>
              Fees and revenue are summed only over a project&rsquo;s listings that DefiLlama counts in the chain total and that report both on the same days, so a version with fees but no revenue does not pull capture down. The Base Chain row, which is sequencer income, is left out.
            </p>
            <p>
              {counts.plotted} {counts.plotted === 1 ? "project has" : "projects have"} both fees and revenue. {counts.feesOnly} {counts.feesOnly === 1 ? "reports" : "report"} fees only and {counts.feesOnly === 1 ? "is" : "are"} not plotted.
              {counts.errors > 0 && ` ${counts.errors} with revenue above fees, a data error, ${counts.errors === 1 ? "is" : "are"} left out.`}
            </p>
            <p>Markers are the same size unless Size by TVL is on. Projects with fees but no TVL are normal, for example launchpads, trading apps and NFT markets.</p>
          </div>
        }
        range={br}
        onRangeChange={setBr}
        rangeOptions={brOptions}
        adminNote={
          <>
            <TvlNote />
          </>
        }
        actions={
          <>
            <MultiSelect label="Sector" options={sectorOptions} selected={bs} onChange={(v) => void setBs(v)} />
            <MultiSelect label="Native chain" options={chainOptions} selected={chains} onChange={(v) => void setNc(v)} searchable={false} />
            <label className="flex items-center gap-2 text-xs text-ink-300">
              <Switch checked={bz} onCheckedChange={(v) => void setBz(v)} aria-label="Size by TVL" />
              Size by TVL
            </label>
          </>
        }
      >
        <BusinessModelScatter projects={filtered} win={win} chains={chains} sectors={bs} sizeByTvl={bz} onOpen={openProject} />
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          id="tier-by-sector"
          scope="filtered"
          title="Tier distribution by sector"
          adminNote={<p>Most sectors are mostly untracked; leaders cluster in DEXs, launchpads, lending and perps.</p>}
          info={<TierInfoContent showTbd={false} closing="Projects DefiLlama does not track are left out. Click a bar to open the sector." />}
        >
          <TierBySector projects={filtered} onSelect={openSector} />
        </ChartCard>
        <ChartCard
          id="listed-vs-live"
          scope="filtered"
          title="Listed vs live by discovery source"
          takeaway={points(official.length > 0 ? `Only ${officialLive} of the ${official.length} projects in the Base official directory are live.` : "How many projects from each discovery source are live.")}
          info={`Projects grouped by where they were found, against how many are live. ${LIVE_DEFINITION} Click a bar to filter by that source.`}
        >
          <ListedVsLive projects={filtered} onSelect={(v) => setFacet("via", [v])} />
        </ChartCard>
      </div>
    </div>
  );
}
