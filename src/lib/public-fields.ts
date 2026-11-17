/**
 * Which data a logged-out visitor may download (owner prompt, login wall phase 2,
 * 2026-11-11). An allowlist: a field is public only when it is listed here, so any
 * field added later is gated until someone decides otherwise. Pure, shared by the
 * build (scripts/build-data.ts) and the client store (src/lib/data.ts).
 *
 * Public is what Overview needs plus the project pop-up's header, Overview and
 * Traction core rows. Everything else (funding, investors, tokens, security,
 * sources, contracts, business model, sector metrics, financials) is gated.
 */
import type { EcosystemEvent, LiveMetrics, Project } from "./types";

export const PUBLIC_PROJECT_FIELDS = [
  "id",
  "name",
  "website",
  "sector",
  "subcategory",
  "chain",
  "chainDetail",
  "chainConfidence",
  "tier",
  "tvl",
  "volume",
  "fees",
  "revenue",
  "otherTraction",
  "tractionSources",
  "description",
  "status",
  "statusGroup",
  "xHandle",
  "discoveredVia",
  "hasTraction",
  "revenueCapture",
  "leaderRank",
  "metricSource",
  "metricFlags",
  "counted",
  "onchain",
  "signal",
  "snapshot",
  "live",
] as const satisfies ReadonlyArray<keyof Project>;

/** Only these parts of `live` are public: when the figures are from, which listings they sum, and their changes. */
export const PUBLIC_LIVE_FIELDS = ["asOf", "slugs", "change"] as const satisfies ReadonlyArray<keyof LiveMetrics>;
/** Only these parts of `snapshot` are public (the tier note in the pop-up). */
export const PUBLIC_SNAPSHOT_FIELDS = ["asOf", "tier"] as const;

export type GatedProjectFields = Record<string, unknown>;

function pick(obj: Record<string, unknown>, keys: readonly string[]): { kept: Record<string, unknown>; rest: Record<string, unknown> } {
  const kept: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) (keys.includes(k) ? kept : rest)[k] = v;
  return { kept, rest };
}

/** Split one project into what may ship to every visitor and what only signed-in readers get. */
export function splitProject(p: Project): { public: Record<string, unknown>; gated: GatedProjectFields } {
  const { kept, rest } = pick(p as unknown as Record<string, unknown>, PUBLIC_PROJECT_FIELDS);
  const gated: GatedProjectFields = { ...rest };
  if (p.live) {
    const live = pick(p.live as unknown as Record<string, unknown>, PUBLIC_LIVE_FIELDS);
    kept.live = live.kept;
    gated.live = live.rest;
  }
  if (p.snapshot) {
    const snap = pick(p.snapshot as unknown as Record<string, unknown>, PUBLIC_SNAPSHOT_FIELDS);
    kept.snapshot = snap.kept;
    gated.snapshot = snap.rest;
  }
  return { public: kept, gated };
}

/**
 * Neutral values for gated fields until a signed-in reader's data arrives, so code
 * reading a Project never meets undefined. Nothing here pretends to be data: empty
 * lists, null, and "Not disclosed" is never used as a placeholder for funding.
 */
export const GATED_DEFAULTS: Partial<Project> = {
  fundingType: "",
  fundingTypes: [],
  investors: null,
  amountRaised: null,
  amountDisclosed: false,
  token: null,
  tokenRaw: null,
  fundingSourceUrl: null,
  risk: "Not researched",
  audits: null,
  incidents: null,
  redFlags: null,
  securitySourceUrl: null,
  sourceUrl: null,
  contracts: [],
  biz: null,
  sectorMetrics: undefined,
};

export const GATED_LIVE_DEFAULTS: Partial<LiveMetrics> = {
  tvl: null,
  volume: null,
  fees: null,
  revenue: null,
  holdersRevenue: null,
  supplySideRevenue: null,
  feesDaily: null,
  annualisedRevenue: null,
  tokenMarketCap: null,
  psRatio: null,
  txns24h: null,
  txns7d: null,
  uniqueSenders7d: null,
  holders: null,
  activityAsOf: null,
  activityPartial: false,
};

/** The gated part of a Funding event. */
export interface GatedEventFields {
  detail: string | null;
  sourceUrl: string | null;
}

/**
 * Funding events stay on the public timeline with title, date and amount. The detail and the source link are
 * gated: the detail names investors, and so can the source's URL (the Lighter article's slug names its lead
 * investor; owner approval, 2026-11-11).
 */
export function splitEvents(events: EcosystemEvent[]): { public: EcosystemEvent[]; gated: Record<string, GatedEventFields> } {
  const gated: Record<string, GatedEventFields> = {};
  const pub = events.map((e) => {
    if (e.type !== "Funding") return e;
    gated[e.id] = { detail: e.detail, sourceUrl: e.sourceUrl };
    return { ...e, detail: null, sourceUrl: null };
  });
  return { public: pub, gated };
}
