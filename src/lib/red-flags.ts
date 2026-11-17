import type { Project } from "./types";

/**
 * Aggregate security view (docs/ATLAS-UI.md, section 10). No project is rated.
 * Instead, the researcher's free-text notes are matched against plain rules
 * and counted by flag type and sector. `Project.risk` is only read to know
 * whether the project was researched at all; it is never displayed.
 */
export const RED_FLAG_TYPES = ["noAudit", "teamUnnamed", "pausedOrShutDown", "pastIncident", "impersonation", "noWebsite"] as const;
export type RedFlagType = (typeof RED_FLAG_TYPES)[number];

export const RED_FLAG_LABEL: Record<RedFlagType, string> = {
  noAudit: "No published audit found",
  teamUnnamed: "Team not publicly named",
  pausedOrShutDown: "Paused or shut down",
  pastIncident: "Past incident recorded",
  impersonation: "Impersonation tokens reported",
  noWebsite: "No website listed",
};

export const RED_FLAG_RULE: Record<RedFlagType, string> = {
  noAudit: "The audits note says no audit was found, none is listed or the contracts are unaudited, or the research notes say there is no published audit.",
  teamUnnamed: "The research notes describe the team as pseudonymous or anonymous, or say no team disclosure was found.",
  pausedOrShutDown: "The status is defunct or impaired, or the notes record a shutdown, a pause, a halt, a lost domain, or a site that went offline or silent.",
  pastIncident: "The incidents note records a dated event that affected the project itself, not an impersonation of it and not an unconfirmed report.",
  impersonation: "The notes report impersonation tokens, fake tokens, honeypots or drainers aimed at the project's users.",
  noWebsite: "No website is recorded, the only link is a social or link page, or the notes say there is no production site.",
};

const RE = {
  noAuditAudits: /\bno audit\b|none listed|not published|unaudited|names no auditor|no audit report/i,
  noAuditNotes: /no (published )?audit\b|no team or audit/i,
  teamUnnamed: /pseudonymous|anonymous|no team\b|team disclosure found|team not named|no disclosed legal identit/i,
  pausedStatus: /defunct|impaired/i,
  pausedText: /shutdown|shut down|paused|offline|halted operations|went silent|lost (control of (the|its) )?domain|site reported down/i,
  noneFound: /^none found/i,
  dated: /\b20\d\d\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i,
  incidentExcluded: /not an? \w+ breach|not (the |its |their )?[\w']+ own contracts|not established|could not be located|\(market, not security\)/i,
  impersonation: /impersonat|fake \$?\w* ?tokens?|honeypot|drainers/i,
  noWebsite: /no (product )?website|social\/link page only|no production site/i,
};

/** Whether the security pass looked at this project at all. The only use of the risk field. */
export function securityResearched(p: Project): boolean {
  return p.risk !== "Not researched";
}

export function redFlagTypes(p: Project): RedFlagType[] {
  if (!securityResearched(p)) return [];
  const audits = p.audits ?? "";
  const notes = p.redFlags ?? "";
  const incidents = p.incidents ?? "";
  const out: RedFlagType[] = [];
  if (RE.noAuditAudits.test(audits) || RE.noAuditNotes.test(notes)) out.push("noAudit");
  if (RE.teamUnnamed.test(notes)) out.push("teamUnnamed");
  if (RE.pausedStatus.test(p.status) || RE.pausedText.test(`${notes} ${incidents}`)) out.push("pausedOrShutDown");
  if (incidents && !RE.noneFound.test(incidents) && RE.dated.test(incidents) && !RE.incidentExcluded.test(incidents)) out.push("pastIncident");
  if (RE.impersonation.test(`${notes} ${incidents}`)) out.push("impersonation");
  if (p.website === null || RE.noWebsite.test(notes)) out.push("noWebsite");
  return out;
}

/** Researched projects per flag type, most common first. */
export function redFlagCounts(projects: Project[]): Array<{ type: RedFlagType; count: number }> {
  const counts = new Map<RedFlagType, number>(RED_FLAG_TYPES.map((t) => [t, 0]));
  for (const p of projects) for (const t of redFlagTypes(p)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return RED_FLAG_TYPES.map((type) => ({ type, count: counts.get(type) ?? 0 })).sort((a, b) => b.count - a.count || RED_FLAG_TYPES.indexOf(a.type) - RED_FLAG_TYPES.indexOf(b.type));
}

export interface SectorFlags {
  sector: string;
  researched: number;
  flagged: number;
  byType: Record<RedFlagType, number>;
}

/** Sectors with at least one researched project, largest first. */
export function flagsBySector(projects: Project[]): SectorFlags[] {
  const m = new Map<string, SectorFlags>();
  for (const p of projects) {
    if (!securityResearched(p)) continue;
    const row = m.get(p.sector) ?? { sector: p.sector, researched: 0, flagged: 0, byType: Object.fromEntries(RED_FLAG_TYPES.map((t) => [t, 0])) as Record<RedFlagType, number> };
    row.researched += 1;
    const flags = redFlagTypes(p);
    if (flags.length) row.flagged += 1;
    for (const t of flags) row.byType[t] += 1;
    m.set(p.sector, row);
  }
  return Array.from(m.values()).sort((a, b) => b.researched - a.researched || a.sector.localeCompare(b.sector));
}
