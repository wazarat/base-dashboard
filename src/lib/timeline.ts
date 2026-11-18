import type { ChartTableColumn, ChartTableSpec } from "@/components/atlas/chart-table";
import { EVENT_ORDER } from "./colors";
import { fmtDate, fmtUsd } from "./format";
import { isDirectSource, NO_DIRECT_SOURCE } from "./sources";
import type { Takeaway } from "./takeaways";
import type { EcosystemEvent, EventType } from "./types";

export const DAY_MS = 86_400_000;

/** Events before the atlas default start (mainnet) collapse into one marker until the reader asks for them. */
export function splitEarlier(events: EcosystemEvent[], defaultStart: string): { shown: EcosystemEvent[]; earlier: EcosystemEvent[] } {
  return { shown: events.filter((e) => e.date >= defaultStart), earlier: events.filter((e) => e.date < defaultStart) };
}

/** Points like "29 events recorded.", "Incidents lead with 10.", "16 carry a USD amount.", "3 sit behind Show earlier events." No dates. */
export function timelineSummary(events: EcosystemEvent[], defaultStart: string): Takeaway {
  if (events.length === 0) return { points: ["No events recorded."] };
  const counts = new Map<EventType, number>();
  for (const e of events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  const lead = [...EVENT_ORDER].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))[0];
  const withAmount = events.filter((e) => e.amount !== null).length;
  const earlier = splitEarlier(events, defaultStart).earlier.length;
  const n = events.length;
  const points = [`${n} ${n === 1 ? "event" : "events"} recorded.`, `${lead}s lead with ${counts.get(lead)}.`, `${withAmount} carry a USD amount.`];
  if (earlier > 0) points.push(`${earlier} sit behind Show earlier events.`);
  return { points };
}

const EVENT_COLUMNS: ChartTableColumn[] = [
  { key: "date", label: "Date", format: (v) => fmtDate(String(v)) },
  { key: "type", label: "Type" },
  { key: "title", label: "Event", primary: true },
  { key: "projects", label: "Projects", empty: "none" },
];

/**
 * The timeline as a table: date, type, event and projects on the page. The amount, what it
 * measures, the detail and the source are one click away in the event popup and travel in the
 * CSV. A link that is not a direct source is left out of both (src/lib/sources.ts).
 */
/** Shown in the CSV, logged out, where a Funding event's detail and source load after login. */
export const AFTER_LOGIN = "After login";

export function eventTable(events: EcosystemEvent[], opts: { gatedHidden?: boolean } = {}): ChartTableSpec {
  const hidden = (e: EcosystemEvent) => Boolean(opts.gatedHidden) && e.type === "Funding";
  return {
    columns: EVENT_COLUMNS,
    exportColumns: [
      ...EVENT_COLUMNS,
      { key: "amount", label: "Amount", align: "right", format: (v) => (v === null || v === undefined ? "undisclosed" : fmtUsd(v as number)) },
      { key: "amountNote", label: "Amount note", empty: "none" },
      { key: "detail", label: "Detail", empty: "none" },
      { key: "source", label: "Source", empty: NO_DIRECT_SOURCE },
    ],
    rows: [...events]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((e) => ({
        id: e.id,
        date: e.date,
        type: e.type,
        title: e.title,
        projects: e.projects.join(", ") || null,
        amount: e.amount,
        amountNote: e.amountNote,
        detail: e.detail ?? (hidden(e) ? AFTER_LOGIN : null),
        source: isDirectSource(e.sourceUrl) ? e.sourceUrl : hidden(e) && !e.sourceUrl ? AFTER_LOGIN : null,
      })),
    filename: "base-events.csv",
    maxRows: 100,
  };
}

/** Marker area on a log scale between the smallest and largest recorded amount; events without an amount use the smallest marker. */
export function markerSize(amount: number | null, lo: number, hi: number): number {
  if (amount === null || !(amount > 0)) return 30;
  if (!(hi > lo) || !(lo > 0)) return 240;
  const t = Math.min(1, Math.max(0, (Math.log10(amount) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))));
  return 60 + 360 * t;
}

/** First-of-month ticks across the span: monthly up to 14 months, quarterly beyond. */
export function monthTicks(min: number, max: number): number[] {
  const ticks: number[] = [];
  const d = new Date(min);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  if (d.getTime() < min) d.setUTCMonth(d.getUTCMonth() + 1);
  const months = (max - min) / (DAY_MS * 30.44);
  const step = months > 14 ? 3 : 1;
  if (step === 3) while (d.getUTCMonth() % 3 !== 0) d.setUTCMonth(d.getUTCMonth() + 1);
  while (d.getTime() <= max) {
    ticks.push(d.getTime());
    d.setUTCMonth(d.getUTCMonth() + step);
  }
  return ticks;
}
