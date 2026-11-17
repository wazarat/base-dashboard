"use client";

import { useMemo } from "react";
import { ChartCard, TvlNote } from "@/components/atlas/chart-card";
import { chainData } from "@/lib/data";
import { useChartRange } from "@/lib/chart-range";
import { fmtUsd } from "@/lib/format";
import { chainTakeaway, points } from "@/lib/takeaways";
import { levelLabel } from "@/lib/level-axis";
import { rangeDays, sliceTail } from "@/lib/ranges";
import { MiniSeries } from "./mini-series";

const FLOWS = [
  { key: "volume", title: "Daily DEX volume" },
  { key: "fees", title: "Daily fees" },
  { key: "revenue", title: "Daily revenue" },
] as const;

const money = (v: unknown) => fmtUsd(v as number | null);

/** Chain TVL is a level on a fitted axis; the three flows start from zero. Every panel follows this card's own range. */
export function ChainOverTime() {
  const [range, setRange, rangeOptions] = useChartRange("cr");
  const total = chainData.dates.length;
  const n = rangeDays(range, total);
  const dates = useMemo(() => sliceTail(chainData.dates, n), [n]);
  const tvl = useMemo(() => sliceTail(chainData.defillama.tvl, n), [n]);
  const flows = useMemo(() => {
    const out = {} as Record<(typeof FLOWS)[number]["key"], Array<number | null>>;
    for (const f of FLOWS) out[f.key] = sliceTail(chainData.defillama[f.key], n);
    return out;
  }, [n]);
  // The summary covers 7, 30 and 90 days whatever range the card shows.
  const takeaway = total === 0 ? points("No chain history is loaded in this build.") : chainTakeaway(chainData.defillama);

  return (
    <ChartCard
      id="chain-over-time"
      scope="chain"
      title="Chain over time"
      takeaway={takeaway}
      info="Chain-level daily series from DefiLlama. TVL is a snapshot per day drawn on a fitted axis; DEX volume, fees and revenue are summed across every protocol on Base and start from zero. Every panel follows the range picked on this card. Flows exclude the current partial day."
      range={range}
      onRangeChange={setRange}
      rangeOptions={rangeOptions}
      adminNote={<TvlNote />}
      table={{
        columns: [
          { key: "date", label: "Date" },
          { key: "tvl", label: "TVL", align: "right", format: money },
          { key: "volume", label: "DEX volume", align: "right", format: money },
          { key: "fees", label: "Fees", align: "right", format: money },
          { key: "revenue", label: "Revenue", align: "right", format: money },
        ],
        rows: dates
          .map((d, i) => {
            const j = total - n + i;
            return { date: d, tvl: chainData.defillama.tvl[j], volume: chainData.defillama.volume[j], fees: chainData.defillama.fees[j], revenue: chainData.defillama.revenue[j] };
          })
          .reverse(),
        filename: "robinhood-chain-over-time.csv",
        maxRows: 400,
      }}
    >
      {({ expanded, height }) => {
        const panel = expanded ? Math.max(200, Math.floor(height / 2) - 48) : 150;
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniSeries title="Chain TVL" dates={dates} values={tvl} kind="line" level rangeLabel={levelLabel(n, total)} brush={expanded} height={panel} />
            {FLOWS.map((f) => (
              <MiniSeries key={f.key} title={f.title} dates={dates} values={flows[f.key]} kind="bar" brush={expanded} height={panel} />
            ))}
          </div>
        );
      }}
    </ChartCard>
  );
}
