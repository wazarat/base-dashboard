/**
 * Funding rounds (data/base-funding-rounds-*.csv) and the investors derived from them. Pure.
 */
import { normalizeName } from "./mapping";
import { clean, parseNumber, slugify, type RawRow } from "./parse";
import type { Investor, Round } from "./types";

/** Round-file project names that differ from the ecosystem CSV. */
export const ROUND_PROJECT_ALIASES: Record<string, string> = {};

/** One spelling per round type for display; the CSV keeps its own text (base data audit, Nov 17 2026). */
export const ROUND_TYPE_ALIASES: Record<string, string> = {
  "pre-seed": "Pre-seed",
  "angel round": "Angel",
  "angel & pre-seed": "Angel and pre-seed",
  "strategic round": "Strategic",
  "venture round": "Venture round",
  "private round": "Private",
  "series a extension": "Series A+",
};

export function normalizeRoundType(type: string): string {
  return ROUND_TYPE_ALIASES[type.trim().toLowerCase()] ?? type.trim();
}

export const ROUND_BUCKETS = ["Seed and angel", "Series rounds", "Strategic", "Token sale", "Programs and awards"] as const;
export type RoundBucket = (typeof ROUND_BUCKETS)[number];

export function roundBucket(type: string): RoundBucket {
  const t = type.toLowerCase();
  if (/seed|angel|accelerator|pre-seed/.test(t)) return "Seed and angel";
  if (/series/.test(t)) return "Series rounds";
  if (/token sale|token auction|ico|public sale|saft|ido/.test(t)) return "Token sale";
  if (/program|award|grant|incentive|dao service|hackathon|bounty|ecosystem fund/.test(t)) return "Programs and awards";
  return "Strategic";
}

export function splitInvestors(v: string | undefined | null): string[] {
  const t = clean(v);
  if (!t) return [];
  return t
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s && !/^(undisclosed|unknown|n\/a|none)$/i.test(s));
}

/**
 * One name per investor, so the same firm under two spellings is counted once.
 * Lightspeed Faction and Lightspeed Venture Partners are different funds and stay apart.
 */
export const INVESTOR_ALIASES: Record<string, string> = {
  a16z: "a16z crypto",
  "andreessen horowitz": "a16z crypto",
  "a16z crypto": "a16z crypto",
  "paradigm capital": "Paradigm",
  "binance labs": "YZi Labs",
  "yzi labs (binance labs)": "YZi Labs",
  "base ecosystem fund (coinbase ventures)": "Base Ecosystem Fund",
  "arrington xrp capital": "Arrington Capital",
  "dragonfly capital": "Dragonfly",
  // Coinbase stays apart from Coinbase Ventures: on Base it is the parent company and an acquirer.
};

export function canonicalInvestor(name: string): string {
  return INVESTOR_ALIASES[name.trim().toLowerCase()] ?? name.trim();
}

export function investorId(name: string): string {
  return slugify(name.replace(/\s*\(.*?\)\s*/g, " "));
}

export type ProjectResolver = (name: string) => string | null;

export function toRound(row: RawRow, index: number, resolve: ProjectResolver): Round {
  const project = clean(row["Project"]) ?? "";
  const date = clean(row["Date"]);
  const confidence = clean(row["Confidence"]) ?? "Sourced";
  const roundType = normalizeRoundType(clean(row["Round Type"]) ?? "Undisclosed");
  const lead = splitInvestors(row["Lead Investors"]);
  const other = splitInvestors(row["Other Investors"]);
  return {
    id: `${slugify(project)}-${date ?? "undated"}-${index}`,
    project,
    projectId: resolve(project),
    roundType,
    bucket: roundBucket(roundType),
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    amount: parseNumber(row["Amount (USD)"]),
    amountNote: clean(row["Amount Note"]),
    leadInvestors: lead,
    otherInvestors: other,
    related: /^yes$/i.test(clean(row["Base Related"]) ?? ""),
    confidence: confidence.startsWith("Prior") ? "Prior knowledge (re-verify)" : "Sourced",
    sourceUrl: clean(row["Source URL"]),
  };
}

/** Resolver: exact name, then normalized name, over the ecosystem projects. */
export function makeResolver(projects: Array<{ id: string; name: string }>): ProjectResolver {
  const exact = new Map(projects.map((p) => [p.name.toLowerCase(), p.id]));
  const norm = new Map<string, string>();
  for (const p of projects) {
    const n = normalizeName(p.name);
    if (!norm.has(n)) norm.set(n, p.id);
  }
  return (name) => {
    const alias = ROUND_PROJECT_ALIASES[name];
    return exact.get(name.toLowerCase()) ?? (alias ? exact.get(alias.toLowerCase()) : undefined) ?? norm.get(normalizeName(name)) ?? (alias ? norm.get(normalizeName(alias)) : undefined) ?? null;
  };
}

export function aggregateInvestors(rounds: Round[]): Investor[] {
  const m = new Map<string, Investor>();
  for (const r of rounds) {
    const seen = new Set<string>();
    const add = (raw: string, led: boolean) => {
      const name = canonicalInvestor(raw);
      const id = investorId(name);
      const inv = m.get(id) ?? { id, name, deals: 0, led: 0, totalDisclosed: 0, relatedDeals: 0, projects: [], rounds: [] };
      if (!seen.has(id)) {
        seen.add(id);
        inv.deals += 1;
        inv.totalDisclosed += r.amount ?? 0;
        if (r.related) inv.relatedDeals += 1;
        if (!inv.projects.some((p) => p.name === r.project)) inv.projects.push({ name: r.project, projectId: r.projectId });
        inv.rounds.push(r.id);
      }
      if (led) inv.led += 1;
      m.set(id, inv);
    };
    for (const n of r.leadInvestors) add(n, true);
    for (const n of r.otherInvestors) add(n, false);
  }
  return Array.from(m.values()).sort((a, b) => b.deals - a.deals || b.totalDisclosed - a.totalDisclosed || a.name.localeCompare(b.name));
}

/** Quarter label like "2026 Q3" for the rounds-over-time chart. */
export function quarterOf(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return `${y} Q${Math.floor((m - 1) / 3) + 1}`;
}
