/**
 * Reads the CSV and Markdown sources in ./data, joins the committed history
 * under ./data/history (when present), validates, and writes typed JSON to
 * src/data/generated. Never touches the network, so it runs the same on Vercel.
 *
 * Run with: npm run data   (also runs automatically before `next build`)
 */
import fs from "node:fs";
import path from "node:path";
import { addDays, dateRange, daysBetween, utcToday, type DateStr } from "../src/lib/dates";
import type { HistoryMeta, LlamaProtocolSnap, Series } from "../src/lib/history-types";
import type { ChainHistory } from "../src/lib/history-types";
import { projectActivity, type ActivityStore } from "../src/lib/activity";
import { aggregateInvestors, makeResolver, toRound } from "../src/lib/rounds";
import type { MorphoMarketRecord } from "../src/lib/history-types";
import { alignSeries, applyLive, changes, computeCounted, computeLive, projectSeries, dayChange, emptyLive, sparkDates, sumWindow, valueAt, windowEnd, type HistoryStore } from "../src/lib/live";
import { FLAG_METRICS } from "../src/lib/flags";
import { bizModel, type BizModel } from "../src/lib/biz-model";
import { groupExclusions, reconcile, type ReconcileResult } from "../src/lib/reconcile";
import { parseMapRows, slugsByProject } from "../src/lib/mapping";
import { parseMemoInsights, toEvent, toLeader, toProject, uniqueSorted } from "../src/lib/parse";
import { CHAIN_SERIES, TIERS, type ChainData, type ContractInfo, type Meta, type Project, type SeriesFile, type Tier } from "../src/lib/types";
import { validate, type Expected } from "../src/lib/validate";
import { dateFromName, findFile, findFileOrNull, readCsv, readCsvOrEmpty } from "./lib/csv";
import { DATA, GATED, HISTORY, OUT } from "./lib/paths";
import { readJson } from "./lib/store";
import { reversedDrops } from "../src/lib/series-gaps";
import { computeOnchain, onchainSupply, parseStablecoinMap, stablecoinSummary, type OnchainStore } from "../src/lib/onchain";
import { TRACTION_RULES } from "../src/lib/traction";
import { higherTier, onchainTier } from "../src/lib/tier";
import { guardToken } from "../src/lib/token-guard";
import { EXTRA_TVL_KEYS, type ExtraTvlKey, type LlamaMethodology, type MorphoTotalsRow, type NewlyDetected, type SeriesMap, type StablecoinRecord, type TokenDexRecord, type TokenMetaRecord, type TokenSnapRow } from "../src/lib/history-types";
import { describeGap, sourceGap, type SourceGap } from "../src/lib/accuracy";
import { auditedBy, computeMetricFlags, computeSectorMetrics, computeSourceMetrics, OVERVIEW_KEYS, type MarketNow, type OverviewKey, type SectorInputStore, type SourceStore } from "../src/lib/sector-inputs";
import { parseGeckoDexMap } from "../src/lib/venues";
import type { GeckoVenueRecord, LlamaHack, MorphoVaultsFile, YieldPoolsFile } from "../src/lib/history-types";
import { headlineTierInput, isMeasured } from "../src/lib/sector-metrics";
import { checkSignal } from "../src/lib/signal-check";
import { recomputeTier } from "../src/lib/tier";
import { PUBLIC_PROJECT_FIELDS, splitEvents, splitProject } from "../src/lib/public-fields";
import { redFlagTypes, securityResearched } from "../src/lib/red-flags";
import { seedCategories, snapshotCounted } from "../src/lib/snapshot-counted";

function label(d: DateStr): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function sum(rows: Project[], key: "tvl" | "volume" | "fees" | "revenue"): number {
  return rows.reduce((acc, r) => acc + (r[key] ?? 0), 0);
}

function loadActivity(): ActivityStore {
  const dir = path.join(HISTORY, "contracts");
  return {
    counters: readJson(path.join(dir, "counters.json"), {}),
    tokens: readJson(path.join(dir, "tokens.json"), {}),
    activity: readJson(path.join(dir, "activity.json"), {}),
  };
}

function loadContracts(): Map<string, ContractInfo[]> {
  const m = new Map<string, ContractInfo[]>();
  for (const r of readCsvOrEmpty(path.join(DATA, "contracts.csv"))) {
    const address = (r["Address"] ?? "").trim().toLowerCase();
    const project = (r["Project"] ?? "").trim();
    if (!/^0x[0-9a-f]{40}$/.test(address) || !project) continue;
    const arr = m.get(project) ?? [];
    const dec = (r["Decimals"] ?? "").trim();
    arr.push({ address, role: (r["Role"] ?? "").trim().toLowerCase(), verified: (r["Verified"] ?? "").trim(), name: (r["Name"] ?? "").trim(), symbol: (r["Symbol"] ?? "").trim() || null, decimals: dec !== "" && Number.isFinite(Number(dec)) ? Number(dec) : null, source: (r["Source"] ?? "").trim() });
    m.set(project, arr);
  }
  return m;
}

function loadOnchain(): OnchainStore & { chain: Series } {
  return {
    coins: readJson<Record<string, StablecoinRecord>>(path.join(HISTORY, "stablecoins", "coins.json"), {}),
    chain: readJson<Series>(path.join(HISTORY, "stablecoins", "chain.json"), []),
    meta: readJson<Record<string, TokenMetaRecord>>(path.join(HISTORY, "tokens", "meta.json"), {}),
    snaps: readJson<Record<string, TokenSnapRow[]>>(path.join(HISTORY, "tokens", "snapshots.json"), {}),
    dex: readJson<Record<string, TokenDexRecord>>(path.join(HISTORY, "tokens", "dex.json"), {}),
  };
}

