/**
 * Accuracy rule 1 (docs/SECTOR-METRICS.md, section 0): every Other Traction Signal carries a date and is
 * checked against the live metric of the same kind. Pure text parsing; nothing here changes a signal.
 *
 * Only figures whose kind is unambiguous are compared: TVL, total deposited and supply on the chain.
 * Volume is compared only when the signal states a 30-day window, since a cumulative or weekly figure
 * is a different quantity from the 30-day metric and would always look like a conflict.
 */
import { daysBetween, type DateStr } from "./dates";
import type { SignalCheck } from "./types";

/** A signal is tucked behind Older figure when it is off by more than this share and older than SIGNAL_MAX_AGE_DAYS. */
export const SIGNAL_GAP = 0.25;
export const SIGNAL_MAX_AGE_DAYS = 30;

export type SignalKind = "tvl" | "deposited" | "supply" | "volume30d";

export interface SignalFigure {
  kind: SignalKind | null;
  usd: number;
  /** "$1B+", "past $100M": the signal states a floor, so a larger live figure is no conflict. */
  atLeast: boolean;
  clause: string;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DATE_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:(\d{1,2}),?\s+)?(\d{4})\b/i;
const pad = (n: number) => String(n).padStart(2, "0");

/** A date written in the signal, read from its closing parenthesis: "(Sep 2026)" or "(Blockscout, Nov 9, 2026)". A month alone means its last day. */
export function parseSignalDate(text: string): DateStr | null {
  const tail = text.match(/\(([^()]*)\)\s*$/);
  const m = tail?.[1].match(DATE_RE);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
  const year = Number(m[3]);
  const day = m[2] ? Number(m[2]) : new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(day)}` as DateStr;
}

const UNIT: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
const MONEY_RE = /\$\s?([\d][\d,]*(?:\.\d+)?)\s?([kmbt])?\b(\+)?/gi;

function kindOf(clause: string): SignalKind | null {
  const c = clause.toLowerCase();
  if (/\bdeposited\b/.test(c)) return "deposited";
  if (/\btvl\b/.test(c) || /\bvault\b[^,]*\b(past|about|over)\b/.test(c)) return "tvl";
  if (/\bsupply\b/.test(c) || /\bon the chain\b/.test(c) && !/\bvolume\b|\btraded\b/.test(c)) return "supply";
  if (/\b(volume|traded)\b/.test(c) && /\b30[ -]?d(ays?)?\b/.test(c)) return "volume30d";
  return null;
}

/** Every dollar figure in the signal with the kind its own clause names. Clauses split on commas. */
export function parseSignalFigures(text: string): SignalFigure[] {
  const body = text.replace(/\(([^()]*)\)\s*$/, "");
  const out: SignalFigure[] = [];
  for (const clause of body.split(/,\s+(?=[^\d])|;\s*/)) {
    for (const m of clause.matchAll(MONEY_RE)) {
      const n = Number(m[1].replace(/,/g, ""));
      if (!Number.isFinite(n)) continue;
      const usd = n * (m[2] ? UNIT[m[2].toLowerCase()] : 1);
      const before = clause.slice(0, m.index ?? 0).toLowerCase();
      const atLeast = Boolean(m[3]) || /\b(past|over|above|more than|at least)\s*$/.test(before.trimEnd() + " ");
      out.push({ kind: kindOf(clause), usd, atLeast, clause: clause.trim() });
    }
  }
  return out;
}

export type SignalLive = Partial<Record<SignalKind, number | null>>;

/**
 * The date and conflict check for one signal. `snapshotAsOf` is the day of the ecosystem file, used when
 * the text carries no date of its own. `end` is the build's window end.
 */
export function checkSignal(text: string | null, snapshotAsOf: DateStr, live: SignalLive, end: DateStr): SignalCheck | null {
  if (!text) return null;
  const written = parseSignalDate(text);
  const asOf = written ?? snapshotAsOf;
  let conflict: SignalCheck["conflict"] = null;
  for (const f of parseSignalFigures(text)) {
    if (!f.kind) continue;
    const now = live[f.kind];
    if (now === null || now === undefined || !(now > 0)) continue;
    const gap = Math.abs(f.usd - now) / now;
    const off = f.atLeast ? now < f.usd * (1 - SIGNAL_GAP) : gap > SIGNAL_GAP;
    if (off && (!conflict || gap > conflict.gap)) conflict = { kind: f.kind, signal: f.usd, live: now, gap };
  }
  const age = daysBetween(asOf, end);
  return { asOf, dated: written !== null, conflict, older: conflict !== null && age > SIGNAL_MAX_AGE_DAYS };
}
