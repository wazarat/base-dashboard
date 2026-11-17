import type { MetricChange } from "./types";

export const RANGES = ["7d", "30d", "90d", "all"] as const;
export type Range = (typeof RANGES)[number];

export const RANGE_LABEL: Record<Range, string> = { "7d": "7d", "30d": "30d", "90d": "90d", all: "All" };
export const RANGE_LONG: Record<Range, string> = { "7d": "last 7 days", "30d": "last 30 days", "90d": "last 90 days", all: "all history" };

/** Number of days a range covers; `all` means the whole available series. */
export function rangeDays(range: Range, available: number): number {
  const n = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : available;
  return Math.max(1, Math.min(n, available));
}

/** Which change window a range maps to. `all` reports the 90-day change and says so. */
export function changeKey(range: Range): keyof MetricChange {
  return range === "7d" ? "d7" : range === "30d" ? "d30" : "d90";
}

export function changeLabel(range: Range): string {
  return range === "7d" ? "7d" : range === "30d" ? "30d" : "90d";
}

/** Slice an aligned date axis and parallel arrays to the last n days. */
export function sliceTail<T>(arr: T[], n: number): T[] {
  return n >= arr.length ? arr : arr.slice(arr.length - n);
}
