/**
 * Idempotent, append-only history store helpers.
 * Everything here is pure except readJson/writeJsonStable.
 */
import fs from "node:fs";
import path from "node:path";
import type { DateStr } from "../../src/lib/dates";
import { addDays } from "../../src/lib/dates";
import type { HourRow, Series } from "../../src/lib/history-types";

export interface UpsertOpts {
  today: DateStr;
  /** Days before today whose values may still be revised by the source. */
  revisionDays?: number;
  /** Flows never store the partial current day; stocks (TVL, snapshots) may. */
  allowToday?: boolean;
}

/**
 * Merge incoming points into an existing series by date.
 * - skips non-finite values and dates after today
 * - skips today unless allowToday
 * - within the revision window the incoming value wins; older dates are frozen
 * - output sorted ascending, one point per date
 */
export function upsertSeries(existing: Series, incoming: Series, opts: UpsertOpts): Series {
  const revisionDays = opts.revisionDays ?? 7;
  const allowToday = opts.allowToday ?? false;
  const frozenBefore = addDays(opts.today, -revisionDays);
  const m = new Map<DateStr, number>(existing);
  for (const [d, v] of incoming) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    if (d > opts.today) continue;
    if (d === opts.today && !allowToday) continue;
    if (m.has(d) && d < frozenBefore) continue;
    m.set(d, v);
  }
  return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** Replace the row with the same date, else append; keeps ascending order. */
export function appendDated<T extends [DateStr, ...unknown[]]>(existing: T[], row: T): T[] {
  const out = existing.filter((r) => r[0] !== row[0]);
  out.push(row);
  out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return out;
}

export function mergeHourly(existing: HourRow[], incoming: HourRow[], opts: { retainDays: number; now: number }): HourRow[] {
  const cutoff = opts.now - opts.retainDays * 86_400;
  const m = new Map<number, HourRow>();
  for (const r of existing) m.set(r[0], r);
  for (const r of incoming) {
    if (!Number.isFinite(r[1]) || !Number.isFinite(r[2])) continue;
    m.set(r[0], r);
  }
  return Array.from(m.values())
    .filter((r) => r[0] >= cutoff)
    .sort((a, b) => a[0] - b[0]);
}

export function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

/**
 * Deterministic JSON: top-level object keys sorted, one top-level entry per line,
 * nested values compact. Returns true when the file content changed.
 */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((v) => JSON.stringify(v)).join(",\n")}\n]\n`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    if (keys.length === 0) return "{}";
    return `{\n${keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify((value as Record<string, unknown>)[k])}`).join(",\n")}\n}\n`;
  }
  return JSON.stringify(value);
}

export function writeJsonStable(file: string, value: unknown): boolean {
  const next = stableJson(value);
  const prev = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (prev === next) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next);
  return true;
}