function loadHistory(): { meta: HistoryMeta; store: HistoryStore; chain: ChainHistory; protocols: LlamaProtocolSnap[]; sector: SectorInputStore } | null {
  const metaFile = path.join(HISTORY, "_meta.json");
  if (!fs.existsSync(metaFile)) return null;
  const meta = readJson<HistoryMeta>(metaFile, null as unknown as HistoryMeta);
  if (!meta?.lastRunDate) return null;
  const dl = (name: string) => readJson<Record<string, Series>>(path.join(HISTORY, "defillama", `${name}.json`), {});
  const protocols = readJson<LlamaProtocolSnap[]>(path.join(HISTORY, "defillama", "protocols.json"), []);
  const store: HistoryStore = {
    tvl: dl("tvl"),
    volume: dl("volume"),
    fees: dl("fees"),
    revenue: dl("revenue"),
    holdersRevenue: dl("holders-revenue"),
    supplySideRevenue: dl("supply-side-revenue"),
    nameOfSlug: new Map(protocols.map((p) => [p.slug, p.name])),
    mcapOfSlug: new Map(protocols.map((p) => [p.slug, p.mcap])),
  };
  const chain = readJson<ChainHistory>(path.join(HISTORY, "chain.json"), {
    defillama: { tvl: [], volume: [], fees: [], revenue: [], holdersRevenue: [], supplySideRevenue: [], activeUsers: [] },
    blockscoutLines: {},
    counters: [],
  });
  // Sector metric inputs (docs/SECTOR-METRICS.md): series DefiLlama reports beside TVL, its methodology text and Morpho's own totals.
  const sector: SectorInputStore = {
    extras: Object.fromEntries(EXTRA_TVL_KEYS.map((k) => [k, dl(`tvl-${k}`)])) as Record<ExtraTvlKey, SeriesMap>,
    methodology: readJson<Record<string, LlamaMethodology>>(path.join(HISTORY, "defillama", "methodology.json"), {}),
    nameOfSlug: store.nameOfSlug,
    morphoTotals: readJson<MorphoTotalsRow[]>(path.join(HISTORY, "morpho", "totals.json"), []),
    exclusionOf: new Map(protocols.map((p) => [p.slug, p.tvlExclusion ?? null])),
  };
  return { meta, store, chain, protocols, sector };
}

/** History files of the sources added for the sector metrics; every one is optional, so a source that has not run yet changes nothing. */
const OVERVIEW_FILE: Record<OverviewKey, string> = { aggVolume: "aggregator-volume", bridgeAggVolume: "bridge-aggregator-volume", openInterest: "open-interest", optionsNotional: "options-notional", optionsPremium: "options-premium" };

function loadSources(end: DateStr): SourceStore {
  const dl = (name: string) => readJson<SeriesMap>(path.join(HISTORY, "defillama", `${name}.json`), {});
  // The last reading of each Morpho market at or before the day after `end` (the refresh runs a day after the window closes).
  const markets: MarketNow[] = [];
  let marketsAsOf: DateStr | null = null;
  for (const m of Object.values(readJson<Record<string, MorphoMarketRecord>>(path.join(HISTORY, "morpho", "markets.json"), {}))) {
    const row = m.series.filter((r) => r[0] <= addDays(end, 1) && r[0] >= addDays(end, -7)).at(-1);
    if (!row) continue;
    if (!marketsAsOf || row[0] > marketsAsOf) marketsAsOf = row[0];
    markets.push({ loan: m.loan?.address ?? null, collateral: m.lookAlike ? null : (m.collateral?.address ?? null), supplyUsd: row[1] ?? 0, borrowUsd: row[2] ?? 0, collateralUsd: row[3] ?? 0 });
  }
  return {
    overview: Object.fromEntries(OVERVIEW_KEYS.map((k) => [k, dl(OVERVIEW_FILE[k])])) as Record<OverviewKey, SeriesMap>,
    overviewNames: readJson<Record<string, string>>(path.join(HISTORY, "defillama", "overview-names.json"), {}),
    yields: readJson<YieldPoolsFile | null>(path.join(HISTORY, "yields", "pools.json"), null),
    vaults: readJson<MorphoVaultsFile | null>(path.join(HISTORY, "morpho", "vaults.json"), null),
    markets,
    marketsAsOf,
    stockAddresses: new Set<string>(),
    venues: readJson<Record<string, GeckoVenueRecord>>(path.join(HISTORY, "gecko", "venues.json"), {}),
    dexMap: parseGeckoDexMap(readCsvOrEmpty(path.join(DATA, "gecko-dex-map.csv"))),
  };
}

