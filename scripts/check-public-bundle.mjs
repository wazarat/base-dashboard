#!/usr/bin/env node
/**
 * Login wall phase 2 build check: no gated string may reach a file a logged-out
 * visitor can download. Runs after `next build` (postbuild).
 *
 * Sentinels are the investor names from the gated rounds file that appear in no
 * public JSON and nowhere in the source code (a name the code itself uses, such as
 * an alias or "Robinhood Markets" in the footer, is not data), plus a few fixed names. The scan covers .next/static, public/, and
 * the prerendered pages under .next/server/app (HTML and RSC payloads), skipping the
 * api/ route handlers, which are server code. Any hit fails the build.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
export const FIXED_SENTINELS = ["Ribbit Capital", "Polychain"];
/** The URL-slug form of a name ("Ribbit Capital" is "ribbit-capital"), since a source link can carry a gated name in its path. */
export const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const MIN_LENGTH = 8;

/** Investor names from the gated rounds that no public file or source file mentions, plus the fixed names. */
export function findSentinels(rounds, publicTexts, codeTexts = []) {
  const names = new Set([...FIXED_SENTINELS, ...FIXED_SENTINELS.map(slugOf)]);
  for (const r of rounds) for (const n of [...(r.leadInvestors ?? []), ...(r.otherInvestors ?? [])]) if (n.length >= MIN_LENGTH) names.add(n);
  const elsewhere = [...publicTexts, ...codeTexts];
  const fixed = new Set([...FIXED_SENTINELS, ...FIXED_SENTINELS.map(slugOf)]);
  return [...names].filter((n) => fixed.has(n) || !elsewhere.some((t) => t.includes(n)));
}

function walk(dir, out, skip) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (skip(full)) continue;
    if (e.isDirectory()) walk(full, out, skip);
    else out.push(full);
  }
  return out;
}

const TEXT = /\.(js|mjs|cjs|css|json|html|rsc|body|txt|map|xml|svg|meta)$/;

/** Every hit of a sentinel in a text file under the folders, as { file, sentinel }. */
export function scan(dirs, sentinels, skip = () => false) {
  const hits = [];
  for (const dir of dirs) {
    for (const file of walk(dir, [], skip)) {
      if (!TEXT.test(file)) continue;
      const body = fs.readFileSync(file, "utf8");
      for (const s of sentinels) if (body.includes(s)) hits.push({ file: path.relative(ROOT, file), sentinel: s });
    }
  }
  return hits;
}

function main() {
  const gatedFile = path.join(ROOT, "src", "data", "gated", "gated.json");
  if (!fs.existsSync(gatedFile)) {
    console.log("  public bundle check skipped: no gated data (run npm run data)");
    return;
  }
  const gated = JSON.parse(fs.readFileSync(gatedFile, "utf8"));
  const publicDir = path.join(ROOT, "src", "data", "generated");
  const publicTexts = fs.readdirSync(publicDir).filter((f) => f.endsWith(".json")).map((f) => fs.readFileSync(path.join(publicDir, f), "utf8"));
  const codeTexts = walk(path.join(ROOT, "src"), [], (f) => f.includes(`${path.sep}data${path.sep}`)).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => fs.readFileSync(f, "utf8"));
  const sentinels = findSentinels(gated.rounds ?? [], publicTexts, codeTexts);
  for (const s of FIXED_SENTINELS) if ([...publicTexts, ...codeTexts].some((t) => t.includes(s))) console.error(`  fixed sentinel "${s}" appears in public data or code`);
  const appDir = path.join(ROOT, ".next", "server", "app");
  const hits = [
    ...scan([path.join(ROOT, ".next", "static"), path.join(ROOT, "public")], sentinels),
    ...scan([appDir], sentinels, (f) => f.startsWith(path.join(appDir, "api")) || /\.js(\.map)?$/.test(f)),
  ];
  const js = walk(path.join(ROOT, ".next", "static"), [], () => false).filter((f) => f.endsWith(".js"));
  const sizes = js.map((f) => fs.statSync(f).size);
  const total = sizes.reduce((a, b) => a + b, 0);
  const largest = Math.max(0, ...sizes);
  console.log(`\n  public bundle: ${(total / 1024).toFixed(0)} KB of JavaScript in ${js.length} files, largest ${(largest / 1024).toFixed(0)} KB; ${sentinels.length} gated sentinels checked`);
  if (hits.length) {
    for (const h of hits.slice(0, 20)) console.error(`  gated string "${h.sentinel}" in ${h.file}`);
    console.error(`\nGated data reached a public file (${hits.length} hits). Check src/lib/public-fields.ts and what client code imports.\n`);
    process.exit(1);
  }
  console.log("  no gated string in any public file\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
