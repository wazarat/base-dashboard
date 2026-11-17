import { countWith } from "./metrics";
import { tractionReasons } from "./traction";
import type { NumericMetricKey, Project } from "./types";

/** Coverage language (docs/ATLAS-UI.md, section 5). Blank metrics are gaps in what the source tracks, never zero and never unverified. */
export const NOT_TRACKED = "Not tracked";
export const NOT_TRACKED_TIP = "DefiLlama does not report this metric for these projects. This is a coverage gap, not a zero and not unverified data.";

export function coverage(projects: Project[], metric: NumericMetricKey): { tracked: number; total: number } {
  return { tracked: countWith(projects, metric), total: projects.length };
}

export function fmtTracked(c: { tracked: number; total: number }): string {
  return `Tracked for ${c.tracked} of ${c.total} ${c.total === 1 ? "project" : "projects"}`;
}

export const COVERAGE_TERMS: Array<{ term: string; meaning: string }> = [
  { term: "Not tracked", meaning: "DefiLlama reports no figure for this project or metric. A coverage gap, not a zero." },
  { term: "Not researched", meaning: "The field was never checked in the research pass." },
  { term: "Not disclosed", meaning: "Checked, and no funding information was found." },
  { term: "Checked, nothing found", meaning: "Security was researched and no audit, incident or flag was found in the sources checked." },
  { term: "no history", meaning: "There is no earlier window to compare against yet, so a change cannot be computed." },
];

/**
 * Live, or "with traction": any reason in src/lib/traction.ts (DefiLlama metric, stablecoin or RWA supply,
 * token DEX volume, an NFT collection, or a sourced signal). The one definition behind every
 * "live" or "with traction" count.
 */
export function isLive(p: Project): boolean {
  return tractionReasons(p).length > 0;
}

export const LIVE_DEFINITION = "Live means the project has a DefiLlama metric, stablecoin or RWA supply on the chain, token volume on the chain, an active NFT collection, or a sourced traction signal.";
