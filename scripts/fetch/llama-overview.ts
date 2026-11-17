/**
 * Shared body of the DefiLlama chain-overview fetchers added for the sector metrics (docs/SECTOR-METRICS.md,
 * section 2): aggregators, bridge aggregators, open interest and options. Each is its own source in
 * scripts/refresh.ts; they differ only in the endpoint, the file they write and whether the figure is a
 * flow (summed over 30 days) or a level (read on a day).
 */
import path from "node:path";
import type { SeriesMap } from "../../src/lib/history-types";
import { HISTORY } from "../lib/paths";
import { readJson, upsertSeries, writeJsonStable } from "../lib/store";
import type { Ctx, RunResult } from "./context";
import { CHAIN, parseBreakdown, parseOverviewProtocols } from "./defillama";
import { createClient, HttpError } from "./http";
import { CHAIN as CHAIN_CONFIG } from "../../src/lib/chain";

const CHAIN_OVERVIEW = CHAIN_CONFIG.llamaOverview;

const BASE = "https://api.llama.fi";
const DIR = path.join(HISTORY, "defillama");
/** slug -> display name for listings that only exist in these overviews, so the build can join them through data/defillama-map.csv. */
export const OVERVIEW_NAMES_FILE = path.join(DIR, "overview-names.json");

export interface OverviewSpec {
  /** Path segment after /overview/. */
  kind: string;
  dataType?: string;
  /** File under data/history/defillama, without the extension. */
  file: string;
  /** A level (open interest) keeps today's reading; a flow never stores the unfinished day. */
  level?: boolean;
}

export function overviewUrl(spec: OverviewSpec): string {
  return `${BASE}/overview/${spec.kind}/${CHAIN_OVERVIEW}${spec.dataType ? `?dataType=${spec.dataType}` : ""}`;
}

/** Merge one overview's per-protocol breakdown into its history file, re-fetching the trailing 7 days like every other series. */
export function mergeOverview(existing: SeriesMap, incoming: SeriesMap, today: string, level: boolean): SeriesMap {
  const out: SeriesMap = { ...existing };
  for (const [name, s] of Object.entries(incoming)) out[name] = upsertSeries(existing[name] ?? [], s, { today, allowToday: level });
  return out;
}

export async function runOverviews(ctx: Ctx, source: string, specs: OverviewSpec[]): Promise<RunResult> {
  const client = createClient({ name: source, minIntervalMs: 1000, timeoutMs: 120_000 });
  const notes: string[] = [];
  let rows = 0;
  let got = 0;
  const names = readJson<Record<string, string>>(OVERVIEW_NAMES_FILE, {});
  for (const spec of specs) {
    let json: Parameters<typeof parseBreakdown>[0] & Parameters<typeof parseOverviewProtocols>[0];
    try {
      json = await client.getJson(overviewUrl(spec));
    } catch (e) {
      // DefiLlama answers 404 or 400 when it has nothing of this kind for the chain; that is a skip, not a failure.
      if (e instanceof HttpError && (e.status === 404 || e.status === 400)) {
        notes.push(`${spec.file}: nothing listed for ${CHAIN}`);
        continue;
      }
      throw e;
    }
    const bd = parseBreakdown(json);
    const file = path.join(DIR, `${spec.file}.json`);
    if (!ctx.dryRun) writeJsonStable(file, mergeOverview(readJson<SeriesMap>(file, {}), bd, ctx.today, Boolean(spec.level)));
    for (const p of parseOverviewProtocols(json)) if (p.slug && p.name) names[p.slug] = p.name;
    rows += Object.keys(bd).length;
    got += 1;
    notes.push(`${spec.file}: ${Object.keys(bd).length} protocols`);
  }
  if (!ctx.dryRun && got) writeJsonStable(OVERVIEW_NAMES_FILE, names);
  if (!got) return { rows: 0, calls: client.stats().calls, notes: [`skipped: DefiLlama lists nothing of this kind for ${CHAIN}`] };
  return { rows, calls: client.stats().calls, notes };
}
