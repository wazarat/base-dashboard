/**
 * Fetch the latest day (or full history with --backfill) from every free source
 * into data/history. Each source is isolated: a failure is recorded in _meta.json
 * and the others still run. Exit code is 0 unless every source failed.
 *
 *   npm run refresh
 *   npm run refresh -- --backfill
 *   npm run refresh -- --only defillama,blockscout --verbose --dry-run
 *
 * Sources run in lanes: sources inside a lane run in order, lanes run at the same time. A lane holds sources
 * that touch the same files or the same host, so nothing is written by two sources at once. GeckoTerminal and the Blockscout key also share one rate limiter across lanes (http.ts).
 * REFRESH_BUDGET_MIN (default 12) sets when optional work stops (ctx.deadlineMs), so the daily run, with its
 * build and tests, stays under 20 minutes; cursors carry what is left to the next run.
 */
import fs from "node:fs";
import path from "node:path";
import { isoNow, utcToday } from "../src/lib/dates";
import { emptyMeta, emptySourceStatus, SOURCE_IDS, type HistoryMeta, type SourceId } from "../src/lib/history-types";
import { log, setVerbose } from "./lib/log";
import { HISTORY } from "./lib/paths";
import { readJson, writeJsonStable } from "./lib/store";
import type { Ctx, Source } from "./fetch/context";
import * as defillama from "./fetch/defillama";
import * as blockscout from "./fetch/blockscout";
import * as morpho from "./fetch/morpho";
import * as growthepie from "./fetch/growthepie";
import * as stablecoins from "./fetch/stablecoins";
import * as blockscoutTokens from "./fetch/blockscout-tokens";
import * as blockscoutNfts from "./fetch/blockscout-nfts";
import * as geckoTokens from "./fetch/geckoterminal-tokens";
import * as geckoHolders from "./fetch/geckoterminal-holders";
import * as llamaAggregators from "./fetch/llama-aggregators";
import * as llamaBridgeAggregators from "./fetch/llama-bridge-aggregators";
import * as llamaOpenInterest from "./fetch/llama-open-interest";
import * as llamaOptions from "./fetch/llama-options";
import * as llamaHacks from "./fetch/llama-hacks";
import * as llamaYields from "./fetch/llama-yields";
import * as morphoVaults from "./fetch/morpho-vaults";
import * as geckoVenues from "./fetch/geckoterminal-venues";

/** Lanes run in parallel; sources inside a lane run in this order. */
const LANES: Source[][] = [
  // Morpho and the keyed Blockscout gateway, plus growthepie's chain activity.
  [
    { id: "morpho", run: morpho.run },
    { id: "blockscout", run: blockscout.runLines },
    { id: "blockscout-keyed", run: blockscout.runKeyed },
    { id: "growthepie", run: growthepie.run },
  ],
  // GeckoTerminal project tokens and venues: own files, the shared GeckoTerminal limiter keeps the host within its limit.
  [
    { id: "geckoterminal-tokens", run: geckoTokens.run },
    { id: "geckoterminal-venues", run: geckoVenues.run },
  ],
  // DefiLlama family: one host, in order, so it is asked politely.
  [
    { id: "defillama", run: defillama.run },
    { id: "defillama-stablecoins", run: stablecoins.run },
    { id: "llama-aggregators", run: llamaAggregators.run },
    { id: "llama-bridge-aggregators", run: llamaBridgeAggregators.run },
    { id: "llama-open-interest", run: llamaOpenInterest.run },
    { id: "llama-options", run: llamaOptions.run },
    { id: "llama-hacks", run: llamaHacks.run },
    { id: "llama-yields", run: llamaYields.run },
  ],
  // Token and NFT snapshots, which share tokens/meta.json and tokens/snapshots.json, and Morpho vaults.
  // GeckoTerminal holders use the shared GeckoTerminal limiter; the Blockscout ones skip while Base needs a paid plan.
  [
    { id: "geckoterminal-holders", run: geckoHolders.run },
    { id: "blockscout-tokens", run: blockscoutTokens.run },
    { id: "blockscout-nfts", run: blockscoutNfts.run },
    { id: "morpho-vaults", run: morphoVaults.run },
  ],
];
export const SOURCES: Source[] = LANES.flat();

