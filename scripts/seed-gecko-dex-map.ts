/**
 * Seeds data/gecko-dex-map.csv: one row per GeckoTerminal DEX id on network robinhood, mapped to an Atlas
 * project where the names match. Existing rows are kept (hand edits win); new ids are appended. A row with
 * an empty Project means reviewed and left out, the same convention as data/defillama-map.csv.
 *
 *   npm run seed:venues            # prints the mapping report and writes the file
 *   npm run seed:venues -- --dry   # report only
 *
 * Matching is by name only, so read the report: a venue is only as right as its row.
 */
import path from "node:path";
import { toProject } from "../src/lib/parse";
import { normalizeVenue, parseGeckoDexMap, type GeckoDexMapRow, type VenueKind } from "../src/lib/venues";
import { createClient } from "./fetch/http";
import { findFile, readCsv, readCsvOrEmpty, writeCsv } from "./lib/csv";
import { DATA } from "./lib/paths";

const BASE = "https://api.geckoterminal.com/api/v2/networks/robinhood";

/** GeckoTerminal venue name (normalized) -> Atlas project name, for names that do not match on their own. */
const ALIASES: Record<string, string> = {
  virtuals: "Virtuals Protocol",
  "pons dot family": "Pons",
  "uniswap pools trade": "pools.trade (Uniswap Labs)",
  "dlmm king": "DLMM KING",
  giga: "GigaDex",
  aero: "Aero (Aerodrome)",
  "long xyz": "Long",
  "frontier fun": "Frontier",
  "clank trade": "Clank.trade",
  up: "up.",
};

const KIND_BY_SECTOR: Record<string, VenueKind> = { Launchpads: "launchpad", "AI Agents": "agent", "DEXs & Liquidity": "dex" };

async function main() {
  const dry = process.argv.includes("--dry");
  const projects = readCsv(findFile("base-ecosystem-", ".csv")).map(toProject);
  const byName = new Map(projects.map((p) => [normalizeVenue(p.name), p]));
  const client = createClient({ name: "geckoterminal-venues", minIntervalMs: 2500, minBackoffMs: 15_000 });
  const dexes: Array<{ id: string; name: string }> = [];
  for (let page = 1; page <= 5; page++) {
    const json = await client.getJson<{ data?: Array<{ id: string; attributes?: { name?: string } }> }>(`${BASE}/dexes?page=${page}`);
    const batch = (json.data ?? []).map((d) => ({ id: d.id, name: d.attributes?.name ?? d.id }));
    dexes.push(...batch);
    if (batch.length < 100) break;
  }
  const file = path.join(DATA, "gecko-dex-map.csv");
  const existing = parseGeckoDexMap(readCsvOrEmpty(file));
  const have = new Set(existing.map((r) => r.dexId));
  const rows: GeckoDexMapRow[] = [...existing];
  for (const d of dexes) {
    if (have.has(d.id)) continue;
    const key = normalizeVenue(d.name);
    const alias = ALIASES[key];
    const project = (alias ? projects.find((p) => p.name === alias) : undefined) ?? byName.get(key);
    // Only launchpads, agent platforms and DEXes have venue metrics; anything else is recorded as left out.
    const kind = project ? KIND_BY_SECTOR[project.sector] : undefined;
    rows.push({ project: project && kind ? project.name : "", dexId: d.id, dexName: d.name, kind: kind ?? "" });
  }
  rows.sort((a, b) => a.dexId.localeCompare(b.dexId));
  const mapped = rows.filter((r) => r.project);
  console.log(`\nGeckoTerminal venues on network robinhood: ${dexes.length} listed, ${mapped.length} mapped to a project, ${rows.length - mapped.length} left out\n`);
  for (const r of rows) console.log(`  ${r.dexId.padEnd(40)} ${(r.project || "(left out)").padEnd(34)} ${r.kind}`);
  if (dry) return;
  const changed = writeCsv(
    file,
    rows.map((r) => ({ Project: r.project, "Dex id": r.dexId, "Dex name": r.dexName, Kind: r.kind })),
    ["Project", "Dex id", "Dex name", "Kind"],
  );
  console.log(`\n${changed ? "Wrote" : "No change to"} ${path.relative(process.cwd(), file)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
