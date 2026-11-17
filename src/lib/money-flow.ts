/**
 * The Ecosystem money flow feed on the Funding tab (owner review, 2026-11-09).
 * Pure. Program, Funding and Incentive events from the events file, plus
 * rounds from the rounds file, typed by where the money came from (Base Ecosystem Fund, Base Batches,
 * Coinbase Ventures, an acquisition, or another Base related round), skipping a round when an event
 * already covers the same project in the same month.
 */
import { canonicalInvestor } from "./rounds";
import type { EcosystemEvent, Round } from "./types";

export const FLOW_EVENT_TYPES = ["Program", "Funding", "Incentive"] as const;
export const ROUND_FLOW_TYPE = "Other Base related round";
/** Round types in the order the filter lists them, before the generic one. */
export const ROUND_FLOW_TYPES = ["Base Ecosystem Fund", "Base Batches", "Coinbase Ventures", "Acquisition"] as const;

/** Where a round's money came from, or null when it is not part of the Base money flow. */
export function roundFlowType(r: Pick<Round, "roundType" | "leadInvestors" | "otherInvestors" | "related">): string | null {
  const names = [...r.leadInvestors, ...r.otherInvestors].map((n) => n.toLowerCase());
  const has = (k: string) => names.some((n) => n.startsWith(k));
  if (/acqui/i.test(r.roundType)) return "Acquisition";
  if (has("base batches")) return "Base Batches";
  if (has("base ecosystem fund")) return "Base Ecosystem Fund";
  if (has("coinbase ventures")) return "Coinbase Ventures";
  return r.related ? ROUND_FLOW_TYPE : null;
}
export const FLOW_ALL = "All";

export interface FlowItem {
  id: string;
  type: string;
  date: string | null;
  title: string;
  amount: number | null;
  amountNote: string | null;
  detail: string | null;
  /** Set for event items; opens the event popup. */
  eventId?: string;
  /** Set for round items; opens the project modal. */
  projectId?: string | null;
}

const month = (d: string | null) => (d ? d.slice(0, 7) : null);

export function moneyFlow(events: EcosystemEvent[], rounds: Round[]): FlowItem[] {
  const ev = events.filter((e) => (FLOW_EVENT_TYPES as readonly string[]).includes(e.type));
  const covered = new Set(ev.flatMap((e) => e.projectIds.map((id) => `${id}|${month(e.date)}`)));
  const items: FlowItem[] = ev.map((e) => ({ id: `event-${e.id}`, type: e.type, date: e.date || null, title: e.title, amount: e.amount, amountNote: e.amountNote, detail: e.detail, eventId: e.id }));
  for (const r of rounds) {
    const type = roundFlowType(r);
    if (!type) continue;
    if (r.projectId && covered.has(`${r.projectId}|${month(r.date)}`)) continue;
    const from = r.leadInvestors.length ? `${type === "Acquisition" ? "By" : "From"} ${Array.from(new Set(r.leadInvestors.map(canonicalInvestor))).join(", ")}.` : null;
    items.push({
      id: `round-${r.id}`,
      type,
      date: r.date,
      title: `${r.project}, ${r.roundType.toLowerCase()}`,
      amount: r.amount,
      amountNote: r.amountNote,
      detail: [from, r.amountNote].filter(Boolean).join(" ") || null,
      projectId: r.projectId,
    });
  }
  // Newest first, always; undated items last, then by title so the order is stable.
  return items.sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title) : a.date === null ? 1 : b.date === null ? -1 : b.date.localeCompare(a.date)));
}

/** Filter options with counts: All, the event types, Award or investment, then any other type present. */
export function flowTypes(items: FlowItem[]): Array<{ type: string; count: number }> {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.type, (counts.get(i.type) ?? 0) + 1);
  // Event types always show; round types only when some round has them.
  const roundTypes = ([...ROUND_FLOW_TYPES, ROUND_FLOW_TYPE] as string[]).filter((t) => counts.has(t));
  const known = [...FLOW_EVENT_TYPES, ...roundTypes] as string[];
  const others = Array.from(counts.keys()).filter((t) => !known.includes(t)).sort();
  return [{ type: FLOW_ALL, count: items.length }, ...[...known, ...others].map((t) => ({ type: t, count: counts.get(t) ?? 0 }))];
}

export function filterFlow(items: FlowItem[], type: string): FlowItem[] {
  return type === FLOW_ALL ? items : items.filter((i) => i.type === type);
}
