/**
 * GeckoTerminal holder snapshots, network "base" only, for every fungible token in data/contracts.csv
 * and every stablecoin address in data/stablecoin-map.csv. It stands in for keyed Blockscout, which
 * needs a paid plan on Base (CHAIN.blockscoutFree).
 * - tokens/multi (30 addresses a call) gives name, symbol, decimals, supply and price for the spoof guard.
 * - tokens/{address}/info gives the holder count, one call per token.
 * Rows go into the same tokens/meta.json and tokens/snapshots.json the build already reads, with the
 * transfer columns left null because GeckoTerminal does not report transfers.
 */
import path from "node:path";
import type { DateStr } from "../../src/lib/dates";
import { isFungibleRole } from "../../src/lib/contract-roles";
import type { TokenMetaRecord, TokenSnapRow } from "../../src/lib/history-types";
import { readCsvOrEmpty } from "../lib/csv";
import { log } from "../lib/log";
import { DATA } from "../lib/paths";
import { appendDated, writeJsonStable } from "../lib/store";
import { parseContracts } from "./blockscout";
import { readTokenStore, TOKENS_DIR } from "./blockscout-tokens";
import { hasTime, type Ctx, type RunResult } from "./context";
import { GECKO_BASE } from "./geckoterminal";
import { geckoClient } from "./gecko-client";

const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

interface GtTokenAttrs {
  address?: string;
  name?: string | null;
  symbol?: string | null;
  decimals?: number | string | null;
  normalized_total_supply?: string | null;
  price_usd?: string | null;
}

export interface GtTokenFacts {
  address: string;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  supply: number | null;
  priceUsd: number | null;
}

/** One entry per token in a tokens/multi response, keyed by lowercase address. */
export function parseMultiFacts(json: { data?: Array<{ attributes?: GtTokenAttrs }> }): Map<string, GtTokenFacts> {
  const out = new Map<string, GtTokenFacts>();
  for (const d of json.data ?? []) {
    const a = d.attributes ?? {};
    if (!a.address) continue;
    const address = a.address.toLowerCase();
    out.set(address, { address, name: str(a.name), symbol: str(a.symbol), decimals: num(a.decimals), supply: num(a.normalized_total_supply), priceUsd: num(a.price_usd) });
  }
  return out;
}

/** Holder count from a tokens/{address}/info response, or null when GeckoTerminal has none. */
export function parseHolders(json: { data?: { attributes?: { holders?: { count?: number | string | null } | null } } }): number | null {
  const v = num(json.data?.attributes?.holders?.count);
  return v !== null && v >= 0 ? Math.round(v) : null;
}

export function toMeta(f: GtTokenFacts, today: DateStr): TokenMetaRecord {
  return { name: f.name, symbol: f.symbol, decimals: f.decimals, type: null, checked: today };
}

export function toRow(f: GtTokenFacts | undefined, holders: number | null, today: DateStr): TokenSnapRow {
  return [today, holders, f?.supply ?? null, f?.priceUsd ?? null, null, null];
}

/** Fungible addresses from contracts.csv plus stablecoin-map.csv, each once. */
export function holderTargets(contracts: Array<{ address: string; role: string }>, stables: Array<Record<string, string | undefined>>): string[] {
  const set = new Set<string>();
  for (const c of contracts) if (isFungibleRole(c.role)) set.add(c.address);
  for (const s of stables) {
    const a = (s["Address"] ?? "").trim().toLowerCase();
    if (/^0x[0-9a-f]{40}$/.test(a)) set.add(a);
  }
  return Array.from(set).sort();
}

export async function run(ctx: Ctx): Promise<RunResult> {
  const targets = holderTargets(parseContracts(readCsvOrEmpty(path.join(DATA, "contracts.csv"))), readCsvOrEmpty(path.join(DATA, "stablecoin-map.csv")));
  if (!targets.length) return { rows: 0, calls: 0, notes: ["skipped: no token addresses in data/contracts.csv or data/stablecoin-map.csv"] };
  const client = geckoClient("geckoterminal-holders", ctx.env);
  const store = readTokenStore();
  const notes: string[] = [];

  // 1. Identity, supply and price, 30 addresses a call.
  const facts = new Map<string, GtTokenFacts>();
  for (let i = 0; i < targets.length; i += 30) {
    const chunk = targets.slice(i, i + 30);
    try {
      for (const [a, f] of parseMultiFacts(await client.getJson(`${GECKO_BASE}/tokens/multi/${chunk.join(",")}`, { noCache: true }))) facts.set(a, f);
    } catch (e) {
      notes.push(`tokens/multi chunk ${i / 30}: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  if (!facts.size) throw new Error(notes.join("; ") || "GeckoTerminal returned no tokens");

  // 2. Holder counts, one call per token. Past the refresh time budget the rest keep their last snapshot.
  let rows = 0;
  let failed = 0;
  let late = 0;
  for (const a of targets) {
    const f = facts.get(a);
    if (!f) continue;
    if (!hasTime(ctx)) {
      late += 1;
      continue;
    }
    let holders: number | null = null;
    try {
      holders = parseHolders(await client.getJson(`${GECKO_BASE}/tokens/${a}/info`, { noCache: true }));
    } catch (e) {
      failed += 1;
      log.debug(`holders ${a}: ${(e as Error).message}`);
    }
    store.meta[a] = toMeta(f, ctx.today);
    store.snaps[a] = appendDated(store.snaps[a] ?? [], toRow(f, holders, ctx.today));
    rows += 1;
  }
  if (!ctx.dryRun) {
    writeJsonStable(path.join(TOKENS_DIR, "meta.json"), store.meta);
    writeJsonStable(path.join(TOKENS_DIR, "snapshots.json"), store.snaps);
  }
  const missing = targets.length - facts.size;
  notes.push(`${rows} of ${targets.length} tokens snapshotted${missing ? `, ${missing} not listed on GeckoTerminal` : ""}${failed ? `, ${failed} without a holder count` : ""}${late ? `, ${late} left for the next run (time budget)` : ""}`);
  return { rows, calls: client.stats().calls, notes };
}
