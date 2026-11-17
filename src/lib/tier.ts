import { fmtUsd } from "./format";
import { TRACTION_RULES } from "./traction";
import type { Tier } from "./types";

/** Traction tier thresholds (same as the v1 research memo). Null means no data, never zero. */
export const TIER_THRESHOLDS = {
  tier1: { tvl: 50_000_000, volume: 500_000_000, fees: 1_000_000 },
  tier2: { tvl: 2_000_000, volume: 50_000_000, fees: 100_000 },
} as const;

/** Display label for a tier. The data keeps "Not tracked"; readers see "TBD" (owner request, 2026-11-09). The one place this mapping lives. */
export const TIER_LABEL: Record<Tier, string> = {
  "Tier 1 - Leader": "Tier 1 - Leader",
  "Tier 2 - Strong": "Tier 2 - Strong",
  "Tier 3 - Emerging": "Tier 3 - Emerging",
  "Tracked, negligible": "Tracked, negligible",
  "Not tracked": "TBD",
  "Not applicable": "Not applicable",
};

export function tierLabel(tier: Tier): string {
  return TIER_LABEL[tier];
}

export interface TierInput {
  tvl: number | null;
  volume: number | null;
  fees: number | null;
  revenue: number | null;
}

export function recomputeTier(m: TierInput): Tier {
  const ge = (v: number | null, t: number) => v !== null && v >= t;
  const t1 = TIER_THRESHOLDS.tier1;
  const t2 = TIER_THRESHOLDS.tier2;
  if (ge(m.tvl, t1.tvl) || ge(m.volume, t1.volume) || ge(m.fees, t1.fees)) return "Tier 1 - Leader";
  if (ge(m.tvl, t2.tvl) || ge(m.volume, t2.volume) || ge(m.fees, t2.fees)) return "Tier 2 - Strong";
  const vals = [m.tvl, m.volume, m.fees, m.revenue];
  if (vals.some((v) => v !== null && v > 0)) return "Tier 3 - Emerging";
  // Mapped to a source that reports only zeros.
  if (vals.some((v) => v !== null)) return "Tracked, negligible";
  return "Not tracked";
}

const TIER_ORDER: Tier[] = ["Not tracked", "Tracked, negligible", "Tier 3 - Emerging", "Tier 2 - Strong", "Tier 1 - Leader"];

export function higherTier(a: Tier, b: Tier): Tier {
  return TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b) ? a : b;
}

/**
 * Tier from onchain metrics: stablecoin or RWA supply on the chain counts like TVL and project-token
 * DEX volume like 30-day volume, at the same thresholds. A metric below its traction rule
 * (src/lib/traction.ts) sets no tier, and holders or transfers never do, since airdrops inflate them.
 */
export function onchainTier(m: { supply: number | null; tokenVolume: number | null }, rules: { supply: number; tokenVolume: number }): Tier {
  const supply = m.supply !== null && m.supply >= rules.supply ? m.supply : null;
  const volume = m.tokenVolume !== null && m.tokenVolume >= rules.tokenVolume ? m.tokenVolume : null;
  return recomputeTier({ tvl: supply, volume, fees: null, revenue: null });
}

/** How onchain metrics enter the tiers, built from the traction rules so the copy cannot drift. */
export const TIER_ONCHAIN_LINE = `Stablecoin or RWA supply on the chain counts like TVL once it reaches ${fmtUsd(TRACTION_RULES.supply, { digits: 0 })}, and project token DEX volume on the chain counts like 30-day volume once it reaches ${fmtUsd(TRACTION_RULES.tokenVolume, { digits: 0 })}. Holders and transfers never set a tier.`;

/** How a sector's headline enters the tiers (src/lib/sector-metrics.ts). */
export const TIER_HEADLINE_LINE = "Each sector's headline metric uses the same thresholds. Total deposited for lenders counts like TVL, and volume routed or launched counts like 30-day volume.";
