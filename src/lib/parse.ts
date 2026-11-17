/**
 * Pure parsing helpers shared by the build script and the unit tests.
 * No Node or browser APIs here.
 */
import {
  CONFIDENCE,
  EVENT_TYPES,
  NATIVE_CHAINS,
  RISK_LEVELS,
  TIERS,
  type Confidence,
  type EcosystemEvent,
  type EventType,
  type Leader,
  type MemoInsight,
  type MetricSource,
  type NativeChain,
  type Project,
  type RiskLevel,
  type StatusGroup,
  type Tier,
} from "./types";

export type RawRow = Record<string, string | undefined>;

export function clean(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** Blank means "no data", never zero. Accepts "1,234", "$1,234", "1234.5". */
export function parseNumber(v: string | undefined | null): number | null {
  const t = clean(v);
  if (t === null) return null;
  const n = Number(t.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) {
    throw new Error(`Not a number: "${v}"`);
  }
  return n;
}

export function splitList(v: string | undefined | null): string[] {
  const t = clean(v);
  if (t === null) return [];
  return t
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function statusGroup(status: string): StatusGroup {
  const s = status.toLowerCase();
  if (s.startsWith("mainnet")) return "Mainnet";
  if (s.startsWith("building")) return "Building";
  if (s.startsWith("inactive")) return "Inactive";
  if (s.startsWith("hackathon")) return "Hackathon";
  if (s.startsWith("defunct")) return "Defunct";
  return "Unknown";
}

const UNDISCLOSED = new Set([
  "unknown",
  "none disclosed",
  "undisclosed",
  "n/a",
  "na",
  "not disclosed",
  "none",
]);

/** True when the Amount Raised cell carries an actual figure. */
export function isAmountDisclosed(v: string | null): boolean {
  if (v === null) return false;
  const s = v.trim().toLowerCase();
  if (UNDISCLOSED.has(s)) return false;
  // "Undisclosed (Sep 4, 2026)", "n/a (DAO treasury)" and similar.
  if (/^(undisclosed|n\/a|unknown|none disclosed)\b/.test(s)) return false;
  return /\d/.test(s);
}

const NO_TOKEN = new Set(["none", "unknown", "none confirmed", "n/a", "-"]);

export function normalizeToken(v: string | null): string | null {
  if (v === null) return null;
  return NO_TOKEN.has(v.trim().toLowerCase()) ? null : v.trim();
}

function oneOf<T extends readonly string[]>(
  list: T,
  v: string | null,
  field: string,
  name: string,
): T[number] {
  if (v !== null && (list as readonly string[]).includes(v)) return v as T[number];
  throw new Error(`Row "${name}": unexpected ${field} value "${v}"`);
}

export function toProject(row: RawRow): Project {
  const name = clean(row["Project/Company Name"]);
  if (!name) throw new Error("Row without a project name");

  const tvl = parseNumber(row["TVL on Base (USD)"]);
  const volume = parseNumber(row["30d DEX Volume (USD)"]);
  const fees = parseNumber(row["30d Fees (USD)"]);
  const revenue = parseNumber(row["30d Revenue (USD)"]);

  const tier = oneOf(TIERS, clean(row["Traction Tier"]), "Traction Tier", name) as Tier;
  const src = (v: number | null): MetricSource => (v === null ? "none" : "snapshot");
  const fundingType = clean(row["Funding Type"]) ?? "Not researched";
  const amountRaised = clean(row["Amount Raised"]);
  const tokenRaw = clean(row["Token"]);
  const status = clean(row["Status"]) ?? "Unknown";

  return {
    id: slugify(name),
    name,
    website: clean(row["Website"]),
    sector: clean(row["Sector/Category"]) ?? "Other",
    subcategory: clean(row["Subcategory"]),
    chain: oneOf(NATIVE_CHAINS, clean(row["Native Chain"]), "Native Chain", name) as NativeChain,
    chainDetail: clean(row["Native Chain Detail"]),
    chainConfidence: oneOf(
      CONFIDENCE,
      clean(row["Native Chain Confidence"]),
      "Native Chain Confidence",
      name,
    ) as Confidence,
    tier,
    tvl,
    volume,
    fees,
    revenue,
    otherTraction: clean(row["Other Traction Signal"]),
    tractionSources: splitList(row["Traction Source"]),
    fundingType,
    fundingTypes: splitList(fundingType),
    investors: clean(row["Investors / Backers"]),
    amountRaised,
    amountDisclosed: isAmountDisclosed(amountRaised),
    token: normalizeToken(tokenRaw),
    tokenRaw,
    fundingSourceUrl: clean(row["Funding Source URL"]),
    risk: oneOf(RISK_LEVELS, clean(row["Security Risk Level"]), "Security Risk Level", name) as RiskLevel,
    audits: clean(row["Audits"]),
    incidents: clean(row["Incidents"]),
    redFlags: clean(row["Red Flags"]),
    securitySourceUrl: clean(row["Security Source URL"]),
    description: clean(row["Description"]) ?? "",
    status,
    statusGroup: statusGroup(status),
    xHandle: clean(row["X Handle"]),
    discoveredVia: clean(row["Discovered Via"]) ?? "Unknown",
    sourceUrl: clean(row["Source URL"]),
    hasTraction: [tvl, volume, fees, revenue].some((v) => v !== null),
    revenueCapture:
      fees !== null && revenue !== null && fees > 0 ? revenue / fees : null,
    leaderRank: null,
    snapshot: { tvl, volume, fees, revenue, tier, asOf: "" },
    live: null,
    metricSource: { tvl: src(tvl), volume: src(volume), fees: src(fees), revenue: src(revenue) },
    contracts: [],
  };
}

/** Reads data/base-sector-leaders.csv (Sector, Rank, Project, Why it leads, Evidence source); the older Robinhood column names also work. */
export function toLeader(row: RawRow, idByName: Map<string, string>): Leader {
  const name = clean(row["Project"] ?? row["Project/Company Name"]) ?? "";
  const rank = parseNumber(row["Rank"] ?? row["Rank in Sector"]);
  if (rank === null) throw new Error(`Leader "${name}" has no rank`);
  return {
    sector: clean(row["Sector"] ?? row["Sector/Category"]) ?? "Other",
    rank,
    name,
    projectId: idByName.get(name.toLowerCase()) ?? null,
    website: clean(row["Website"]),
    why: clean(row["Why it leads"] ?? row["Why It Leads"]) ?? "",
    status: clean(row["Status"]) ?? "Unknown",
    xHandle: clean(row["X Handle"]),
    evidenceUrl: clean(row["Evidence source"] ?? row["Evidence Source"]),
  };
}

export function toEvent(
  row: RawRow,
  index: number,
  idByName: Map<string, string>,
): EcosystemEvent {
  const projects = splitList(row["Projects"]);
  const type = clean(row["Event Type"]);
  if (!type || !(EVENT_TYPES as readonly string[]).includes(type)) {
    throw new Error(`Event ${index}: unexpected Event Type "${type}"`);
  }
  const date = clean(row["Date"]);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Event ${index}: bad date "${date}"`);
  }
  return {
    id: `${date}-${slugify(clean(row["Title"]) ?? String(index))}`,
    date,
    type: type as EventType,
    title: clean(row["Title"]) ?? "",
    projects,
    projectIds: projects
      .map((p) => idByName.get(p.toLowerCase()))
      .filter((p): p is string => Boolean(p)),
    amount: parseNumber(row["Amount (USD)"]),
    amountNote: clean(row["Amount Note"]),
    detail: clean(row["Detail"]),
    sourceUrl: clean(row["Source URL"]),
  };
}

/** Pulls the numbered list under "## Ecosystem insights" out of the memo. */
export function parseMemoInsights(markdown: string): MemoInsight[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Ecosystem insights/i.test(l));
  if (start === -1) return [];
  const out: MemoInsight[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const m = line.match(/^(\d+)\.\s+(.*)$/);
    if (!m) continue;
    const text = m[2].trim();
    const dot = text.indexOf(". ");
    const title = dot > 0 && dot < 60 ? text.slice(0, dot) : text.split(" ").slice(0, 4).join(" ");
    out.push({ n: Number(m[1]), title, text });
  }
  return out;
}

export function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}
