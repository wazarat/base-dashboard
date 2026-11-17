/**
 * DefiLlama free API (api.llama.fi). No key. One request per second.
 */
import path from "node:path";
import { addDays as addDaysSafe, dateOf, type DateStr } from "../../src/lib/dates";
import { adapterDoublecounted, inChainTotal, inDoublecountedBucket, isChainIncome, rawAdapterUrl, tvlExclusion } from "../../src/lib/flags";
import { EXTRA_TVL_KEYS, type AdapterCheck, type ChainHistory, type LlamaProtocolSnap, type Series, type SeriesMap } from "../../src/lib/history-types";
import { parseMethodology, parseProtocolExtras } from "./llama-extras";
import { mappedSlugs, newlyDetected, parseMapRows, unmatchedMapSlugs } from "../../src/lib/mapping";
import { readCsvOrEmpty } from "../lib/csv";
import { log } from "../lib/log";
import { DATA, HISTORY } from "../lib/paths";
import { readJson, upsertSeries, writeJsonStable } from "../lib/store";
import type { Ctx, RunResult } from "./context";
import { createClient, HttpError, type HttpClient } from "./http";

const BASE = "https://api.llama.fi";
export const CHAIN = "Base";
const CHAIN_Q = encodeURIComponent(CHAIN);
/** Lowercase chain segment the overview endpoints were probed with (Nov 17 2026). */
const CHAIN_OV = "base";
const DIR = path.join(HISTORY, "defillama");

export const FEE_TYPES = {
  fees: "dailyFees",
  revenue: "dailyRevenue",
  "holders-revenue": "dailyHoldersRevenue",
  "supply-side-revenue": "dailySupplySideRevenue",
} as const;

interface RawProtocol {
  slug: string;
  name: string;
  parentProtocol?: string | null;
  category?: string;
  chains?: string[];
  chainTvls?: Record<string, number>;
  address?: string | null;
  mcap?: number | null;
  gecko_id?: string | null;
  url?: string | null;
  tvlCodePath?: string | null;
  module?: string | null;
}

