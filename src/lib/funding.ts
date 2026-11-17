import { FUNDING_ORDER, fundingBucket, fundingColor } from "./colors";
import type { Project } from "./types";

/**
 * Funding coverage (docs/ATLAS-UI.md, section 9). The donut shows only
 * projects with disclosed funding; "Not disclosed" (checked, nothing found)
 * and "Not researched" (never checked) stay distinct and become one line of text.
 */
export interface FundingCounts {
  total: number;
  researched: number;
  disclosed: number;
  notDisclosed: number;
  notResearched: number;
}

export function fundingCounts(projects: Project[]): FundingCounts {
  const total = projects.length;
  const notResearched = projects.filter((p) => p.fundingType === "Not researched").length;
  const notDisclosed = projects.filter((p) => p.fundingType === "Not disclosed").length;
  const researched = total - notResearched;
  return { total, researched, disclosed: researched - notDisclosed, notDisclosed, notResearched };
}

export interface FundingSlice {
  name: string;
  value: number;
  color: string;
}

/** Disclosed projects only, each counted once by its primary funding type, in the fixed categorical order; empty buckets are dropped. */
export function fundingSlices(projects: Project[]): FundingSlice[] {
  const m = new Map<string, number>();
  for (const p of projects) {
    if (p.fundingType === "Not researched" || p.fundingType === "Not disclosed") continue;
    const b = fundingBucket(p.fundingTypes[0] ?? p.fundingType);
    if (b === "Not researched" || b === "Not disclosed") continue;
    m.set(b, (m.get(b) ?? 0) + 1);
  }
  return FUNDING_ORDER.filter((k) => (m.get(k) ?? 0) > 0).map((k) => ({ name: k, value: m.get(k) as number, color: fundingColor(k) }));
}

/** Plain definitions for each funding bucket, shown in the funding type modal. */
export const FUNDING_DEFINITIONS: Record<string, string> = {
  "VC-backed": "Raised from venture investors, in an equity, token or SAFE round.",
  "Token-funded": "Funded by its own token, through a sale, emissions or token-holder fees, rather than equity.",
  "Token/DAO treasury": "Funded from a DAO or protocol treasury, often grants or programs paid in the protocol's token.",
  "Grant/Program": "Funded by a grant, an accelerator, a hackathon prize or a program award.",
  Bootstrapped: "Self-funded by the team or by revenue, with no outside round found.",
  "Corporate/parent": "Built and funded by a parent company or corporate sponsor.",
  Acquired: "Bought by another company.",
  Other: "Smaller types grouped together, Public company/subsidiary and Angel/pre-seed.",
  "Not disclosed": "Checked, and no funding information was found. For hackathon entries and small native projects this means winner lists, project pages and a search found nothing.",
};

/** Projects whose primary funding type falls in a bucket (the donut's grouping, so the counts match). */
export function projectsOfType(projects: Project[], bucket: string): Project[] {
  return projects.filter((p) => fundingBucket(p.fundingTypes[0] ?? p.fundingType) === bucket);
}

/** The raw funding types inside a bucket, for the "Filter the atlas to this type" button. */
export function typesInBucket(projects: Project[], bucket: string): string[] {
  return Array.from(new Set(projectsOfType(projects, bucket).map((p) => p.fundingTypes[0] ?? p.fundingType))).sort();
}
