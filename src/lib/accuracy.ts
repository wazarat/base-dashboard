/**
 * Accuracy rule 3 (docs/SECTOR-METRICS.md, section 0): one source per number. Where two sources report
 * the same figure the Atlas shows the primary one and logs the gap; a gap over 10% on a headline metric
 * fails the build. Pure.
 */
import { daysBetween, type DateStr } from "./dates";

/** A headline gap above this share fails the build. */
export const SOURCE_GAP_FAIL = 0.1;
/** Smaller figures swing by more than 10% on noise alone, so they are logged but never fail the build. */
export const SOURCE_GAP_FLOOR = 1_000_000;
/** The two readings must be at most this many days apart, so one source lagging a day cannot block the daily deploy. */
export const SOURCE_GAP_MAX_DAYS = 1;

export interface SourceReading {
  source: string;
  value: number;
  asOf: DateStr;
}

export interface SourceGap {
  project: string;
  metric: string;
  headline: boolean;
  primary: SourceReading;
  secondary: SourceReading;
  /** |primary - secondary| / primary */
  gap: number;
  /** The readings are close enough in time and large enough for the 10% rule to apply. */
  comparable: boolean;
  fail: boolean;
}

export function sourceGap(project: string, metric: string, headline: boolean, primary: SourceReading, secondary: SourceReading): SourceGap {
  const gap = primary.value > 0 ? Math.abs(primary.value - secondary.value) / primary.value : secondary.value > 0 ? 1 : 0;
  const comparable = Math.abs(daysBetween(primary.asOf, secondary.asOf)) <= SOURCE_GAP_MAX_DAYS && Math.min(primary.value, secondary.value) >= SOURCE_GAP_FLOOR;
  return { project, metric, headline, primary, secondary, gap, comparable, fail: headline && comparable && gap > SOURCE_GAP_FAIL };
}

export function describeGap(g: SourceGap): string {
  const m = (v: number) => `$${(v / 1e6).toFixed(1)}M`;
  return `${g.project} ${g.metric}, ${g.primary.source} ${m(g.primary.value)} (${g.primary.asOf}) against ${g.secondary.source} ${m(g.secondary.value)} (${g.secondary.asOf}), gap ${(g.gap * 100).toFixed(1)}%${g.comparable ? "" : ", not comparable (dates or size)"}`;
}
