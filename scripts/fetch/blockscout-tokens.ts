/**
 * Keyed Blockscout snapshots for mapped tokens (stablecoin, project-token, rwa-token roles in
 * data/contracts.csv): holders, total supply, price and transfer counts, plus the token's own
 * name, symbol and decimals for the spoof guard. Blockscout's market cap and 24h volume cover
 * every chain, so they are never stored here.
 */
import path from "node:path";
import { addDays, type DateStr } from "../../src/lib/dates";
import { isFungibleRole } from "../../src/lib/contract-roles";
import { RECENT_TRANSFER_CAP } from "../../src/lib/onchain";
import type { TokenMetaRecord, TokenSnapRow } from "../../src/lib/history-types";
import { readCsvOrEmpty } from "../lib/csv";
import { log } from "../lib/log";
import { DATA, HISTORY } from "../lib/paths";
import { appendDated, readJson, writeJsonStable } from "../lib/store";
import { keyedClient, keyedGet, keyedSkip, parseContracts, parseTokenInfo, type ContractRow } from "./blockscout";
import type { Ctx, RunResult } from "./context";
import type { HttpClient } from "./http";

export const TOKENS_DIR = path.join(HISTORY, "tokens");
export { RECENT_TRANSFER_CAP };

const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export function parseTokenMeta(json: Record<string, unknown>, today: DateStr): TokenMetaRecord {
  return {
    name: typeof json.name === "string" ? json.name : null,
    symbol: typeof json.symbol === "string" ? json.symbol : null,
    decimals: num(json.decimals),
    type: typeof json.type === "string" ? json.type : null,
    checked: today,
  };
}

/** Count transfers newer than `since` on newest-first pages; returns the count and whether it stopped at the cap. */
export function countRecent(items: Array<{ timestamp?: string }>, since: DateStr): { count: number; older: boolean } {
  let count = 0;
  for (const it of items) {
    if (!it.timestamp || it.timestamp.slice(0, 10) < since) return { count, older: true };
    count += 1;
  }
  return { count, older: false };
}

export function readTokenStore(): { meta: Record<string, TokenMetaRecord>; snaps: Record<string, TokenSnapRow[]> } {
  return {
    meta: readJson<Record<string, TokenMetaRecord>>(path.join(TOKENS_DIR, "meta.json"), {}),
    snaps: readJson<Record<string, TokenSnapRow[]>>(path.join(TOKENS_DIR, "snapshots.json"), {}),
  };
}

export async function snapshotToken(client: HttpClient, key: string, address: string, today: DateStr, recent: boolean): Promise<{ meta: TokenMetaRecord; row: TokenSnapRow }> {
  const json = await keyedGet<Record<string, unknown>>(client, key, `/tokens/${address}`);
  const meta = parseTokenMeta(json, today);
  const info = parseTokenInfo(json);
  let total: number | null = null;
  try {
    total = num((await keyedGet<Record<string, unknown>>(client, key, `/tokens/${address}/counters`)).transfers_count);
  } catch (e) {
    log.debug(`counters ${address}: ${(e as Error).message}`);
  }
  let recent30: number | null = null;
  if (recent) {
    const since = addDays(today, -30);
    let next: Record<string, unknown> | null = null;
    let count = 0;
    for (let page = 0; page < Math.ceil(RECENT_TRANSFER_CAP / 50); page++) {
      const q: string = next ? `?${new URLSearchParams(Object.entries(next).map(([k, v]) => [k, String(v)])).toString()}` : "";
      const r = await keyedGet<{ items?: Array<{ timestamp?: string }>; next_page_params?: Record<string, unknown> | null }>(client, key, `/tokens/${address}/transfers${q}`);
      const c = countRecent(r.items ?? [], since);
      count += c.count;
      next = r.next_page_params ?? null;
      if (c.older || !next || count >= RECENT_TRANSFER_CAP) break;
    }
    recent30 = Math.min(count, RECENT_TRANSFER_CAP);
  }
  return { meta, row: [today, info.holders, info.totalSupply, info.exchangeRate, total, recent30] };
}

export async function runFor(ctx: Ctx, pick: (c: ContractRow) => boolean, recent: boolean, label: string): Promise<RunResult> {
  const skip = keyedSkip(ctx.env);
  if (skip) return { rows: 0, calls: 0, notes: [skip] };
  const key = ctx.env.BLOCKSCOUT_API_KEY!.trim();
  const targets = parseContracts(readCsvOrEmpty(path.join(DATA, "contracts.csv"))).filter(pick);
  if (!targets.length) return { rows: 0, calls: 0, notes: [`skipped: no ${label} in data/contracts.csv`] };
  const client = keyedClient(key);
  const store = readTokenStore();
  const notes: string[] = [];
  let rows = 0;
  let failed = 0;
  for (const c of targets) {
    try {
      const { meta, row } = await snapshotToken(client, key, c.address, ctx.today, recent);
      store.meta[c.address] = meta;
      store.snaps[c.address] = appendDated(store.snaps[c.address] ?? [], row);
      rows += 1;
    } catch (e) {
      failed += 1;
      log.debug(`${label} ${c.address}: ${(e as Error).message}`);
      if (failed > 10 && rows === 0) throw new Error(`keyed Blockscout failing for ${label}: ${(e as Error).message}`);
    }
  }
  if (!ctx.dryRun) {
    writeJsonStable(path.join(TOKENS_DIR, "meta.json"), store.meta);
    writeJsonStable(path.join(TOKENS_DIR, "snapshots.json"), store.snaps);
  }
  notes.push(`${rows} of ${targets.length} ${label} snapshotted${failed ? `, ${failed} failed` : ""}`);
  return { rows, calls: client.stats().calls, notes };
}

export function run(ctx: Ctx): Promise<RunResult> {
  return runFor(ctx, (c) => isFungibleRole(c.role), false, "tokens");
}