function buildChain(chain: ChainHistory, end: DateStr): ChainData {
  const all: Series[] = [...CHAIN_SERIES.map((k) => chain.defillama[k]), ...Object.values(chain.blockscoutLines)];
  const firsts = all.filter((s) => s.length).map((s) => s[0][0]);
  const start = firsts.length ? firsts.sort()[0] : end;
  const dates = dateRange(start, end);
  const defillama = {} as ChainData["defillama"];
  for (const k of CHAIN_SERIES) defillama[k] = alignSeries(chain.defillama[k], dates, k === "tvl" ? "stock" : "flow");
  const blockscout: Record<string, Array<number | null>> = {};
  for (const [k, s] of Object.entries(chain.blockscoutLines)) blockscout[k] = alignSeries(s, dates, "flow");
  const lines = chain.blockscoutLines;
  const txns = lines.newTxns ?? [];
  const active = lines.activeAccounts ?? [];
  return {
    dates,
    defillama,
    blockscout,
    counters: chain.counters.at(-1)?.[1] ?? {},
    latest: {
      asOf: end,
      tvl: valueAt(chain.defillama.tvl, end),
      volume30d: sumWindow(chain.defillama.volume, end, 30).value,
      fees30d: sumWindow(chain.defillama.fees, end, 30).value,
      revenue30d: sumWindow(chain.defillama.revenue, end, 30).value,
      activeUsers: valueAt(chain.defillama.activeUsers, end),
      activeAccounts: valueAt(active, end),
      txns: valueAt(txns, end),
      change: {
        tvl: changes(chain.defillama.tvl, end, "stock"),
        volume: changes(chain.defillama.volume, end, "flow"),
        fees: changes(chain.defillama.fees, end, "flow"),
        revenue: changes(chain.defillama.revenue, end, "flow"),
        // Daily counts: the last full day against the same day 7, 30 or 90 days earlier.
        activeAccounts: { d7: dayChange(active, end, 7), d30: dayChange(active, end, 30), d90: dayChange(active, end, 90) },
        txns: { d7: dayChange(txns, end, 7), d30: dayChange(txns, end, 30), d90: dayChange(txns, end, 90) },
      },
    },
  };
}

function dayOverDay(s: Series): number | null {
  if (s.length < 2) return null;
  const [, a] = s[s.length - 2];
  const [, b] = s[s.length - 1];
  return a > 0 ? b / a : null;
}

