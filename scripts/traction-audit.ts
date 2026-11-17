/**
 * Traction audit: per sector, projects with traction under the rule before 2026-11-09
 * (DefiLlama metric or sourced signal) and under the current rule (src/lib/traction.ts),
 * with the source that added each project. Also lists projects with a Token value but
 * no mapped address, so the gaps can be filled from the issuer's own source.
 *
 *   npm run data && npm run audit:traction
 */
import fs from "node:fs";
import path from "node:path";
import { isFungibleRole, isNftRole } from "../src/lib/contract-roles";
import { legacyLive, REASON_LABEL, tractionReasons } from "../src/lib/traction";
import type { Project } from "../src/lib/types";
import { readCsvOrEmpty } from "./lib/csv";
import { DATA, OUT } from "./lib/paths";

const projects = JSON.parse(fs.readFileSync(path.join(OUT, "projects.json"), "utf8")) as Project[];
const stableProjects = new Set(readCsvOrEmpty(path.join(DATA, "stablecoin-map.csv")).map((r) => (r["Project"] ?? "").trim()));

const bySector = new Map<string, Project[]>();
for (const p of projects) bySector.set(p.sector, [...(bySector.get(p.sector) ?? []), p]);

const rows = Array.from(bySector.entries())
  .map(([sector, ps]) => {
    const before = ps.filter(legacyLive).length;
    const after = ps.filter((p) => tractionReasons(p).length > 0).length;
    const added = ps
      .filter((p) => !legacyLive(p) && tractionReasons(p).length > 0)
      .map((p) => `${p.name} (${tractionReasons(p).map((r) => REASON_LABEL[r]).join(", ")})`);
    return { sector, projects: ps.length, before, after, added };
  })
  .sort((a, b) => b.after - b.before - (a.after - a.before) || a.sector.localeCompare(b.sector));

console.log("\n| Sector | Projects | With traction before | With traction after | Added by |");
console.log("|---|---:|---:|---:|---|");
for (const r of rows) console.log(`| ${r.sector} | ${r.projects} | ${r.before} | ${r.after} | ${r.added.join("; ") || "none"} |`);
const tot = rows.reduce((a, r) => ({ projects: a.projects + r.projects, before: a.before + r.before, after: a.after + r.after }), { projects: 0, before: 0, after: 0 });
console.log(`| All sectors | ${tot.projects} | ${tot.before} | ${tot.after} | ${tot.after - tot.before} added |`);

const gaps = projects.filter((p) => p.token && !/^none\b/i.test(p.tokenRaw ?? "") && !p.contracts.some((c) => isFungibleRole(c.role) || isNftRole(c.role)) && !stableProjects.has(p.name));
console.log(`\nProjects with a Token value but no mapped address (${gaps.length})`);
for (const p of gaps.sort((a, b) => a.sector.localeCompare(b.sector) || a.name.localeCompare(b.name))) console.log(`  ${p.sector.padEnd(30)} ${p.name.padEnd(32)} ${p.tokenRaw ?? p.token}`);
console.log("");
