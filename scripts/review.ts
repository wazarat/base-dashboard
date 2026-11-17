/**
 * Weekly review of form submissions. Reads Tally CSV exports from data/submissions/
 * and prints each submission next to the matching ecosystem CSV row, so changes can
 * be approved by hand. This script never writes to the CSVs.
 *
 *   npm run review
 *   npm run review -- --file data/submissions/corrections-2026-11-15.csv
 */
import fs from "node:fs";
import path from "node:path";
import type { RawRow } from "../src/lib/parse";
import { normalizeName } from "../src/lib/mapping";
import { findFile, readCsv } from "./lib/csv";
import { SUBMISSIONS } from "./lib/paths";

/** Candidate Tally question labels for each ecosystem CSV column (case-insensitive, first match wins). */
export const TALLY_FIELDS: Record<string, string[]> = {
  "Project/Company Name": ["project name", "project", "project/company name", "name"],
  Website: ["website", "url", "site"],
  "X Handle": ["x handle", "twitter", "x"],
  "Sector/Category": ["sector", "sector/category", "category"],
  "Native Chain": ["native chain", "chain"],
  Description: ["short description", "description"],
  Contracts: ["contract addresses", "contracts", "contract address"],
  Evidence: ["evidence url", "evidence", "source url", "source"],
  Contact: ["contact", "email", "contact (optional)"],
  Field: ["which field is wrong", "field", "which field"],
  "Correct value": ["correct value", "value", "correction"],
  Page: ["page"],
};

export interface Submission {
  kind: "new" | "correction";
  values: Record<string, string>;
  raw: RawRow;
}

function findValue(row: RawRow, candidates: string[]): string {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const k = keys.find((x) => x.trim().toLowerCase() === c);
    if (k && (row[k] ?? "").trim()) return (row[k] ?? "").trim();
  }
  for (const c of candidates) {
    const k = keys.find((x) => x.trim().toLowerCase().includes(c));
    if (k && (row[k] ?? "").trim()) return (row[k] ?? "").trim();
  }
  return "";
}

export function parseSubmission(row: RawRow): Submission {
  const values: Record<string, string> = {};
  for (const [col, cands] of Object.entries(TALLY_FIELDS)) values[col] = findValue(row, cands);
  const kind = values.Field || values["Correct value"] ? "correction" : "new";
  return { kind, values, raw: row };
}

export interface FieldDiff {
  field: string;
  submitted: string;
  current: string | null;
  changed: boolean;
}

/** Side-by-side of a submission against the current CSV row (null when the project is new). */
export function diffSubmission(sub: Submission, current: RawRow | null): FieldDiff[] {
  if (sub.kind === "correction") {
    const field = sub.values.Field;
    const cur = current ? (current[field] ?? "") : null;
    return [{ field: field || "(unspecified field)", submitted: sub.values["Correct value"], current: cur, changed: cur !== sub.values["Correct value"] }];
  }
  return ["Project/Company Name", "Website", "X Handle", "Sector/Category", "Native Chain", "Description"].map((f) => {
    const cur = current ? (current[f] ?? "") : null;
    const submitted = sub.values[f];
    return { field: f, submitted, current: cur, changed: cur !== submitted && Boolean(submitted) };
  });
}

function main() {
  const fileArg = process.argv.indexOf("--file");
  const files = fileArg >= 0 ? [path.resolve(process.argv[fileArg + 1])] : fs.existsSync(SUBMISSIONS) ? fs.readdirSync(SUBMISSIONS).filter((f) => f.endsWith(".csv")).map((f) => path.join(SUBMISSIONS, f)) : [];
  if (!files.length) {
    console.log(`\nNo submission files. Export Tally responses as CSV into ${path.relative(process.cwd(), SUBMISSIONS)}/ and run again.\n`);
    return;
  }
  const projects = readCsv(findFile("base-ecosystem-", ".csv"));
  const byExact = new Map(projects.map((r) => [(r["Project/Company Name"] ?? "").toLowerCase(), r]));
  const byNorm = new Map(projects.map((r) => [normalizeName(r["Project/Company Name"] ?? ""), r]));
  let n = 0;
  for (const file of files) {
    console.log(`\n=== ${path.relative(process.cwd(), file)}`);
    for (const row of readCsv(file)) {
      const sub = parseSubmission(row);
      const name = sub.values["Project/Company Name"];
      const current = byExact.get(name.toLowerCase()) ?? byNorm.get(normalizeName(name)) ?? null;
      n += 1;
      console.log(`\n#${n} ${sub.kind === "correction" ? "CORRECTION" : "NEW PROJECT"} · ${name || "(no project name)"}${current ? "" : sub.kind === "correction" ? "  !! no matching row" : "  (not in the CSV yet)"}${sub.values.Page ? `  · from ${sub.values.Page}` : ""}`);
      if (sub.values.Evidence) console.log(`   evidence: ${sub.values.Evidence}`);
      if (sub.values.Contact) console.log(`   contact:  ${sub.values.Contact}`);
      for (const d of diffSubmission(sub, current)) {
        const mark = d.changed ? "≠" : " ";
        console.log(`   ${mark} ${d.field.padEnd(22)} submitted: ${d.submitted || "—"}`);
        if (d.current !== null) console.log(`     ${"".padEnd(22)} current:   ${d.current || "—"}`);
      }
      if (sub.values.Contracts) console.log(`   contracts: ${sub.values.Contracts}`);
    }
  }
  console.log(`\n${n} submissions. Nothing was written: apply approved changes to the CSVs by hand, update data/expected.json if row counts changed, then commit.\n`);
}

if (require.main === module) main();