function main() {
  const projectsFile = findFile("base-ecosystem-", ".csv");
  const leadersFile = findFileOrNull("base-sector-leaders", ".csv");
  const eventsFile = findFileOrNull("base-events", ".csv");
  const notesFile = path.join(DATA, "analyst-notes.md");
  const expected = JSON.parse(fs.readFileSync(path.join(DATA, "expected.json"), "utf8")) as Expected;
  const snapshotAsOf = dateFromName(projectsFile) ?? utcToday();

  const snapshotProjects = readCsv(projectsFile).map(toProject).map((p) => ({ ...p, snapshot: { ...p.snapshot, asOf: snapshotAsOf } }));
  const idByName = new Map(snapshotProjects.map((p) => [p.name.toLowerCase(), p.id]));
  const dupes = snapshotProjects.map((p) => p.id).filter((id, i, arr) => arr.indexOf(id) !== i);
  if (dupes.length) throw new Error(`Duplicate project ids: ${dupes.join(", ")}`);

  // History join.
  const history = loadHistory();
  const map = parseMapRows(readCsvOrEmpty(path.join(DATA, "defillama-map.csv")));
  const slugsOf = slugsByProject(map);
  const end = history ? windowEnd(history.meta.lastRunDate as DateStr) : null;
  const activityStore = loadActivity();
  const contractsOf = loadContracts();
  const onchainStore = loadOnchain();
  const stableMap = parseStablecoinMap(readCsvOrEmpty(path.join(DATA, "stablecoin-map.csv")));
  const txnsSeries = new Map<string, Series>();
  // Chain-total flags per slug (written by the DefiLlama fetcher); a project's Overview values use only flagged slugs.
  const flagsOf = new Map((history?.protocols ?? []).filter((p) => p.inChainTotal).map((p) => [p.slug, p.inChainTotal!]));
  const tvlOfSlug = new Map((history?.protocols ?? []).map((p) => [p.slug, p.tvl]));
  const sources = end ? loadSources(end) : null;
  const seedCats = seedCategories(readCsv(findFile("base-defillama-map-", ".csv")));
  const projects: Project[] = snapshotProjects.map((p) => {
    const contracts = contractsOf.get(p.name) ?? [];
    if (!history || !end) {
      const snap = snapshotCounted(p, seedCats.get(p.name));
      return { ...p, contracts, counted: snap.counted, metricFlags: Object.keys(snap.flags).length ? snap.flags : undefined };
    }
    const slugs = slugsOf.get(p.name) ?? [];
    let live = slugs.length ? computeLive(slugs, history.store, end) : null;
    const act = projectActivity(contracts, activityStore, end);
    if (act) {
      live = { ...(live ?? emptyLive(end, slugs)), txns24h: act.txns24h, txns7d: act.txns7d, uniqueSenders7d: act.uniqueSenders7d, holders: act.holders, activityAsOf: act.activityAsOf, activityPartial: act.skippedLarge };
      if (act.txns.length) txnsSeries.set(p.id, act.txns);
    }
    const counted = slugs.length ? computeCounted(slugs, history.store, end, flagsOf) : null;
    // Business model chart: only listings counted in the chain total for both fees and revenue.
    const bizNames = slugs.filter((s) => flagsOf.get(s)?.fees && flagsOf.get(s)?.revenue).map((s) => history.store.nameOfSlug.get(s)).filter((n): n is string => Boolean(n));
    const biz: BizModel | null = bizNames.length ? bizModel(bizNames, history.store.fees, history.store.revenue, end) : null;
    const withLive = applyLive(p, live);
    const onchain = computeOnchain(
      contracts.map((c) => ({ address: c.address, role: c.role, symbol: c.symbol ?? null })),
      stableMap.filter((m) => m.project === p.name),
      onchainStore,
      end,
    );
    // Supply counts like TVL and token volume like 30-day volume, at the same thresholds; holders never set a tier.
    const onchainTiered = onchain ? higherTier(withLive.tier, onchainTier({ supply: onchainSupply(onchain), tokenVolume: onchain.tokenVolume30d }, TRACTION_RULES)) : withLive.tier;
    const sectorMetrics = {
      ...computeSectorMetrics(withLive, slugs, history.sector, end),
      ...computeSourceMetrics(
        { name: p.name, tokens: contracts.filter((c) => c.role === "rwa-token" || c.role === "project-token").map((c) => c.address), stables: stableMap.filter((m) => m.project === p.name && m.address).map((m) => m.address as string) },
        slugs,
        history.store.nameOfSlug,
        sources as SourceStore,
        end,
      ),
    };
    const metricFlags = computeMetricFlags({ ...withLive, counted }, slugs, (s) => tvlOfSlug.get(s) ?? 0, history.sector.exclusionOf);
    const joined: Project = { ...withLive, tier: onchainTiered, contracts, counted, biz, onchain, sectorMetrics, metricFlags };
    // The sector's headline feeds the same thresholds: deposits count like TVL, routed or launch volume like 30-day volume.
    const head = headlineTierInput(joined);
    const tier = higherTier(onchainTiered, recomputeTier({ tvl: head.tvl, volume: head.volume, fees: null, revenue: null }));
    return { ...joined, tier };
  });

  // Spoof guard: a mapped token whose Blockscout identity contradicts its listed source fails the build.
  const projectNames = new Set(snapshotProjects.map((p) => p.name));
  const guardIssues: string[] = [];
  for (const [project, list] of contractsOf) {
    if (!projectNames.has(project)) guardIssues.push(`${project} has no row in the ecosystem CSV`);
    for (const c of list) for (const problem of guardToken({ project, address: c.address, role: c.role, symbol: c.symbol ?? null, decimals: c.decimals ?? null, name: c.name || null }, onchainStore.meta[c.address])) guardIssues.push(`${project} ${c.address}, ${problem}`);
  }
  for (const m of stableMap) {
    if (m.project && !projectNames.has(m.project)) guardIssues.push(`stablecoin-map ${m.symbol}, project ${m.project} has no row in the ecosystem CSV`);
    if (m.address) for (const problem of guardToken({ project: m.project, address: m.address, role: "stablecoin", symbol: m.symbol, decimals: m.decimals, name: null }, onchainStore.meta[m.address])) guardIssues.push(`stablecoin-map ${m.symbol} ${m.address}, ${problem}`);
  }
  if (guardIssues.length) {
    console.error(`\nToken mapping check failed.\n  ${guardIssues.join("\n  ")}\nFix data/contracts.csv or data/stablecoin-map.csv from the issuer's own source.\n`);
    process.exit(1);
  }
  const stablecoins = end ? stablecoinSummary(onchainStore.coins, onchainStore.chain, stableMap, projectNames, end) : null;
  // Coins with no ecosystem row are listed for review, like unmapped DefiLlama protocols.
  const mappedIds = new Set(stableMap.filter((m) => projectNames.has(m.project)).map((m) => m.llamaId));
  const newStablecoins: NewlyDetected[] = (stablecoins?.coins ?? [])
    .filter((c) => !mappedIds.has(c.id) && c.usd >= 1000)
    .map((c) => ({ kind: "stablecoin", slug: `stablecoin:${c.id}`, name: `${c.name} (${c.symbol})`, category: "Stablecoin", parentProtocol: null, tvl: c.usd, firstSeen: onchainStore.coins[c.id]?.series[0]?.[0] ?? (end as string), url: `https://defillama.com/stablecoin/${c.id}` }));

  const leaders = leadersFile ? readCsv(leadersFile).map((r) => toLeader(r, idByName)) : [];
  for (const l of leaders) {
    const p = l.projectId ? projects.find((x) => x.id === l.projectId) : undefined;
    if (p) p.leaderRank = l.rank;
  }
  const unmatchedLeaders = leaders.filter((l) => !l.projectId).map((l) => l.name);
  const events = (eventsFile ? readCsv(eventsFile) : [])
    .map((r, i) => toEvent(r, i + 2, idByName))
    .sort((a, b) => a.date.localeCompare(b.date));
  const insights = fs.existsSync(notesFile) ? parseMemoInsights(fs.readFileSync(notesFile, "utf8")) : [];

  // Series + chain files.
  let series: SeriesFile = { dates: [], projects: {} };
  const dropFlags: string[] = [];
  let chain: ChainData | null = null;
  if (history && end) {
    const dates = sparkDates(end, 90);
    series = { dates, projects: {} };
    for (const p of projects) {
      if (!p.live) continue;
      const slugs = slugsOf.get(p.name) ?? [];
      const names = slugs.map((s) => history.store.nameOfSlug.get(s)).filter((n): n is string => Boolean(n));
      const pick = (m: Record<string, Series>, keys: string[]) => {
        const merged = new Map<string, number>();
        for (const k of keys) for (const [d, v] of m[k] ?? []) merged.set(d, (merged.get(d) ?? 0) + v);
        return Array.from(merged.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)) as Series;
      };
      series.projects[p.id] = {
        // The same gap-carried TVL sum the headline figure uses (src/lib/series-gaps.ts).
        tvl: alignSeries(projectSeries(slugs, history.store).tvl, dates, "stock"),
        volume: alignSeries(pick(history.store.volume, names), dates, "flow"),
        fees: alignSeries(pick(history.store.fees, names), dates, "flow"),
        revenue: alignSeries(pick(history.store.revenue, names), dates, "flow"),
        txns: alignSeries(txnsSeries.get(p.id) ?? [], dates, "flow"),
      };
    }
    chain = buildChain(history.chain, end);
    // Level series that fall by more than half and come back within three days: whatever is left after gap carrying is flagged.
    const fmtM = (v: number) => `$${(v / 1e6).toFixed(1)}M`;
    const flag = (label: string, ser: Series) => {
      for (const r of reversedDrops(ser, { floor: 100_000 })) dropFlags.push(`${label} ${r.date} ${fmtM(r.from)} to ${fmtM(r.low)}, back by ${r.recovered}`);
    };
    for (const p of projects) {
      const slugs = slugsOf.get(p.name) ?? [];
      if (slugs.length) flag(p.name, projectSeries(slugs, history.store).tvl);
    }
    flag("Chain TVL", history.chain.defillama.tvl);
    flag("Chain stablecoins", onchainStore.chain);
  }

  // Chain-total reconciliation (owner review 2026-11-09): counted protocols must match DefiLlama's chain totals within 1%.
  let rec: ReconcileResult | null = null;
  if (history && end) {
    if (!history.protocols.some((p) => p.inChainTotal)) {
      console.error("\nChain-total flags are missing from data/history/defillama/protocols.json. Run npm run refresh -- --only defillama.\n");
      process.exit(1);
    }
    const c = history.chain.defillama;
    rec = reconcile(history.protocols, { volume: history.store.volume, fees: history.store.fees, revenue: history.store.revenue }, { tvl: c.tvl, tvlDoublecounted: c.tvlDoublecounted ?? [], volume: c.volume, fees: c.fees, revenue: c.revenue }, end);
  }

  // Funding rounds and investors.
  const roundsFile = findFile("base-funding-rounds-", ".csv");
  const resolve = makeResolver(projects);
  const rounds = readCsv(roundsFile).map((r, i) => toRound(r, i + 2, resolve));
  const investors = aggregateInvestors(rounds);
  const unresolvedRounds = Array.from(new Set(rounds.filter((r) => !r.projectId).map((r) => r.project)));

  const asOf = end ?? snapshotAsOf;

  // Sector facts, signal dates and the unmeasured tier (docs/SECTOR-METRICS.md, sections 0 and 1).
  const sourceGaps: SourceGap[] = [];
  const signalReview: string[] = [];
  if (history && end) {
    for (const p of projects) {
      const sm: NonNullable<Project["sectorMetrics"]> = { ...(p.sectorMetrics ?? {}) };
      if (p.sector === "Security, Risk & Compliance") {
        const n = auditedBy(p.name, projects);
        if (n > 0) sm.auditedProjects = { v: n, asOf: snapshotAsOf };
      }
      // One source per number: Morpho's own API is primary for its deposits, DefiLlama is the cross-check.
      const { borrowedLlama, ...kept } = sm;
      if (kept.lendingSupply && kept.deposited && kept.borrowed && borrowedLlama && p.live?.tvl != null) {
        sourceGaps.push(sourceGap(p.name, "total deposited", true, { source: "Morpho API", value: kept.deposited.v, asOf: kept.deposited.asOf as DateStr }, { source: "DefiLlama TVL plus borrowed", value: p.live.tvl + borrowedLlama.v, asOf: p.live.asOf as DateStr }));
        sourceGaps.push(sourceGap(p.name, "borrowed", false, { source: "Morpho API", value: kept.borrowed.v, asOf: kept.borrowed.asOf as DateStr }, { source: "DefiLlama", value: borrowedLlama.v, asOf: borrowedLlama.asOf as DateStr }));
      }
      p.sectorMetrics = Object.keys(kept).length ? kept : undefined;
      if (p.metricFlags && !Object.keys(p.metricFlags).length) p.metricFlags = undefined;
      p.signal = checkSignal(p.otherTraction, snapshotAsOf as DateStr, { tvl: p.tvl, deposited: kept.deposited?.v ?? null, supply: onchainSupply(p.onchain), volume30d: p.volume }, end);
      if (p.signal?.conflict) {
        const c = p.signal.conflict;
        signalReview.push(`${p.name}, signal says ${c.kind} $${(c.signal / 1e6).toFixed(1)}M, live is $${(c.live / 1e6).toFixed(1)}M (${(c.gap * 100).toFixed(0)}% apart), signal dated ${p.signal.asOf}${p.signal.dated ? "" : " (snapshot day)"}${p.signal.older ? ", hidden behind Older figure" : ""}`);
      }
    }
    // Stablecoin supply: DefiLlama is primary, Blockscout supply times price is the cross-check where the address is mapped.
    for (const s of stableMap) {
      if (!s.address || !projectNames.has(s.project)) continue;
      const coin = onchainStore.coins[s.llamaId];
      const llama = coin ? valueAt(coin.series, end, 3) : null;
      const snap = (onchainStore.snaps[s.address] ?? []).filter((r) => r[0] <= addDays(end, 1) && r[0] >= addDays(end, -7)).at(-1);
      if (!coin || llama === null || !snap || snap[2] === null || snap[3] === null) continue;
      const llamaDay = coin.series.filter(([d]) => d <= end).at(-1)?.[0] ?? end;
      sourceGaps.push(sourceGap(s.project, `${s.symbol} supply on the chain`, true, { source: "DefiLlama", value: llama, asOf: llamaDay as DateStr }, { source: "Blockscout supply times price", value: snap[2] * snap[3], asOf: snap[0] as DateStr }));
    }
  }
  // Signal dates work from the snapshot alone; with history the loop above also checks them against live figures.
  if (!history) for (const p of projects) p.signal = checkSignal(p.otherTraction, snapshotAsOf as DateStr, { tvl: p.tvl, deposited: null, supply: null, volume30d: p.volume }, snapshotAsOf as DateStr);
  // Sectors with no traction metric carry no tier at all, never TBD (docs/reference/robinhood-sector-metrics-spec.md, section 1).
  for (const p of projects) if (!isMeasured(p)) p.tier = "Not applicable";
  const tierCounts = {} as Record<Tier, number>;
  for (const t of TIERS) tierCounts[t] = projects.filter((p) => p.tier === t).length;
  const perSource: Meta["live"] extends infer L ? (L extends { perSource: infer P } ? P : never) : never = {};
  if (history) {
    for (const [id, st] of Object.entries(history.meta.perSource)) {
      perSource[id] = { ok: !st.error && !st.skipped, lastSuccess: st.lastSuccess, error: st.error, skipped: st.skipped };
    }
  }
  const unmatchedCsv = snapshotProjects.filter((p) => p.hasTraction && !(slugsOf.get(p.name)?.length)).map((p) => p.name);

  const meta: Meta = {
    asOf,
    asOfLabel: label(asOf),
    snapshotAsOf,
    snapshotAsOfLabel: label(snapshotAsOf),
    live: history && end ? { lastRun: history.meta.lastRun ?? "", windowEnd: end, perSource } : null,
    counts: {
      projects: projects.length,
      sectors: new Set(projects.map((p) => p.sector)).size,
      leaders: leaders.length,
      events: events.length,
      tier1: tierCounts["Tier 1 - Leader"],
      liveProjects: projects.filter((p) => p.live).length,
      newlyDetected: history?.meta.newlyDetected.length ?? 0,
      mappedSlugs: map.filter((r) => r.project).length,
      rounds: rounds.length,
      investors: investors.length,
    },
    totals: { tvl: sum(projects, "tvl"), volume: sum(projects, "volume"), fees: sum(projects, "fees"), revenue: sum(projects, "revenue") },
    snapshotTotals: {
      tvl: sum(snapshotProjects, "tvl"),
      volume: sum(snapshotProjects, "volume"),
      fees: sum(snapshotProjects, "fees"),
      revenue: sum(snapshotProjects, "revenue"),
    },
    chainTotals: rec
      ? {
          windowStart: addDays(rec.windowEnd, -29),
          windowEnd: rec.windowEnd,
          checks: rec.checks.map((c) => ({ id: c.id, label: c.label, ours: c.ours, theirs: c.theirs, gap: c.gap, ok: c.ok })),
          atlas: rec.atlas,
          excluded: Object.fromEntries(FLAG_METRICS.map((m) => [m, groupExclusions(rec!.excluded[m]).map((g) => ({ ...g, names: g.names.slice(0, 5) }))])) as NonNullable<Meta["chainTotals"]>["excluded"],
        }
      : null,
    tierCounts,
    stablecoins,
    sectors: uniqueSorted(projects.map((p) => p.sector)),
    chains: uniqueSorted(projects.map((p) => p.chain)),
    tiers: uniqueSorted(projects.map((p) => p.tier)),
    statuses: uniqueSorted(projects.map((p) => p.status)),
    fundingTypes: uniqueSorted(projects.flatMap((p) => p.fundingTypes)),
    // Counts only, for the public Methodology and insights lines; the per-project facts are gated.
    research: {
      fundingChecked: projects.filter((p) => p.fundingType !== "Not researched").length,
      securityResearched: projects.filter((p) => securityResearched(p)).length,
      redFlagged: projects.filter((p) => redFlagTypes(p).length > 0).length,
    },
    discoveredVia: uniqueSorted(projects.map((p) => p.discoveredVia)),
  };

  // Accuracy rule 3: a headline figure two sources disagree on by more than 10% stops the build.
  const failedGaps = sourceGaps.filter((g) => g.fail);
  if (failedGaps.length) {
    console.error(`\nSource gap check failed (over 10% on a headline metric).\n  ${failedGaps.map(describeGap).join("\n  ")}\nFind which source is wrong before publishing either figure.\n`);
    process.exit(1);
  }

  // Validation.
  const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
  const result = validate(expected, {
    static: {
      projects: snapshotProjects.length,
      sectors: new Set(snapshotProjects.map((p) => p.sector)).size,
      subcategories: new Set(snapshotProjects.map((p) => p.subcategory ?? "")).size,
      nativeChains: new Set(snapshotProjects.map((p) => p.chain)).size,
      tier1: snapshotProjects.filter((p) => p.snapshot.tier === "Tier 1 - Leader").length,
      tier2: snapshotProjects.filter((p) => p.snapshot.tier === "Tier 2 - Strong").length,
      tier3: snapshotProjects.filter((p) => p.snapshot.tier === "Tier 3 - Emerging").length,
      trackedNegligible: snapshotProjects.filter((p) => p.snapshot.tier === "Tracked, negligible").length,
      notTracked: snapshotProjects.filter((p) => p.snapshot.tier === "Not tracked").length,
      rounds: rounds.length,
      roundsBaseRelated: rounds.filter((r) => r.related).length,
      defillamaSeedRows: readCsv(findFile("base-defillama-map-", ".csv")).length,
    },
    snapshot: {
      tvl: meta.snapshotTotals.tvl,
      volume: meta.snapshotTotals.volume,
      fees: meta.snapshotTotals.fees,
      revenue: meta.snapshotTotals.revenue,
    },
    live: history ? { tvl: meta.totals.tvl, volume: meta.totals.volume, fees: meta.totals.fees, revenue: meta.totals.revenue } : {},
    liveVsSnapshot: history
      ? {
          tvl: ratio(meta.totals.tvl, meta.snapshotTotals.tvl),
          volume: ratio(meta.totals.volume, meta.snapshotTotals.volume),
          fees: ratio(meta.totals.fees, meta.snapshotTotals.fees),
          revenue: ratio(meta.totals.revenue, meta.snapshotTotals.revenue),
        }
      : {},
    dayOverDay: history
      ? {
          tvl: dayOverDay(history.chain.defillama.tvl),
          volume: dayOverDay(history.chain.defillama.volume),
          fees: dayOverDay(history.chain.defillama.fees),
          activeAccounts: dayOverDay(history.chain.blockscoutLines.activeAccounts ?? []),
        }
      : {},
    sourceErrors: history ? Object.entries(history.meta.perSource).filter(([, s]) => s.error).map(([id, s]) => `${id}: ${s.error}`) : [],
    lastRunAgeDays: history?.meta.lastRunDate ? daysBetween(history.meta.lastRunDate as DateStr, utcToday()) : null,
  });

  console.log(`\nBase Ecosystem Atlas data build (as of ${meta.asOfLabel}${history ? "" : ", snapshot only: no data/history found"})`);
  console.log(`  projects: ${path.basename(projectsFile)}   leaders: ${leadersFile ? path.basename(leadersFile) : "none yet"}   events: ${eventsFile ? path.basename(eventsFile) : "none yet"}\n`);
  console.log("  group     check          expected              actual  ok");
  for (const r of result.rows) {
    console.log(`  ${r.group.padEnd(9)} ${r.key.padEnd(14)} ${r.expected.padStart(10)} ${r.actual.padStart(19)}  ${r.ok ? "✓" : "✗"}`);
  }
  if (history) {
    const fmt = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
    console.log(`\n  live vs snapshot totals: tvl ${fmt(meta.totals.tvl)} vs ${fmt(meta.snapshotTotals.tvl)} · volume ${fmt(meta.totals.volume)} vs ${fmt(meta.snapshotTotals.volume)} · fees ${fmt(meta.totals.fees)} vs ${fmt(meta.snapshotTotals.fees)} · revenue ${fmt(meta.totals.revenue)} vs ${fmt(meta.snapshotTotals.revenue)}`);
    console.log(`  window end ${end} · ${meta.counts.liveProjects} projects with live data · tiers ${TIERS.map((t) => `${t.split(" ")[0]} ${t.split(" ")[1]}: ${tierCounts[t]}`).join(", ")}`);
    console.log(`  mapping: ${meta.counts.mappedSlugs} slugs · ${history.meta.newlyDetected.length} unmapped DefiLlama protocols · CSV projects with metrics but no map row: ${unmatchedCsv.length ? unmatchedCsv.join(", ") : "none"}`);
    const sparkCount = Object.keys(series.projects).length;
    console.log(`  series: ${sparkCount} projects × ${series.dates.length} days · chain: ${chain?.dates.length ?? 0} days from ${chain?.dates[0] ?? "-"}`);
    console.log(`  activity: ${contractsOf.size} projects with tracked contracts · ${projects.filter((p) => p.live?.txns7d !== null && p.live?.txns7d !== undefined).length} with 7d transactions · ${projects.filter((p) => p.live?.holders).length} with holder counts`);
  }
  console.log(`  memo insights parsed: ${insights.length}`);
  if (dropFlags.length) console.log(`  TVL drops over 50% that reverse within 3 days (check the listing on DefiLlama): ${dropFlags.join("; ")}`);
  else if (history) console.log("  TVL drops over 50% that reverse within 3 days: none");
  console.log(`  rounds: ${rounds.length} (${rounds.filter((r) => r.projectId).length} linked to a project row, ${rounds.filter((r) => r.confidence !== "Sourced").length} prior-knowledge) · investors: ${investors.length}`);
  console.log(`  top 30 investors by rounds: ${investors.slice(0, 30).map((i) => `${i.name} ${i.deals}`).join(", ")}`);
  if (unresolvedRounds.length) {
    console.error(`\nRound projects without a row in the ecosystem CSV: ${unresolvedRounds.join(", ")}. Fix the name or add an alias in src/lib/rounds.ts.\n`);
    process.exit(1);
  }
  if (unmatchedLeaders.length) console.log(`  leaders without a project row: ${unmatchedLeaders.join(", ")}`);
  const unmatchedEventRefs = uniqueSorted(events.flatMap((e) => e.projects).filter((n) => !idByName.has(n.toLowerCase())));
  if (unmatchedEventRefs.length) console.log(`  event project refs without a row: ${unmatchedEventRefs.join(", ")}`);
  for (const w of result.warnings) console.log(`  warning: ${w}`);
  const bizErrors = projects.filter((p) => p.biz && Object.values(p.biz).some((b) => b?.error));
  if (bizErrors.length) console.log(`  business model: revenue above fees, left off the chart: ${bizErrors.map((p) => `${p.name} (${Object.entries(p.biz ?? {}).filter(([, b]) => b?.error).map(([k]) => k).join(", ")})`).join("; ")}`);
  if (rec) {
    const fmt = (v: number | null) => (v === null ? "none" : `$${Math.round(v).toLocaleString("en-US")}`);
    console.log(`\n  chain totals, ${addDays(rec.windowEnd, -29)} to ${rec.windowEnd} (TVL on ${rec.windowEnd})`);
    for (const c of rec.checks) console.log(`  ${c.label.padEnd(26)} ours ${fmt(c.ours).padStart(16)}  DefiLlama ${fmt(c.theirs).padStart(16)}  gap ${c.gap === null ? "none" : `${(c.gap * 100).toFixed(2)}%`}  ${c.ok ? "✓" : "✗"}`);
    for (const m of FLAG_METRICS) console.log(`  atlas ${m.padEnd(8)} ${fmt(rec.atlas[m]).padStart(16)}, excluded ${groupExclusions(rec.excluded[m]).map((g) => `${g.label} ${g.count} (${fmt(g.value)})`).join(", ") || "none"}`);
    const miss = rec.checks.filter((c) => !c.ok);
    if (miss.length) {
      for (const c of miss) {
        console.error(`\n  ${c.label} misses DefiLlama by ${c.gap === null ? "an unknown amount (no DefiLlama value on that day)" : `${(c.gap * 100).toFixed(2)}%`}. Top contributors to the gap:`);
        for (const t of c.contributors) console.error(`    ${t.name.padEnd(36)} ${fmt(t.value)}`);
      }
      console.error("\nChain-total reconciliation failed. Check the flags in src/lib/flags.ts and data/history/defillama/adapters.json.\n");
      process.exit(1);
    }
  }
  if (history) {
    // Accuracy rules (docs/SECTOR-METRICS.md, section 0): the gap between two sources for one number, and signals that disagree with live data.
    console.log(`\n  source gaps (the first source is shown, the second is the cross-check): ${sourceGaps.length ? "" : "none"}`);
    for (const g of sourceGaps) console.log(`    ${describeGap(g)}${g.headline ? "" : " (logged only)"}`);
    console.log(`  signals to review, off by more than 25% from the live metric of the same kind: ${signalReview.length ? "" : "none"}`);
    for (const s of signalReview) console.log(`    ${s}`);
    console.log(`  sector metrics: ${projects.filter((p) => p.sectorMetrics).length} projects carry one, ${projects.filter((p) => p.sectorMetrics?.revenueZero).length} with revenue of zero by design, ${projects.filter((p) => p.tier === "Not applicable").length} in unmeasured sectors`);
  }
  if (stablecoins) {
    const fmt = (v: number | null) => (v === null ? "none" : `$${Math.round(v).toLocaleString("en-US")}`);
    const gap = stablecoins.mappedShare === null ? null : 1 - stablecoins.mappedShare;
    console.log(`\n  stablecoins on ${stablecoins.asOf}: chain ${fmt(stablecoins.total)}, mapped to projects ${fmt(stablecoins.mapped)} (${gap === null ? "no chain total" : `${(gap * 100).toFixed(1)}% unmapped`})`);
    if (gap === null || gap > 0.05) console.log(`  unmapped stablecoins: ${stablecoins.coins.filter((c) => !c.project).map((c) => `${c.symbol} ${fmt(c.usd)}`).join(", ") || "none"}`);
  }
  const withOnchain = projects.filter((p) => p.onchain);
  console.log(`  onchain traction: ${withOnchain.length} projects with onchain metrics, ${withOnchain.filter((p) => (p.onchain?.tokenVolume30d ?? 0) > 0).length} with token volume, ${withOnchain.filter((p) => p.onchain?.nftHolders).length} with NFT holders`);
  if (result.failures.length) {
    console.error(`\nValidation failed: ${result.failures.join("; ")}. Update data/expected.json if the new data is intentional.\n`);
    process.exit(1);
  }

  // Public set (src/data/generated, imported by the browser) and gated set (src/data/gated, read only by the
  // /api/data route handlers for signed-in readers). Both folders are rebuilt from scratch so a file that moved
  // to the gated set can never linger in the public one (owner prompt, login wall phase 2).
  for (const dir of [OUT, GATED]) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }
  const write = (name: string, value: unknown) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(value));
  const writeGated = (name: string, value: unknown) => fs.writeFileSync(path.join(GATED, name), JSON.stringify(value));
  const split = projects.map(splitProject);
  const ev = splitEvents(events);
  write("projects.json", split.map((x) => x.public));
  write("events.json", ev.public);
  write("meta.json", meta);
  write("series.json", series);
  write(
    "chain.json",
    chain ?? {
      dates: [],
      defillama: Object.fromEntries(CHAIN_SERIES.map((k) => [k, []])),
      blockscout: {},
      counters: {},
      latest: { asOf: asOf, tvl: null, volume30d: null, fees30d: null, revenue30d: null, activeUsers: null, activeAccounts: null, txns: null, change: {} },
    },
  );
  writeGated("gated.json", {
    projects: Object.fromEntries(projects.map((p, i) => [p.id, split[i].gated])),
    eventDetails: ev.gated,
    leaders,
    insights,
    rounds,
    investors,
    // Incidents DefiLlama records for the chain; chain level only, for the Security page (docs/SECTOR-METRICS.md).
    hacks: readJson<LlamaHack[]>(path.join(HISTORY, "defillama", "hacks.json"), []),
    newlyDetected: {
      items: [...newStablecoins, ...(history?.meta.newlyDetected ?? [])],
      unmatchedCsv,
      unmatchedMap: history?.meta.unmatchedMap ?? [],
    },
  });
  // A public file must never carry a gated project key.
  const leaked = Object.keys(split[0]?.public ?? {}).filter((k) => !(PUBLIC_PROJECT_FIELDS as readonly string[]).includes(k));
  if (leaked.length) {
    console.error(`\nPublic projects.json would carry gated fields: ${leaked.join(", ")}.\n`);
    process.exit(1);
  }
  console.log(`\n  wrote ${OUT} (public) and ${GATED} (gated)\n`);
}

main();
