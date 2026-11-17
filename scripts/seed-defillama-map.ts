/**
 * Seeds data/defillama-map.csv: one row per DefiLlama slug mapped to a CSV project.
 * Matching: exact normalized name, then parent-protocol name, then the ALIASES table.
 * Existing rows are kept (hand edits win); new rows are appended with a note.
 *
 *   npm run seed:map            # prints the mapping report and writes the file
 *   npm run seed:map -- --dry   # report only
 */
import path from "node:path";
import type { LlamaProtocolSnap } from "../src/lib/history-types";
import { normalizeName, parseMapRows, type MapRow } from "../src/lib/mapping";
import { toProject } from "../src/lib/parse";
import { createClient } from "./fetch/http";
import { fetchAllProtocols, readProtocols } from "./fetch/defillama";
import { findFile, readCsv, readCsvOrEmpty, writeCsv } from "./lib/csv";
import { DATA, HISTORY } from "./lib/paths";
import { writeJsonStable } from "./lib/store";

/** CSV project name -> DefiLlama parent ids ("parent#x") or slugs. Cases the brief calls out plus obvious renames. */
const ALIASES: Record<string, string[]> = {
  Uniswap: ["parent#uniswap"],
  Pons: ["parent#pons"],
  RAMSES: ["parent#ramses-exchange-hl"],
  "up.": ["parent#up"],
  Arcus: ["parent#arcus"],
  Lighter: ["parent#lighter"],
  Meridian: ["parent#meridiandotxyz"],
  "Clutch Markets (StonkBrokers)": ["parent#stonkbrokers", "parent#clutch-markets"],
  Ekubo: ["parent#ekubo"],
  GigaDex: ["parent#giga"],
  PancakeSwap: ["parent#pancakeswap"],
  "pools.trade (Uniswap Labs)": ["name:Pools"],
  "Aero (Aerodrome)": ["parent#aero-protocol"],
  SushiSwap: ["parent#sushi"],
  Curve: ["parent#curve-finance"],
  "1inch": ["parent#1inch"],
  KyberSwap: ["parent#kyberswap"],
  "LI.FI": ["parent#li.fi"],
  "0x Labs": ["name:0x"],
  Rialto: ["parent#rialto"],
  "DLMM KING": ["parent#sectorone"],
  Flap: ["flap-sh", "name:Flap sh"],
  Metric: ["parent#metric"],
  Morpho: ["parent#morpho"],
  Spark: ["parent#spark"],
  Pendle: ["parent#pendle"],
  Sablier: ["parent#sablier-finance"],
  OpenSea: ["parent#opensea"],
  "letscash.fun (formerly cashcat.fun)": ["name:LetsCash"],
  Clanker: ["name:clanker"],
  Fomo: ["parent#fomo"],
  Axiom: ["parent#axiom"],
  Midas: ["name:Midas RWA"],
  "Binance Alpha / Binance Wallet": ["name:Binance Alpha", "binance-cex"],
  "Bitget Wallet": ["bitget"],
  DexFi: ["parent#dexfinance"],
  "Alley (Catnip)": ["catnip"],
  "Ravenhood (Flock Credit)": ["parent#ravenhood"],
  "Sheriff (Algebra)": ["parent#sheriff"],
  Onagi: ["parent#onagi"],
  Gate: ["gate", "parent#gate-products"],
  Jumper: ["parent#jumper-exchange"],
  Arbitrum: ["parent#arbitrum-foundation"],
};

