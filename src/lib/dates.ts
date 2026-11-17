/** UTC date helpers shared by the scripts, the build and the UI. No Node APIs. */
export type DateStr = string; // "YYYY-MM-DD" (UTC day)

const DAY_MS = 86_400_000;

export function dateOf(unixSec: number): DateStr {
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}

export function dateOfMs(ms: number): DateStr {
  return new Date(ms).toISOString().slice(0, 10);
}

export function utcToday(nowMs: number = Date.now()): DateStr {
  return dateOfMs(nowMs);
}

export function toUnixDay(d: DateStr): number {
  return Date.parse(`${d}T00:00:00Z`) / 1000;
}

export function addDays(d: DateStr, n: number): DateStr {
  return dateOfMs(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS);
}

/** b - a in whole days. */
export function daysBetween(a: DateStr, b: DateStr): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** Inclusive list of days from start to end. */
export function dateRange(start: DateStr, end: DateStr): DateStr[] {
  const n = daysBetween(start, end);
  if (n < 0) return [];
  const out: DateStr[] = [];
  for (let i = 0; i <= n; i++) out.push(addDays(start, i));
  return out;
}

export function isoNow(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString();
}

export function isDateStr(v: unknown): v is DateStr {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}
