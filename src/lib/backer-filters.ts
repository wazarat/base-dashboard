import { NATIVE_CHAINS, type Project } from "./types";

/**
 * The "Disclosed backers per project" table on Funding: which projects it lists,
 * the filters over them, and one consistent word for an empty value. All display
 * logic; the parsed data is not changed (docs/ATLAS-UI.md, section 9).
 */
const NOT_DISCLOSED = new Set(["Not researched", "Not disclosed"]);

/** Projects with a funding type on record and either named backers or a stated amount. */
export function disclosedBackers(projects: Project[]): Project[] {
  return projects.filter((p) => !NOT_DISCLOSED.has(p.fundingType) && (p.amountDisclosed || Boolean(p.investors)));
}

/** Text a researcher typed to mean "nothing here". Matched against the whole value, ignoring case and a trailing full stop. */
const PLACEHOLDERS = new Set(["none", "unknown", "none confirmed", "none disclosed", "not disclosed", "undisclosed", "n/a", "na", "tbd", "-"]);

export function isPlaceholder(text: string | null | undefined): boolean {
  if (text === null || text === undefined) return true;
  const t = text.trim().toLowerCase().replace(/\.$/, "");
  return t === "" || PLACEHOLDERS.has(t);
}

const NONE_WITH_NOTE = /^none\b\s*(.+)$/i;

/** The token ticker, or null when the project has none. "None", "Unknown", a blank and "None (issues USDC)" all mean no token. */
export function displayToken(p: Pick<Project, "token" | "tokenRaw">): string | null {
  const raw = p.token ?? p.tokenRaw;
  if (isPlaceholder(raw) || NONE_WITH_NOTE.test((raw as string).trim())) return null;
  return raw as string;
}

/** What the source adds after "None", for example "(issues USDC)" or "announced". Shown after the word "none". */
export function tokenNote(p: Pick<Project, "token" | "tokenRaw">): string | null {
  const raw = (p.token ?? p.tokenRaw ?? "").trim();
  if (isPlaceholder(raw)) return null;
  return NONE_WITH_NOTE.exec(raw)?.[1].trim() ?? null;
}

/** The amount as written, or null when it is only a placeholder. Text that says something ("N/A (acquisition ~$200M)") is kept. */
export function displayAmount(raw: string | null | undefined): string | null {
  return isPlaceholder(raw) ? null : (raw as string);
}

export function displayInvestors(raw: string | null | undefined): string | null {
  return isPlaceholder(raw) ? null : (raw as string);
}

const UNIT: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

/** First dollar figure in the amount text, for sorting only. "~$564M (latest Feb 2022)" gives 564,000,000. */
export function amountValue(raw: string | null | undefined): number | null {
  const text = displayAmount(raw);
  if (!text) return null;
  const m = /\$\s*([\d,]+(?:\.\d+)?)\s*([kmb])?/i.exec(text);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return n * (m[2] ? UNIT[m[2].toLowerCase()] : 1);
}

export type YesNo = "yes" | "no";

export interface BackerFilters {
  /** Search over project name and backers. */
  bq: string;
  /** Funding types; a project with several types matches any of them. */
  bt: string[];
  /** Native-chain types. */
  bn: string[];
  /** Has a token ticker. */
  bk: YesNo | null;
}

export const NO_BACKER_FILTERS: BackerFilters = { bq: "", bt: [], bn: [], bk: null };

export function applyBackerFilters(rows: Project[], f: BackerFilters): Project[] {
  const q = f.bq.trim().toLowerCase();
  const types = f.bt.length ? new Set(f.bt) : null;
  const chains = f.bn.length ? new Set(f.bn) : null;
  return rows.filter((p) => {
    if (types && !p.fundingTypes.some((t) => types.has(t))) return false;
    if (chains && !chains.has(p.chain)) return false;
    if (f.bk !== null && (displayToken(p) !== null) !== (f.bk === "yes")) return false;
    if (q && !`${p.name} ${p.investors ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export interface BackerOption {
  value: string;
  count: number;
}

/** Options for one facet, counted among rows matching every other filter. A selected value stays listed at zero. */
export function backerFacetOptions(rows: Project[], f: BackerFilters, key: "bt" | "bn"): BackerOption[] {
  const base = applyBackerFilters(rows, { ...f, [key]: [] });
  const counts = new Map<string, number>();
  for (const p of base) for (const v of key === "bt" ? p.fundingTypes : [p.chain]) counts.set(v, (counts.get(v) ?? 0) + 1);
  const values = new Set<string>([...counts.keys(), ...f[key]]);
  const order = (v: string) => (key === "bn" ? (NATIVE_CHAINS as readonly string[]).indexOf(v) : 0);
  return Array.from(values)
    .map((v) => ({ value: v, count: counts.get(v) ?? 0 }))
    .sort((a, b) => order(a.value) - order(b.value) || b.count - a.count || a.value.localeCompare(b.value));
}

export function activeBackerFilterCount(f: BackerFilters): number {
  return (f.bq.trim() ? 1 : 0) + f.bt.length + f.bn.length + (f.bk !== null ? 1 : 0);
}