export function parseProtocols(json: RawProtocol[]): LlamaProtocolSnap[] {
  return json
    .filter((p) => (p.chains ?? []).includes(CHAIN) || (p.chainTvls && CHAIN in p.chainTvls))
    .map((p) => {
      const addr = (p.address ?? "").toLowerCase();
      const m = addr.match(/^base:(0x[0-9a-f]{40})$/);
      return {
        slug: p.slug,
        name: p.name,
        parentProtocol: p.parentProtocol ?? null,
        category: p.category ?? "Unknown",
        address: m ? m[1] : null,
        tvl: Number(p.chainTvls?.[CHAIN] ?? 0) || 0,
        mcap: typeof p.mcap === "number" && Number.isFinite(p.mcap) ? p.mcap : null,
        geckoId: p.gecko_id ?? null,
        url: p.url ?? null,
        kinds: ["tvl"] as Array<"tvl" | "dexs" | "fees">,
        codePath: p.tvlCodePath ?? null,
        module: p.module ?? null,
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Fee/volume-only protocols never appear in /protocols; merge them in from the chain overviews. */
export function mergeOverviewProtocols(base: LlamaProtocolSnap[], dexs: OverviewProtocol[], fees: OverviewProtocol[]): LlamaProtocolSnap[] {
  const bySlug = new Map(base.map((p) => [p.slug, { ...p, kinds: [...p.kinds] }]));
  const byName = new Map(base.map((p) => [p.name, p.slug]));
  const addAll = (list: OverviewProtocol[], kind: "dexs" | "fees") => {
    for (const o of list) {
      const slug = o.slug ?? o.module;
      if (!slug || !o.name) continue;
      const existingSlug = bySlug.has(slug) ? slug : byName.get(o.name);
      if (existingSlug) {
        const e = bySlug.get(existingSlug)!;
        if (!e.kinds.includes(kind)) e.kinds.push(kind);
        continue;
      }
      bySlug.set(slug, {
        slug,
        name: o.name,
        parentProtocol: o.parentProtocol,
        category: o.category ?? "Unknown",
        address: null,
        tvl: 0,
        mcap: null,
        geckoId: null,
        url: null,
        kinds: [kind],
      });
      byName.set(o.name, slug);
    }
  };
  addAll(dexs, "dexs");
  addAll(fees, "fees");
  return Array.from(bySlug.values()).sort((a, b) => a.slug.localeCompare(b.slug));
}

type OverviewJson = { totalDataChart?: Array<[number, number]>; totalDataChartBreakdown?: Breakdown; protocols?: Array<Record<string, unknown>> };

export async function fetchOverview(client: HttpClient, kind: "dexs" | "fees", dataType?: string): Promise<OverviewJson> {
  const q = dataType ? `?dataType=${dataType}` : "";
  return client.getJson<OverviewJson>(`${BASE}/overview/${kind}/${CHAIN_OV}${q}`);
}

/** The combined protocol snapshot (TVL listing + DEX + fees overviews) used for mapping. */
export async function fetchAllProtocols(client: HttpClient): Promise<LlamaProtocolSnap[]> {
  const [base, dexs, fees] = await Promise.all([fetchProtocols(client), fetchOverview(client, "dexs"), fetchOverview(client, "fees", "dailyFees")]);
  return mergeOverviewProtocols(base, parseOverviewProtocols(dexs), parseOverviewProtocols(fees));
}

export function parseProtocolTvl(json: { chainTvls?: Record<string, { tvl?: { date: number; totalLiquidityUSD: number }[] }> }): Series {
  const pts = json.chainTvls?.[CHAIN]?.tvl ?? [];
  const m = new Map<string, number>();
  for (const p of pts) m.set(dateOf(p.date), Math.round(p.totalLiquidityUSD));
  return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

type Breakdown = Array<[number, Record<string, number>]>;

/** Chain overview breakdown -> protocol display name -> daily series. */
export function parseBreakdown(json: { totalDataChartBreakdown?: Breakdown }): SeriesMap {
  const out: Record<string, Map<string, number>> = {};
  for (const [ts, byName] of json.totalDataChartBreakdown ?? []) {
    const d = dateOf(ts);
    for (const [name, v] of Object.entries(byName)) {
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      (out[name] ??= new Map()).set(d, Math.round(v));
    }
  }
  const res: SeriesMap = {};
  for (const [name, m] of Object.entries(out)) res[name] = Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return res;
}

export function parseTotalChart(json: { totalDataChart?: Array<[number, number]> }): Series {
  return (json.totalDataChart ?? [])
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
    .map(([ts, v]) => [dateOf(ts), Math.round(v)] as [string, number]);
}

type SummaryBreakdown = Array<[number, Record<string, Record<string, number>>]>;

/** Per-protocol summary: [[ts, {Chain: {Child: v}}]] -> this chain's daily total across children. */
export function parseSummaryBreakdown(json: { totalDataChartBreakdown?: SummaryBreakdown }, chain: string = CHAIN): Series {
  const m = new Map<string, number>();
  for (const [ts, byChain] of json.totalDataChartBreakdown ?? []) {
    const children = byChain?.[chain];
    if (!children) continue;
    let total = 0;
    let seen = false;
    for (const v of Object.values(children)) {
      if (typeof v === "number" && Number.isFinite(v)) {
        total += v;
        seen = true;
      }
    }
    if (seen) m.set(dateOf(ts), Math.round(total));
  }
  return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

export interface OverviewProtocol {
  name: string;
  defillamaId: string;
  module: string | null;
  parentProtocol: string | null;
  category: string | null;
  slug: string | null;
}

export function parseOverviewProtocols(json: { protocols?: Array<Record<string, unknown>> }): OverviewProtocol[] {
  return (json.protocols ?? []).map((p) => ({
    name: String(p.name ?? p.displayName ?? ""),
    defillamaId: String(p.defillamaId ?? ""),
    module: (p.module as string) ?? null,
    parentProtocol: (p.parentProtocol as string) ?? null,
    category: (p.category as string) ?? null,
    slug: (p.slug as string) ?? null,
  }));
}

export function parseChainTvl(json: Array<{ date: number; tvl: number }>): Series {
  return json.map((p) => [dateOf(p.date), Math.round(p.tvl)] as [string, number]);
}

/** /lite/charts/{chain}: [[ts as string, value]] per bucket -> the gross TVL and its double-counted part. */
export function parseLiteCharts(json: { tvl?: Array<[string | number, number]>; doublecounted?: Array<[string | number, number]> }): { gross: Series; doublecounted: Series } {
  const conv = (rows: Array<[string | number, number]> | undefined): Series => {
    const m = new Map<string, number>();
    for (const [ts, v] of rows ?? []) if (typeof v === "number" && Number.isFinite(v)) m.set(dateOf(Number(ts)), Math.round(v));
    return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  };
  return { gross: conv(json.tvl), doublecounted: conv(json.doublecounted) };
}

/** /lite/protocols2: protocol name -> this chain's TVL on the previous day. */
export function parseLitePrevDay(json: { protocols?: Array<{ name: string; chainTvls?: Record<string, { tvlPrevDay?: number | null }> }> }): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of json.protocols ?? []) {
    const v = p.chainTvls?.[CHAIN]?.tvlPrevDay;
    if (typeof v === "number" && Number.isFinite(v)) m.set(p.name, Math.round(v));
  }
  return m;
}

/** Names with any value in a breakdown series map between start and end inclusive. */
export function namesInWindow(bd: SeriesMap, start: DateStr, end: DateStr): Set<string> {
  const out = new Set<string>();
  for (const [name, s] of Object.entries(bd)) if (s.some(([d, v]) => d >= start && d <= end && v !== 0)) out.add(name);
  return out;
}

/** Read each protocol's adapter on GitHub (cached per slug, re-checked weekly) and record whether it is marked double counted. */
async function checkAdapters(protocols: LlamaProtocolSnap[], ctx: Ctx, notes: string[]): Promise<Record<string, AdapterCheck>> {
  const file = path.join(DIR, "adapters.json");
  const cache = readJson<Record<string, AdapterCheck>>(file, {});
  const gh = createClient({ name: "github-raw", minIntervalMs: 150, timeoutMs: 30_000 });
  const texts = new Map<string, Promise<string | null>>();
  const text = (url: string) => {
    let t = texts.get(url);
    if (!t) {
      t = gh.getText(url).catch(() => null);
      texts.set(url, t);
    }
    return t;
  };
  const stale = addDaysSafe(ctx.today, -7);
  let checked = 0;
  for (const p of protocols) {
    if (!p.kinds.includes("tvl")) continue;
    const prev = cache[p.slug];
    if (prev && prev.checked > stale && ctx.mode !== "backfill" && prev.source === (p.codePath ?? null)) continue;
    const url = rawAdapterUrl(p.codePath);
    const src = url ? await text(url) : null;
    cache[p.slug] = { doublecounted: src === null ? null : adapterDoublecounted(src, p.codePath ?? "", p.module ?? null), source: p.codePath ?? null, checked: ctx.today };
    checked += 1;
  }
  for (const slug of Object.keys(cache)) if (!protocols.some((p) => p.slug === slug)) delete cache[slug];
  if (!ctx.dryRun) writeJsonStable(file, cache);
  const unknown = protocols.filter((p) => p.kinds.includes("tvl") && cache[p.slug]?.doublecounted === null && p.tvl > 100_000).map((p) => p.slug);
  notes.push(`adapters: ${checked} checked on GitHub, ${Object.values(cache).filter((c) => c.doublecounted).length} marked double counted${unknown.length ? `, unreadable above $100K: ${unknown.join(", ")}` : ""}`);
  return cache;
}

/** Attach the per-metric chain-total flags to every protocol. */
export function applyFlags(
  protocols: LlamaProtocolSnap[],
  adapters: Record<string, AdapterCheck>,
  breakdownNames: { volume: Set<string>; fees: Set<string>; revenue: Set<string> },
  prevDay: Map<string, number>,
  prevDate: DateStr,
): LlamaProtocolSnap[] {
  return protocols.map((p) => {
    const dc = adapters[p.slug]?.doublecounted ?? null;
    const v = prevDay.get(p.name);
    return {
      ...p,
      tvlPrevDay: p.kinds.includes("tvl") && v !== undefined ? [prevDate, v] : null,
      inChainTotal: inChainTotal(p, dc, breakdownNames),
      doublecounted: inDoublecountedBucket(p.category, dc),
      tvlExclusion: tvlExclusion(p, dc),
      chainIncome: isChainIncome(p),
    };
  });
}

export function readProtocols(): LlamaProtocolSnap[] {
  return readJson<LlamaProtocolSnap[]>(path.join(DIR, "protocols.json"), []);
}

export function readSeriesFile(name: string): SeriesMap {
  return readJson<SeriesMap>(path.join(DIR, `${name}.json`), {});
}

export function readChain(): ChainHistory {
  return readJson<ChainHistory>(path.join(HISTORY, "chain.json"), {
    defillama: { tvl: [], volume: [], fees: [], revenue: [], holdersRevenue: [], supplySideRevenue: [], activeUsers: [] },
    blockscoutLines: {},
    counters: [],
  });
}

export function writeChain(c: ChainHistory): boolean {
  return writeJsonStable(path.join(HISTORY, "chain.json"), c);
}

export async function fetchProtocols(client: HttpClient): Promise<LlamaProtocolSnap[]> {
  return parseProtocols(await client.getJson<RawProtocol[]>(`${BASE}/protocols`));
}

function mergeMap(existing: SeriesMap, incoming: SeriesMap, today: string): SeriesMap {
  const out: SeriesMap = { ...existing };
  for (const [name, s] of Object.entries(incoming)) out[name] = upsertSeries(existing[name] ?? [], s, { today, allowToday: false });
  return out;
}

export async function run(ctx: Ctx): Promise<RunResult> {
  const client = createClient({ name: "defillama", minIntervalMs: 1000, timeoutMs: 120_000 });
  const notes: string[] = [];
  let rows = 0;

  // 1. Chain overviews: one call per dataType gives every protocol's daily series.
  const chain = readChain();
  const winEnd = addDaysSafe(ctx.today, -1);
  const winStart = addDaysSafe(winEnd, -29);
  const breakdownNames = { volume: new Set<string>(), fees: new Set<string>(), revenue: new Set<string>() };
  const dexs = await fetchOverview(client, "dexs");
  breakdownNames.volume = namesInWindow(parseBreakdown(dexs), winStart, winEnd);
  const overviewProtocols = parseOverviewProtocols(dexs);
  const feeOverviewProtocols: OverviewProtocol[] = [];
  if (!ctx.dryRun) writeJsonStable(path.join(DIR, "volume.json"), mergeMap(readSeriesFile("volume"), parseBreakdown(dexs), ctx.today));
  chain.defillama.volume = upsertSeries(chain.defillama.volume, parseTotalChart(dexs), { today: ctx.today });
  rows += Object.keys(parseBreakdown(dexs)).length;

  const chainKey: Record<keyof typeof FEE_TYPES, "fees" | "revenue" | "holdersRevenue" | "supplySideRevenue"> = {
    fees: "fees",
    revenue: "revenue",
    "holders-revenue": "holdersRevenue",
    "supply-side-revenue": "supplySideRevenue",
  };
  for (const [file, dataType] of Object.entries(FEE_TYPES) as Array<[keyof typeof FEE_TYPES, string]>) {
    try {
      const json = await client.getJson<{ totalDataChart?: Array<[number, number]>; totalDataChartBreakdown?: Breakdown; protocols?: Array<Record<string, unknown>> }>(
        `${BASE}/overview/fees/${CHAIN_OV}?dataType=${dataType}`,
      );
      const bd = parseBreakdown(json);
      if (file === "fees" || file === "revenue") breakdownNames[file] = namesInWindow(bd, winStart, winEnd);
      // Each listing's 30-day revenue and methodology text, so a zero by design can carry its reason (docs/SECTOR-METRICS.md).
      if (file === "revenue" && !ctx.dryRun) writeJsonStable(path.join(DIR, "methodology.json"), parseMethodology(json));
      if (!ctx.dryRun) writeJsonStable(path.join(DIR, `${file}.json`), mergeMap(readSeriesFile(file), bd, ctx.today));
      chain.defillama[chainKey[file]] = upsertSeries(chain.defillama[chainKey[file]], parseTotalChart(json), { today: ctx.today });
      rows += Object.keys(bd).length;
      if (file === "fees") {
        for (const p of parseOverviewProtocols(json)) {
          feeOverviewProtocols.push(p);
          if (!overviewProtocols.some((o) => o.name === p.name)) overviewProtocols.push(p);
        }
      }
    } catch (e) {
      notes.push(`${dataType} failed: ${(e as Error).message}`);
    }
  }
  if (!ctx.dryRun) writeJsonStable(path.join(DIR, "overview-protocols.json"), overviewProtocols.sort((a, b) => a.name.localeCompare(b.name)));

  // 2. Protocol listing merged with overview-only protocols + mapping report.
  const protocols = mergeOverviewProtocols(await fetchProtocols(client), parseOverviewProtocols(dexs), feeOverviewProtocols);
  const map = parseMapRows(readCsvOrEmpty(path.join(DATA, "defillama-map.csv")));
  ctx.meta.newlyDetected = newlyDetected(protocols, map, ctx.meta.newlyDetected, ctx.today);
  ctx.meta.unmatchedMap = unmatchedMapSlugs(map, protocols);
  notes.push(`${protocols.length} protocols on ${CHAIN} (${protocols.filter((p) => p.kinds.includes("tvl")).length} with TVL), ${map.length} map rows, ${ctx.meta.newlyDetected.length} unmapped`);
  if (!map.length) notes.push("defillama-map.csv missing or empty: per-protocol TVL history skipped (run npm run seed:map)");

  // 2b. Mapped protocols missing from the chain breakdown (e.g. Fables) get their own summary call.
  const nameBySlug = new Map(protocols.map((p) => [p.slug, p.name]));
  const dexNames = new Set(parseOverviewProtocols(dexs).map((p) => p.name));
  const feeNames = new Set(feeOverviewProtocols.map((p) => p.name));
  const mapped = Array.from(mappedSlugs(map)).filter((s) => nameBySlug.has(s));
  let summaryCalls = 0;
  const missing = (ctx.meta.cursors.llamaMissing ??= {});
  let skippedMissing = 0;
  const fallback = async (file: string, url: string, name: string) => {
    const existing = readSeriesFile(file);
    if ((existing[name]?.length ?? 0) > 0 && ctx.mode !== "backfill" && existing[name].at(-1)![0] >= addDaysSafe(ctx.today, -3)) return;
    const missKey = `${file}/${name}`;
    // DefiLlama said this protocol has no such data type; re-check monthly instead of daily.
    if (missing[missKey] && missing[missKey] > addDaysSafe(ctx.today, -30) && ctx.mode !== "backfill") {
      skippedMissing += 1;
      return;
    }
    try {
      const s = parseSummaryBreakdown(await client.getJson(url));
      summaryCalls += 1;
      delete missing[missKey];
      if (!s.length) return;
      existing[name] = upsertSeries(existing[name] ?? [], s, { today: ctx.today });
      if (!ctx.dryRun) writeJsonStable(path.join(DIR, `${file}.json`), existing);
    } catch (e) {
      summaryCalls += 1;
      const msg = (e as Error).message;
      if (/not found/i.test(msg) || (e instanceof HttpError && e.status === 400)) missing[missKey] = ctx.today;
      else notes.push(`summary ${file}/${name}: ${msg}`);
    }
  };
  const volumeNames = new Set(Object.keys(readSeriesFile("volume")));
  const feesCovered = new Set(Object.keys(readSeriesFile("fees")));
  for (const slug of mapped) {
    const name = nameBySlug.get(slug)!;
    if (dexNames.has(name) && !volumeNames.has(name)) await fallback("volume", `${BASE}/summary/dexs/${encodeURIComponent(slug)}?dataType=dailyVolume`, name);
    if (feeNames.has(name) && !feesCovered.has(name)) {
      for (const [file, dataType] of Object.entries(FEE_TYPES)) await fallback(file, `${BASE}/summary/fees/${encodeURIComponent(slug)}?dataType=${dataType}`, name);
    }
  }
  if (summaryCalls || skippedMissing) notes.push(`${summaryCalls} per-protocol summary calls for protocols missing from the chain breakdown (${Object.keys(missing).length} known-missing data types, ${skippedMissing} skipped)`);

  // 3. Chain TVL, its double-counted part, active users.
  chain.defillama.tvl = upsertSeries(chain.defillama.tvl, parseChainTvl(await client.getJson(`${BASE}/v2/historicalChainTvl/${CHAIN_Q}`)), { today: ctx.today, allowToday: true });
  const lite = parseLiteCharts(await client.getJson(`${BASE}/lite/charts/${CHAIN_Q}`));
  chain.defillama.tvlGross = upsertSeries(chain.defillama.tvlGross ?? [], lite.gross, { today: ctx.today, allowToday: true });
  chain.defillama.tvlDoublecounted = upsertSeries(chain.defillama.tvlDoublecounted ?? [], lite.doublecounted, { today: ctx.today, allowToday: true });

  // 3b. Chain-total flags: adapter sources, previous-day TVL per protocol, breakdown membership.
  const adapters = await checkAdapters(protocols, ctx, notes);
  const prevDay = parseLitePrevDay(await client.getJson(`${BASE}/lite/protocols2?b=2`));
  // The lite listing's previous-day value is a rolling 24 hours, so it only equals the day's close on the first run after
  // midnight UTC. A later run the same day keeps the values the first run stored, or the double-counted check drifts.
  const stored = new Map(readProtocols().map((p) => [p.slug, p.tvlPrevDay ?? null]));
  const flagged = applyFlags(protocols, adapters, breakdownNames, prevDay, winEnd).map((p) => {
    const kept = stored.get(p.slug);
    return kept && kept[0] === winEnd ? { ...p, tvlPrevDay: kept } : p;
  });
  if (!ctx.dryRun) writeJsonStable(path.join(DIR, "protocols.json"), flagged);
  try {
    const users = await client.getJson<{ totalDataChart?: Array<[number, number]> }>(`${BASE}/overview/active-users/${CHAIN_OV}`);
    chain.defillama.activeUsers = upsertSeries(chain.defillama.activeUsers, parseTotalChart(users), { today: ctx.today });
  } catch (e) {
    notes.push(`active-users failed: ${(e as Error).message}`);
  }
  if (!ctx.dryRun) writeChain(chain);

  // 4. Per-protocol TVL. Daily: today's listing value. Backfill (or thin history): full series per slug.
  const tvl = readSeriesFile("tvl");
  // Borrowed, staking, pool2 and vesting ride along in the same response; none of them is part of TVL.
  const extras = Object.fromEntries(EXTRA_TVL_KEYS.map((k) => [k, readSeriesFile(`tvl-${k}`)])) as Record<(typeof EXTRA_TVL_KEYS)[number], SeriesMap>;
  let extraSeries = 0;
  const slugs = Array.from(mappedSlugs(map)).filter((s) => protocols.some((p) => p.slug === s && p.kinds.includes("tvl")));
  const bySlug = new Map(protocols.map((p) => [p.slug, p]));
  let fetched = 0;
  for (const slug of slugs) {
    const existing = tvl[slug] ?? [];
    // Daily runs re-fetch the full series too, so DefiLlama's revisions to the last 7 days land; older days stay frozen.
    const needFull = ctx.mode === "backfill" || existing.length < 7;
    {
      try {
        // Each response is read once and can run to megabytes, so it never enters the in-run cache.
        const json = await client.getJson<Parameters<typeof parseProtocolTvl>[0]>(`${BASE}/protocol/${encodeURIComponent(slug)}`, { noCache: true });
        const series = parseProtocolTvl(json);
        tvl[slug] = upsertSeries(existing, series, { today: ctx.today, allowToday: true, revisionDays: needFull ? 10_000 : 7 });
        for (const [key, s] of Object.entries(parseProtocolExtras(json, CHAIN)) as Array<[(typeof EXTRA_TVL_KEYS)[number], Series]>) {
          const had = extras[key][slug] ?? [];
          extras[key][slug] = upsertSeries(had, s, { today: ctx.today, allowToday: true, revisionDays: ctx.mode === "backfill" || had.length < 7 ? 10_000 : 7 });
          extraSeries += 1;
        }
        fetched += 1;
        continue;
      } catch (e) {
        notes.push(`protocol/${slug} failed: ${(e as Error).message}`);
      }
    }
    const p = bySlug.get(slug);
    if (p) tvl[slug] = upsertSeries(existing, [[ctx.today, Math.round(p.tvl)]], { today: ctx.today, allowToday: true });
  }
  if (!ctx.dryRun) {
    writeJsonStable(path.join(DIR, "tvl.json"), tvl);
    for (const k of EXTRA_TVL_KEYS) writeJsonStable(path.join(DIR, `tvl-${k}.json`), extras[k]);
  }
  notes.push(`extras: ${extraSeries} borrowed, staking, pool2 or vesting series`);
  rows += slugs.length;
  notes.push(`tvl: ${slugs.length} mapped slugs, ${fetched} series re-fetched`);
  log.debug(client.stats());
  return { rows, calls: client.stats().calls, notes };
}
