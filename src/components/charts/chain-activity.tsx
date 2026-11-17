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

const pick = (k: string, n: number) => sliceTail(chainData.blockscout[k] ?? [], n);

/**
 * Explorer counts from the Blockscout stats service. Active accounts and smart-wallet
 * operations are levels on a fitted axis; new accounts and transactions are flows from zero.
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
      active: pick("activeAccounts", n),
      newAccounts: pick("newAccounts", n),
      txns: pick("newTxns", n),
      userOps: pick("newUserOps", n),
      aaWallets: pick("activeAccountAbstractionWallets", n),
      newContracts: pick("newContracts", n),
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
      : activityTakeaway({ activeChange: { 7: ac?.d7 ?? null, 30: ac?.d30 ?? null, 90: ac?.d90 ?? null }, newAccounts: chainData.blockscout.newAccounts ?? [], txns: chainData.blockscout.newTxns ?? [], userOps: chainData.blockscout.newUserOps ?? [] });
  const label = levelLabel(n, total);

  return (
    <ChartCard
      id="chain-activity"
      scope="chain"
      title="Chain activity"
      takeaway={takeaway}
      info="Daily chain-level counts from the Blockscout stats service for Base, covering active and new accounts, transactions, and account-abstraction user operations and wallets. Single-day figures are for the last full UTC day, and changes compare it with the same day 7, 30 or 90 days earlier to match the range picked on this card. Active accounts and user operations are drawn on a fitted axis. The partial current day is left out."
      range={range}
      onRangeChange={setRange}
      rangeOptions={rangeOptions}
      table={{
        columns: [
          { key: "date", label: "Date" },
          { key: "active", label: "Active accounts", align: "right" },
          { key: "newAccounts", label: "New accounts", align: "right" },
          { key: "txns", label: "Transactions", align: "right" },
          { key: "userOps", label: "User ops", align: "right" },
          { key: "aaWallets", label: "Active smart wallets", align: "right" },
          { key: "newContracts", label: "New contracts", align: "right" },
        ],
        rows: dates.map((d, i) => ({ date: d, active: s.active[i], newAccounts: s.newAccounts[i], txns: s.txns[i], userOps: s.userOps[i], aaWallets: s.aaWallets[i], newContracts: s.newContracts[i] })).reverse(),
        filename: "robinhood-chain-activity.csv",
        maxRows: 400,
      }}
    >
      {({ expanded, height }) => {
        const panel = expanded ? Math.max(200, Math.floor(height / 2) - 48) : 150;
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniSeries title="Active accounts" dates={dates} values={s.active} kind="line" color="var(--cat-1)" format={fmtCompact} level rangeLabel={range === "all" ? `${days}d` : label} change={accChange} brush={expanded} height={panel} />
            <MiniSeries title="New accounts" dates={dates} values={s.newAccounts} kind="bar" color="var(--cat-1)" format={fmtCompact} brush={expanded} height={panel} />
            <MiniSeries title="Transactions" dates={dates} values={s.txns} kind="line" color="var(--cat-1)" format={fmtCompact} brush={expanded} height={panel} />
            <MiniSeries title="Smart-wallet user operations" dates={dates} values={s.userOps} kind="line" color="var(--cat-1)" format={fmtCompact} level rangeLabel={label} brush={expanded} height={panel} />
          </div>
        );
      }}
    </ChartCard>
  );
}
