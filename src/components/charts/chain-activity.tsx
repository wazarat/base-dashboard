"use client";

import { useMemo } from "react";
import { ChartCard } from "@/components/atlas/chart-card";
import { chainData } from "@/lib/data";
import { useChartRange } from "@/lib/chart-range";
import { fmtCompact } from "@/lib/format";
import { activityTakeaway, points } from "@/lib/takeaways";
import { levelLabel } from "@/lib/level-axis";
import { changeKey, rangeDays, sliceTail } from "@/lib/ranges";
import { MiniSeries } from "./mini-series";

const pick = (k: string, n: number) => sliceTail(chainData.activity?.[k] ?? [], n);
const pickLlama = (n: number) => sliceTail(chainData.defillama.activeUsers ?? [], n);

/**
 * Chain activity for Base from growthepie (Base publishes no Blockscout stats service), plus DefiLlama's count of
 * users across the apps it tracks. Active addresses and smart wallets are levels on a fitted axis; transactions are
 * a flow from zero.
 * Every panel follows this card's own range, and every change compares the last full day
 * with the same day n days earlier.
 */
export function ChainActivity() {
  const [range, setRange, rangeOptions] = useChartRange("ar");
  const total = chainData.dates.length;
  const n = rangeDays(range, total);
  const dates = useMemo(() => sliceTail(chainData.dates, n), [n]);
  const s = useMemo(
    () => ({
      active: pick("activeAddresses", n),
      txns: pick("txns", n),
      smartWallets: pick("smartWallets7d", n),
      appUsers: pickLlama(n),
    }),
    [n],
  );
  const latest = chainData.latest;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const accChange = latest.change.activeAccounts?.[changeKey(range)] ?? null;
  // The summary covers 7, 30 and 90 days whatever range the card shows.
  const ac = latest.change.activeAccounts;
  const takeaway =
    total === 0
      ? points("No chain activity history is loaded in this build.")
      : activityTakeaway({ activeChange: { 7: ac?.d7 ?? null, 30: ac?.d30 ?? null, 90: ac?.d90 ?? null }, active: chainData.activity?.activeAddresses ?? [], txns: chainData.activity?.txns ?? [], smartWallets: chainData.activity?.smartWallets7d ?? [] });
  const label = levelLabel(n, total);

  return (
    <ChartCard
      id="chain-activity"
      scope="chain"
      title="Chain activity"
      takeaway={takeaway}
      info="Daily active addresses and transactions on Base come from growthepie, and smart wallets active over the trailing 7 days from its 90-day file. App users are DefiLlama's count across the apps it tracks on Base. Blockscout publishes no stats service for Base. Single-day figures are for the last full UTC day, and changes compare it with the same day 7, 30 or 90 days earlier. The partial current day is left out."
      range={range}
      onRangeChange={setRange}
      rangeOptions={rangeOptions}
      table={{
        columns: [
          { key: "date", label: "Date" },
          { key: "active", label: "Active addresses", align: "right" },
          { key: "txns", label: "Transactions", align: "right" },
          { key: "smartWallets", label: "Smart wallets, 7 days", align: "right" },
          { key: "appUsers", label: "App users", align: "right" },
        ],
        rows: dates.map((d, i) => ({ date: d, active: s.active[i], txns: s.txns[i], smartWallets: s.smartWallets[i], appUsers: s.appUsers[i] })).reverse(),
        filename: "base-chain-activity.csv",
        maxRows: 400,
      }}
    >
      {({ expanded, height }) => {
        const panel = expanded ? Math.max(200, Math.floor(height / 2) - 48) : 150;
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniSeries title="Active addresses" dates={dates} values={s.active} kind="line" color="var(--cat-1)" format={fmtCompact} level rangeLabel={range === "all" ? `${days}d` : label} change={accChange} brush={expanded} height={panel} />
            <MiniSeries title="Transactions" dates={dates} values={s.txns} kind="bar" color="var(--cat-1)" format={fmtCompact} brush={expanded} height={panel} />
            <MiniSeries title="Smart wallets active in 7 days" dates={dates} values={s.smartWallets} kind="line" color="var(--cat-1)" format={fmtCompact} level rangeLabel={label} brush={expanded} height={panel} />
            <MiniSeries title="Users of tracked apps" dates={dates} values={s.appUsers} kind="line" color="var(--cat-1)" format={fmtCompact} level rangeLabel={label} brush={expanded} height={panel} />
          </div>
        );
      }}
    </ChartCard>
  );
}
