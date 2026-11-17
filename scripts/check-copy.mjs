#!/usr/bin/env node
/**
 * Copy rule checker (docs/ATLAS-UI.md, section 2). User-facing strings under
 * src/ carry no em dashes and no colons. Run with
 *
 *   npm run check:copy
 *
 * The scan walks every .ts and .tsx file through the TypeScript compiler API
 * and looks only at string literals, template literal chunks and JSX text, so
 * comments never count. A colon is a hit when whitespace follows it or when it
 * ends a final chunk (a template head or middle ending in a colon is a code
 * join such as a Map key). Tailwind classes ("md:flex"), times ("12:30") and
 * URLs ("https://") never put whitespace after a colon, so they need no
 * allowlist. A line containing "copy-ok" is skipped.
 *
 * Tone rule (docs/ATLAS-UI.md, section 2, added 2026-11-09): text uses two tones
 * only, text-ink-50 for names and values and text-ink-300 for labels and meta.
 * Any other text-ink-* step, text-muted-foreground, or an opacity utility on a
 * class string that sets a text tone is a "tone" hit. Disabled controls use
 * disabled:opacity-* and are exempt.
 *
 * Modelled on the checker in the canhav.dev repo so both atlases share one rule.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

export const ROOTS = ["src"];
/** Files whose strings are not platform copy, each with the reason. */
export const SKIP = new Map([
  ["src/lib/validate.ts", "build log messages"],
  ["src/lib/parse.ts", "CSV parse errors for the build log"],
]);
const SCHEME_RE = /^(https?|mailto|data|ipfs|tel):$/;
const ESCAPE = "copy-ok";
const EM_DASH = "—";
/** Text colour classes other than the two allowed tones (variant prefixes like hover: included). */
const OFF_TONE = /(?:^|[\s"'`])(?:[\w-]+:)*text-(?:ink-(?!50\b|300\b)\d+|muted-foreground)\b/;
/** Dimming text with opacity, other than for disabled states. */
const DIM_TEXT = /(?:^|\s)(?:[\w-]+:)*text-ink-(?:50|300)\/\d+\b|(?:^|\s)(?!disabled:)(?:[\w-]+:)*opacity-\d+\b(?=.*\btext-ink-)/;

const K = ts.SyntaxKind;
const FINAL = new Set([K.StringLiteral, K.NoSubstitutionTemplateLiteral, K.TemplateTail, K.JsxText]);
const CHUNK = new Set([...FINAL, K.TemplateHead, K.TemplateMiddle]);

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !SKIP.has(full)) out.push(full);
  }
  return out;
}

/** Scan one source text. Returns every hit with its 1-based line and column. */
export function scanSource(text, fileName) {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const src = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const lines = text.split("\n");
  const hits = [];
  const check = (node) => {
    const raw = node.text;
    const { line, character } = src.getLineAndCharacterOfPosition(node.getStart(src));
    if (lines[line].includes(ESCAPE)) return;
    if (node.kind === K.JsxText && !raw.trim()) return;
    if (SCHEME_RE.test(raw)) return;
    const problems = [];
    if (raw.includes(EM_DASH)) problems.push("em");
    if (/:\s/.test(raw) || (FINAL.has(node.kind) && /:$/.test(raw.trimEnd()))) problems.push("colon");
    if (OFF_TONE.test(raw) || DIM_TEXT.test(raw)) problems.push("tone");
    if (problems.length === 0) return;
    const snippet = raw.replace(/\s+/g, " ").trim().slice(0, 90);
    hits.push({ file: fileName, line: line + 1, col: character + 1, tag: problems.join("+"), snippet });
  };
  const visit = (node) => {
    if (CHUNK.has(node.kind)) check(node);
    ts.forEachChild(node, visit);
  };
  visit(src);
  return hits;
}

/** Scan every file under the roots. */
export function run(roots = ROOTS) {
  const hits = roots.flatMap((r) => walk(r, [])).flatMap((file) => scanSource(fs.readFileSync(file, "utf8"), file));
  hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col);
  return hits;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const hits = run();
  for (const h of hits) console.log(`${h.file}:${h.line}:${h.col}  [${h.tag}]  ${h.snippet}`);
  const files = new Set(hits.map((h) => h.file)).size;
  console.log(`${hits.length} hit${hits.length === 1 ? "" : "s"} in ${files} file${files === 1 ? "" : "s"}`);
  process.exitCode = hits.length ? 1 : 0;
}
