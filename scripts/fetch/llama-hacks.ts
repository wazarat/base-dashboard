/**
 * Incidents DefiLlama records for the chain (/hacks, filtered to Base). Chain-level only: the
 * list feeds the Security page and is never attached to a project in public views (docs/SECTOR-METRICS.md).
 */
import path from "node:path";
import { dateOf } from "../../src/lib/dates";
import type { LlamaHack } from "../../src/lib/history-types";
import { HISTORY } from "../lib/paths";
import { writeJsonStable } from "../lib/store";
import type { Ctx, RunResult } from "./context";
import { CHAIN } from "./defillama";
import { createClient } from "./http";

export const HACKS_FILE = path.join(HISTORY, "defillama", "hacks.json");

interface RawHack {
  date?: number;
  name?: string;
  classification?: string | null;
  technique?: string | null;
  amount?: number | null;
  chain?: string[] | string | null;
  source?: string | null;
  returnedFunds?: number | null;
  targetType?: string | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Incidents that list this chain, newest first. An incident on several chains keeps its whole amount, flagged as shared. */
export function parseHacks(json: RawHack[], chain: string = CHAIN): LlamaHack[] {
  return json
    .filter((h) => (Array.isArray(h.chain) ? h.chain : [h.chain]).includes(chain) && typeof h.date === "number" && str(h.name))
    .map((h) => {
      const chains = Array.isArray(h.chain) ? h.chain : [chain];
      return { date: dateOf(h.date as number), name: str(h.name) as string, classification: str(h.classification), technique: str(h.technique), amount: num(h.amount), returned: num(h.returnedFunds), targetType: str(h.targetType), source: str(h.source), chains: chains.length };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.name.localeCompare(b.name)));
}

export async function run(ctx: Ctx): Promise<RunResult> {
  const client = createClient({ name: "llama-hacks", minIntervalMs: 1000, timeoutMs: 120_000 });
  const all = await client.getJson<RawHack[]>("https://api.llama.fi/hacks");
  const hacks = parseHacks(all);
  if (!ctx.dryRun) writeJsonStable(HACKS_FILE, hacks);
  return { rows: hacks.length, calls: client.stats().calls, notes: [`${hacks.length} incidents list ${CHAIN}, of ${all.length} recorded`] };
}
