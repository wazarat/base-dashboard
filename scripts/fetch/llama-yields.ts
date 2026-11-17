/**
 * Yield pools on the chain with their APYs, joined to the lending side of the same pool
 * (yields.llama.fi /pools and /lendBorrow). The lendBorrow rows carry no chain, so they join by pool id.
 * A snapshot per day: the free API gives no history for a chain's pools.
 */
import path from "node:path";
import type { YieldPoolRecord, YieldPoolsFile } from "../../src/lib/history-types";
import { HISTORY } from "../lib/paths";
import { writeJsonStable } from "../lib/store";
import type { Ctx, RunResult } from "./context";
import { CHAIN } from "./defillama";
import { createClient } from "./http";

export const YIELDS_FILE = path.join(HISTORY, "yields", "pools.json");
const BASE = "https://yields.llama.fi";

type Raw = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** DefiLlama quotes APYs in percent; the Atlas stores shares, so 3.98 becomes 0.0398. */
const pct = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : n / 100;
};

export function parsePools(pools: { data?: Raw[] }, lendBorrow: Raw[], chain: string = CHAIN): YieldPoolRecord[] {
  const lb = new Map(lendBorrow.map((r) => [String(r.pool), r]));
  return (pools.data ?? [])
    .filter((p) => p.chain === chain && typeof p.pool === "string" && typeof p.project === "string")
    .map((p) => {
      const l = lb.get(p.pool as string);
      return {
        pool: p.pool as string,
        project: p.project as string,
        symbol: String(p.symbol ?? ""),
        tvlUsd: num(p.tvlUsd),
        apyBase: pct(p.apyBase),
        apyReward: pct(p.apyReward),
        apy: pct(p.apy),
        supplyUsd: l ? num(l.totalSupplyUsd) : null,
        borrowUsd: l ? num(l.totalBorrowUsd) : null,
        apyBorrow: l ? pct(l.apyBaseBorrow) : null,
        ltv: l ? num(l.ltv) : null,
      };
    })
    .sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0) || a.pool.localeCompare(b.pool));
}

export async function run(ctx: Ctx): Promise<RunResult> {
  const client = createClient({ name: "llama-yields", minIntervalMs: 1000, timeoutMs: 120_000 });
  const pools = await client.getJson<{ data?: Raw[] }>(`${BASE}/pools`);
  let lendBorrow: Raw[] = [];
  const notes: string[] = [];
  try {
    lendBorrow = await client.getJson<Raw[]>(`${BASE}/lendBorrow`);
  } catch (e) {
    notes.push(`lendBorrow failed, pools kept without their lending side: ${(e as Error).message}`);
  }
  const rows = parsePools(pools, lendBorrow);
  if (!rows.length) return { rows: 0, calls: client.stats().calls, notes: [`skipped: no yield pools listed for ${CHAIN}`] };
  const file: YieldPoolsFile = { asOf: ctx.today, pools: rows };
  if (!ctx.dryRun) writeJsonStable(YIELDS_FILE, file);
  notes.unshift(`${rows.length} pools on ${CHAIN} across ${new Set(rows.map((r) => r.project)).size} protocols, ${rows.filter((r) => r.borrowUsd !== null).length} with a lending side`);
  return { rows: rows.length, calls: client.stats().calls, notes };
}
