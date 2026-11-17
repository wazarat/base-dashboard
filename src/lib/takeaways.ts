/**
 * Card takeaways (pure, so the wording is tested). They show only in a card's expanded view
 * (owner request, 2026-11-10): time-based cards give a table of each metric over 7, 30 and
 * 90 days, other cards give short points. Every number is computed; no point carries a date.
 */
import { fmtCompact, fmtDateShort, fmtPctSigned, fmtUsd } from "./format";
import { rangeStats } from "./level-axis";

export const SUMMARY_WINDOWS = [7, 30, 90] as const;
export const SUMMARY_LABELS = SUMMARY_WINDOWS.map((n) => `${n}d`);

export interface TakeawayTable {
  /** Column headers after the metric column, e.g. 7d, 30d, 90d. */
  columns: string[];
  rows: Array<{ label: string; values: string[] }>;
}

/** A card's takeaway: an optional lead line, short points, and an optional metric table. */
export interface Takeaway {
  lead?: string;
  points: string[];
  table?: TakeawayTable;
}

const avg = (values: Array<number | null>): number | null => {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

const tail = <T>(arr: T[], n: number): T[] => (n >= arr.length ? arr : arr.slice(arr.length - n));
const pct = (v: number | null) => (v === null ? "none" : fmtPctSigned(v));
const usd = (v: number | null) => (v === null ? "none" : fmtUsd(v));
const count = (v: number | null) => (v === null ? "none" : fmtCompact(v));

/** First-to-last change of a level over the last n days, the same rule as the stats line under each panel. */
export function levelChange(values: Array<number | null>, n: number): number | null {
  return rangeStats(tail(values, n))?.change ?? null;
}

export function dailyAverage(values: Array<number | null>, n: number): number | null {
  return avg(tail(values, n));
}

/** Chain over time: TVL change and the daily average of each flow, over 7, 30 and 90 days. */
export function chainTakeaway(s: { tvl: Array<number | null>; volume: Array<number | null>; fees: Array<number | null>; revenue: Array<number | null> }): Takeaway {
  const w = SUMMARY_WINDOWS;
  return {
    points: [],
    table: {
      columns: SUMMARY_LABELS,
      rows: [
        { label: "Chain TVL change", values: w.map((n) => pct(levelChange(s.tvl, n))) },
        { label: "Daily DEX volume, average", values: w.map((n) => usd(dailyAverage(s.volume, n))) },
        { label: "Daily fees, average", values: w.map((n) => usd(dailyAverage(s.fees, n))) },
        { label: "Daily revenue, average", values: w.map((n) => usd(dailyAverage(s.revenue, n))) },
      ],
    },
  };
}

/** Chain activity: active-account change, daily averages of new accounts and transactions, and the smart-wallet change. */
export function activityTakeaway(s: { activeChange: Record<7 | 30 | 90, number | null>; active: Array<number | null>; txns: Array<number | null>; smartWallets: Array<number | null>; lastDay?: string | null }): Takeaway {
  const w = SUMMARY_WINDOWS;
  const lastActive = [...s.active].reverse().find((v) => v !== null) ?? null;
  const lastTxns = [...s.txns].reverse().find((v) => v !== null) ?? null;
  const avgActive = dailyAverage(s.active, 30);
  const avgTxns = dailyAverage(s.txns, 30);
  const points: string[] = [];
  if (s.lastDay && lastActive !== null && lastTxns !== null) points.push(`On ${fmtDateShort(s.lastDay)}, the last full day, ${count(lastActive)} addresses were active and ${count(lastTxns)} transactions landed.`);
  if (avgActive !== null && avgTxns !== null) points.push(`Over the last 30 days that averaged ${count(avgActive)} active addresses and ${count(avgTxns)} transactions a day.`);
  return {
    points,
    table: {
      columns: SUMMARY_LABELS,
      rows: [
        { label: "Active addresses change", values: w.map((n) => pct(s.activeChange[n])) },
        { label: "Active addresses a day, average", values: w.map((n) => count(dailyAverage(s.active, n))) },
        { label: "Transactions a day, average", values: w.map((n) => count(dailyAverage(s.txns, n))) },
        { label: "Smart wallets active in 7 days, change", values: w.map((n) => pct(levelChange(s.smartWallets, n))) },
      ],
    },
  };
}

/** Split a generated sentence list into points, one per insight. */
export function points(...sentences: Array<string | null | undefined | false>): Takeaway {
  return { points: sentences.filter((s): s is string => Boolean(s)) };
}