async function main() {
  const dry = process.argv.includes("--dry");
  let protocols = readProtocols();
  if (!protocols.length) {
    const client = createClient({ name: "defillama", minIntervalMs: 1000, timeoutMs: 120_000 });
    protocols = await fetchAllProtocols(client);
    writeJsonStable(path.join(HISTORY, "defillama", "protocols.json"), protocols);
  }
  const projects = readCsv(findFile("base-ecosystem-", ".csv")).map(toProject);
  const mapFile = path.join(DATA, "defillama-map.csv");
  const existing = parseMapRows(readCsvOrEmpty(mapFile));
  const have = new Set(existing.map((r) => r.slug));

  const byNorm = new Map<string, LlamaProtocolSnap[]>();
  const byParent = new Map<string, LlamaProtocolSnap[]>();
  const parentNorm = new Map<string, string>();
  for (const p of protocols) {
    const n = normalizeName(p.name);
    byNorm.set(n, [...(byNorm.get(n) ?? []), p]);
    const par = p.parentProtocol;
    if (par) {
      byParent.set(par, [...(byParent.get(par) ?? []), p]);
      parentNorm.set(normalizeName(par.replace(/^parent#/, "").split("-").join(" ")), par);
    }
  }

  const rows: MapRow[] = [...existing];
  const claimed = new Map<string, string>(existing.filter((r) => r.project).map((r) => [r.slug, r.project as string]));
  const report: string[] = [];
  const add = (project: string, p: LlamaProtocolSnap, note: string) => {
    if (have.has(p.slug)) return;
    if (claimed.has(p.slug) && claimed.get(p.slug) !== project) {
      report.push(`  conflict: ${p.slug} already mapped to ${claimed.get(p.slug)}, wanted by ${project}`);
      return;
    }
    rows.push({ project, slug: p.slug, notes: note });
    have.add(p.slug);
    claimed.set(p.slug, project);
  };

  for (const pr of projects) {
    const alias = ALIASES[pr.name];
    if (alias) {
      for (const a of alias) {
        if (a.startsWith("parent#")) for (const p of byParent.get(a) ?? []) add(pr.name, p, `alias ${a}`);
        else if (a.startsWith("name:")) {
          const matches = protocols.filter((x) => x.name === a.slice(5));
          if (!matches.length) report.push(`  alias name not on DefiLlama: ${a} (${pr.name})`);
          for (const p of matches) add(pr.name, p, `alias ${a}`);
        } else {
          const p = protocols.find((x) => x.slug === a);
          if (p) add(pr.name, p, "alias slug");
          else report.push(`  alias slug not on DefiLlama: ${a} (${pr.name})`);
        }
      }
      continue;
    }
    const n = normalizeName(pr.name);
    for (const p of byNorm.get(n) ?? []) add(pr.name, p, "exact name");
    const par = parentNorm.get(n);
    if (par) for (const p of byParent.get(par) ?? []) add(pr.name, p, `parent name ${par}`);
  }

  const mappedProjects = new Set(rows.filter((r) => r.project).map((r) => r.project));
  const withMetric = projects.filter((p) => p.hasTraction);
  const unmatched = withMetric.filter((p) => !mappedProjects.has(p.name));
  const covered = new Set(rows.map((r) => r.slug));
  const unmapped = protocols.filter((p) => !covered.has(p.slug)).sort((a, b) => b.tvl - a.tvl);

  console.log(`\nDefiLlama mapping: ${rows.filter((r) => r.project).length} slug rows across ${mappedProjects.size} projects (${protocols.length} protocols on chain)\n`);
  const byProject = new Map<string, MapRow[]>();
  for (const r of rows) if (r.project) byProject.set(r.project, [...(byProject.get(r.project) ?? []), r]);
  for (const [project, rs] of Array.from(byProject.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${project.padEnd(34)} ${rs.map((r) => r.slug).join(", ")}`);
  }
  console.log(`\nCSV projects with metrics but no map row (${unmatched.length}):`);
  for (const p of unmatched) {
    const n = normalizeName(p.name);
    const stem = n.slice(0, 5);
    const sugg = protocols.filter((x) => normalizeName(x.name).includes(stem) || (x.parentProtocol ?? "").includes(stem)).slice(0, 4);
    console.log(`  ${p.name.padEnd(34)} tvl=${p.tvl ?? "-"} vol=${p.volume ?? "-"} fees=${p.fees ?? "-"}   suggestions: ${sugg.map((s) => s.slug).join(", ") || "none"}`);
  }
  console.log(`\nUnmapped DefiLlama protocols (newly detected list), top 25 of ${unmapped.length} by TVL:`);
  for (const p of unmapped.slice(0, 25)) console.log(`  ${p.slug.padEnd(34)} ${p.category.padEnd(22)} ${(p.parentProtocol ?? "").padEnd(28)} $${Math.round(p.tvl).toLocaleString("en-US")}`);
  if (report.length) console.log(`\nNotes:\n${report.join("\n")}`);

  if (!dry) {
    const changed = writeCsv(
      mapFile,
      rows.map((r) => ({ Project: r.project ?? "", "DefiLlama slug": r.slug, Notes: r.notes })),
      ["Project", "DefiLlama slug", "Notes"],
    );
    console.log(`\n${changed ? "wrote" : "unchanged"} ${path.relative(process.cwd(), mapFile)} (${rows.length} rows)\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
