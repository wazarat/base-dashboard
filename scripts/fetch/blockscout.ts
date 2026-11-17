/**
 * Blockscout for Base.
 * - Chain-level stats service on the explorer host works without a key.
 * - The explorer's /api/v2 sits behind a browser challenge for scripts, so
 *   per-address and token endpoints use the keyed gateway api.blockscout.com/4663
 *   with BLOCKSCOUT_API_KEY (free tier). Without the key those metrics are skipped.
 */
import path from "node:path";
import { isFungibleRole } from "../../src/lib/contract-roles";
import { dateOfMs } from "../../src/lib/dates";
import type { ContractActivity, Series } from "../../src/lib/history-types";
import type { RawRow } from "../../src/lib/parse";
import { readCsvOrEmpty } from "../lib/csv";
import { log } from "../lib/log";
import { DATA, HISTORY } from "../lib/paths";
import { appendDated, readJson, upsertSeries, writeJsonStable } from "../lib/store";
import { CHAIN } from "../../src/lib/chain";
import type { Ctx, RunResult } from "./context";
import { readChain, writeChain } from "./defillama";
import { createClient, HttpError, type HttpClient } from "./http";

/** Base publishes no Blockscout stats service (probed Nov 17 2026), so chain lines come from growthepie and DefiLlama instead. */
const STATS: string | null = null;
const KEYED = CHAIN.blockscoutGateway;
/** Contracts above this many transactions are not backfilled page by page. */
export const BACKFILL_MAX_TXNS = 50_000;

export const LINE_IDS = [
  "activeAccounts",
  "newAccounts",
  "accountsGrowth",
  "newTxns",
  "txnsGrowth",
  "txnsSuccessRate",
  "averageTxnFee",
  "txnsFee",
  "newBlocks",
  "newNativeCoinTransfers",
  "averageGasPrice",
  "networkUtilization",
  "newContracts",
  "contractsGrowth",
  "newVerifiedContracts",
  "verifiedContractsGrowth",
  "newUserOps",
  "userOpsGrowth",
  "newAccountAbstractionWallets",
  "accountAbstractionWalletsGrowth",
  "activeAccountAbstractionWallets",
  "activeBundlers",
  "activePaymasters",
] as const;

export function parseLine(json: { chart?: Array<{ date: string; value: string | number; is_approximate?: boolean }> }): Series {
  const out: Series = [];
  for (const p of json.chart ?? []) {
    if (p.is_approximate) continue;
    const v = Number(p.value);
    if (!Number.isFinite(v)) continue;
    out.push([p.date, v]);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

export function parseCounters(json: { counters?: Array<{ id: string; value: string | number }> }): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of json.counters ?? []) {
    const v = Number(c.value);
    if (Number.isFinite(v)) out[c.id] = v;
  }
  return out;
}

export interface AddressCounters {
  txns: number | null;
  tokenTransfers: number | null;
  gasUsed: number | null;
  validations: number | null;
}

const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export function parseAddressCounters(json: Record<string, unknown>): AddressCounters {
  return {
    txns: num(json.transactions_count),
    tokenTransfers: num(json.token_transfers_count),
    gasUsed: num(json.gas_usage_count),
    validations: num(json.validations_count),
  };
}

export interface TokenInfo {
  holders: number | null;
  totalSupply: number | null;
  circulatingMarketCap: number | null;
  exchangeRate: number | null;
  decimals: number | null;
}

export function parseTokenInfo(json: Record<string, unknown>): TokenInfo {
  const decimals = num(json.decimals);
  const rawSupply = num(json.total_supply);
  return {
    holders: num(json.holders_count ?? json.holders),
    totalSupply: rawSupply !== null && decimals !== null ? rawSupply / 10 ** decimals : rawSupply,
    circulatingMarketCap: num(json.circulating_market_cap),
    exchangeRate: num(json.exchange_rate),
    decimals,
  };
}

export interface TxPage {
  rows: Array<{ date: string; from: string; ok: boolean }>;
  next: Record<string, string> | null;
}

/** One page of /addresses/{a}/transactions (newest first). */
export function parseTransactionsPage(json: { items?: Array<Record<string, unknown>>; next_page_params?: Record<string, unknown> | null }): TxPage {
  const rows: TxPage["rows"] = [];
  for (const it of json.items ?? []) {
    const ts = typeof it.timestamp === "string" ? Date.parse(it.timestamp) : NaN;
    if (!Number.isFinite(ts)) continue;
    const from = ((it.from as { hash?: string } | undefined)?.hash ?? "").toLowerCase();
    rows.push({ date: dateOfMs(ts), from, ok: it.status === "ok" || it.status === undefined });
  }
  const np = json.next_page_params;
  const next = np && Object.keys(np).length ? Object.fromEntries(Object.entries(np).map(([k, v]) => [k, String(v)])) : null;
  return { rows, next };
}

