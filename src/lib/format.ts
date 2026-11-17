import { NOT_TRACKED } from "./coverage";
import type { MetricKey } from "./types";

/** $1.2M style. null -> "Not tracked" (a coverage gap, never zero). */
export function fmtUsd(v: number | null | undefined, opts: { digits?: number } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NOT_TRACKED;
  const digits = opts.digits ?? 1;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(digits)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(digits)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** Full number with separators, for tables and tooltips. */
export function fmtUsdFull(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NOT_TRACKED;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NOT_TRACKED;
  return Math.round(v).toLocaleString("en-US");
}

export function fmtPct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NOT_TRACKED;
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function fmtMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

export const METRIC_LABEL: Record<MetricKey, string> = {
  count: "Projects",
  tvl: "TVL",
  volume: "30d DEX volume",
  fees: "30d fees",
  revenue: "30d revenue",
};

/** Lower-case a label for use inside a sentence, keeping acronyms such as TVL and DEX in capitals. */
export function lowerLabel(label: string): string {
  return label.replace(/[A-Za-z][A-Za-z']*/g, (w) => (w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase()));
}

export const METRIC_SHORT: Record<MetricKey, string> = {
  count: "Projects",
  tvl: "TVL",
  volume: "Volume",
  fees: "Fees",
  revenue: "Revenue",
};

export function fmtMetric(metric: MetricKey, v: number | null | undefined): string {
  return metric === "count" ? fmtInt(v) : fmtUsd(v);
}

export function fmtMetricFull(metric: MetricKey, v: number | null | undefined): string {
  return metric === "count" ? fmtInt(v) : fmtUsdFull(v);
}

/** Strip protocol and trailing slash for display. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function xUrl(handle: string): string {
  return `https://x.com/${handle.replace(/^@/, "")}`;
}

/** Signed percent with one decimal, +12.3% or -4.1%. null -> "no history" (no prior window to compare). */
export function fmtPctSigned(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "no history";
  const pct = v * 100;
  const sign = pct > 0 ? "+" : "";
  if (Math.abs(pct) >= 1000) return `${sign}${Math.round(pct).toLocaleString("en-US")}%`;
  return `${sign}${pct.toFixed(digits)}%`;
}

/** 1.2K / 3.4M style counts. */
export function fmtCompact(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NOT_TRACKED;
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return Math.round(v).toLocaleString("en-US");
}

export function fmtRatio(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "no history";
  return `${v.toFixed(digits)}×`;
}

export function fmtDateShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