function loadEnvLocal(): void {
  const file = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined && m[2] !== "") process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function parseArgs(argv: string[]) {
  const only = new Set<SourceId>();
  const flags = { backfill: false, strict: false, dryRun: false, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--backfill") flags.backfill = true;
    else if (a === "--strict") flags.strict = true;
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--verbose") flags.verbose = true;
    else if (a === "--only") {
      for (const s of (argv[++i] ?? "").split(",")) {
        if ((SOURCE_IDS as readonly string[]).includes(s)) only.add(s as SourceId);
        else throw new Error(`Unknown source "${s}". Known: ${SOURCE_IDS.join(", ")}`);
      }
    } else if (a.startsWith("--only=")) {
      for (const s of a.slice(7).split(",")) only.add(s as SourceId);
    } else throw new Error(`Unknown flag ${a}`);
  }
  return { only, ...flags };
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));
  setVerbose(args.verbose);
  const metaFile = path.join(HISTORY, "_meta.json");
  const meta: HistoryMeta = { ...emptyMeta(), ...readJson<Partial<HistoryMeta>>(metaFile, {}) };
  for (const id of SOURCE_IDS) meta.perSource[id] = { ...emptySourceStatus(), ...(meta.perSource[id] ?? {}) };
  const nowMs = Date.now();
  const budgetMin = Number(process.env.REFRESH_BUDGET_MIN ?? (args.backfill ? 0 : 12));
  const deadlineMs = budgetMin > 0 ? nowMs + budgetMin * 60_000 : undefined;
  const ctx: Ctx = { mode: args.backfill ? "backfill" : "daily", today: utcToday(nowMs), nowMs, meta, env: process.env, dryRun: args.dryRun, deadlineMs };
  const ran = new Set<SourceId>();
  /** Merge only what this process changed, so two refreshes (e.g. a backfill and the daily run) never clobber each other. */
  const save = () => {
    if (args.dryRun) return;
    const disk: HistoryMeta = { ...emptyMeta(), ...readJson<Partial<HistoryMeta>>(metaFile, {}) };
    for (const id of SOURCE_IDS) disk.perSource[id] = { ...emptySourceStatus(), ...(disk.perSource[id] ?? {}) };
    for (const id of ran) disk.perSource[id] = meta.perSource[id];
    if (ran.has("blockscout-keyed")) disk.cursors.blockscoutTx = meta.cursors.blockscoutTx;
    if (ran.has("defillama")) {
      disk.cursors.llamaMissing = meta.cursors.llamaMissing;
      disk.newlyDetected = meta.newlyDetected;
      disk.unmatchedCsv = meta.unmatchedCsv;
      disk.unmatchedMap = meta.unmatchedMap;
    }
    if (meta.lastRun) {
      disk.lastRun = meta.lastRun;
      disk.lastRunDate = meta.lastRunDate;
      disk.mode = meta.mode;
    }
    writeJsonStable(metaFile, disk);
  };
  process.on("SIGINT", () => {
    save();
    process.exit(130);
  });

  log.info(`\nBase Ecosystem Atlas refresh — ${ctx.mode} — ${ctx.today}${args.dryRun ? " (dry run)" : ""}\n`);
  let ok = 0;
  let failed = 0;
  const runOne = async (s: Source) => {
    const st = meta.perSource[s.id];
    ran.add(s.id);
    st.lastAttempt = isoNow();
    st.error = null;
    st.skipped = null;
    st.notes = [];
    const started = Date.now();
    let line: string;
    try {
      const r = await s.run(ctx);
      st.ms = Date.now() - started;
      st.rows = r.rows;
      st.calls = r.calls;
      st.notes = r.notes;
      const skipped = r.notes.find((n) => n.startsWith("skipped:"));
      if (skipped) {
        st.skipped = skipped.replace(/^skipped:\s*/, "");
        line = `skipped (${st.skipped})`;
      } else {
        st.lastSuccess = isoNow();
        ok += 1;
        line = `ok  ${String(r.rows).padStart(6)} rows  ${String(r.calls).padStart(4)} calls  ${(st.ms / 1000).toFixed(1)}s`;
      }
      for (const n of r.notes) if (!n.startsWith("skipped:")) line += `\n${"".padEnd(28)}· ${n}`;
    } catch (e) {
      st.ms = Date.now() - started;
      st.error = (e as Error).message.slice(0, 300);
      failed += 1;
      line = `FAILED  ${st.error}`;
    }
    // One line per source when it finishes, since lanes run at the same time.
    log.info(`  ${s.id.padEnd(26)}${line}`);
    save();
  };
  const lanes = LANES.map((lane) => lane.filter((s) => !args.only.size || args.only.has(s.id))).filter((l) => l.length);
  await Promise.all(
    lanes.map(async (lane) => {
      for (const s of lane) await runOne(s);
    }),
  );
  // Time per fetcher, slowest first.
  const timed = [...ran].map((id) => ({ id, ms: meta.perSource[id].ms ?? 0, calls: meta.perSource[id].calls ?? 0 })).sort((a, b) => b.ms - a.ms);
  log.info(`\n  Time per source (lanes run in parallel; wall time ${((Date.now() - nowMs) / 60_000).toFixed(1)} min)`);
  for (const t of timed) log.info(`    ${t.id.padEnd(26)}${(t.ms / 1000).toFixed(0).padStart(6)}s ${String(t.calls).padStart(6)} calls`);
  if (!args.dryRun) {
    // Only a full run moves the window end: after `--only a,b` the other sources still stop at the last full run,
    // so the build would read a day they never fetched (TVL reconciles against a missing day).
    if (!args.only.size) {
      meta.lastRun = isoNow();
      meta.lastRunDate = ctx.today;
      meta.mode = ctx.mode;
    }
    save();
  }
  log.info(`\n  ${ok} sources ok, ${failed} failed. ${meta.newlyDetected.length} unmapped DefiLlama protocols, ${meta.unmatchedMap.length} stale map slugs.\n`);
  if (failed && (args.strict || ok === 0)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