/** Fold transaction rows into per-day counts and sender sets (newest-first input is fine). */
export function foldDays(rows: TxPage["rows"], into: Map<string, { txns: number; senders: Set<string> }> = new Map()) {
  for (const r of rows) {
    const d = into.get(r.date) ?? { txns: 0, senders: new Set<string>() };
    d.txns += 1;
    if (r.from) d.senders.add(r.from);
    into.set(r.date, d);
  }
  return into;
}

export async function runLines(ctx: Ctx): Promise<RunResult> {
  if (!STATS) return { rows: 0, calls: 0, notes: ["skipped: Blockscout publishes no stats service for Base; chain activity comes from growthepie"] };
  const client = createClient({ name: "blockscout", minIntervalMs: 500 });
  const notes: string[] = [];
  const chain = readChain();
  let rows = 0;
  for (const id of LINE_IDS) {
    try {
      const s = parseLine(await client.getJson(`${STATS}/lines/${id}?resolution=DAY`));
      chain.blockscoutLines[id] = upsertSeries(chain.blockscoutLines[id] ?? [], s, { today: ctx.today });
      rows += s.length;
    } catch (e) {
      notes.push(`${id}: ${(e as Error).message}`);
    }
  }
  try {
    const counters = parseCounters(await client.getJson(`${STATS}/counters`));
    chain.counters = appendDated(chain.counters, [ctx.today, counters]);
  } catch (e) {
    notes.push(`counters: ${(e as Error).message}`);
  }
  if (!ctx.dryRun) writeChain(chain);
  return { rows, calls: client.stats().calls, notes };
}

export interface ContractRow {
  project: string;
  address: string;
  role: string;
  source: string;
  verified: string;
}

export function parseContracts(rows: RawRow[]): ContractRow[] {
  return rows
    .map((r) => ({
      project: (r["Project"] ?? "").trim(),
      address: (r["Address"] ?? "").trim().toLowerCase(),
      role: (r["Role"] ?? "").trim().toLowerCase(),
      source: (r["Source"] ?? "").trim(),
      verified: (r["Verified"] ?? "").trim(),
    }))
    .filter((r) => /^0x[0-9a-f]{40}$/.test(r.address));
}

function redact(msg: string, key: string): string {
  return key ? msg.split(key).join("***") : msg;
}

export function keyedClient(key: string): HttpClient {
  return createClient({ name: "blockscout-keyed", rateKey: "blockscout-keyed", minIntervalMs: 250, headers: { Authorization: `Bearer ${key}`, "x-api-key": key } });
}

export async function keyedGet<T>(client: HttpClient, key: string, p: string): Promise<T> {
  try {
    return await client.getJson<T>(`${KEYED}${p}`, { noCache: true });
  } catch (e) {
    if (e instanceof HttpError && (e.status === 401 || e.status === 402 || e.status === 403)) {
      const sep = p.includes("?") ? "&" : "?";
      try {
        return await client.getJson<T>(`${KEYED}${p}${sep}apikey=${encodeURIComponent(key)}`, { noCache: true });
      } catch (e2) {
        throw new Error(redact((e2 as Error).message, key));
      }
    }
    throw new Error(redact((e as Error).message, key));
  }
}

type CounterRow = [string, number | null, number | null, number | null];
type TokenRow = [string, number | null, number | null, number | null, number | null];

export function readActivity(): Record<string, ContractActivity> {
  return readJson<Record<string, ContractActivity>>(path.join(HISTORY, "contracts", "activity.json"), {});
}

