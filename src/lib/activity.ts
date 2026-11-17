/**
 * Per-project onchain activity from the keyed Blockscout snapshots (pure).
 * Daily transactions come from the capped transaction backfill where it exists
 * and from day-over-day differences of the counter snapshots otherwise.
 */
import { isFungibleRole } from "./contract-roles";
import { addDays, type DateStr } from "./dates";
import type { ContractActivity, Series } from "./history-types";
import { sumWindow, valueAt } from "./live";

export type CounterRow = [DateStr, number | null, number | null, number | null];
export type TokenRow = [DateStr, number | null, number | null, number | null, number | null];

export interface ActivityStore {
  counters: Record<string, CounterRow[]>;
  tokens: Record<string, TokenRow[]>;
  activity: Record<string, ContractActivity>;
}

export interface ContractRef {
  address: string;
  role: string;
}

/** Daily transaction counts for one address: backfilled days first, counter differences fill the rest. */
export function dailyTxns(address: string, store: ActivityStore): Series {
  const m = new Map<DateStr, number>();
  for (const [d, txns] of store.activity[address]?.days ?? []) m.set(d, txns);
  const rows = (store.counters[address] ?? []).filter((r) => r[1] !== null);
  for (let i = 1; i < rows.length; i++) {
    const [d, cur] = rows[i];
    const [pd, prev] = rows[i - 1];
    if (cur === null || prev === null) continue;
    // Snapshot taken on day d covers transactions up to that moment; attribute the difference to the day before (the last complete day).
    const day = addDays(d, -1);
    if (day !== pd && day > pd) continue; // gap of more than a day: cannot attribute
    if (!m.has(day)) m.set(day, Math.max(0, cur - prev));
  }
  return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

export function dailySenders(address: string, store: ActivityStore): Series {
  return (store.activity[address]?.days ?? []).map((d) => [d[0], d[2]] as [DateStr, number]);
}

export function sumByDate(list: Series[]): Series {
  const m = new Map<DateStr, number>();
  for (const s of list) for (const [d, v] of s) m.set(d, (m.get(d) ?? 0) + v);
  return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

export interface ProjectActivity {
  txns: Series;
  senders: Series;
  txns24h: number | null;
  txns7d: number | null;
  uniqueSenders7d: number | null;
  holders: number | null;
  activityAsOf: DateStr | null;
  skippedLarge: boolean;
}

export function projectActivity(contracts: ContractRef[], store: ActivityStore, end: DateStr): ProjectActivity | null {
  if (!contracts.length) return null;
  const txns = sumByDate(contracts.map((c) => dailyTxns(c.address, store)));
  const senders = sumByDate(contracts.map((c) => dailySenders(c.address, store)));
  const holdersList = contracts
    .filter((c) => isFungibleRole(c.role))
    .map((c) => store.tokens[c.address]?.at(-1)?.[1] ?? null)
    .filter((v): v is number => v !== null);
  const skippedLarge = contracts.some((c) => store.activity[c.address]?.skippedLarge);
  if (!txns.length && !holdersList.length) return null;
  const last = txns.at(-1)?.[0] ?? null;
  const s7 = sumWindow(senders, end, 7);
  return {
    txns,
    senders,
    txns24h: valueAt(txns, end, 1),
    txns7d: sumWindow(txns, end, 7).value,
    uniqueSenders7d: s7.days ? s7.value : null,
    holders: holdersList.length ? Math.max(...holdersList) : null,
    activityAsOf: last && last <= end ? last : last ? end : null,
    skippedLarge,
  };
}
