/**
 * growthepie's free, keyless API for Base chain activity. Base publishes no Blockscout stats service, so this is the
 * chain activity source: daily active addresses and transactions (full history from the per-metric export on a
 * backfill, the 90-day fundamentals file every day) and smart-wallet activity over the last 7 days (fundamentals only).
 */
import path from "node:path";
import { CHAIN } from "../../src/lib/chain";
import type { Series, SeriesMap } from "../../src/lib/history-types";
import { HISTORY } from "../lib/paths";
import { readJson, upsertSeries, writeJsonStable } from "../lib/store";
import type { Ctx, RunResult } from "./context";
import { createClient } from "./http";

const BASE = "https://api.growthepie.com/v1";
/** Its own file: the DefiLlama lane rewrites chain.json at the same time, so sharing it would drop one side's writes. */
export const GTP_FILE = path.join(HISTORY, "growthepie.json");

/** growthepie metric key, and the key the Atlas stores it under in growthepie.json. */
export const GTP_METRICS = {
  daa: "activeAddresses",
  txcount: "txns",
  aa_last7d: "smartWallets7d",
} as const;
export type GtpKey = (typeof GTP_METRICS)[keyof typeof GTP_METRICS];

/** Metrics with a full-history export file; the rest exist only in the 90-day fundamentals file. */
export const GTP_EXPORT = ["daa", "txcount"] as const;

interface GtpRow {
  metric_key?: string;
  origin_key?: string;
  date?: string;
  value?: number | string | null;
}

/** One chain's rows of one metric, sorted by date, with non-numbers and duplicate dates dropped. */
export function parseGtp(rows: GtpRow[], metric: string, origin: string = CHAIN.growthepieKey): Series {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.metric_key !== metric || r.origin_key !== origin || !r.date || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
    const v = Number(r.value);
    if (Number.isFinite(v)) m.set(r.date, Math.round(v));
  }
  return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)) as Series;
}

export async function run(ctx: Ctx): Promise<RunResult> {
  const client = createClient({ name: "growthepie", minIntervalMs: 1500, timeoutMs: 120_000 });
  const store = readJson<SeriesMap>(GTP_FILE, {});
  const notes: string[] = [];
  let rows = 0;
  const merge = (key: GtpKey, s: Series) => {
    // The newest day can still be partial; upsertSeries keeps it out unless allowToday.
    store[key] = upsertSeries(store[key] ?? [], s, { today: ctx.today });
    rows += s.length;
  };
  if (ctx.mode === "backfill") {
    for (const metric of GTP_EXPORT) {
      const s = parseGtp(await client.getJson<GtpRow[]>(`${BASE}/export/${metric}.json`), metric);
      merge(GTP_METRICS[metric], s);
      notes.push(`${metric} from ${s[0]?.[0] ?? "none"}`);
    }
  }
  const fundamentals = await client.getJson<GtpRow[]>(`${BASE}/fundamentals.json`);
  for (const [metric, key] of Object.entries(GTP_METRICS) as Array<[keyof typeof GTP_METRICS, GtpKey]>) {
    const s = parseGtp(fundamentals, metric);
    if (!s.length) notes.push(`${metric}: nothing listed for ${CHAIN.growthepieKey}`);
    merge(key, s);
  }
  if (!ctx.dryRun) writeJsonStable(GTP_FILE, store);
  return { rows, calls: client.stats().calls, notes };
}