export async function runKeyed(ctx: Ctx): Promise<RunResult> {
  const key = ctx.env.BLOCKSCOUT_API_KEY?.trim();
  if (!key) return { rows: 0, calls: 0, notes: ["skipped: BLOCKSCOUT_API_KEY not set"] };
  const contracts = parseContracts(readCsvOrEmpty(path.join(DATA, "contracts.csv")));
  const client = keyedClient(key);
  const notes: string[] = [];
  const dir = path.join(HISTORY, "contracts");
  const counters = readJson<Record<string, CounterRow[]>>(path.join(dir, "counters.json"), {});
  const tokens = readJson<Record<string, TokenRow[]>>(path.join(dir, "tokens.json"), {});
  const activity = readActivity();
  let rows = 0;
  let failed = 0;
  const bail = (e: unknown) => {
    failed += 1;
    log.debug((e as Error).message);
    if (failed > 20 && rows === 0) throw new Error(`keyed Blockscout failing consistently: ${(e as Error).message}`);
  };

  // 1. Daily counter snapshot per project contract (+ token info for token roles).
  for (const c of contracts) {
    try {
      const ac = parseAddressCounters(await keyedGet<Record<string, unknown>>(client, key, `/addresses/${c.address}/counters`));
      counters[c.address] = appendDated(counters[c.address] ?? [], [ctx.today, ac.txns, ac.tokenTransfers, ac.gasUsed]);
      rows += 1;
      if (isFungibleRole(c.role)) {
        const ti = parseTokenInfo(await keyedGet<Record<string, unknown>>(client, key, `/tokens/${c.address}`));
        tokens[c.address] = appendDated(tokens[c.address] ?? [], [ctx.today, ti.holders, ti.totalSupply, ti.circulatingMarketCap, ti.exchangeRate]);
      }
    } catch (e) {
      bail(e);
    }
  }

  // 3. Capped transaction backfill for small contracts: daily txns and unique senders back to creation.
  const pageBudget = Number(ctx.env.BS_TX_PAGES ?? (ctx.mode === "backfill" ? 400 : 120));
  let pagesUsed = 0;
  const todo = contracts
    .map((c) => ({ c, txns: counters[c.address]?.at(-1)?.[1] ?? null }))
    .filter(({ c, txns }) => {
      const a = activity[c.address];
      if (a?.done) return false;
      if (txns !== null && txns > BACKFILL_MAX_TXNS) {
        activity[c.address] = { days: a?.days ?? [], next: null, done: true, skippedLarge: true, pages: a?.pages ?? 0 };
        return false;
      }
      return true;
    })
    .sort((a, b) => (a.txns ?? 0) - (b.txns ?? 0));
  for (const { c } of todo) {
    if (pagesUsed >= pageBudget) break;
    const a = activity[c.address] ?? { days: [], next: null, done: false, skippedLarge: false, pages: 0 };
    const folded = new Map<string, { txns: number; senders: Set<string> }>();
    let next: Record<string, string> | null = a.pages === 0 ? null : a.next;
    if (a.pages > 0 && !next) {
      a.done = true;
      activity[c.address] = a;
      continue;
    }
    let pagesThis = 0;
    try {
      for (;;) {
        if (pagesUsed >= pageBudget || pagesThis >= 60) break;
        const q = next ? `?${new URLSearchParams(next).toString()}` : "";
        const page = parseTransactionsPage(await keyedGet(client, key, `/addresses/${c.address}/transactions${q}`));
        pagesUsed += 1;
        pagesThis += 1;
        a.pages += 1;
        foldDays(page.rows, folded);
        next = page.next;
        if (!next) {
          a.done = true;
          break;
        }
      }
    } catch (e) {
      bail(e);
    }
    a.next = next;
    // Merge: counts are additive across runs because a day may span two pages fetched in different runs; sender counts stay an estimate.
    const byDate = new Map(a.days.map((d) => [d[0], d]));
    for (const [date, v] of folded) {
      const prev = byDate.get(date);
      byDate.set(date, [date, (prev?.[1] ?? 0) + v.txns, (prev?.[2] ?? 0) + v.senders.size]);
    }
    a.days = Array.from(byDate.values()).sort((x, y) => (x[0] < y[0] ? -1 : 1));
    activity[c.address] = a;
    rows += folded.size;
  }

  if (!ctx.dryRun) {
    writeJsonStable(path.join(dir, "counters.json"), counters);
    writeJsonStable(path.join(dir, "tokens.json"), tokens);
    writeJsonStable(path.join(dir, "activity.json"), activity);
  }
  if (failed) notes.push(`${failed} keyed requests failed`);
  const done = Object.values(activity).filter((a) => a.done && !a.skippedLarge).length;
  const large = Object.values(activity).filter((a) => a.skippedLarge).length;
  notes.push(`${contracts.length} contracts snapshotted; tx backfill: ${pagesUsed} pages, ${done} contracts complete, ${large} skipped as large`);
  return { rows, calls: client.stats().calls, notes };
}
