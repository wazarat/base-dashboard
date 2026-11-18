/**
 * Seeds data/contracts.csv (Project, Address, Role, Source, Verified, Name, Symbol, Decimals) from the
 * DefiLlama listing addresses of mapped projects, classifying each address
 * through the keyed Blockscout gateway. Existing rows are kept; new rows are
 * appended. Stock tokens are tracked separately (data/stock-tokens.csv).
 *
 *   npm run seed:contracts            # needs BLOCKSCOUT_API_KEY in .env.local
 *   npm run seed:contracts -- --dry   # report only
 */
import fs from "node:fs";
import path from "node:path";
import { parseMapRows } from "../src/lib/mapping";
import { readProtocols } from "./fetch/defillama";
import { keyedClient, keyedGet, keyedSkip, parseContracts, type ContractRow } from "./fetch/blockscout";
import { readCsvOrEmpty, writeCsv } from "./lib/csv";
import { DATA } from "./lib/paths";

export const CONTRACT_COLUMNS = ["Project", "Address", "Role", "Source", "Verified", "Name", "Symbol", "Decimals"];

function loadEnvLocal(): void {
  const file = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined && m[2] !== "") process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

interface AddressInfo {
  is_contract?: boolean;
  is_verified?: boolean;
  is_scam?: boolean;
  name?: string | null;
  token?: { name?: string; symbol?: string; type?: string } | null;
}

async function main() {
  loadEnvLocal();
  const dry = process.argv.includes("--dry");
  // Base needs a paid Blockscout plan, so roles stay unverified until CHAIN.blockscoutFree is true.
  const key = keyedSkip(process.env) ? undefined : process.env.BLOCKSCOUT_API_KEY?.trim();
  const protocols = readProtocols();
  const map = parseMapRows(readCsvOrEmpty(path.join(DATA, "defillama-map.csv")));
  const file = path.join(DATA, "contracts.csv");
  const raw = readCsvOrEmpty(file);
  const existing = parseContracts(raw);
  const have = new Set(existing.map((r) => r.address));
  const bySlug = new Map(protocols.map((p) => [p.slug, p]));

  const candidates: Array<{ project: string; address: string; slug: string }> = [];
  for (const r of map) {
    if (!r.project) continue;
    const p = bySlug.get(r.slug);
    if (!p?.address || have.has(p.address) || candidates.some((c) => c.address === p.address)) continue;
    candidates.push({ project: r.project, address: p.address, slug: r.slug });
  }
  console.log(`\n${existing.length} existing rows, ${candidates.length} new candidate addresses from DefiLlama listings${key ? "" : " (no usable Blockscout key: roles left unverified)"}\n`);

  const client = key ? keyedClient(key) : null;
  // Existing rows are written back unchanged, with their name, symbol and decimals.
  const rows: Array<ContractRow & { name: string; symbol?: string; decimals?: string }> = [];
  for (const c of candidates) {
    let role = "unknown";
    let verified = "No (not checked)";
    let name = "";
    if (client && key) {
      try {
        const info = await keyedGet<AddressInfo>(client, key, `/addresses/${c.address}`);
        name = info.token?.name ?? info.name ?? "";
        if (info.token) role = info.token.type === "ERC-20" ? "project-token" : "nft-collection";
        else if (info.is_contract) role = "contract";
        else role = "eoa";
        verified = info.is_scam ? "No (flagged as scam on Blockscout)" : info.is_contract ? `Yes (Blockscout contract${info.is_verified ? ", verified source" : ""})` : "No (externally owned account)";
      } catch (e) {
        verified = `No (lookup failed: ${(e as Error).message.slice(0, 60)})`;
      }
    }
    rows.push({ project: c.project, address: c.address, role, source: `DefiLlama listing (${c.slug})`, verified, name });
    console.log(`  ${c.project.padEnd(30)} ${c.address} ${role.padEnd(8)} ${verified}  ${name}`);
  }
  if (!dry) {
    const changed = writeCsv(
      file,
      [...raw, ...rows.map((r) => ({ Project: r.project, Address: r.address, Role: r.role, Source: r.source, Verified: r.verified, Name: r.name, Symbol: r.symbol ?? "", Decimals: r.decimals ?? "" }))],
      CONTRACT_COLUMNS,
    );
    console.log(`\n${changed ? "wrote" : "unchanged"} data/contracts.csv (${raw.length + rows.length} rows)\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
